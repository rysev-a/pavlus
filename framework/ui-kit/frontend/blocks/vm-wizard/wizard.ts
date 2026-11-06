/**
 * The "create a virtual machine" wizard as pure functions: the catalogs
 * (regions, images, sizes), the draft, the price, the validation of each step
 * and a reducer for the clicks. The host keeps a `WizardState` and re-derives
 * the props after each message.
 */
import {
  type Lookup,
  type Vm,
  HOURS_PER_MONTH,
  dollars,
  hourlyText,
} from "../vm-card/vm.ts";

export interface Region {
  id: string;
  label: string;
  flag: string;
  /** Prices in this region are multiplied by this. */
  factor: number;
  note: string;
}

export interface Image {
  id: string;
  label: string;
  emoji: string;
  note: string;
  /** A licence added to the hourly price. */
  licence: number;
  minVcpu: number;
  minRam: number;
}

export interface Size {
  id: string;
  label: string;
  vcpu: number;
  ram: number;
  disk: number;
  hourly: number;
}

export const REGIONS: Region[] = [
  { id: "fra", label: "Frankfurt", flag: "🇩🇪", factor: 1, note: "eu-central" },
  { id: "ams", label: "Amsterdam", flag: "🇳🇱", factor: 1, note: "eu-west" },
  { id: "nyc", label: "New York", flag: "🇺🇸", factor: 1.05, note: "us-east" },
  {
    id: "sfo",
    label: "San Francisco",
    flag: "🇺🇸",
    factor: 1.05,
    note: "us-west",
  },
  {
    id: "sgp",
    label: "Singapore",
    flag: "🇸🇬",
    factor: 1.12,
    note: "ap-southeast",
  },
  { id: "blr", label: "Bangalore", flag: "🇮🇳", factor: 0.95, note: "ap-south" },
];

export const IMAGES: Image[] = [
  {
    id: "ubuntu-24",
    label: "Ubuntu 24.04 LTS",
    emoji: "🟠",
    note: "The default choice",
    licence: 0,
    minVcpu: 1,
    minRam: 1,
  },
  {
    id: "debian-12",
    label: "Debian 12",
    emoji: "🌀",
    note: "Small and stable",
    licence: 0,
    minVcpu: 1,
    minRam: 1,
  },
  {
    id: "fedora-40",
    label: "Fedora 40",
    emoji: "🎩",
    note: "Fresh packages",
    licence: 0,
    minVcpu: 1,
    minRam: 2,
  },
  {
    id: "alpine-3",
    label: "Alpine Linux 3.20",
    emoji: "🏔️",
    note: "Tiny, for containers",
    licence: 0,
    minVcpu: 1,
    minRam: 1,
  },
  {
    id: "windows-2022",
    label: "Windows Server 2022",
    emoji: "🪟",
    note: "Adds a licence fee. Needs 2 vCPU and 4 GB.",
    licence: 0.036,
    minVcpu: 2,
    minRam: 4,
  },
];

export const SIZES: Size[] = [
  { id: "nano", label: "Nano", vcpu: 1, ram: 1, disk: 25, hourly: 0.0075 },
  { id: "small", label: "Small", vcpu: 1, ram: 2, disk: 50, hourly: 0.015 },
  { id: "medium", label: "Medium", vcpu: 2, ram: 4, disk: 80, hourly: 0.03 },
  { id: "large", label: "Large", vcpu: 4, ram: 8, disk: 160, hourly: 0.06 },
  { id: "xlarge", label: "X-Large", vcpu: 8, ram: 16, disk: 320, hourly: 0.12 },
  {
    id: "xxlarge",
    label: "2X-Large",
    vcpu: 16,
    ram: 32,
    disk: 640,
    hourly: 0.24,
  },
];

export const VPCS = [
  { value: "default", label: "default-vpc (10.0.0.0/16)" },
  { value: "staging", label: "staging-vpc (10.1.0.0/16)" },
  { value: "none", label: "No private network" },
];

