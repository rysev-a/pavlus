/**
 * The demo data of the Phone Retail CRM. Pure and deterministic: a tiny PRNG,
 * no Math.random, no Date, no I/O. Same seed, same database.
 */
import {
  type BudgetEntry,
  type Db,
  type Manufacturer,
  type Model,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Permission,
  type Product,
  type Role,
  type Session,
  type Shop,
  type ShopCategory,
  type User,
  SEED_COUNTS,
} from "./schema.ts";

/** The fixed "today" of the demo. */
export const TODAY = "2026-10-31";

// ---------------------------------------------------------------- random

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** index chosen by weights */
  weighted(weights: readonly number[]): number;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
    chance: (p) => next() < p,
    weighted(weights) {
      let sum = 0;
      for (const w of weights) sum += w;
      let r = next() * sum;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i] as number;
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}

// ----------------------------------------------------------------- dates

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** Days since 1970-01-01 of a civil date. */
function dayNumber(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civil(days: number): [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const fmtDate = (days: number): string => {
  const [y, m, d] = civil(days);
  return `${y}-${pad(m)}-${pad(d)}`;
};

const fmtDateTime = (days: number, secs: number): string => {
  const extra = Math.floor(secs / 86400);
  const s = secs - extra * 86400;
  return `${fmtDate(days + extra)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

const monthOf = (days: number): string => fmtDate(days).slice(0, 7);

const TODAY_DAY = dayNumber(2026, 10, 31);
/** the first day of the 12-month window (orders and budget) */
const WINDOW_START = dayNumber(2025, 11, 1);
const MONTHS: string[] = Array.from({ length: 12 }, (_, i) => {
  const idx = 2025 * 12 + 10 + i; // November 2025 is index 10 of 2025
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
});

// ----------------------------------------------------------- permissions

const MODULE_ACTIONS: Record<string, string[]> = {
  users: ["view", "create", "update", "delete", "export", "block", "invite"],
  roles: ["view", "create", "update", "delete", "assign"],
  permissions: ["view", "update"],
  sessions: ["view", "terminate", "export"],
  products: ["view", "create", "update", "delete", "export", "import", "price"],
  models: ["view", "create", "update", "delete"],
  manufacturers: ["view", "create", "update", "delete"],
  shops: ["view", "create", "update", "delete", "export", "assign"],
  orders: [
    "view",
    "create",
    "update",
    "delete",
    "export",
    "refund",
    "approve",
    "cancel",
    "ship",
  ],
  budget: ["view", "create", "update", "delete", "export", "approve"],
  reports: ["view", "export", "schedule"],
  settings: ["view", "update"],
  delivery: ["view", "create", "update", "delete", "track", "assign"],
  inventory: [
    "view",
    "adjust",
    "transfer",
    "count",
    "write_off",
    "export",
    "import",
  ],
  customers: [
    "view",
    "create",
    "update",
    "delete",
    "export",
    "merge",
    "message",
  ],
  support: ["view", "reply", "assign", "close", "escalate"],
  payments: ["view", "capture", "refund", "export", "reconcile"],
  promotions: ["view", "create", "update", "delete", "approve"],
  audit: ["view", "export", "purge"],
  invoices: ["view", "create", "send", "void"],
};

const MODULE_NOUN: Record<string, string> = {
  users: "user accounts",
  roles: "roles",
  permissions: "permissions",
  sessions: "login sessions",
  products: "products and SKUs",
  models: "phone models",
  manufacturers: "manufacturers",
  shops: "shops",
  orders: "customer orders",
  budget: "budget entries",
  reports: "reports",
  settings: "system settings",
  delivery: "deliveries",
  inventory: "stock levels",
  customers: "customer profiles",
  support: "support tickets",
  payments: "payments",
  promotions: "promotions and discounts",
  audit: "the audit log",
  invoices: "invoices",
};

const ACTION_VERB: Record<string, string> = {
  view: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
  export: "Export",
  import: "Import",
  refund: "Refund",
  approve: "Approve",
  block: "Block and unblock",
  invite: "Invite",
  assign: "Assign",
  terminate: "Terminate",
  price: "Change prices of",
  cancel: "Cancel",
  ship: "Mark as shipped",
  schedule: "Schedule",
  track: "Track",
  adjust: "Adjust",
  transfer: "Transfer between shops",
  count: "Run stocktakes of",
  write_off: "Write off",
  merge: "Merge duplicate",
  message: "Send messages to",
  reply: "Reply to",
  close: "Close",
  escalate: "Escalate",
  capture: "Capture",
  reconcile: "Reconcile",
  purge: "Purge old records of",
  send: "Send",
  void: "Void",
};

function buildPermissions(): Permission[] {
  const out: Permission[] = [];
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    for (const action of actions) {
      out.push({
        id: out.length + 1,
        code: `${module}.${action}`,
        description: `${ACTION_VERB[action] ?? action} ${MODULE_NOUN[module] ?? module}`,
        module,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------- roles

interface RoleBase {
  name: string;
  description: string;
  /** `module.action`, `module.*`, `*.action` or `*`; a leading `-` removes */
  grants: string[];
  customer?: boolean;
}

const ROLE_BASES: RoleBase[] = [
  {
    name: "Administrator",
    description: "Full access to every module of the CRM.",
    grants: ["*", "-audit.purge"],
  },
  {
    name: "Store manager",
    description:
      "Runs a shop: orders, stock, staff schedules and shop reports.",
    grants: [
      "shops.view",
      "shops.update",
      "orders.*",
      "products.view",
      "inventory.*",
      "budget.view",
      "reports.*",
      "users.view",
      "delivery.view",
      "delivery.assign",
      "customers.view",
      "support.view",
      "payments.view",
    ],
  },
  {
    name: "Cashier",
    description: "Rings up sales at the counter and takes payments.",
    grants: [
      "orders.view",
      "orders.create",
      "products.view",
      "payments.view",
      "payments.capture",
      "customers.view",
      "customers.create",
      "invoices.view",
      "invoices.create",
    ],
  },
  {
    name: "Courier",
    description: "Delivers parcels and updates delivery statuses.",
    grants: [
      "delivery.view",
      "delivery.track",
      "delivery.update",
      "orders.view",
    ],
  },
  {
    name: "Support agent",
    description:
      "Answers customers and handles tickets, returns and cancellations.",
    grants: [
      "support.*",
      "customers.view",
      "customers.update",
      "customers.message",
      "orders.view",
      "orders.update",
      "orders.cancel",
    ],
  },
  {
    name: "Accountant",
    description:
      "Keeps the books: budget, payments, invoices and financial reports.",
    grants: [
      "budget.*",
      "payments.*",
      "invoices.*",
      "reports.*",
      "orders.view",
      "orders.export",
    ],
  },
  {
    name: "Buyer",
    description: "Manages the catalogue, suppliers and purchasing prices.",
    grants: [
      "products.*",
      "models.*",
      "manufacturers.*",
      "inventory.view",
      "inventory.transfer",
      "budget.view",
      "promotions.view",
    ],
  },
  {
    name: "Inventory clerk",
    description: "Receives goods, counts stock and moves it between shops.",
    grants: [
      "inventory.*",
      "products.view",
      "products.update",
      "delivery.view",
    ],
  },
  {
    name: "HR",
    description: "Manages staff accounts, roles and onboarding.",
    grants: ["users.*", "roles.view", "roles.assign", "sessions.view"],
  },
  {
    name: "Auditor",
    description:
      "Read-only access to everything, with export and the audit log.",
    grants: ["*.view", "*.export", "audit.*", "-audit.purge"],
  },
  {
    name: "Marketing manager",
    description: "Plans promotions and talks to the customer base.",
    grants: [
      "promotions.*",
      "customers.view",
      "customers.export",
      "customers.message",
      "reports.view",
      "products.view",
    ],
  },
  {
    name: "Shift supervisor",
    description: "Leads a shift on the shop floor and approves refunds.",
    grants: [
      "orders.view",
      "orders.update",
      "orders.refund",
      "orders.approve",
      "products.view",
      "inventory.view",
      "payments.view",
      "payments.refund",
      "customers.view",
      "support.view",
      "support.reply",
    ],
  },
  {
    name: "Warehouse manager",
    description:
      "Owns the warehouse: stock, inbound deliveries and write-offs.",
    grants: [
      "inventory.*",
      "delivery.*",
      "products.view",
      "orders.view",
      "orders.ship",
      "shops.view",
      "reports.view",
    ],
  },
  {
    name: "Customer",
    description: "A shopper with an online account.",
    grants: ["orders.view", "products.view"],
    customer: true,
  },
  {
    name: "Loyalty member",
    description: "A repeat shopper in the loyalty programme.",
    grants: ["orders.view", "products.view", "promotions.view"],
    customer: true,
  },
  {
    name: "Business customer",
    description: "A company buying phones for its staff.",
    grants: ["orders.view", "orders.create", "products.view", "invoices.view"],
    customer: true,
  },
  {
    name: "VIP customer",
    description: "A top customer with priority support.",
    grants: ["orders.view", "products.view", "promotions.view", "support.view"],
    customer: true,
  },
];

const ROLE_SUFFIXES = [
  "North",
  "South",
  "East",
  "West",
  "Airport",
  "Online",
  "EMEA",
  "APAC",
  "Americas",
  "Night shift",
  "Trainee",
  "Senior",
];

function matches(code: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const [pm, pa] = pattern.split(".");
  const [cm, ca] = code.split(".");
  return (pm === "*" || pm === cm) && (pa === "*" || pa === ca);
}

function grantIds(base: RoleBase, perms: Permission[]): number[] {
  const ids: number[] = [];
  for (const p of perms) {
    let ok = false;
    for (const g of base.grants) {
      if (g.startsWith("-")) {
        if (matches(p.code, g.slice(1))) ok = false;
      } else if (matches(p.code, g)) ok = true;
    }
    if (ok) ids.push(p.id);
  }
  return ids;
}

interface RoleBuild {
  roles: Role[];
  customerRoleIds: number[];
  staffRoleIds: number[];
}

function buildRoles(rng: Rng, perms: Permission[]): RoleBuild {
  const roles: Role[] = [];
  const customerRoleIds: number[] = [];
  const staffRoleIds: number[] = [];
  const names = new Set<string>();
  const baseIds = new Map<string, number[]>();

  for (const base of ROLE_BASES) {
    const ids = grantIds(base, perms);
    baseIds.set(base.name, ids);
    const id = roles.length + 1;
    roles.push({
      id,
      name: base.name,
      description: base.description,
      permissionIds: ids,
    });
    names.add(base.name);
    (base.customer ? customerRoleIds : staffRoleIds).push(id);
  }

  const variantBases = ROLE_BASES.filter(
    (b) => !b.customer && b.name !== "Administrator",
  );
  for (let k = 0; roles.length < SEED_COUNTS.roles; k++) {
    const base = variantBases[k % variantBases.length] as RoleBase;
    let s =
      (k * 7 + Math.floor(k / variantBases.length)) % ROLE_SUFFIXES.length;
    let name = `${base.name} (${ROLE_SUFFIXES[s]})`;
    while (names.has(name)) {
      s = (s + 1) % ROLE_SUFFIXES.length;
      name = `${base.name} (${ROLE_SUFFIXES[s]})`;
    }
    names.add(name);
    const suffix = ROLE_SUFFIXES[s] as string;
    const own = (baseIds.get(base.name) as number[]).filter(
      () => !rng.chance(0.12),
    );
    const keep =
      own.length >= 3 ? own : (baseIds.get(base.name) as number[]).slice(0, 3);
    // a few extra read-only permissions for variety
    const extras = perms
      .filter((p) => p.code.endsWith(".view") && rng.chance(0.04))
      .map((p) => p.id);
    const permissionIds = [...new Set([...keep, ...extras])].sort(
      (a, b) => a - b,
    );
    const id = roles.length + 1;
    roles.push({
      id,
      name,
      description: `${base.description} Scope: ${suffix.toLowerCase()}.`,
      permissionIds,
    });
    staffRoleIds.push(id);
  }
  return { roles, customerRoleIds, staffRoleIds };
}

// ----------------------------------------------------------------- users

const NAME_GROUPS: { first: string[]; last: string[]; dial: string }[] = [
  {
    dial: "1",
    first: [
      "James",
      "Emily",
      "Michael",
      "Olivia",
      "Daniel",
      "Sophia",
      "Ethan",
      "Grace",
    ],
    last: [
      "Carter",
      "Bennett",
      "Hughes",
      "Foster",
      "Murphy",
      "Reed",
      "Hayes",
      "Brooks",
    ],
  },
  {
    dial: "34",
    first: [
      "Carlos",
      "Lucia",
      "Javier",
      "Marta",
      "Diego",
      "Elena",
      "Pablo",
      "Sofia",
    ],
    last: [
      "Garcia",
      "Fernandez",
      "Morales",
      "Navarro",
      "Ortega",
      "Ramos",
      "Castillo",
      "Vega",
    ],
  },
  {
    dial: "49",
    first: [
      "Lukas",
      "Anna",
      "Felix",
      "Greta",
      "Jonas",
      "Lena",
      "Max",
      "Hannah",
    ],
    last: [
      "Muller",
      "Schneider",
      "Fischer",
      "Weber",
      "Becker",
      "Hoffmann",
      "Koch",
      "Richter",
    ],
  },
  {
    dial: "33",
    first: [
      "Louis",
      "Camille",
      "Hugo",
      "Chloe",
      "Antoine",
      "Manon",
      "Pierre",
      "Lea",
    ],
    last: [
      "Dubois",
      "Moreau",
      "Laurent",
      "Lefebvre",
      "Girard",
      "Rousseau",
      "Fontaine",
      "Mercier",
    ],
  },
  {
    dial: "39",
    first: [
      "Marco",
      "Giulia",
      "Luca",
      "Chiara",
      "Matteo",
      "Francesca",
      "Paolo",
      "Elisa",
    ],
    last: [
      "Rossi",
      "Ferrari",
      "Esposito",
      "Bianchi",
      "Romano",
      "Colombo",
      "Ricci",
      "Greco",
    ],
  },
  {
    dial: "48",
    first: [
      "Piotr",
      "Katarzyna",
      "Tomasz",
      "Agnieszka",
      "Marek",
      "Zofia",
      "Jakub",
      "Magdalena",
    ],
    last: [
      "Nowak",
      "Kowalski",
      "Wisniewski",
      "Wojcik",
      "Kaminski",
      "Lewandowski",
      "Zielinski",
      "Szymanski",
    ],
  },
  {
    dial: "7",
    first: [
      "Ivan",
      "Natalia",
      "Dmitri",
      "Olga",
      "Sergei",
      "Irina",
      "Alexei",
      "Tatiana",
    ],
    last: [
      "Petrov",
      "Smirnov",
      "Volkov",
      "Morozov",
      "Sokolov",
      "Lebedev",
      "Kuznetsov",
      "Popov",
    ],
  },
  {
    dial: "91",
    first: [
      "Arjun",
      "Priya",
      "Rahul",
      "Ananya",
      "Vikram",
      "Neha",
      "Rohan",
      "Kavya",
    ],
    last: [
      "Sharma",
      "Patel",
      "Iyer",
      "Reddy",
      "Mehta",
      "Nair",
      "Kapoor",
      "Joshi",
    ],
  },
  {
    dial: "86",
    first: ["Wei", "Li", "Jing", "Chen", "Hao", "Mei", "Yan", "Lei"],
    last: ["Wang", "Zhang", "Liu", "Zhao", "Huang", "Zhou", "Xu", "Sun"],
  },
  {
    dial: "81",
    first: ["Haruto", "Yui", "Kenji", "Sakura", "Takumi", "Aiko", "Ren", "Mio"],
    last: [
      "Tanaka",
      "Suzuki",
      "Watanabe",
      "Yamamoto",
      "Nakamura",
      "Kobayashi",
      "Kato",
      "Ito",
    ],
  },
  {
    dial: "82",
    first: [
      "Minjun",
      "Seoyeon",
      "Jiho",
      "Haeun",
      "Dohyun",
      "Jiwoo",
      "Sungmin",
      "Yuna",
    ],
    last: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon"],
  },
  {
    dial: "971",
    first: [
      "Omar",
      "Layla",
      "Khalid",
      "Fatima",
      "Youssef",
      "Amira",
      "Hassan",
      "Noor",
    ],
    last: [
      "Haddad",
      "Nasser",
      "Khoury",
      "Mansour",
      "Saleh",
      "Farouk",
      "Rahman",
      "Aziz",
    ],
  },
  {
    dial: "90",
    first: [
      "Emre",
      "Elif",
      "Mehmet",
      "Zeynep",
      "Burak",
      "Selin",
      "Kerem",
      "Defne",
    ],
    last: [
      "Yilmaz",
      "Kaya",
      "Demir",
      "Celik",
      "Sahin",
      "Arslan",
      "Dogan",
      "Aydin",
    ],
  },
  {
    dial: "234",
    first: [
      "Chinedu",
      "Amara",
      "Tunde",
      "Ngozi",
      "Emeka",
      "Folake",
      "Kelechi",
      "Zainab",
    ],
    last: [
      "Okafor",
      "Adeyemi",
      "Balogun",
      "Nwosu",
      "Eze",
      "Ogunleye",
      "Abubakar",
      "Obi",
    ],
  },
  {
    dial: "55",
    first: [
      "Gabriel",
      "Beatriz",
      "Rafael",
      "Larissa",
      "Thiago",
      "Camila",
      "Bruno",
      "Juliana",
    ],
    last: [
      "Silva",
      "Santos",
      "Oliveira",
      "Souza",
      "Costa",
      "Pereira",
      "Almeida",
      "Ribeiro",
    ],
  },
];

const NOW_SECS = 18 * 3600;

function buildUsers(rng: Rng, roleBuild: RoleBuild): User[] {
  const users: User[] = [];
  const seen = new Set<string>();
  const adminId = 1;
  const staffNoAdmin = roleBuild.staffRoleIds.filter((id) => id !== adminId);
  const customerWeights = roleBuild.customerRoleIds.map(
    (_, i) => [60, 20, 10, 10][i] ?? 5,
  );

  for (let i = 0; i < SEED_COUNTS.users; i++) {
    let first = "";
    let last = "";
    let group = NAME_GROUPS[0] as (typeof NAME_GROUPS)[number];
    for (let tries = 0; tries < 200; tries++) {
      group = rng.pick(NAME_GROUPS);
      first = rng.pick(group.first);
      last = rng.pick(group.last);
      if (!seen.has(`${first} ${last}`)) break;
    }
    // vanishingly unlikely, but keep names unique whatever happens
    while (seen.has(`${first} ${last}`)) last = `${last}-${rng.int(2, 99)}`;
    seen.add(`${first} ${last}`);

    let roleId: number;
    if (i < 2) roleId = adminId;
    else if (rng.chance(0.7))
      roleId = roleBuild.customerRoleIds[
        rng.weighted(customerWeights)
      ] as number;
    else roleId = rng.pick(staffNoAdmin);

    const statusRoll = rng.next();
    const status =
      i < 10
        ? "active"
        : statusRoll < 0.86
          ? "active"
          : statusRoll < 0.93
            ? "blocked"
            : "invited";
    const age = i < 10 ? rng.int(900, 1095) : rng.int(0, 1095);
    users.push({
      id: i + 1,
      name: `${first} ${last}`,
      email: `${first}.${last}@example.com`.toLowerCase(),
      phone: `+${group.dial} ${rng.int(200, 999)} ${rng.int(100, 999)} ${pad(rng.int(0, 9999), 4)}`,
      roleId,
      status,
      createdAt: fmtDate(TODAY_DAY - age),
    });
  }
  return users;
}

// -------------------------------------------------------------- sessions

const DEVICES = [
  "Chrome 130 on Windows 11",
  "Safari 18 on macOS Sequoia",
  "Firefox 132 on Ubuntu 24.04",
  "Edge 130 on Windows 11",
  "Chrome 130 on Android 15",
  "Safari 18 on iOS 18",
  "Chrome 130 on macOS Sonoma",
];
const IP_FIRST = [
  34, 52, 77, 81, 85, 91, 95, 109, 130, 145, 178, 185, 194, 203,
];

function buildSessions(rng: Rng, users: User[]): Session[] {
  const eligible = users.filter((u) => u.status !== "blocked");
  const sessions: Session[] = [];
  for (let i = 0; i < SEED_COUNTS.sessions; i++) {
    const active = i < 12;
    const startDay = TODAY_DAY - (active ? rng.int(0, 1) : rng.int(3, 9));
    const startSecs =
      startDay === TODAY_DAY
        ? rng.int(6 * 3600, NOW_SECS - 1)
        : rng.int(0, 86399);
    const hours = active ? rng.pick([48, 72, 168]) : rng.pick([8, 24]);
    sessions.push({
      id: i + 1,
      userId: rng.pick(eligible).id,
      ip: `${rng.pick(IP_FIRST)}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
      device: rng.pick(DEVICES),
      startedAt: fmtDateTime(startDay, startSecs),
      expiresAt: fmtDateTime(startDay, startSecs + hours * 3600),
      active,
    });
  }
  // newest first reads naturally in a table
  sessions.sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0,
  );
  sessions.forEach((s, i) => (s.id = i + 1));
  return sessions;
}

