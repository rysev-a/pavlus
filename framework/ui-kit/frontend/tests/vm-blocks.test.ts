import { describe, expect, test } from "vitest";
import {
  DEFAULT_METRICS,
  RANGES,
  chartOf,
  chartsFor,
  formatValue,
  seedOf,
  series,
} from "../blocks/metric-charts/metrics.ts";
import {
  addRule,
  emptyDraft as emptyRule,
  isRisky,
  portError,
  removeRule,
  ruleOf,
  rulesProps,
  validSource,
  validateRule,
  type Rule,
} from "../blocks/rules-table/rules.ts";
import {
  TRANSITION_MS,
  type Vm,
  actionsFor,
  begin,
  canDo,
  cardOf,
  dollars,
  hourlyText,
  monthlyOf,
  pendingAction,
  settle,
  statusLabel,
} from "../blocks/vm-card/vm.ts";
import {
  IMAGES,
  SIZES,
  buildVm,
  emptyDraft,
  fits,
  hourlyOf,
  imageOf,
  lookupOf,
  monthlyPrice,
  nameError,
  priceLines,
  readyToCreate,
  reduce,
  startWizard,
  validateStep,
  wizardProps,
} from "../blocks/vm-wizard/wizard.ts";

const vm = (patch: Partial<Vm> = {}): Vm => ({
  id: "v1",
  name: "web",
  image: "ubuntu-24",
  region: "fra",
  ip: "203.0.113.10",
  vcpu: 2,
  ram: 4,
  disk: 80,
  hourly: 0.035,
  status: "running",
  intent: "",
  hours: 0,
  tags: [],
  ...patch,
});

describe("vm status transitions", () => {
  test("what each status allows", () => {
    expect(actionsFor(vm({ status: "running" }))).toEqual([
      "stop",
      "reboot",
      "delete",
    ]);
    expect(actionsFor(vm({ status: "stopped" }))).toEqual(["start", "delete"]);
    expect(actionsFor(vm({ status: "error" }))).toEqual(["start", "delete"]);
    expect(actionsFor(vm({ status: "starting" }))).toEqual([]);
    expect(actionsFor(vm({ status: "stopping" }))).toEqual([]);
    expect(canDo(vm({ status: "stopped" }), "stop")).toBe(false);
  });
  test("start goes through starting to running", () => {
    const a = begin(vm({ status: "stopped" }), "start");
    expect(a.status).toBe("starting");
    expect(pendingAction(a)).toBe("start");
    expect(settle(a)?.status).toBe("running");
  });
  test("stop goes through stopping to stopped", () => {
    const a = begin(vm(), "stop");
    expect(a.status).toBe("stopping");
    expect(pendingAction(a)).toBe("stop");
    expect(settle(a)?.status).toBe("stopped");
  });
  test("reboot comes back running, with its own label", () => {
    const a = begin(vm(), "reboot");
    expect(a).toMatchObject({ status: "starting", intent: "reboot" });
    expect(statusLabel(a)).toBe("Rebooting");
    expect(pendingAction(a)).toBe("reboot");
    expect(settle(a)).toMatchObject({ status: "running", intent: "" });
  });
  test("delete removes the machine when the timer ends", () => {
    const a = begin(vm({ status: "stopped" }), "delete");
    expect(a).toMatchObject({ status: "stopping", intent: "delete" });
    expect(statusLabel(a)).toBe("Deleting");
    expect(pendingAction(a)).toBe("delete");
    expect(settle(a)).toBeNull();
  });
  test("an action the status does not allow changes nothing", () => {
    const stopped = vm({ status: "stopped" });
    expect(begin(stopped, "stop")).toBe(stopped);
    expect(begin(stopped, "reboot")).toBe(stopped);
    const busy = vm({ status: "starting" });
    expect(begin(busy, "stop")).toBe(busy);
  });
  test("a failed machine can be started again", () => {
    expect(begin(vm({ status: "error" }), "start").status).toBe("starting");
  });
  test("settling a settled machine changes nothing", () => {
    const running = vm();
    expect(settle(running)).toBe(running);
    expect(pendingAction(running)).toBeNull();
  });
  test("every action has a duration", () => {
    for (const ms of Object.values(TRANSITION_MS))
      expect(ms).toBeGreaterThan(0);
  });
});