export const FIREWALLS = [
  { value: "web", label: "Web server (SSH, HTTP, HTTPS)" },
  { value: "ssh", label: "SSH only" },
  { value: "open", label: "Allow everything (not recommended)" },
];

/** What a public IPv4 address costs per hour, and the share added by backups. */
export const IPV4_HOURLY = 0.005;
export const BACKUP_SHARE = 0.2;

export interface Draft {
  name: string;
  region: string;
  image: string;
  size: string;
  keys: string[];
  ipv4: boolean;
  backups: boolean;
  vpc: string;
  firewall: string;
}

export const emptyDraft = (): Draft => ({
  name: "",
  region: "fra",
  image: "ubuntu-24",
  size: "small",
  keys: [],
  ipv4: true,
  backups: false,
  vpc: "default",
  firewall: "web",
});

const byId = <T extends { id: string }>(list: T[], id: string): T =>
  list.find((x) => x.id === id) ?? list[0];

export const regionOf = (id: string): Region => byId(REGIONS, id);
export const imageOf = (id: string): Image => byId(IMAGES, id);
export const sizeOf = (id: string): Size => byId(SIZES, id);

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export interface PriceLine {
  label: string;
  hourly: number;
}

/** Pure: the lines of the price per hour (compute in the region, licence, IPv4, backups). */
export function priceLines(d: Draft): PriceLine[] {
  const size = sizeOf(d.size);
  const region = regionOf(d.region);
  const image = imageOf(d.image);
  const compute = round4(size.hourly * region.factor);
  const lines: PriceLine[] = [
    { label: `${size.label} in ${region.label}`, hourly: compute },
  ];
  if (image.licence > 0)
    lines.push({ label: "Windows licence", hourly: image.licence });
  if (d.ipv4) lines.push({ label: "Public IPv4 address", hourly: IPV4_HOURLY });
  if (d.backups)
    lines.push({
      label: "Weekly backups",
      hourly: round4(compute * BACKUP_SHARE),
    });
  return lines;
}

/** Pure: the price per hour while the machine runs. */
export const hourlyOf = (d: Draft): number =>
  round4(priceLines(d).reduce((sum, l) => sum + l.hourly, 0));

/** Pure: the monthly price (730 hours), in dollars rounded to cents. */
export const monthlyPrice = (d: Draft): number =>
  Math.round(hourlyOf(d) * HOURS_PER_MONTH * 100) / 100;

export type Errors = Record<string, string>;

export const STEPS = [
  { id: "basics", label: "Basics" },
  { id: "image", label: "Image" },
  { id: "size", label: "Size" },
  { id: "access", label: "Access" },
  { id: "review", label: "Review" },
];

/** Pure: is a size big enough for the image? */
export function fits(image: Image, size: Size): boolean {
  return size.vcpu >= image.minVcpu && size.ram >= image.minRam;
}

/** Pure: the error of a machine name, or an empty string. */
export function nameError(name: string, taken: string[]): string {
  const n = name.trim();
  if (n === "") return "Give the machine a name.";
  if (n.length < 3) return "Use at least 3 characters.";
  if (n.length > 30) return "Use at most 30 characters.";
  if (!/^[a-z]/.test(n)) return "Start with a lowercase letter.";
  if (!/^[a-z0-9-]+$/.test(n))
    return "Use lowercase letters, digits and hyphens only.";
  if (n.endsWith("-")) return "Do not end with a hyphen.";
  if (taken.includes(n)) return "A machine with this name already exists.";
  return "";
}

/** Pure: the errors that stop a step (`{}` when it can go on). */
export function validateStep(d: Draft, step: number, taken: string[]): Errors {
  const errors: Errors = {};
  if (step === 0) {
    const e = nameError(d.name, taken);
    if (e) errors.name = e;
  }
  if (step === 2 && !fits(imageOf(d.image), sizeOf(d.size))) {
    errors.size = `${imageOf(d.image).label} needs at least ${imageOf(d.image).minVcpu} vCPU and ${imageOf(d.image).minRam} GB of memory.`;
  }
  if (step === 3 && d.keys.length === 0) {
    errors.keys = "Pick at least one SSH key: there is no password login.";
  }
  return errors;
}