// ------------------------------------------------------------- catalogue

const MANUFACTURERS: [string, string, string][] = [
  ["Apple", "United States", "APL"],
  ["Samsung", "South Korea", "SAM"],
  ["Google", "United States", "GOO"],
  ["Xiaomi", "China", "XIA"],
  ["OnePlus", "China", "ONE"],
  ["Motorola", "United States", "MOT"],
  ["Sony", "Japan", "SON"],
  ["Nothing", "United Kingdom", "NTH"],
];

interface ModelSpec {
  m: number; // manufacturer index
  name: string;
  year: number;
  price: number;
  cpu: string;
  ram: number;
  display: string;
}

const MODEL_SPECS: ModelSpec[] = [
  {
    m: 0,
    name: "iPhone 15",
    year: 2023,
    price: 799,
    cpu: "A16 Bionic",
    ram: 6,
    display: '6.1" OLED 60 Hz',
  },
  {
    m: 0,
    name: "iPhone 15 Pro",
    year: 2023,
    price: 999,
    cpu: "A17 Pro",
    ram: 8,
    display: '6.1" LTPO OLED 120 Hz',
  },
  {
    m: 0,
    name: "iPhone 15 Pro Max",
    year: 2023,
    price: 1199,
    cpu: "A17 Pro",
    ram: 8,
    display: '6.7" LTPO OLED 120 Hz',
  },
  {
    m: 0,
    name: "iPhone 16",
    year: 2024,
    price: 799,
    cpu: "A18",
    ram: 8,
    display: '6.1" OLED 60 Hz',
  },
  {
    m: 0,
    name: "iPhone 16 Plus",
    year: 2024,
    price: 899,
    cpu: "A18",
    ram: 8,
    display: '6.7" OLED 60 Hz',
  },
  {
    m: 0,
    name: "iPhone 16 Pro",
    year: 2024,
    price: 999,
    cpu: "A18 Pro",
    ram: 8,
    display: '6.3" LTPO OLED 120 Hz',
  },
  {
    m: 0,
    name: "iPhone 16 Pro Max",
    year: 2024,
    price: 1199,
    cpu: "A18 Pro",
    ram: 8,
    display: '6.9" LTPO OLED 120 Hz',
  },
  {
    m: 0,
    name: "iPhone SE (3rd gen)",
    year: 2022,
    price: 429,
    cpu: "A15 Bionic",
    ram: 4,
    display: '4.7" LCD 60 Hz',
  },
  {
    m: 1,
    name: "Galaxy S24",
    year: 2024,
    price: 799,
    cpu: "Snapdragon 8 Gen 3",
    ram: 8,
    display: '6.2" AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy S24+",
    year: 2024,
    price: 999,
    cpu: "Exynos 2400",
    ram: 12,
    display: '6.7" AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy S24 Ultra",
    year: 2024,
    price: 1299,
    cpu: "Snapdragon 8 Gen 3",
    ram: 12,
    display: '6.8" AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy S25",
    year: 2025,
    price: 799,
    cpu: "Snapdragon 8 Elite",
    ram: 12,
    display: '6.2" AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy S25 Ultra",
    year: 2025,
    price: 1299,
    cpu: "Snapdragon 8 Elite",
    ram: 12,
    display: '6.9" AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy Z Flip6",
    year: 2024,
    price: 1099,
    cpu: "Snapdragon 8 Gen 3",
    ram: 12,
    display: '6.7" foldable AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy Z Fold6",
    year: 2024,
    price: 1899,
    cpu: "Snapdragon 8 Gen 3",
    ram: 12,
    display: '7.6" foldable AMOLED 120 Hz',
  },
  {
    m: 1,
    name: "Galaxy A55",
    year: 2024,
    price: 439,
    cpu: "Exynos 1480",
    ram: 8,
    display: '6.6" Super AMOLED 120 Hz',
  },
  {
    m: 2,
    name: "Pixel 8",
    year: 2023,
    price: 699,
    cpu: "Tensor G3",
    ram: 8,
    display: '6.2" OLED 120 Hz',
  },
  {
    m: 2,
    name: "Pixel 8 Pro",
    year: 2023,
    price: 999,
    cpu: "Tensor G3",
    ram: 12,
    display: '6.7" LTPO OLED 120 Hz',
  },
  {
    m: 2,
    name: "Pixel 8a",
    year: 2024,
    price: 499,
    cpu: "Tensor G3",
    ram: 8,
    display: '6.1" OLED 120 Hz',
  },
  {
    m: 2,
    name: "Pixel 9",
    year: 2024,
    price: 799,
    cpu: "Tensor G4",
    ram: 12,
    display: '6.3" OLED 120 Hz',
  },
  {
    m: 2,
    name: "Pixel 9 Pro",
    year: 2024,
    price: 999,
    cpu: "Tensor G4",
    ram: 16,
    display: '6.3" LTPO OLED 120 Hz',
  },
  {
    m: 3,
    name: "Xiaomi 14",
    year: 2023,
    price: 899,
    cpu: "Snapdragon 8 Gen 3",
    ram: 12,
    display: '6.36" AMOLED 120 Hz',
  },
  {
    m: 3,
    name: "Xiaomi 14 Ultra",
    year: 2024,
    price: 1299,
    cpu: "Snapdragon 8 Gen 3",
    ram: 16,
    display: '6.73" LTPO AMOLED 120 Hz',
  },
  {
    m: 3,
    name: "Xiaomi 15",
    year: 2024,
    price: 899,
    cpu: "Snapdragon 8 Elite",
    ram: 12,
    display: '6.36" AMOLED 120 Hz',
  },
  {
    m: 3,
    name: "Redmi Note 13 Pro",
    year: 2023,
    price: 349,
    cpu: "Snapdragon 7s Gen 2",
    ram: 8,
    display: '6.67" AMOLED 120 Hz',
  },
  {
    m: 3,
    name: "Xiaomi 14T Pro",
    year: 2024,
    price: 649,
    cpu: "Dimensity 9300+",
    ram: 12,
    display: '6.67" AMOLED 144 Hz',
  },
  {
    m: 4,
    name: "OnePlus 12",
    year: 2024,
    price: 799,
    cpu: "Snapdragon 8 Gen 3",
    ram: 12,
    display: '6.82" LTPO AMOLED 120 Hz',
  },
  {
    m: 4,
    name: "OnePlus 12R",
    year: 2024,
    price: 499,
    cpu: "Snapdragon 8 Gen 2",
    ram: 8,
    display: '6.78" LTPO AMOLED 120 Hz',
  },
  {
    m: 4,
    name: "OnePlus 13",
    year: 2024,
    price: 899,
    cpu: "Snapdragon 8 Elite",
    ram: 12,
    display: '6.82" LTPO AMOLED 120 Hz',
  },
  {
    m: 4,
    name: "OnePlus Nord 4",
    year: 2024,
    price: 429,
    cpu: "Snapdragon 7+ Gen 3",
    ram: 8,
    display: '6.74" AMOLED 120 Hz',
  },
  {
    m: 5,
    name: "Razr 40 Ultra",
    year: 2023,
    price: 999,
    cpu: "Snapdragon 8+ Gen 1",
    ram: 8,
    display: '6.9" foldable pOLED 165 Hz',
  },
  {
    m: 5,
    name: "Edge 50 Pro",
    year: 2024,
    price: 599,
    cpu: "Snapdragon 7 Gen 3",
    ram: 12,
    display: '6.7" pOLED 144 Hz',
  },
  {
    m: 5,
    name: "Moto G84",
    year: 2023,
    price: 249,
    cpu: "Snapdragon 695",
    ram: 8,
    display: '6.55" pOLED 120 Hz',
  },
  {
    m: 5,
    name: "Moto G Power (2024)",
    year: 2024,
    price: 199,
    cpu: "Dimensity 6300",
    ram: 6,
    display: '6.7" LCD 120 Hz',
  },
  {
    m: 6,
    name: "Xperia 1 V",
    year: 2023,
    price: 1399,
    cpu: "Snapdragon 8 Gen 2",
    ram: 12,
    display: '6.5" OLED 120 Hz',
  },
  {
    m: 6,
    name: "Xperia 5 V",
    year: 2023,
    price: 999,
    cpu: "Snapdragon 8 Gen 2",
    ram: 8,
    display: '6.1" OLED 120 Hz',
  },
  {
    m: 6,
    name: "Xperia 10 VI",
    year: 2024,
    price: 399,
    cpu: "Snapdragon 6 Gen 1",
    ram: 6,
    display: '6.1" OLED 60 Hz',
  },
  {
    m: 7,
    name: "Nothing Phone (2)",
    year: 2023,
    price: 599,
    cpu: "Snapdragon 8+ Gen 1",
    ram: 8,
    display: '6.7" LTPO OLED 120 Hz',
  },
  {
    m: 7,
    name: "Nothing Phone (2a)",
    year: 2024,
    price: 349,
    cpu: "Dimensity 7200 Pro",
    ram: 8,
    display: '6.7" AMOLED 120 Hz',
  },
  {
    m: 7,
    name: "Nothing Phone (3a)",
    year: 2025,
    price: 379,
    cpu: "Snapdragon 7s Gen 3",
    ram: 8,
    display: '6.77" AMOLED 120 Hz',
  },
];