describe("money", () => {
  test("hourly and monthly prices", () => {
    expect(hourlyText(0.024)).toBe("$0.024/hr");
    expect(hourlyText(0.1)).toBe("$0.10/hr");
    expect(hourlyText(0.0075)).toBe("$0.0075/hr");
    expect(monthlyOf(0.024)).toBe(17.52);
    expect(dollars(17.5)).toBe("$17.50");
    expect(dollars(1234.5)).toBe("$1,234.50");
    expect(dollars(-3)).toBe("-$3.00");
  });
});

describe("vm card", () => {
  test("a card carries the status, the specs and the allowed buttons", () => {
    const c = cardOf(vm({ tags: ["prod"] }), lookupOf(vm()));
    expect(c).toMatchObject({
      statusLabel: "Running",
      tone: "success",
      busy: false,
      vcpu: "2",
      ram: "4 GB",
      disk: "80 GB",
      price: "$0.035/hr",
      monthly: "about $25.55/mo",
      osLabel: "Ubuntu 24.04 LTS",
      regionLabel: "Frankfurt",
      tags: ["prod"],
    });
    expect(c.buttons.map((b) => b.id)).toEqual(["stop", "reboot", "delete"]);
  });
  test("busy, stopped and error cards", () => {
    expect(cardOf(vm({ status: "starting" }), lookupOf(vm())).busy).toBe(true);
    expect(cardOf(vm({ status: "starting" }), lookupOf(vm())).buttons).toEqual(
      [],
    );
    const stopped = cardOf(vm({ status: "stopped" }), lookupOf(vm()));
    expect(stopped.ip).toBe("no public IP");
    expect(stopped.tone).toBe("muted");
    expect(cardOf(vm({ status: "error" }), lookupOf(vm())).tone).toBe(
      "destructive",
    );
  });
});

describe("wizard: names", () => {
  test("rules for a machine name", () => {
    expect(nameError("", [])).toMatch(/Give/);
    expect(nameError("ab", [])).toMatch(/3/);
    expect(nameError("a".repeat(31), [])).toMatch(/30/);
    expect(nameError("1web", [])).toMatch(/letter/);
    expect(nameError("Web", [])).toMatch(/letter/);
    expect(nameError("web_01", [])).toMatch(/hyphens/);
    expect(nameError("web-", [])).toMatch(/hyphen/);
    expect(nameError("web-01", ["web-01"])).toMatch(/already exists/);
    expect(nameError("  web-01 ", [])).toBe("");
  });
});

