/**
 * The data and the pure rules of the virtual machines panel: the seed
 * (machines, snapshots, volumes, firewall rules, SSH keys), the billing
 * arithmetic, SSH key parsing and the simulated console of a machine.
 */
import { money } from "../../blocks/admin-shell/shell.ts";
import {
  type Vm,
  HOURS_PER_MONTH,
  STATUS_TONE,
  dollars,
  statusLabel,
} from "../../blocks/vm-card/vm.ts";
import {
  imageOf,
  regionOf,
  type KeyChoice,
} from "../../blocks/vm-wizard/wizard.ts";
import type { Rule } from "../../blocks/rules-table/rules.ts";
import { type RunResult, run } from "../../blocks/terminal-sim/commands.ts";
import { type Fs, makeFs } from "../../blocks/terminal-sim/fs.ts";
import { hashId } from "../../blocks/terminal-sim/git.ts";
import type { Runner } from "../../blocks/terminal-sim/session.ts";
import { series } from "../../blocks/metric-charts/metrics.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import { card } from "../../blocks/stat-cards/cards.ts";

// ---- the billing month: a fixed "today", the app has no clock ----

export const MONTH = {
  label: "November 2026",
  /** Days gone, and days in the month. */
  day: 18,
  days: 30,
};

const vm = (
  id: string,
  name: string,
  rest: Partial<Vm> &
    Pick<
      Vm,
      "image" | "region" | "ip" | "vcpu" | "ram" | "disk" | "hourly" | "hours"
    >,
): Vm => ({
  id,
  name,
  status: "running",
  intent: "",
  tags: [],
  ...rest,
});

export const SEED_VMS: Vm[] = [
  vm("vm-1", "web-frontend-01", {
    image: "ubuntu-24",
    region: "fra",
    ip: "203.0.113.21",
    vcpu: 2,
    ram: 4,
    disk: 80,
    hourly: 0.035,
    hours: 432,
    tags: ["prod", "nginx"],
  }),
  vm("vm-2", "web-frontend-02", {
    image: "ubuntu-24",
    region: "ams",
    ip: "203.0.113.22",
    vcpu: 2,
    ram: 4,
    disk: 80,
    hourly: 0.035,
    hours: 432,
    tags: ["prod", "nginx"],
  }),
  vm("vm-3", "db-primary", {
    image: "debian-12",
    region: "fra",
    ip: "10.0.0.31",
    vcpu: 4,
    ram: 8,
    disk: 160,
    hourly: 0.065,
    hours: 432,
    tags: ["prod", "postgres"],
  }),
  vm("vm-4", "build-runner", {
    image: "debian-12",
    region: "nyc",
    ip: "203.0.113.45",
    vcpu: 8,
    ram: 16,
    disk: 320,
    hourly: 0.1325,
    hours: 96,
    status: "stopped",
    tags: ["ci"],
  }),
  vm("vm-5", "mail-relay", {
    image: "alpine-3",
    region: "ams",
    ip: "203.0.113.57",
    vcpu: 1,
    ram: 1,
    disk: 25,
    hourly: 0.0125,
    hours: 432,
    tags: ["smtp"],
  }),
  vm("vm-6", "legacy-erp", {
    image: "windows-2022",
    region: "ams",
    ip: "203.0.113.63",
    vcpu: 2,
    ram: 4,
    disk: 80,
    hourly: 0.071,
    hours: 214,
    status: "error",
    tags: ["windows"],
  }),
];

export interface Snapshot {
  id: string;
  vmId: string;
  name: string;
  /** GB. */
  size: number;
  created: string;
  status: "ready" | "creating";
}

export const SEED_SNAPSHOTS: Snapshot[] = [
  {
    id: "sn-1",
    vmId: "vm-1",
    name: "before-nginx-upgrade",
    size: 14,
    created: "12 Nov 2026, 09:40",
    status: "ready",
  },
  {
    id: "sn-2",
    vmId: "vm-1",
    name: "weekly-auto",
    size: 15,
    created: "15 Nov 2026, 03:00",
    status: "ready",
  },
  {
    id: "sn-3",
    vmId: "vm-3",
    name: "weekly-auto",
    size: 62,
    created: "15 Nov 2026, 03:00",
    status: "ready",
  },
  {
    id: "sn-4",
    vmId: "vm-3",
    name: "pre-migration",
    size: 58,
    created: "9 Nov 2026, 17:25",
    status: "ready",
  },
];

export interface Volume {
  id: string;
  name: string;
  /** GB. */
  size: number;
  /** The machine it is attached to, or empty. */
  vmId: string;
  region: string;
}

