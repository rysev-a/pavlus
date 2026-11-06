// 5-field cron: minute hour day-of-month month day-of-week.
// Supports `*`, lists (1,5), ranges (1-5), steps (*/15, 10-30/5, 5/10),
// month and weekday names, weekday 7 = Sunday, and the classic rule that when
// both day-of-month and day-of-week are restricted either one may match.

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const DAYS = "sun mon tue wed thu fri sat".split(" ");

function parseField(
  src: string,
  min: number,
  max: number,
  names?: string[],
  nameBase = 0,
): { set: Set<number>; any: boolean } {
  const set = new Set<number>();
  let any = false;
  const num = (s: string): number => {
    const lower = s.toLowerCase();
    if (names) {
      const i = names.indexOf(lower.slice(0, 3));
      if (i >= 0 && /^[a-z]+$/.test(lower)) return i + nameBase;
    }
    if (!/^\d+$/.test(s)) throw new Error(`cron: bad value "${s}"`);
    return Number(s);
  };
  for (const part of src.split(",")) {
    if (part === "") throw new Error(`cron: empty list item in "${src}"`);
    const [range, stepSrc, extra] = part.split("/");
    if (extra !== undefined) throw new Error(`cron: bad step in "${part}"`);
    const step = stepSrc === undefined ? 1 : num(stepSrc);
    if (!(step >= 1)) throw new Error(`cron: bad step in "${part}"`);
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
      if (stepSrc === undefined) any = true;
    } else if (range!.includes("-")) {
      const [a, b] = range!.split("-");
      lo = num(a!);
      hi = num(b!);
    } else {
      lo = num(range!);
      hi = stepSrc === undefined ? lo : max;
    }
    if (lo < min || hi > max || lo > hi)
      throw new Error(`cron: "${part}" out of range ${min}-${max}`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return { set, any };
}

export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5)
    throw new Error(`cron: expected 5 fields, got ${f.length} in "${expr}"`);
  const minute = parseField(f[0]!, 0, 59);
  const hour = parseField(f[1]!, 0, 23);
  const dom = parseField(f[2]!, 1, 31);
  const month = parseField(f[3]!, 1, 12, MONTHS, 1);
  const dow = parseField(f[4]!, 0, 7, DAYS, 0);
  if (dow.set.has(7)) {
    dow.set.delete(7);
    dow.set.add(0);
  }
  return {
    minute: minute.set,
    hour: hour.set,
    dom: dom.set,
    month: month.set,
    dow: dow.set,
    domAny: dom.any,
    dowAny: dow.any,
  };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Offset of `tz` from UTC at `instant` (ms): wall-clock minus UTC. */
export function tzOffset(instant: number, tz: string): number {
  if (tz === "UTC") return 0;
  const p: Record<string, number> = {};
  for (const x of formatter(tz).formatToParts(instant))
    if (x.type !== "literal") p[x.type] = Number(x.value);
  const wall = Date.UTC(
    p.year!,
    p.month! - 1,
    p.day!,
    p.hour!,
    p.minute!,
    p.second!,
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/** Wall-clock (as UTC fields) -> instant, or undefined when the time does not exist (DST gap). */
function wallToInstant(wall: number, tz: string): number | undefined {
  if (tz === "UTC") return wall;
  let t = wall - tzOffset(wall, tz);
  t = wall - tzOffset(t, tz);
  return t + tzOffset(t, tz) === wall ? t : undefined;
}

function dayMatches(s: CronSpec, d: Date): boolean {
  const domOk = s.dom.has(d.getUTCDate());
  const dowOk = s.dow.has(d.getUTCDay());
  if (!s.domAny && !s.dowAny) return domOk || dowOk;
  return domOk && dowOk;
}

/** The first instant strictly after `after` (ms) matching `spec` in time zone `tz`. */
export function nextCron(spec: CronSpec, after: number, tz = "UTC"): number {
  let wall = Math.floor((after + tzOffset(after, tz)) / 60000) * 60000 + 60000;
  for (let guard = 0; guard < 200_000; guard++) {
    const d = new Date(wall);
    if (!spec.month.has(d.getUTCMonth() + 1)) {
      wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      continue;
    }
    if (!dayMatches(spec, d)) {
      wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      continue;
    }
    if (!spec.hour.has(d.getUTCHours())) {
      wall = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours() + 1,
      );
      continue;
    }
    if (!spec.minute.has(d.getUTCMinutes())) {
      wall += 60000;
      continue;
    }
    const at = wallToInstant(wall, tz);
    if (at !== undefined && at > after) return at;
    wall += 60000;
  }
  throw new Error("cron: expression never matches");
}