const COLORS: [string, string][][] = [
  [
    ["Black Titanium", "BLK"],
    ["Natural Titanium", "NAT"],
    ["White", "WHT"],
    ["Blue", "BLU"],
    ["Pink", "PNK"],
  ],
  [
    ["Phantom Black", "BLK"],
    ["Marble Gray", "GRY"],
    ["Cobalt Violet", "VIO"],
    ["Onyx Black", "ONX"],
    ["Amber Yellow", "YLW"],
  ],
  [
    ["Obsidian", "OBS"],
    ["Porcelain", "POR"],
    ["Hazel", "HAZ"],
    ["Peony", "PEO"],
    ["Bay", "BAY"],
  ],
  [
    ["Black", "BLK"],
    ["White", "WHT"],
    ["Green", "GRN"],
    ["Blue", "BLU"],
    ["Titanium", "TIT"],
  ],
  [
    ["Silky Black", "BLK"],
    ["Flowy Emerald", "EMR"],
    ["Glacial White", "WHT"],
    ["Arctic Blue", "ARC"],
    ["Black Eclipse", "ECL"],
  ],
  [
    ["Midnight Blue", "MID"],
    ["Pantone Peach", "PCH"],
    ["Carbon Gray", "CRB"],
    ["Cherry Red", "RED"],
    ["Forest Green", "GRN"],
  ],
  [
    ["Black", "BLK"],
    ["Platinum Silver", "SLV"],
    ["Forest Green", "GRN"],
    ["Frosted Blue", "BLU"],
    ["Khaki Green", "KHK"],
  ],
  [
    ["White", "WHT"],
    ["Black", "BLK"],
    ["Light Gray", "LGR"],
    ["Dark Gray", "DGR"],
    ["Blue", "BLU"],
  ],
];