export interface WizardState {
  step: number;
  /** The furthest step reached, so the header can jump back and forward. */
  reached: number;
  draft: Draft;
  errors: Errors;
}

export const startWizard = (draft: Draft = emptyDraft()): WizardState => ({
  step: 0,
  reached: 0,
  draft,
  errors: {},
});

/**
 * Pure: the wizard after a message. `act` is a click (`region`, `image`,
 * `size`, `key`, `ipv4`, `backups`, `goto`), `field` an input (`name`, `vpc`,
 * `firewall`), and `next` / `back` move between steps (`next` validates).
 */
export function reduce(
  w: WizardState,
  kind: string,
  arg: string,
  taken: string[],
): WizardState {
  const set = (patch: Partial<Draft>, drop: string[] = []): WizardState => {
    const errors = { ...w.errors };
    for (const key of drop) delete errors[key];
    return { ...w, draft: { ...w.draft, ...patch }, errors };
  };
  switch (kind) {
    case "name":
      return set({ name: arg }, ["name"]);
    case "vpc":
      return set({ vpc: arg });
    case "firewall":
      return set({ firewall: arg });
    case "region":
      return set({ region: arg });
    case "image":
      return set({ image: arg }, ["size"]);
    case "size":
      return set({ size: arg }, ["size"]);
    case "key": {
      const keys = w.draft.keys.includes(arg)
        ? w.draft.keys.filter((k) => k !== arg)
        : [...w.draft.keys, arg];
      return set({ keys }, ["keys"]);
    }
    case "ipv4":
      return set({ ipv4: !w.draft.ipv4 });
    case "backups":
      return set({ backups: !w.draft.backups });
    case "back":
      return { ...w, step: Math.max(0, w.step - 1), errors: {} };
    case "goto": {
      const to = Number(arg);
      if (!Number.isInteger(to) || to < 0 || to > w.reached) return w;
      return { ...w, step: to, errors: {} };
    }
    case "next": {
      const errors = validateStep(w.draft, w.step, taken);
      if (Object.keys(errors).length > 0) return { ...w, errors };
      const step = Math.min(STEPS.length - 1, w.step + 1);
      return { ...w, step, reached: Math.max(w.reached, step), errors: {} };
    }
    default:
      return w;
  }
}

/** Pure: every step up to the last one passes validation (the wizard may create). */
export function readyToCreate(d: Draft, taken: string[]): boolean {
  return [0, 1, 2, 3].every(
    (s) => Object.keys(validateStep(d, s, taken)).length === 0,
  );
}

/** Pure: a machine from a finished draft. `seq` makes the IP address and id. */
export function buildVm(d: Draft, seq: number): Vm {
  const size = sizeOf(d.size);
  return {
    id: `vm-${seq}`,
    name: d.name.trim(),
    image: d.image,
    region: d.region,
    ip: d.ipv4 ? `203.0.113.${10 + (seq % 200)}` : `10.0.0.${10 + (seq % 200)}`,
    vcpu: size.vcpu,
    ram: size.ram,
    disk: size.disk,
    hourly: hourlyOf(d),
    status: "starting",
    intent: "",
    hours: 0,
    tags: [],
  };
}

/** Pure: how a machine's image and region are called, for its card. */
export function lookupOf(vm: Pick<Vm, "image" | "region">): Lookup {
  const image = imageOf(vm.image);
  const region = regionOf(vm.region);
  return {
    emoji: image.emoji,
    osLabel: image.label,
    regionLabel: region.label,
    flag: region.flag,
  };
}

export interface KeyChoice {
  id: string;
  name: string;
  fingerprint: string;
}