export const SEED_VOLUMES: Volume[] = [
  { id: "vol-1", name: "pg-data", size: 200, vmId: "vm-3", region: "fra" },
  { id: "vol-2", name: "uploads", size: 100, vmId: "vm-1", region: "fra" },
  { id: "vol-3", name: "ci-cache", size: 50, vmId: "vm-4", region: "nyc" },
  { id: "vol-4", name: "backup-staging", size: 150, vmId: "", region: "fra" },
  { id: "vol-5", name: "mail-spool", size: 20, vmId: "", region: "ams" },
];

const rule = (
  id: string,
  port: string,
  source: string,
  note: string,
  extra: Partial<Rule> = {},
): Rule => ({
  id,
  proto: "tcp",
  port,
  source,
  action: "allow",
  note,
  ...extra,
});

export const SEED_RULES: Record<string, Rule[]> = {
  "vm-1": [
    rule("r1", "22", "198.51.100.0/24", "SSH from the office"),
    rule("r2", "80", "any", "HTTP"),
    rule("r3", "443", "any", "HTTPS"),
  ],
  "vm-2": [
    rule("r1", "22", "198.51.100.0/24", "SSH from the office"),
    rule("r2", "443", "any", "HTTPS"),
  ],
  "vm-3": [
    rule("r1", "22", "10.0.0.0/16", "SSH from the private network"),
    rule("r2", "5432", "10.0.0.0/16", "Postgres for the app servers"),
  ],
  "vm-4": [rule("r1", "22", "any", "SSH")],
  "vm-5": [
    rule("r1", "22", "198.51.100.0/24", "SSH from the office"),
    rule("r2", "587", "any", "SMTP submission"),
  ],
  "vm-6": [rule("r1", "3389", "198.51.100.14", "RDP for the vendor")],
};

// ---- SSH keys ----

export interface SshKey {
  id: string;
  name: string;
  type: string;
  fingerprint: string;
  added: string;
  /** The body of the public key (base64). */
  blob: string;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Pure: a believable `SHA256:...` fingerprint (43 characters) of a key body. */
export function fingerprintOf(blob: string): string {
  let out = "";
  for (let i = 0; i < 43; i++) {
    out += B64[parseInt(hashId(`${blob}:${i}`).slice(0, 2), 16) % 64];
  }
  return `SHA256:${out}`;
}

export const KEY_TYPES = ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"];

export type ParsedKey =
  | {
      ok: true;
      type: string;
      blob: string;
      comment: string;
      fingerprint: string;
    }
  | { ok: false; error: string };

/** Pure: read a line of a `.pub` file: `type body comment`. */
export function parsePublicKey(text: string): ParsedKey {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0)
    return {
      ok: false,
      error: "Paste the public key (the contents of the .pub file).",
    };
  if (!KEY_TYPES.includes(parts[0]))
    return {
      ok: false,
      error: `Unknown key type "${parts[0]}". Use ssh-ed25519, ssh-rsa or ecdsa-sha2-nistp256.`,
    };
  const blob = parts[1] ?? "";
  if (blob.length < 20 || !/^[A-Za-z0-9+/]+={0,2}$/.test(blob))
    return {
      ok: false,
      error: "The key body is missing or is not valid base64.",
    };
  return {
    ok: true,
    type: parts[0],
    blob,
    comment: parts.slice(2).join(" "),
    fingerprint: fingerprintOf(blob),
  };
}