describe("wizard: price", () => {
  test("the default draft prices compute and the public IP", () => {
    const d = emptyDraft();
    expect(priceLines(d).map((l) => l.label)).toEqual([
      "Small in Frankfurt",
      "Public IPv4 address",
    ]);
    expect(hourlyOf(d)).toBe(0.02);
    expect(monthlyPrice(d)).toBe(14.6);
  });
  test("the region factor, the licence and the backups add up", () => {
    const d = {
      ...emptyDraft(),
      size: "medium",
      region: "sgp",
      image: "windows-2022",
      backups: true,
    };
    // 0.03 * 1.12 = 0.0336 ; licence 0.036 ; ip 0.005 ; backups 20% of 0.0336 = 0.0067
    expect(priceLines(d).map((l) => l.hourly)).toEqual([
      0.0336, 0.036, 0.005, 0.0067,
    ]);
    expect(hourlyOf(d)).toBe(0.0813);
  });
  test("no public IP is cheaper", () => {
    const d = emptyDraft();
    expect(hourlyOf({ ...d, ipv4: false })).toBeLessThan(hourlyOf(d));
  });
  test("a bigger size always costs more", () => {
    const prices = SIZES.map((s) => hourlyOf({ ...emptyDraft(), size: s.id }));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe("wizard: steps", () => {
  const taken = ["db-primary"];
  test("windows needs a bigger size", () => {
    const win = imageOf("windows-2022");
    expect(fits(win, SIZES[0])).toBe(false);
    expect(fits(win, SIZES[2])).toBe(true);
    const d = { ...emptyDraft(), image: "windows-2022", size: "nano" };
    expect(validateStep(d, 2, taken).size).toMatch(/Windows Server 2022 needs/);
    expect(validateStep({ ...d, size: "medium" }, 2, taken)).toEqual({});
  });
  test("the first step needs a valid name, the access step a key", () => {
    expect(validateStep(emptyDraft(), 0, taken).name).toBeTruthy();
    expect(validateStep({ ...emptyDraft(), name: "api-01" }, 0, taken)).toEqual(
      {},
    );
    expect(validateStep(emptyDraft(), 3, taken).keys).toMatch(/SSH key/);
    expect(validateStep({ ...emptyDraft(), keys: ["k1"] }, 3, taken)).toEqual(
      {},
    );
    expect(validateStep(emptyDraft(), 1, taken)).toEqual({});
  });
  test("next is blocked by errors and then allowed", () => {
    let w = startWizard();
    w = reduce(w, "next", "", taken);
    expect(w.step).toBe(0);
    expect(w.errors.name).toBeTruthy();
    w = reduce(w, "name", "api-01", taken);
    expect(w.errors.name).toBeUndefined();
    w = reduce(w, "next", "", taken);
    expect(w.step).toBe(1);
    expect(w.reached).toBe(1);
  });
  test("back, goto and the furthest step reached", () => {
    let w = reduce(
      startWizard({ ...emptyDraft(), name: "api-01" }),
      "next",
      "",
      [],
    );
    w = reduce(w, "next", "", []);
    expect(w.step).toBe(2);
    w = reduce(w, "back", "", []);
    expect(w.step).toBe(1);
    w = reduce(w, "goto", "2", []);
    expect(w.step).toBe(2);
    expect(reduce(w, "goto", "4", [])).toBe(w);
    expect(reduce(w, "goto", "x", [])).toBe(w);
    expect(reduce(startWizard(), "back", "", []).step).toBe(0);
  });
  test("picking things changes the draft", () => {
    let w = startWizard();
    w = reduce(w, "region", "nyc", []);
    w = reduce(w, "image", "debian-12", []);
    w = reduce(w, "size", "large", []);
    w = reduce(w, "vpc", "none", []);
    w = reduce(w, "firewall", "ssh", []);
    w = reduce(w, "ipv4", "", []);
    w = reduce(w, "backups", "", []);
    expect(w.draft).toMatchObject({
      region: "nyc",
      image: "debian-12",
      size: "large",
      vpc: "none",
      firewall: "ssh",
      ipv4: false,
      backups: true,
    });
  });
  test("keys toggle on and off", () => {
    let w = reduce(startWizard(), "key", "k1", []);
    w = reduce(w, "key", "k2", []);
    expect(w.draft.keys).toEqual(["k1", "k2"]);
    w = reduce(w, "key", "k1", []);
    expect(w.draft.keys).toEqual(["k2"]);
  });
  test("an unknown message changes nothing", () => {
    const w = startWizard();
    expect(reduce(w, "nope", "", [])).toBe(w);
  });
  test("readyToCreate needs every step to pass", () => {
    const ok = { ...emptyDraft(), name: "api-01", keys: ["k1"] };
    expect(readyToCreate(ok, [])).toBe(true);
    expect(readyToCreate({ ...ok, keys: [] }, [])).toBe(false);
    expect(readyToCreate({ ...ok, name: "api-01" }, ["api-01"])).toBe(false);
    expect(
      readyToCreate({ ...ok, image: "windows-2022", size: "nano" }, []),
    ).toBe(false);
  });
  test("buildVm makes a starting machine from the draft", () => {
    const d = {
      ...emptyDraft(),
      name: " api-01 ",
      size: "large",
      region: "ams",
      keys: ["k1"],
    };
    const v = buildVm(d, 5);
    expect(v).toMatchObject({
      id: "vm-5",
      name: "api-01",
      vcpu: 4,
      ram: 8,
      disk: 160,
      status: "starting",
      region: "ams",
      hourly: hourlyOf(d),
    });
    expect(v.ip).toBe("203.0.113.15");
    expect(buildVm({ ...d, ipv4: false }, 5).ip).toBe("10.0.0.15");
  });
  test("the view props follow the state", () => {
    const keys = [{ id: "k1", name: "laptop", fingerprint: "SHA256:x" }];
    let w = startWizard({ ...emptyDraft(), name: "api-01", keys: ["k1"] });
    let p = wizardProps(w, keys);
    expect(p.stepId).toBe("basics");
    expect(p.steps.map((s) => s.state)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(p.canBack).toBe(false);
    expect(p.nextLabel).toBe("Continue");
    expect(p.keys[0].selected).toBe(true);
    expect(p.monthlyText).toBe("$14.60/mo");
    for (let i = 0; i < 4; i++) w = reduce(w, "next", "", []);
    p = wizardProps(w, keys);
    expect(p.stepId).toBe("review");
    expect(p.isLast).toBe(true);
    expect(p.nextLabel).toBe("Create virtual machine");
    expect(p.summary.find((r) => r.label === "SSH keys")?.value).toBe("laptop");
    expect(p.steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });
  test("sizes too small for the image are flagged", () => {
    const w = reduce(startWizard(), "image", IMAGES[4].id, []);
    const p = wizardProps(w, []);
    expect(p.sizes.map((s) => s.tooSmall)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("metrics", () => {
  test("series is repeatable and stays in range", () => {
    const a = series(3, 40, 50, 60, 100);
    expect(series(3, 40, 50, 60, 100)).toEqual(a);
    expect(series(4, 40, 50, 60, 100)).not.toEqual(a);
    expect(a).toHaveLength(40);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
  test("formatting follows the unit", () => {
    expect(formatValue(41.6, "%")).toBe("42%");
    expect(formatValue(12.34, "Mbit/s")).toBe("12.3 Mbit/s");
    expect(formatValue(340.4, "IOPS")).toBe("340 IOPS");
  });
  test("a chart has one bar per point of the range", () => {
    for (const r of RANGES) {
      const c = chartOf(DEFAULT_METRICS[0], r.id, true);
      expect(c.bars).toHaveLength(r.points);
      expect(c.bars[c.bars.length - 1].last).toBe(true);
      for (const b of c.bars) {
        expect(b.h).toBeGreaterThanOrEqual(3);
        expect(b.h).toBeLessThanOrEqual(100);
      }
    }
  });
  test("a stopped machine draws an empty chart", () => {
    const c = chartOf(DEFAULT_METRICS[0], "1h", false);
    expect(c.current).toBe("offline");
    expect(c.tone).toBe("muted");
    expect(c.bars.every((b) => b.h === 2 && !b.hot)).toBe(true);
  });
  test("each machine has its own curves, each range too", () => {
    const a = chartsFor("web-01", "1h", true);
    const b = chartsFor("db-01", "1h", true);
    expect(a.map((c) => c.id)).toEqual(["cpu", "mem", "net", "disk"]);
    expect(a[0].bars.map((x) => x.h)).not.toEqual(b[0].bars.map((x) => x.h));
    expect(chartsFor("web-01", "6h", true)[0].bars).toHaveLength(36);
    expect(seedOf("x")).toBe(seedOf("x"));
  });
});

describe("firewall rules", () => {
  const rules: Rule[] = [
    {
      id: "r1",
      proto: "tcp",
      port: "22",
      source: "any",
      action: "allow",
      note: "",
    },
  ];
  test("sources", () => {
    for (const ok of ["any", "ANY", "10.0.0.5", "10.0.0.0/16", "0.0.0.0/0"])
      expect(validSource(ok)).toBe(true);
    for (const bad of [
      "",
      "10.0.0",
      "10.0.0.256",
      "10.0.0.0/33",
      "10.0.0.0/8/8",
      "a.b.c.d",
      "10.0.0.0/",
    ])
      expect(validSource(bad)).toBe(false);
  });
  test("ports", () => {
    expect(portError("443", "tcp")).toBe("");
    expect(portError("8000-8100", "udp")).toBe("");
    expect(portError("any", "tcp")).toBe("");
    expect(portError("", "tcp")).toMatch(/Give a port/);
    expect(portError("", "icmp")).toBe("");
    expect(portError("abc", "tcp")).toMatch(/Use a number/);
    expect(portError("0", "tcp")).toMatch(/1 to 65535/);
    expect(portError("70000", "tcp")).toMatch(/65535/);
    expect(portError("9000-8000", "tcp")).toMatch(/ends before/);
  });
  test("validateRule reports the fields and refuses duplicates", () => {
    const draft = { ...emptyRule(), port: "80", source: "any" };
    expect(validateRule(draft, rules)).toEqual({});
    expect(validateRule({ ...draft, port: "x" }, rules).port).toBeTruthy();
    expect(validateRule({ ...draft, source: "" }, rules).source).toBeTruthy();
    expect(
      validateRule({ ...draft, source: "10.1.1.1.1" }, rules).source,
    ).toMatch(/not an IPv4/);
    expect(validateRule({ ...draft, port: "22" }, rules).port).toMatch(
      /already exists/,
    );
    expect(
      validateRule({ ...draft, port: " 22 ", source: "ANY" }, rules).port,
    ).toMatch(/already/);
  });
  test("an ICMP rule needs no port", () => {
    const draft = { ...emptyRule(), proto: "icmp" as const, source: "any" };
    expect(validateRule(draft, rules)).toEqual({});
    expect(ruleOf(draft, "x").port).toBe("any");
  });
  test("add and remove", () => {
    const next = addRule(
      rules,
      { ...emptyRule(), port: "80", source: "any", note: " web " },
      2,
    );
    expect(next.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(next[1]).toMatchObject({ port: "80", note: "web", action: "allow" });
    expect(removeRule(next, "r1").map((r) => r.id)).toEqual(["r2"]);
    expect(rules).toHaveLength(1);
  });
  test("sensitive ports open to the world are risky", () => {
    expect(isRisky(rules[0])).toBe(true);
    expect(isRisky({ ...rules[0], port: "443" })).toBe(false);
    expect(isRisky({ ...rules[0], source: "10.0.0.0/16" })).toBe(false);
    expect(isRisky({ ...rules[0], action: "deny" })).toBe(false);
    expect(isRisky({ ...rules[0], port: "any" })).toBe(true);
    expect(isRisky({ ...rules[0], proto: "udp" })).toBe(false);
  });
  test("props carry rows, the draft and the errors", () => {
    const p = rulesProps(rules, emptyRule(), { port: "bad" });
    expect(p.rows[0]).toMatchObject({
      tone: "success",
      risky: true,
      protoLabel: "TCP",
    });
    expect(p.portError).toBe("bad");
    expect(p.noPort).toBe(false);
    expect(rulesProps([], { ...emptyRule(), proto: "icmp" }, {}).noPort).toBe(
      true,
    );
  });
});