export interface WizardProps {
  step: number;
  stepId: string;
  steps: {
    id: string;
    label: string;
    n: number;
    state: "done" | "current" | "todo";
    reachable: boolean;
  }[];
  name: string;
  nameError: string;
  regions: (Region & { selected: boolean })[];
  images: (Image & { selected: boolean })[];
  sizes: {
    id: string;
    label: string;
    spec: string;
    price: string;
    monthly: string;
    selected: boolean;
    tooSmall: boolean;
  }[];
  sizeError: string;
  keys: (KeyChoice & { selected: boolean })[];
  keysError: string;
  ipv4: boolean;
  backups: boolean;
  vpcs: { value: string; label: string; selected: boolean }[];
  firewalls: { value: string; label: string; selected: boolean }[];
  /** The live price in the bar under the steps. */
  hourlyText: string;
  monthlyText: string;
  lines: { label: string; value: string }[];
  summary: { label: string; value: string }[];
  canBack: boolean;
  isLast: boolean;
  nextLabel: string;
}

/** Pure: everything the wizard view shows. */
export function wizardProps(w: WizardState, keys: KeyChoice[]): WizardProps {
  const d = w.draft;
  const image = imageOf(d.image);
  const size = sizeOf(d.size);
  const region = regionOf(d.region);
  const isLast = w.step === STEPS.length - 1;
  return {
    step: w.step,
    stepId: STEPS[w.step].id,
    steps: STEPS.map((s, i) => ({
      id: s.id,
      label: s.label,
      n: i + 1,
      state: i < w.step ? "done" : i === w.step ? "current" : "todo",
      reachable: i <= w.reached,
    })),
    name: d.name,
    nameError: w.errors.name ?? "",
    regions: REGIONS.map((r) => ({ ...r, selected: r.id === d.region })),
    images: IMAGES.map((i) => ({ ...i, selected: i.id === d.image })),
    sizes: SIZES.map((s) => ({
      id: s.id,
      label: s.label,
      spec: `${s.vcpu} vCPU · ${s.ram} GB RAM · ${s.disk} GB SSD`,
      price: hourlyText(s.hourly * region.factor),
      monthly: `${dollars(s.hourly * region.factor * HOURS_PER_MONTH)}/mo`,
      selected: s.id === d.size,
      tooSmall: !fits(image, s),
    })),
    sizeError: w.errors.size ?? "",
    keys: keys.map((k) => ({ ...k, selected: d.keys.includes(k.id) })),
    keysError: w.errors.keys ?? "",
    ipv4: d.ipv4,
    backups: d.backups,
    vpcs: VPCS.map((v) => ({ ...v, selected: v.value === d.vpc })),
    firewalls: FIREWALLS.map((f) => ({
      ...f,
      selected: f.value === d.firewall,
    })),
    hourlyText: hourlyText(hourlyOf(d)),
    monthlyText: `${dollars(monthlyPrice(d))}/mo`,
    lines: priceLines(d).map((l) => ({
      label: l.label,
      value: hourlyText(l.hourly),
    })),
    summary: [
      { label: "Name", value: d.name.trim() || "not set" },
      { label: "Region", value: `${region.flag} ${region.label}` },
      { label: "Image", value: image.label },
      {
        label: "Size",
        value: `${size.label}: ${size.vcpu} vCPU, ${size.ram} GB RAM, ${size.disk} GB SSD`,
      },
      {
        label: "SSH keys",
        value:
          keys
            .filter((k) => d.keys.includes(k.id))
            .map((k) => k.name)
            .join(", ") || "none",
      },
      {
        label: "Network",
        value: `${d.ipv4 ? "public IPv4" : "no public IP"}, ${VPCS.find((v) => v.value === d.vpc)?.label ?? d.vpc}`,
      },
      {
        label: "Firewall",
        value:
          FIREWALLS.find((f) => f.value === d.firewall)?.label ?? d.firewall,
      },
      { label: "Backups", value: d.backups ? "weekly, +20%" : "off" },
    ],
    canBack: w.step > 0,
    isLast,
    nextLabel: isLast ? "Create virtual machine" : "Continue",
  };
}