function buildCatalogue(rng: Rng): {
  manufacturers: Manufacturer[];
  models: Model[];
  products: Product[];
} {
  const manufacturers: Manufacturer[] = MANUFACTURERS.map(
    ([name, country], i) => ({ id: i + 1, name, country }),
  );
  const models: Model[] = MODEL_SPECS.map((s, i) => ({
    id: i + 1,
    manufacturerId: s.m + 1,
    name: s.name,
    year: s.year,
  }));
  const products: Product[] = [];
  MODEL_SPECS.forEach((spec, mi) => {
    const storages =
      spec.price >= 1000
        ? [256, 512, 1024]
        : spec.price >= 400
          ? [128, 256, 512]
          : [64, 128, 256];
    const step = spec.price >= 800 ? 100 : spec.price >= 400 ? 50 : 30;
    const palette = COLORS[spec.m] as [string, string][];
    const combos: [number, number][] = [];
    for (let s = 0; s < storages.length; s++)
      for (let c = 0; c < palette.length; c++) combos.push([s, c]);
    const chosen = rng
      .shuffle(combos)
      .slice(0, 3)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [s, c] of chosen) {
      const [color, code] = palette[c] as [string, string];
      const storage = storages[s] as number;
      products.push({
        id: products.length + 1,
        modelId: mi + 1,
        sku: `${(MANUFACTURERS[spec.m] as [string, string, string])[2]}${pad(mi + 1)}-${storage}-${code}`,
        color,
        price: spec.price + s * step,
        processor: spec.cpu,
        ram: spec.ram,
        storage,
        display: spec.display,
        stock: rng.chance(0.1) ? 0 : rng.int(3, 200),
      });
    }
  });
  return { manufacturers, models, products };
}

