import type { Effect, Message } from "@pavlus/frontend";
import { describe, expect, test } from "vitest";
import {
  askConfirm,
  closedConfirm,
  isConfirmed,
  typeConfirm,
} from "../blocks/danger-confirm/confirm.ts";
import { pillOf } from "../blocks/vm-card/vm.ts";
import {
  derive,
  initial,
  keySheet,
  passes,
  searchText,
  VmAdminPanel,
  type VmState,
  visible,
} from "../templates/vm-admin-panel/vm-admin-panel.ts";
import {
  billCards,
  billLines,
  billOf,
  fingerprintOf,
  fleetCards,
  keyChoices,
  MONTH,
  parsePublicKey,
  SEED_KEYS,
  SEED_SNAPSHOTS,
  SEED_VMS,
  SEED_VOLUMES,
  uptimeOf,
  validateKeyForm,
  vmCommand,
  vmFs,
  vmRunner,
} from "../templates/vm-admin-panel/vm-data.ts";

const KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPt7Rk2vQx9LmWc4ZnE1aYh8sUjB0dFgTo3iNeKq5XyV me@laptop";

describe("ssh keys", () => {
  test("a good key parses with its type, comment and a fingerprint", () => {
    const k = parsePublicKey(KEY);
    expect(k).toMatchObject({
      ok: true,
      type: "ssh-ed25519",
      comment: "me@laptop",
    });
    if (k.ok) expect(k.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });
  test("the fingerprint is stable and depends on the key", () => {
    expect(fingerprintOf("AAAA1111")).toBe(fingerprintOf("AAAA1111"));
    expect(fingerprintOf("AAAA1111")).not.toBe(fingerprintOf("AAAA1112"));
  });
  test("bad keys say what is wrong", () => {
    expect(parsePublicKey("")).toMatchObject({ ok: false });
    const kind = parsePublicKey("ssh-dss AAAAAAAAAAAAAAAAAAAAAAAA");
    expect(kind.ok === false && kind.error).toMatch(/Unknown key type/);
    const body = parsePublicKey("ssh-rsa short");
    expect(body.ok === false && body.error).toMatch(/base64/);
    expect(
      parsePublicKey("ssh-rsa AAAA!!!!AAAAAAAAAAAAAAAAAAAAAA"),
    ).toMatchObject({ ok: false });
    expect(parsePublicKey("ssh-rsa")).toMatchObject({ ok: false });
  });
  test("the form is validated", () => {
    expect(validateKeyForm("work", KEY, SEED_KEYS)).toEqual({});
    expect(validateKeyForm("", KEY, SEED_KEYS).name).toBeTruthy();
    expect(validateKeyForm("x", KEY, SEED_KEYS).name).toMatch(/2 characters/);
    expect(validateKeyForm("a".repeat(41), KEY, SEED_KEYS).name).toMatch(/40/);
    expect(validateKeyForm("Alex-Laptop", KEY, SEED_KEYS).name).toMatch(
      /already exists/,
    );
    expect(validateKeyForm("work", "nonsense", SEED_KEYS).public).toBeTruthy();
    const dup = { ...SEED_KEYS[0] };
    const pub = `${dup.type} ${dup.blob}`;
    expect(validateKeyForm("copy", pub, SEED_KEYS).public).toMatch(
      /already added/,
    );
  });
  test("key choices feed the wizard", () => {
    expect(keyChoices(SEED_KEYS)).toHaveLength(3);
    expect(keyChoices(SEED_KEYS)[0]).toMatchObject({
      id: "k1",
      name: "alex-laptop",
    });
  });
});

describe("billing", () => {
  const lines = billLines(SEED_VMS, SEED_VOLUMES, SEED_SNAPSHOTS);
  test("compute is hours times the rate, per machine", () => {
    const web = lines.find((l) => l.id === "vm-1")!;
    expect(web.compute).toBe(15.12);
    expect(web.total).toBe(Math.round((web.compute + web.storage) * 100) / 100);
    const runner = lines.find((l) => l.id === "vm-4")!;
    expect(runner.compute).toBe(12.72);
  });
  test("storage counts the disk, volumes and snapshots for the days gone", () => {
    const db = lines.find((l) => l.id === "vm-3")!;
    // (160 * 0.08 + 200 * 0.10 + 120 * 0.05) * 18 / 30
    expect(db.storage).toBe(23.28);
  });
  test("the month to date is the sum, the projection looks ahead at the burn rate", () => {
    const bill = billOf(SEED_VMS, SEED_VOLUMES, SEED_SNAPSHOTS);
    expect(bill.monthToDate).toBeCloseTo(
      lines.reduce((n, l) => n + l.total, 0),
      1,
    );
    expect(bill.burn).toBeCloseTo(0.035 * 2 + 0.065 + 0.0125, 4);
    expect(bill.running).toBe(4);
    expect(bill.projected).toBeGreaterThan(bill.monthToDate);
    expect(bill.daily).toHaveLength(MONTH.day);
    expect(bill.daily.every((d) => d > 0)).toBe(true);
  });
  test("stopping a machine lowers the burn and the projection", () => {
    const stopped = SEED_VMS.map((v) =>
      v.id === "vm-3" ? { ...v, status: "stopped" as const } : v,
    );
    const a = billOf(SEED_VMS, SEED_VOLUMES, SEED_SNAPSHOTS);
    const b = billOf(stopped, SEED_VOLUMES, SEED_SNAPSHOTS);
    expect(b.burn).toBeLessThan(a.burn);
    expect(b.projected).toBeLessThan(a.projected);
    expect(b.running).toBe(3);
  });
  test("cards and fleet numbers", () => {
    expect(
      billCards(billOf(SEED_VMS, SEED_VOLUMES, SEED_SNAPSHOTS)).map(
        (c) => c.id,
      ),
    ).toEqual(["mtd", "projected", "burn", "live"]);
    const fleet = fleetCards(SEED_VMS);
    expect(fleet[0]).toMatchObject({
      value: "4 of 6",
      hint: "1 with an error",
    });
    expect(fleet[1].value).toBe("9");
    expect(fleet[2].value).toBe("17 GB");
  });
});

describe("the console of a machine", () => {
  const vm = SEED_VMS[0];
  test("its own commands", () => {
    expect(vmCommand(vm, "uname -a")?.[0]).toContain("web-frontend-01");
    expect(vmCommand(vm, "hostname")).toEqual(["web-frontend-01"]);
    expect(vmCommand(vm, "whoami")).toEqual(["deploy"]);
    expect(vmCommand(vm, "nproc")).toEqual(["2"]);
    expect(vmCommand(vm, "free -h")?.[1]).toContain("4.0Gi");
    expect(vmCommand(vm, "df -h")?.[1]).toContain("80G");
    expect(vmCommand(vm, "ip a")?.join("\n")).toContain(vm.ip);
    expect(vmCommand(vm, "systemctl status nginx")?.[0]).toContain(
      "nginx.service",
    );
    expect(vmCommand(vm, "systemctl status nothing")?.[0]).toMatch(
      /could not be found/,
    );
    expect(vmCommand(vm, "systemctl")?.[0]).toMatch(/Try/);
    expect(vmCommand(vm, "reboot")?.[0]).toMatch(/Reboot or Stop button/);
    expect(vmCommand(vm, "help")?.length).toBeGreaterThan(5);
  });
  test("the plain shell takes everything else, and chained commands", () => {
    expect(vmCommand(vm, "ls")).toBeNull();
    expect(vmCommand(vm, "uname && ls")).toBeNull();
    const run = vmRunner(vm);
    const fs = vmFs(vm);
    expect(run(fs, "/home/user", "ls").out[0].text).toContain("README.txt");
    expect(run(fs, "/home/user", "cat /etc/hostname").out[0].text).toBe(
      "web-frontend-01",
    );
    expect(run(fs, "/home/user", "uptime").out[0].text).toMatch(/up \d+ days?/);
    const wrote = run(fs, "/home/user", "echo x > note.txt");
    expect(wrote.fs["/home/user/note.txt"]).toBe("x\n");
  });
  test("uptime follows the hours the machine has run, and is zero when stopped", () => {
    expect(uptimeOf({ ...vm, status: "stopped" })).toMatch(/^up 0 days/);
    expect(uptimeOf(vm)).toMatch(/^up \d+ days?/);
  });
});

describe("the confirm dialog", () => {
  test("typing the name enables the button", () => {
    const c = askConfirm("delete", "x", "Delete?", "Sure?", { expect: "web" });
    expect(c.canConfirm).toBe(false);
    expect(typeConfirm(c, "we").canConfirm).toBe(false);
    expect(typeConfirm(c, " web ").canConfirm).toBe(true);
    expect(
      askConfirm("restore", "x", "t", "t", { danger: false }).canConfirm,
    ).toBe(true);
    expect(isConfirmed("", "")).toBe(true);
    expect(closedConfirm().open).toBe(false);
  });
  test("a muted tone has a pill variant", () => {
    expect(pillOf("muted")).toBe("secondary");
    expect(pillOf("success")).toBe("success");
  });
});

describe("derived views", () => {
  const base = {
    vms: SEED_VMS,
    snapshots: SEED_SNAPSHOTS,
    volumes: SEED_VOLUMES,
    rules: initial.rules,
    keys: SEED_KEYS,
    filter: "all",
    query: "",
    layout: "cards" as const,
    sort: null,
    selectedId: "",
    tab: "overview",
    range: "1h" as const,
    screen: "machines",
    groups: initial.groups,
  };
  test("filters and the search", () => {
    expect(visible(base)).toHaveLength(6);
    expect(visible({ ...base, filter: "running" })).toHaveLength(4);
    expect(visible({ ...base, filter: "error" }).map((v) => v.name)).toEqual([
      "legacy-erp",
    ]);
    expect(visible({ ...base, query: "NGINX" })).toHaveLength(2);
    expect(visible({ ...base, query: "new york" }).map((v) => v.name)).toEqual([
      "build-runner",
    ]);
    expect(
      visible({ ...base, query: "203.0.113.57" }).map((v) => v.name),
    ).toEqual(["mail-relay"]);
    expect(passes(SEED_VMS[0], "stopped")).toBe(false);
    expect(searchText(SEED_VMS[0])).toContain("Frankfurt");
  });
  test("the counts on the filter tabs", () => {
    const v = derive(base);
    expect(v.mFilters.map((f) => [f.id, f.count])).toEqual([
      ["all", 6],
      ["running", 4],
      ["stopped", 1],
      ["busy", 0],
      ["error", 1],
    ]);
    expect(v.subtitle).toBe("6 machines, 4 running");
    expect(v.mCards).toHaveLength(6);
    expect(v.mRows).toHaveLength(6);
  });
  test("sorting the table", () => {
    const up = derive({ ...base, sort: { key: "price", dir: "asc" } });
    expect(up.mRows[0].id).toBe("vm-5");
    const down = derive({ ...base, sort: { key: "name", dir: "desc" } });
    expect(down.mRows[0].id).toBe("vm-2");
  });
  test("a machine in a detail view gets its charts, snapshots and volumes", () => {
    const v = derive({ ...base, screen: "detail", selectedId: "vm-3" });
    expect(v.title).toBe("db-primary");
    expect(v.navActive).toBe("machines");
    expect(v.dvm?.consoleReady).toBe(true);
    expect(v.charts).toHaveLength(4);
    expect(v.snapList).toHaveLength(2);
    expect(v.volRows.map((r) => r.id)).toEqual(["boot", "vol-1"]);
    expect(v.rulesView.rows).toHaveLength(2);
    const stopped = derive({ ...base, screen: "detail", selectedId: "vm-4" });
    expect(stopped.dvm?.consoleReady).toBe(false);
    expect(stopped.charts[0].current).toBe("offline");
    expect(stopped.freeList.map((r) => r.id)).toEqual([]);
  });
  test("free volumes are those without a machine in the same region", () => {
    const v = derive({ ...base, screen: "detail", selectedId: "vm-1" });
    expect(v.freeList.map((r) => r.id)).toEqual(["vol-4"]);
  });
  test("the billing and keys lists", () => {
    const v = derive({ ...base, screen: "billing" });
    expect(v.billRows).toHaveLength(6);
    expect(v.billBars).toHaveLength(MONTH.day);
    expect(v.billBars[0].tip).toMatch(/^Nov 1: \$/);
    expect(v.keyRows).toHaveLength(3);
    expect(derive({ ...base, screen: "keys" }).subtitle).toBe(
      "3 keys on this account",
    );
  });
  test("the add-a-key sheet carries the errors", () => {
    const sheet = keySheet({ name: "", public: "" }, { name: "Bad name" });
    expect(sheet.open).toBe(true);
    expect(sheet.fields[0].error).toBe("Bad name");
    expect(sheet.fields[1].error).toBe("");
    expect(keySheet({ name: "", public: "" }, {}, false).open).toBe(false);
  });
});

// ---- the whole panel through the real handlers ----

function player() {
  const page = new VmAdminPanel();
  let state: VmState = initial;
  const timers: { id: string; msg: string; payload: unknown }[] = [];
  const send = (id: string, payload?: unknown, event?: Message["event"]) => {
    const handler = (page as unknown as Record<string, unknown>)[id];
    if (typeof handler !== "function") throw new Error(`no handler ${id}`);
    const effects = handler.call(page, { id, payload, event }, state, {
      send: () => [],
    }) as Effect[];
    for (const e of effects) {
      const fx = e as unknown as {
        type: string;
        path?: string;
        value?: unknown;
        id?: string;
        message?: { id: string; payload: unknown };
        replyTo?: string;
        payload?: unknown;
      };
      if (fx.type === "set" && fx.path) {
        state = { ...state, [fx.path]: fx.value } as VmState;
      } else if (fx.type === "setTimeout") {
        timers.push({
          id: fx.id ?? "",
          msg: fx.replyTo ?? "",
          payload: fx.payload,
        });
      }
    }
  };
  /** Let every timer started so far run out. */
  const flush = () => {
    const due = timers.splice(0);
    for (const t of due)
      if (t.id.startsWith("vm:") || t.id.startsWith("snap:"))
        send(t.msg, t.payload);
  };
  const status = (id: string) => state.vms.find((v) => v.id === id)?.status;
  return { send, flush, get: () => state, status, timers };
}

describe("the panel, played through", () => {
  test("stop and start go through a transitional status", () => {
    const p = player();
    expect(p.status("vm-1")).toBe("running");
    p.send("card.act", ["vm-1", "stop"]);
    expect(p.status("vm-1")).toBe("stopping");
    expect(p.get().mCards[0].buttons).toEqual([]);
    expect(p.timers.some((t) => t.id === "vm:vm-1")).toBe(true);
    p.flush();
    expect(p.status("vm-1")).toBe("stopped");
    p.send("card.act", ["vm-1", "start"]);
    expect(p.status("vm-1")).toBe("starting");
    p.flush();
    expect(p.status("vm-1")).toBe("running");
    expect(p.get().notice).toMatch(/running/);
  });
  test("a stopped machine cannot be rebooted, a busy one accepts nothing", () => {
    const p = player();
    p.send("card.act", ["vm-4", "reboot"]);
    expect(p.status("vm-4")).toBe("stopped");
    p.send("card.act", ["vm-1", "stop"]);
    p.send("card.act", ["vm-1", "stop"]);
    p.send("card.act", ["vm-1", "reboot"]);
    expect(p.status("vm-1")).toBe("stopping");
  });
  test("reboot comes back running", () => {
    const p = player();
    p.send("card.act", ["vm-2", "reboot"]);
    expect(p.get().vms.find((v) => v.id === "vm-2")).toMatchObject({
      status: "starting",
      intent: "reboot",
    });
    expect(p.get().mCards[1].statusLabel).toBe("Rebooting");
    p.flush();
    expect(p.status("vm-2")).toBe("running");
  });
  test("delete asks first and needs the name typed", () => {
    const p = player();
    p.send("card.act", ["vm-5", "delete"]);
    expect(p.get().confirm.open).toBe(true);
    expect(p.status("vm-5")).toBe("running");
    p.send("confirm.confirm");
    expect(p.get().confirm.open).toBe(true); // not typed yet: nothing happens
    expect(p.status("vm-5")).toBe("running");
    p.send("confirm.type", undefined, { type: "input", value: "mail-relay" });
    expect(p.get().confirm.canConfirm).toBe(true);
    p.send("confirm.confirm");
    expect(p.get().confirm.open).toBe(false);
    expect(p.status("vm-5")).toBe("stopping");
    expect(p.get().mCards.find((c) => c.id === "vm-5")?.statusLabel).toBe(
      "Deleting",
    );
    p.flush();
    expect(p.get().vms.find((v) => v.id === "vm-5")).toBeUndefined();
    expect(p.get().vms).toHaveLength(5);
    expect(p.get().subtitle).toBe("5 machines, 3 running");
    p.send("card.act", ["vm-3", "delete"]);
    p.send("confirm.cancel");
    expect(p.get().confirm.open).toBe(false);
    expect(p.status("vm-3")).toBe("running");
  });
  test("the filter and the search narrow the list, the layout switches", () => {
    const p = player();
    p.send("mfilter.pick", "stopped");
    expect(p.get().mCards.map((c) => c.id)).toEqual(["vm-4"]);
    p.send("mfilter.pick", "all");
    p.send("mfilter.search", undefined, { type: "input", value: "db" });
    expect(p.get().mCards.map((c) => c.id)).toEqual(["vm-3"]);
    p.send("mfilter.search", undefined, { type: "input", value: "zzz" });
    expect(p.get().mCards).toEqual([]);
    expect(p.get().mEmpty).toMatch(/No machine matches/);
    p.send("mfilter.action", "layout");
    expect(p.get().layout).toBe("table");
    p.send("mtable.sort", "price");
    expect(p.get().sort).toEqual({ key: "price", dir: "asc" });
    p.send("mtable.sort", "price");
    expect(p.get().sort).toEqual({ key: "price", dir: "desc" });
  });
  test("a detail view, its tabs, console, snapshots and firewall", () => {
    const p = player();
    p.send("card.open", "vm-3");
    expect(p.get().screen).toBe("detail");
    expect(p.get().title).toBe("db-primary");
    p.send("tab", "console");
    expect(p.get().tab).toBe("console");
    p.send("term.type", undefined, { type: "input", value: "uname -a" });
    p.send("term.submit");
    expect(p.get().term.lines[p.get().term.lines.length - 1].text).toContain(
      "db-primary",
    );
    expect(p.get().prompt).toBe("deploy@db-primary:~$");
    // snapshots
    p.send("tab", "snapshots");
    p.send("snapCreate");
    expect(p.get().snapList[0].status).toBe("Creating");
    expect(p.get().snapList[0].actions).toEqual([]);
    p.flush();
    expect(p.get().snapList[0].status).toBe("Ready");
    expect(p.get().snapList).toHaveLength(3);
    p.send("snaps.act", [p.get().snapList[0].id, "delete"]);
    p.send("confirm.confirm");
    expect(p.get().snapList).toHaveLength(2);
    // restore reboots a running machine
    p.send("snaps.act", ["sn-3", "restore"]);
    p.send("confirm.confirm");
    expect(p.status("vm-3")).toBe("starting");
    p.flush();
    expect(p.status("vm-3")).toBe("running");
    // firewall
    p.send("tab", "network");
    p.send("rules.field", "port", { type: "input", value: "70000" });
    p.send("rules.field", "source", { type: "input", value: "any" });
    p.send("rules.add");
    expect(p.get().rulesView.portError).toMatch(/65535/);
    expect(p.get().rulesView.rows).toHaveLength(2);
    p.send("rules.field", "port", { type: "input", value: "8080" });
    p.send("rules.add");
    expect(p.get().rulesView.rows).toHaveLength(3);
    p.send("rules.remove", p.get().rulesView.rows[2].id);
    expect(p.get().rulesView.rows).toHaveLength(2);
    // the console is kept when we leave and come back
    p.send("back");
    expect(p.get().screen).toBe("machines");
    p.send("card.open", "vm-3");
    expect(p.get().term.runs).toBe(1);
  });
  test("volumes attach and detach", () => {
    const p = player();
    p.send("card.open", "vm-1");
    p.send("tab", "storage");
    expect(p.get().volRows.map((r) => r.id)).toEqual(["boot", "vol-2"]);
    p.send("free.act", ["vol-4", "attach"]);
    expect(p.get().volRows.map((r) => r.id)).toEqual([
      "boot",
      "vol-2",
      "vol-4",
    ]);
    expect(p.get().freeList).toEqual([]);
    p.send("vols.act", ["vol-2", "detach"]);
    expect(p.get().volRows.map((r) => r.id)).toEqual(["boot", "vol-4"]);
    expect(p.get().freeList.map((r) => r.id)).toEqual(["vol-2"]);
  });
  test("the wizard creates a machine that starts and shows in the list and the bill", () => {
    const p = player();
    const before = p.get().billStats[0].value;
    p.send("nav.go", "create");
    expect(p.get().screen).toBe("create");
    // blocked by validation
    p.send("wiz.next");
    expect(p.get().wiz.nameError).toBeTruthy();
    p.send("wiz.field", "name", { type: "input", value: "web-frontend-01" });
    p.send("wiz.next");
    expect(p.get().wiz.nameError).toMatch(/already exists/);
    p.send("wiz.field", "name", { type: "input", value: "api-gateway" });
    p.send("wiz.act", ["size", "large"]);
    p.send("wiz.next");
    p.send("wiz.next");
    p.send("wiz.next");
    expect(p.get().wiz.stepId).toBe("access");
    p.send("wiz.next");
    expect(p.get().wiz.keysError).toBeTruthy();
    p.send("wiz.act", ["key", "k1"]);
    p.send("wiz.next");
    expect(p.get().wiz.stepId).toBe("review");
    p.send("wiz.next");
    expect(p.get().screen).toBe("machines");
    expect(p.get().vms[0]).toMatchObject({
      name: "api-gateway",
      status: "starting",
      vcpu: 4,
    });
    expect(p.get().vms).toHaveLength(7);
    p.flush();
    expect(p.get().vms[0].status).toBe("running");
    expect(p.get().wiz.step).toBe(0);
    p.send("nav.go", "billing");
    expect(p.get().billStats[2].value).not.toBe("$0.1325/hr");
    expect(p.get().billRows).toHaveLength(7);
    expect(before).toMatch(/^\$/);
  });
  test("the wizard can be cancelled", () => {
    const p = player();
    p.send("nav.go", "create");
    p.send("wiz.field", "name", { type: "input", value: "abc" });
    p.send("wiz.cancel");
    expect(p.get().screen).toBe("machines");
    expect(p.get().w.draft.name).toBe("");
  });
  test("keys are added with validation and deleted after asking", () => {
    const p = player();
    p.send("nav.go", "keys");
    p.send("keyAdd");
    expect(p.get().sheet.open).toBe(true);
    p.send("sheet.press", "save");
    expect(p.get().sheet.fields[0].error).toBeTruthy();
    expect(p.get().sheet.fields[1].error).toBeTruthy();
    p.send("sheet.press", "example");
    expect(p.get().keyDraft.public).toContain("ssh-ed25519");
    p.send("sheet.press", "save");
    expect(p.get().sheet.open).toBe(false);
    expect(p.get().keys).toHaveLength(4);
    expect(p.get().keyRows).toHaveLength(4);
    expect(p.get().subtitle).toBe("4 keys on this account");
    // the new key is offered by the wizard
    expect(p.get().wiz.keys).toHaveLength(4);
    // adding the same one again is refused
    p.send("keyAdd");
    p.send("sheet.press", "example");
    p.send("sheet.field", "name", { type: "input", value: "other" });
    p.send("sheet.press", "save");
    expect(p.get().sheet.fields[1].error).toMatch(/already added/);
    p.send("sheet.close");
    p.send("keys.act", ["k3", "delete"]);
    expect(p.get().confirm.kind).toBe("delete-key");
    p.send("confirm.confirm");
    expect(p.get().keys.map((k) => k.id)).not.toContain("k3");
  });
  test("deleting the machine on screen goes back to the list", () => {
    const p = player();
    p.send("card.open", "vm-5");
    p.send("detailAct", "delete");
    p.send("confirm.type", undefined, { type: "input", value: "mail-relay" });
    p.send("confirm.confirm");
    p.flush();
    expect(p.get().screen).toBe("machines");
    expect(p.get().selectedId).toBe("");
  });
});