/** Pure: the errors of the "add a key" form, by field id (`{}` when fine). */
export function validateKeyForm(
  name: string,
  publicKey: string,
  existing: SshKey[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const n = name.trim();
  if (n.length < 2)
    errors.name = "Give the key a name of at least 2 characters.";
  else if (n.length > 40) errors.name = "Use at most 40 characters.";
  else if (existing.some((k) => k.name.toLowerCase() === n.toLowerCase()))
    errors.name = "A key with this name already exists.";
  const parsed = parsePublicKey(publicKey);
  if (!parsed.ok) errors.public = parsed.error;
  else if (existing.some((k) => k.fingerprint === parsed.fingerprint))
    errors.public = "This key is already added.";
  return errors;
}

const seedKey = (
  id: string,
  name: string,
  type: string,
  blob: string,
  added: string,
): SshKey => ({
  id,
  name,
  type,
  blob,
  added,
  fingerprint: fingerprintOf(blob),
});

export const SEED_KEYS: SshKey[] = [
  seedKey(
    "k1",
    "alex-laptop",
    "ssh-ed25519",
    "AAAAC3NzaC1lZDI1NTE5AAAAIKq3vBn2Zt8rFh1LxW0cYdE4mUo7sPjA9gTiNvR5yXk2",
    "2 Mar 2026",
  ),
  seedKey(
    "k2",
    "ci-deploy",
    "ssh-rsa",
    "AAAAB3NzaC1yc2EAAAADAQABAAABgQDm4Zt7pLk0xYvB2nQeW9sRjH6cUaT1fGoIiNd8MzE3",
    "21 Jun 2026",
  ),
  seedKey(
    "k3",
    "ops-yubikey",
    "ecdsa-sha2-nistp256",
    "AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKd9Qw2LmXz4vTnC7sAeRyH0uJkP",
    "5 Sep 2026",
  ),
];

export const keyChoices = (keys: SshKey[]): KeyChoice[] =>
  keys.map((k) => ({ id: k.id, name: k.name, fingerprint: k.fingerprint }));

/** Pure: how many machines were made with a key (the seed says which; new ones carry none). */
export const KEY_USE: Record<string, string[]> = {
  k1: ["vm-1", "vm-2", "vm-3", "vm-5"],
  k2: ["vm-1", "vm-2", "vm-4"],
  k3: ["vm-3"],
};

// ---- billing ----

/** Dollars per GB for a month: boot disks, extra volumes and snapshots. */
export const STORAGE_RATE = { disk: 0.08, volume: 0.1, snapshot: 0.05 };

const cents = (n: number): number => Math.round(n * 100) / 100;

export interface BillLine {
  id: string;
  name: string;
  plan: string;
  hours: number;
  rate: number;
  compute: number;
  storage: number;
  total: number;
}

/** Pure: what each machine has cost so far this month. */
export function billLines(
  vms: Vm[],
  volumes: Volume[],
  snapshots: Snapshot[],
): BillLine[] {
  const share = MONTH.day / MONTH.days;
  return vms.map((v) => {
    const vol = volumes
      .filter((x) => x.vmId === v.id)
      .reduce((n, x) => n + x.size, 0);
    const snap = snapshots
      .filter((x) => x.vmId === v.id)
      .reduce((n, x) => n + x.size, 0);
    const compute = cents(v.hours * v.hourly);
    const storage = cents(
      (v.disk * STORAGE_RATE.disk +
        vol * STORAGE_RATE.volume +
        snap * STORAGE_RATE.snapshot) *
        share,
    );
    return {
      id: v.id,
      name: v.name,
      plan: `${v.vcpu} vCPU, ${v.ram} GB`,
      hours: v.hours,
      rate: v.hourly,
      compute,
      storage,
      total: cents(compute + storage),
    };
  });
}

export interface Bill {
  monthToDate: number;
  /** What the month will cost if nothing changes. */
  projected: number;
  /** Dollars per hour right now, from the running machines. */
  burn: number;
  running: number;
  daily: number[];
}

/** Pure: the summary of the month. Starting or stopping a machine moves the projection. */
export function billOf(
  vms: Vm[],
  volumes: Volume[],
  snapshots: Snapshot[],
): Bill {
  const lines = billLines(vms, volumes, snapshots);
  const monthToDate = cents(lines.reduce((n, l) => n + l.total, 0));
  const live = vms.filter(
    (v) => v.status === "running" || v.status === "starting",
  );
  const burn =
    Math.round(live.reduce((n, v) => n + v.hourly, 0) * 10000) / 10000;
  const left = MONTH.days - MONTH.day;
  const storageDaily =
    lines.reduce((n, l) => n + l.storage, 0) / Math.max(1, MONTH.day);
  const projected = cents(monthToDate + burn * 24 * left + storageDaily * left);
  const average = monthToDate / MONTH.day;
  const noise = series(5, MONTH.day, average, average * 0.25, average * 2);
  const scale = noise.reduce((a, b) => a + b, 0) / Math.max(1, MONTH.day);
  const daily = noise.map((v) => cents((v / (scale || 1)) * average));
  return { monthToDate, projected, burn, running: live.length, daily };
}

export function billCards(bill: Bill): Card[] {
  return [
    card("mtd", "Month to date", dollars(bill.monthToDate), {
      icon: "k-ai-receipt",
      tone: "info",
      hint: `${MONTH.label}, day ${MONTH.day}`,
      series: bill.daily,
    }),
    card("projected", "Projected for the month", dollars(bill.projected), {
      icon: "k-ai-chart",
      tone: "default",
      hint: "if nothing changes",
    }),
    card(
      "burn",
      "Burn rate",
      `$${bill.burn.toFixed(4).replace(/0{1,2}$/, "")}/hr`,
      {
        icon: "k-ai-pulse",
        tone: "warning",
        hint: `${dollars(bill.burn * 24)} a day`,
      },
    ),
    card("live", "Machines billed now", String(bill.running), {
      icon: "k-ai-server",
      tone: "success",
      hint: "running or starting",
    }),
  ];
}

// ---- dashboard numbers ----

export function fleetCards(vms: Vm[]): Card[] {
  const live = vms.filter((v) => v.status === "running");
  const vcpu = live.reduce((n, v) => n + v.vcpu, 0);
  const ram = live.reduce((n, v) => n + v.ram, 0);
  const burn = live.reduce((n, v) => n + v.hourly, 0);
  const bad = vms.filter((v) => v.status === "error").length;
  return [
    card("run", "Running", `${live.length} of ${vms.length}`, {
      icon: "k-ai-server",
      tone: "success",
      hint: bad > 0 ? `${bad} with an error` : "all healthy",
    }),
    card("cpu", "vCPU in use", String(vcpu), {
      icon: "k-ai-pulse",
      tone: "info",
    }),
    card("ram", "Memory in use", `${ram} GB`, {
      icon: "k-ai-database",
      tone: "default",
    }),
    card("burn", "Running cost", `${dollars(burn * HOURS_PER_MONTH)}/mo`, {
      icon: "k-ai-dollar",
      tone: "warning",
      hint: `${money(burn, "$", 3)} an hour`,
    }),
  ];
}

// ---- the console of a machine ----

const OS: Record<
  string,
  { name: string; pretty: string; kernel: string; id: string }
> = {
  "ubuntu-24": {
    name: "Ubuntu",
    pretty: "Ubuntu 24.04.1 LTS",
    kernel: "6.8.0-45-generic",
    id: "ubuntu",
  },
  "debian-12": {
    name: "Debian",
    pretty: "Debian GNU/Linux 12 (bookworm)",
    kernel: "6.1.0-25-amd64",
    id: "debian",
  },
  "fedora-40": {
    name: "Fedora",
    pretty: "Fedora Linux 40 (Server Edition)",
    kernel: "6.8.5-301.fc40.x86_64",
    id: "fedora",
  },
  "alpine-3": {
    name: "Alpine",
    pretty: "Alpine Linux v3.20",
    kernel: "6.6.32-0-virt",
    id: "alpine",
  },
  "windows-2022": {
    name: "Windows",
    pretty: "Ubuntu 24.04.1 LTS",
    kernel: "6.8.0-45-generic",
    id: "ubuntu",
  },
};

/** Pure: the files of a machine's disk. */
export function vmFs(v: Vm): Fs {
  const os = OS[v.image] ?? OS["ubuntu-24"];
  return makeFs({
    "/etc/os-release": `PRETTY_NAME="${os.pretty}"\nNAME="${os.name}"\nID=${os.id}\n`,
    "/etc/hostname": `${v.name}\n`,
    "/home/user/README.txt": `This machine is ${v.name}.\nBack up /var/www before you change anything.\n`,
    "/home/user/deploy.sh":
      "#!/bin/sh\ncd /var/www/app && git pull && systemctl restart app\n",
    "/home/user/.bashrc": "alias ll='ls -l'\n",
    "/var/www/app/index.html": "<h1>It works</h1>\n",
    "/var/www/app/package.json": '{ "name": "app", "version": "1.4.2" }\n',
    "/var/log/syslog":
      "Nov 18 03:00:01 CRON[1021]: (root) CMD (backup)\nNov 18 03:00:09 backup[1022]: snapshot done\n",
    "/var/log/auth.log":
      "Nov 18 08:12:44 sshd[2210]: Accepted publickey for deploy\n",
    "/etc/nginx/nginx.conf":
      "worker_processes auto;\nevents { worker_connections 1024; }\n",
  });
}

/** Pure: how long a machine has been up, from the hours it has run this month. */
export const uptimeOf = (v: Vm): string => {
  const hours = v.status === "running" ? Math.max(1, v.hours % 400) : 0;
  const days = Math.floor(hours / 24);
  return `up ${days} day${days === 1 ? "" : "s"}, ${hours % 24}:${String((hours * 7) % 60).padStart(2, "0")}`;
};

const ok = (lines: string[]): RunResult["out"] =>
  lines.map((text) => ({ kind: "out" as const, text }));

const SERVICES: Record<string, string> = {
  nginx: "A high performance web server and a reverse proxy server",
  ssh: "OpenBSD Secure Shell server",
  docker: "Docker Application Container Engine",
  postgresql: "PostgreSQL RDBMS",
  cron: "Regular background program processing daemon",
};

/** Pure: the extra commands of a machine's console; `null` when the command is for the plain shell. */
export function vmCommand(v: Vm, command: string): string[] | null {
  if (/[&;|>]/.test(command)) return null;
  const [name, ...args] = command.trim().split(/\s+/);
  const os = OS[v.image] ?? OS["ubuntu-24"];
  const gb = (n: number) => `${n}.0Gi`;
  switch (name) {
    case "uname":
      return [
        args.includes("-a")
          ? `Linux ${v.name} ${os.kernel} #45 SMP x86_64 GNU/Linux`
          : "Linux",
      ];
    case "hostname":
      return [v.name];
    case "whoami":
      return ["deploy"];
    case "nproc":
      return [String(v.vcpu)];
    case "uptime":
      return [` ${uptimeOf(v)}, 1 user, load average: 0.12, 0.09, 0.05`];
    case "free":
      return [
        "               total        used        free      shared  buff/cache   available",
        `Mem:           ${gb(v.ram).padEnd(11)} ${gb(Math.round(v.ram * 0.31 * 10) / 10).padEnd(11)} ${gb(Math.round(v.ram * 0.42 * 10) / 10).padEnd(11)} 12Mi        ${gb(Math.round(v.ram * 0.27 * 10) / 10).padEnd(11)} ${gb(Math.round(v.ram * 0.62 * 10) / 10)}`,
        "Swap:          0B          0B          0B",
      ];
    case "df":
      return [
        "Filesystem      Size  Used Avail Use% Mounted on",
        `/dev/vda1       ${String(v.disk).padStart(3)}G   ${String(Math.round(v.disk * 0.23)).padStart(2)}G  ${String(Math.round(v.disk * 0.77)).padStart(3)}G  23% /`,
        "tmpfs           1.9G     0  1.9G   0% /dev/shm",
      ];
    case "ip":
      return [
        "1: lo: <LOOPBACK,UP> mtu 65536",
        "    inet 127.0.0.1/8 scope host lo",
        "2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500",
        `    inet ${v.ip}/24 brd ${v.ip.replace(/\.\d+$/, ".255")} scope global eth0`,
      ];
    case "ping":
      return ["ping: this console has no outbound network."];
    case "top":
      return [
        `top - ${uptimeOf(v)}, 1 user, load average: 0.12, 0.09, 0.05`,
        `Tasks:  94 total,   1 running,  93 sleeping`,
        "  PID USER      %CPU %MEM COMMAND",
        " 1021 www-data   2.3  1.9 nginx",
        " 1180 postgres   1.1  4.2 postgres",
        "    1 root       0.0  0.4 systemd",
      ];
    case "systemctl": {
      if (args[0] !== "status" || !args[1])
        return ["Try: systemctl status nginx"];
      const unit = args[1].replace(/\.service$/, "");
      const desc = SERVICES[unit];
      if (!desc) return [`Unit ${unit}.service could not be found.`];
      return [
        `* ${unit}.service - ${desc}`,
        `     Loaded: loaded (/lib/systemd/system/${unit}.service; enabled)`,
        "     Active: active (running) since Sun 2026-11-01 04:12:09 UTC",
        "   Main PID: 1021",
      ];
    }
    case "reboot":
    case "shutdown":
    case "poweroff":
      return [
        "Use the Reboot or Stop button above the console: this shell cannot power the machine.",
      ];
    case "help":
      return [
        ...run(makeFs({}), "/", "help").out.map((l) => l.text),
        "uname, uptime, free, df, nproc, ip, top, systemctl status <unit>",
      ];
    default:
      return null;
  }
}

/** Pure: a runner for the terminal of one machine: its own commands first, then the plain shell. */
export function vmRunner(v: Vm): Runner {
  return (fs, cwd, command) => {
    const extra = vmCommand(v, command);
    if (extra) return { fs, cwd, out: ok(extra), clear: false, ok: true };
    return run(fs, cwd, command);
  };
}

export const consoleIntro = (v: Vm): string[] => [
  `Welcome to ${OS[v.image]?.pretty ?? "Linux"} (${v.name}, ${regionOf(v.region).label})`,
  `Connected as deploy. Try: uname -a, uptime, free -h, df -h, systemctl status nginx, ls /var/log`,
];

// ---- labels for the lists ----

export const regionLine = (v: Vm): string => regionOf(v.region).label;
export const imageLine = (v: Vm): string => imageOf(v.image).label;
export const stateLine = (v: Vm): string => statusLabel(v);
export const toneOf = (v: Vm) => STATUS_TONE[v.status];