// ----------------------------------------------------------------- shops

const SHOP_CATEGORIES: [string, string][] = [
  ["Supermarket", "A phone corner inside a large grocery supermarket."],
  ["City mall", "A shop on the high street or inside a shopping mall."],
  [
    "Electronics store",
    "A dedicated consumer electronics store with a full range.",
  ],
  [
    "Airport kiosk",
    "A small kiosk in an airport terminal: popular models and accessories.",
  ],
  [
    "Online pickup point",
    "A locker or counter where web orders are collected.",
  ],
];

const BRANDS: string[][] = [
  ["FreshMart", "MegaSave", "CityBasket", "GreenGrocer Plus"],
  ["Galleria Mobile", "Plaza Phones", "Mall Connect"],
  ["TechPoint", "VoltHouse", "Circuit Hub", "Gadget Barn"],
  ["SkyLink Mobile"],
  ["ClickCollect"],
];

const CITIES: [string, string, number, number, string][] = [
  ["New York", "USA", 40.7128, -74.006, "1"],
  ["Los Angeles", "USA", 34.0522, -118.2437, "1"],
  ["Chicago", "USA", 41.8781, -87.6298, "1"],
  ["Toronto", "Canada", 43.6532, -79.3832, "1"],
  ["London", "UK", 51.5074, -0.1278, "44"],
  ["Manchester", "UK", 53.4808, -2.2426, "44"],
  ["Paris", "France", 48.8566, 2.3522, "33"],
  ["Lyon", "France", 45.764, 4.8357, "33"],
  ["Berlin", "Germany", 52.52, 13.405, "49"],
  ["Munich", "Germany", 48.1351, 11.582, "49"],
  ["Madrid", "Spain", 40.4168, -3.7038, "34"],
  ["Barcelona", "Spain", 41.3874, 2.1686, "34"],
  ["Rome", "Italy", 41.9028, 12.4964, "39"],
  ["Milan", "Italy", 45.4642, 9.19, "39"],
  ["Warsaw", "Poland", 52.2297, 21.0122, "48"],
  ["Amsterdam", "Netherlands", 52.3676, 4.9041, "31"],
  ["Stockholm", "Sweden", 59.3293, 18.0686, "46"],
  ["Istanbul", "Turkey", 41.0082, 28.9784, "90"],
  ["Dubai", "UAE", 25.2048, 55.2708, "971"],
  ["Mumbai", "India", 19.076, 72.8777, "91"],
  ["Singapore", "Singapore", 1.3521, 103.8198, "65"],
  ["Tokyo", "Japan", 35.6762, 139.6503, "81"],
  ["Seoul", "South Korea", 37.5665, 126.978, "82"],
  ["Sydney", "Australia", -33.8688, 151.2093, "61"],
  ["Sao Paulo", "Brazil", -23.5505, -46.6333, "55"],
];

const STREETS = [
  "Main Street",
  "High Street",
  "Station Road",
  "Market Square",
  "Park Avenue",
  "Victoria Road",
  "King Street",
  "Queen Street",
  "Church Lane",
  "Harbour Way",
  "Union Street",
  "Maple Avenue",
  "Mill Road",
  "Garden Street",
  "Central Boulevard",
];
const DISTRICTS = [
  "Central",
  "North",
  "Riverside",
  "Old Town",
  "Harbour",
  "West End",
  "Gateway",
];

function buildShops(rng: Rng): { categories: ShopCategory[]; shops: Shop[] } {
  const categories: ShopCategory[] = SHOP_CATEGORIES.map(
    ([name, description], i) => ({ id: i + 1, name, description }),
  );
  const cityOrder = [...rng.shuffle(CITIES), ...rng.shuffle(CITIES)];
  const catOrder = rng.shuffle(
    Array.from({ length: SEED_COUNTS.shops }, (_, i) => i % 5),
  );
  const names = new Set<string>();
  const shops: Shop[] = [];
  for (let i = 0; i < SEED_COUNTS.shops; i++) {
    const [city, country, lat, lng, dial] = cityOrder[
      i
    ] as (typeof CITIES)[number];
    const cat = catOrder[i] as number;
    const brand = rng.pick(BRANDS[cat] as string[]);
    const make = (extra: string): string =>
      cat === 3
        ? `${brand} ${city} Airport${extra}`
        : cat === 4
          ? `${brand} ${city} Point${extra}`
          : `${brand} ${city}${extra}`;
    let name = make("");
    while (names.has(name)) name = make(` ${rng.pick(DISTRICTS)}`);
    names.add(name);
    const street =
      cat === 3
        ? `${city} Airport, Terminal ${rng.int(1, 3)}`
        : `${rng.int(1, 240)} ${rng.pick(STREETS)}`;
    shops.push({
      id: i + 1,
      name,
      categoryId: cat + 1,
      city: `${city}, ${country}`,
      address: street,
      lat: Math.round((lat + (rng.next() - 0.5) * 0.1) * 10000) / 10000,
      lng: Math.round((lng + (rng.next() - 0.5) * 0.1) * 10000) / 10000,
      phone: `+${dial} ${rng.int(200, 999)} ${rng.int(100, 999)} ${pad(rng.int(0, 9999), 4)}`,
    });
  }
  return { categories, shops };
}

// ---------------------------------------------------------------- orders

/** how busy each month is: a December peak, a January lull, an autumn rise */
const SEASON: Record<string, number> = {
  "2025-11": 1.4,
  "2025-12": 1.8,
  "2026-01": 0.75,
  "2026-02": 0.7,
  "2026-03": 0.9,
  "2026-04": 0.95,
  "2026-05": 1,
  "2026-06": 1,
  "2026-07": 1.05,
  "2026-08": 1.1,
  "2026-09": 1.25,
  "2026-10": 1.2,
};

const PAID_STATUSES: OrderStatus[] = ["paid", "shipped", "delivered"];
const STATUS_ORDER: OrderStatus[] = [
  "new",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

function statusWeights(age: number): number[] {
  // new, paid, shipped, delivered, cancelled, refunded
  if (age <= 3) return [35, 30, 25, 0, 10, 0];
  if (age <= 10) return [10, 20, 30, 30, 5, 5];
  return [1, 2, 1, 80, 9, 7];
}

const NOTES_ANY = [
  "Gift wrap please",
  "Call before delivery",
  "Leave with the concierge",
  "Customer asked for an invoice",
  "Pickup in the evening",
  "Trade-in discussed",
  "Add a screen protector",
  "Business purchase",
  "Second floor, ring twice",
];
const NOTES_CANCELLED = [
  "Customer changed their mind",
  "Payment declined",
  "Out of stock at the time",
  "Duplicate order",
];
const NOTES_REFUNDED = [
  "Returned within 14 days",
  "Replaced after a warranty claim",
  "Faulty screen, refunded",
  "Wrong colour delivered",
];

function buildOrders(
  rng: Rng,
  users: User[],
  shops: Shop[],
  products: Product[],
  customerRoleIds: number[],
): Order[] {
  const days: number[] = [];
  const dayWeights: number[] = [];
  for (let d = WINDOW_START; d <= TODAY_DAY; d++) {
    days.push(d);
    dayWeights.push(SEASON[monthOf(d)] ?? 1);
  }
  const monthDays = MONTHS.map((m) => days.filter((d) => monthOf(d) === m));

  const shopWeights = shops.map(() => 0.3 + rng.next() * 1.7);
  const buyers = users.filter((u) => u.status !== "invited");
  const customerish = buyers.filter((u) => customerRoleIds.includes(u.roleId));

  const picked: { day: number; seq: number }[] = [];
  for (let i = 0; i < SEED_COUNTS.orders; i++) {
    // the first twelve orders guarantee that every month has at least one
    const day =
      i < 12
        ? rng.pick(monthDays[i] as number[])
        : (days[rng.weighted(dayWeights)] as number);
    picked.push({ day, seq: i });
  }
  picked.sort((a, b) => a.day - b.day || a.seq - b.seq);

  const orders: Order[] = [];
  picked.forEach(({ day }, idx) => {
    const date = fmtDate(day);
    let user = rng.chance(0.8) ? rng.pick(customerish) : rng.pick(buyers);
    for (let t = 0; t < 30 && user.createdAt > date; t++) {
      user = rng.chance(0.8) ? rng.pick(customerish) : rng.pick(buyers);
    }
    if (user.createdAt > date) user = users[0] as User;

    const count = [1, 2, 3, 4][rng.weighted([55, 28, 12, 5])] as number;
    const items: OrderItem[] = [];
    const used = new Set<number>();
    while (items.length < count) {
      let p = rng.pick(products);
      if (rng.chance(0.5)) {
        const q = rng.pick(products);
        if (q.price < p.price) p = q;
      }
      if (used.has(p.id)) continue;
      used.add(p.id);
      items.push({
        productId: p.id,
        qty: [1, 2, 3][rng.weighted([75, 18, 7])] as number,
        price: p.price,
      });
    }
    const status = STATUS_ORDER[
      rng.weighted(statusWeights(TODAY_DAY - day))
    ] as OrderStatus;
    const note = rng.chance(0.65)
      ? ""
      : status === "cancelled"
        ? rng.pick(NOTES_CANCELLED)
        : status === "refunded"
          ? rng.pick(NOTES_REFUNDED)
          : rng.pick(NOTES_ANY);
    orders.push({
      id: idx + 1,
      userId: user.id,
      shopId: (shops[rng.weighted(shopWeights)] as Shop).id,
      status,
      createdAt: date,
      items,
      total: items.reduce((sum, it) => sum + it.qty * it.price, 0),
      note,
    });
  });
  return orders;
}

// ---------------------------------------------------------------- budget

const round10 = (n: number): number => Math.round(n / 10) * 10;

function buildBudget(rng: Rng, orders: Order[], shops: Shop[]): BudgetEntry[] {
  // income per month and shop, from the orders that were actually paid
  const income = new Map<string, Map<number, number>>();
  for (const m of MONTHS) income.set(m, new Map());
  for (const o of orders) {
    if (!PAID_STATUSES.includes(o.status)) continue;
    const perShop = income.get(o.createdAt.slice(0, 7)) as Map<number, number>;
    perShop.set(o.shopId, (perShop.get(o.shopId) ?? 0) + o.total);
  }
  const monthTotal = (m: string): number => {
    let s = 0;
    for (const v of (income.get(m) as Map<number, number>).values()) s += v;
    return s;
  };
  // costs are sized on an average full month (everything but the current one)
  const full = MONTHS.slice(0, -1);
  const avg = full.reduce((s, m) => s + monthTotal(m), 0) / full.length;

  const budget: BudgetEntry[] = [];
  const add = (
    month: string,
    kind: BudgetEntry["kind"],
    amount: number,
    shopId: number,
    note: string,
  ): void => {
    budget.push({ id: budget.length + 1, month, kind, amount, shopId, note });
  };
  const shopIds = shops.map((s) => s.id);

  for (const month of MONTHS) {
    const season = SEASON[month] ?? 1;
    const perShop = income.get(month) as Map<number, number>;

    // income: the three best shops get their own row, the rest is the company row
    const ranked = [...perShop.entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    );
    let rest = monthTotal(month);
    for (const [shopId, amount] of ranked.slice(0, 3)) {
      add(month, "income", amount, shopId, "Shop sales");
      rest -= amount;
    }
    if (rest > 0)
      add(month, "income", rest, 0, "Other shops and online pickup sales");

    add(
      month,
      "salary",
      round10(avg * 0.2 * (0.97 + rng.next() * 0.06)),
      0,
      "Head office payroll",
    );
    for (const shopId of rng.shuffle(shopIds).slice(0, 3)) {
      add(
        month,
        "salary",
        round10(avg * 0.025 * (0.8 + rng.next() * 0.4)),
        shopId,
        "Shop staff payroll",
      );
    }
    add(
      month,
      "supply",
      round10(avg * 0.34 * (0.75 + 0.25 * season + rng.next() * 0.1)),
      0,
      "Phone and accessory purchases",
    );
    for (const shopId of rng.shuffle(shopIds).slice(0, 2)) {
      add(
        month,
        "supply",
        round10(avg * 0.03 * (0.8 + rng.next() * 0.4)),
        shopId,
        "Local restock",
      );
    }
    add(
      month,
      "delivery",
      round10(avg * 0.05 * (0.9 + rng.next() * 0.2)),
      0,
      "Courier contracts",
    );
    add(
      month,
      "delivery",
      round10(avg * 0.02 * (0.8 + rng.next() * 0.4)),
      rng.pick(shopIds),
      "Same-day delivery",
    );
  }
  return budget;
}

// -------------------------------------------------------------------- db

export function seedDb(seed = 20261104): Db {
  const rng = createRng(seed);
  const permissions = buildPermissions();
  const roleBuild = buildRoles(rng, permissions);
  const users = buildUsers(rng, roleBuild);
  const sessions = buildSessions(rng, users);
  const { manufacturers, models, products } = buildCatalogue(rng);
  const { categories, shops } = buildShops(rng);
  const orders = buildOrders(
    rng,
    users,
    shops,
    products,
    roleBuild.customerRoleIds,
  );
  const budget = buildBudget(rng, orders, shops);
  return {
    users,
    roles: roleBuild.roles,
    permissions,
    sessions,
    manufacturers,
    models,
    products,
    shopCategories: categories,
    shops,
    orders,
    budget,
  };
}
