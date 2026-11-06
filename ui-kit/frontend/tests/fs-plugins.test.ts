// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { parseSync } from "vite";
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type FsState,
  initial,
  page,
  paletteOf,
} from "../templates/flow-studio/flow-studio.ts";
import {
  outcomes,
  simulate,
  stepsOf,
} from "../templates/flow-studio/engine.ts";
import { externalFor } from "../templates/flow-studio/layout.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import {
  type Model,
  type PluginManifest,
  addEdge,
  addNode,
  effectDefIn,
  emptyModel,
  errorCodeIn,
  externalIn,
  fieldsOf,
  latencyIn,
  parsePlugins,
  parseProject,
  projectText,
  timeoutIn,
} from "../templates/flow-studio/model.ts";
import {
  addPlugin,
  builderOf,
  effectLines,
  mergePlugins,
  parseEffectLines,
  pluginInUse,
  pluginStub,
  removePlugin,
  updatePlugin,
} from "../templates/flow-studio/plugins.ts";
import { buildSequence } from "../templates/flow-studio/sequence.ts";

const stripe = (): PluginManifest => ({
  name: "stripe",
  about: "card payments",
  external: "Stripe API",
  latency: 80,
  timeout: 2000,
  errorCode: "card_declined",
  effects: parseEffectLines(
    "stripe",
    "charge | charge a card | POST /v1/charges | reply\nrefund | refund it | POST /v1/refunds | reply",
  ),
});

describe("the effects as lines", () => {
  test("a bare name gets the prefix; flags are read; a duplicate is dropped", () => {
    const e = parseEffectLines(
      "mail",
      "send | send a mail | to: {email} | fire\nmail.status | ask | | optional\nsend | again\n | no name\nping | | | reply nofail",
    );
    expect(e.map((x) => x.type)).toEqual([
      "mail.send",
      "mail.status",
      "mail.ping",
    ]);
    expect(e[0]).toMatchObject({
      replies: false,
      hint: "send a mail",
      detail: "to: {email}",
    });
    expect(e[1]).toMatchObject({ replies: true, optionalReply: true });
    expect(e[2]).toMatchObject({ replies: true, noFail: true });
  });

  test("effectLines reads back what parseEffectLines made", () => {
    const p = stripe();
    expect(parseEffectLines("stripe", effectLines(p))).toEqual(p.effects);
  });
});

describe("the lookups", () => {
  const custom = [stripe()];
  test("built-in plugins keep their numbers; a plugin of the project has its own", () => {
    expect(latencyIn(custom, "pg")).toBe(12);
    expect(latencyIn(custom, "stripe")).toBe(80);
    expect(latencyIn(custom, "nope")).toBe(1);
    expect(timeoutIn(custom, "stripe")).toBe(2000);
    expect(errorCodeIn(custom, "stripe")).toBe("card_declined");
    expect(errorCodeIn(custom, "pg")).toBe("40001");
    expect(externalIn(custom, "stripe")).toEqual({
      title: "Stripe API",
      id: "x-stripe",
    });
    expect(externalIn(custom, "pg")?.title).toBe("Postgres");
    expect(effectDefIn(custom, "stripe.charge")?.replies).toBe(true);
    expect(effectDefIn(custom, "pg.query")?.plugin).toBe("pg");
    expect(effectDefIn([], "stripe.charge")).toBeUndefined();
  });
});

describe("editing the manifests", () => {
  test("a new plugin has a free name and one effect", () => {
    let m = emptyModel();
    const a = addPlugin(m);
    m = a.model;
    const b = addPlugin(m);
    expect([a.name, b.name]).toEqual(["plugin1", "plugin2"]);
    expect(b.model.plugins[1].effects[0].type).toBe("plugin2.call");
    // a built-in name is not free
    expect(addPlugin(emptyModel(), "pg").name).toBe("plugin1");
    expect(addPlugin(emptyModel(), "mailer").name).toBe("mailer");
  });

  test("update, merge and remove", () => {
    let m = addPlugin(emptyModel(), "stripe").model;
    m = updatePlugin(m, "stripe", {
      latency: 90,
      effectsText: "charge | a | b | reply",
    });
    expect(m.plugins[0].latency).toBe(90);
    expect(m.plugins[0].effects.map((e) => e.type)).toEqual(["stripe.charge"]);
    m = mergePlugins(m, [{ ...stripe(), about: "new" }]);
    expect(m.plugins).toHaveLength(1);
    expect(m.plugins[0].about).toBe("new");
    expect(removePlugin(m, "stripe").plugins).toHaveLength(0);
    expect(removePlugin(m, "ghost")).toBe(m);
  });

  test("a plugin that an effect node uses cannot be removed", () => {
    let m: Model = { ...emptyModel(), plugins: [stripe()] };
    m = addNode(m, "effect", "stripe.charge", { id: "c1" }).model;
    expect(pluginInUse(m, "stripe")).toBe(1);
    expect(removePlugin(m, "stripe")).toBe(m);
  });

  test("manifests come from JSON; a built-in name or a bad name is refused", () => {
    expect(parsePlugins(JSON.stringify([stripe()]))).toEqual([stripe()]);
    expect(parsePlugins(JSON.stringify(stripe()))).toEqual([stripe()]);
    expect(typeof parsePlugins("{")).toBe("string");
    expect(
      typeof parsePlugins(JSON.stringify([{ name: "pg", effects: [] }])),
    ).toBe("string");
    expect(typeof parsePlugins(JSON.stringify([{ name: "Bad Name" }]))).toBe(
      "string",
    );
  });

  test("saved with the project", () => {
    const m: Model = { ...emptyModel(), plugins: [stripe()] };
    expect(parseProject(projectText(m))).toEqual(m);
  });
});

/** POST /pay: route -> handler -> stripe.charge -> handler -> respond */
function pay(): Model {
  let m: Model = { ...emptyModel(), plugins: [stripe()] };
  const n = (
    id: string,
    kind: Parameters<typeof addNode>[1],
    title: string,
    patch = {},
  ) => {
    m = addNode(m, kind, title, { id, x: 0, ...patch }).model;
  };
  const e = (
    from: string,
    to: string,
    o: Parameters<typeof addEdge>[3] = {},
  ) => {
    const r = addEdge(m, from, to, o);
    if (!r) throw new Error(`${from} -> ${to}`);
    m = r.model;
  };
  n("xc", "external", "Client", { plugin: "http" });
  n("rt", "route", "POST /pay", { detail: "pay.post" });
  n("h1", "handler", "pay.post");
  n("c", "effect", "stripe.charge", { detail: "POST /v1/charges" });
  n("h2", "handler", "pay.charged");
  n("bad", "error", "pay.failed");
  n("ok", "effect", "http.respond", { status: 200, detail: '{"paid":true}' });
  n("no", "effect", "http.respond", { status: 402, detail: '{"paid":false}' });
  n("xs", "external", "Stripe API", { plugin: "stripe" });
  e("xc", "rt", {
    msg: "http.request",
    payload: fieldsOf("method=POST; path=/pay"),
  });
  e("rt", "h1", { msg: "pay.post" });
  e("h1", "c", { kind: "effect" });
  e("c", "h2", {
    kind: "reply",
    msg: "pay.charged",
    payload: fieldsOf("id:string=ch_1"),
  });
  e("c", "bad", { port: "err", msg: "pay.failed" });
  e("h2", "ok", { kind: "effect" });
  e("bad", "no", { kind: "effect" });
  return {
    ...m,
    scenario: {
      ...m.scenario,
      requests: [{ rid: "r1", entry: "xc", at: 0, payload: {} }],
    },
  };
}

describe("a plugin of the project in the design", () => {
  test("the simulation uses its latency, its timeout and its error code", () => {
    const m = pay();
    const t = simulate(m, m.scenario, 1);
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "responded:200",
    ]);
    const work = stepsOf(t, "r1").find(
      (s) => s.type === "work" && s.to === "c",
    )!;
    expect(work.t - work.tStart).toBeGreaterThan(70);
    expect(work.t - work.tStart).toBeLessThan(95);
    const failed = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "f",
            kind: "error",
            target: "plugin:stripe",
            rid: "",
            code: "",
            ms: 0,
            on: true,
          },
        ],
      },
      1,
    );
    const bad = stepsOf(failed, "r1").find(
      (s) => s.type === "work" && s.status === "error",
    )!;
    expect(bad.payload).toMatchObject({ code: "card_declined" });
    expect(outcomes(failed)[0].status).toBe(402);
    const slow = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "s",
            kind: "slow",
            target: "c",
            rid: "",
            code: "",
            ms: 5000,
            on: true,
          },
        ],
      },
      1,
    );
    const w = stepsOf(slow, "r1").find(
      (s) => s.type === "work" && s.to === "c",
    )!;
    expect(w.status).toBe("timeout");
    expect(w.t - w.tStart).toBe(2000);
  });

  test("its external is found, and the sequence has a lifeline for it", () => {
    const m = pay();
    expect(externalFor(m, m.nodes.find((x) => x.id === "c")!)?.id).toBe("xs");
    const seq = buildSequence(m);
    expect(seq.lifelines.map((l) => l.id)).toContain("stripe");
    expect(seq.lifelines.find((l) => l.id === "stripe")!.label).toBe(
      "Stripe API",
    );
  });

  test("the checks know that its effect replies", () => {
    const m = pay();
    expect(lint(m).filter((i) => i.rule === "no-reply-consumer")).toEqual([]);
    const broken = {
      ...m,
      edges: m.edges.filter((x) => !(x.from === "c" && x.kind === "reply")),
    };
    expect(lint(broken).some((i) => i.rule === "no-reply-consumer")).toBe(true);
  });

  test("the palette lists its effects and its external", () => {
    const g = paletteOf(pay());
    expect(
      g.find((x) => x.lane === "Plugins")!.items.map((i) => i.title),
    ).toContain("stripe.charge");
    expect(
      g.find((x) => x.lane === "Externals")!.items.map((i) => i.title),
    ).toContain("Stripe API");
    expect(paletteOf(emptyModel())).toEqual(
      paletteOf({ ...emptyModel(), plugins: [] }),
    );
  });
});

describe("the stub of a plugin", () => {
  test("parses, and has a builder and a case per effect", () => {
    const code = pluginStub(stripe());
    const r = parseSync("stripe.ts", code, { lang: "ts" });
    expect(r.errors).toEqual([]);
    expect(code).toContain("createStripePlugin");
    expect(code).toContain("stripeEffector");
    expect(code).toContain("charge:");
    expect(code).toContain('case "refund"');
    expect(code).toContain("talks to Stripe API");
    expect(builderOf("stripe.charge")).toBe("charge");
    expect(builderOf("mail.send-later")).toBe("sendLater");
  });
});

function apply(state: FsState, effects: Effect[]): FsState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}
function sim(state: FsState) {
  const self = {
    state,
    send(id: string, payload?: unknown, event?: { value?: string }) {
      const msg: Message = { id, payload };
      if (event) msg.event = { type: "input", ...event };
      self.state = apply(self.state, page.dispatch(msg, self.state));
      return self;
    },
  };
  return self;
}

describe("plugins in the editor", () => {
  test("add, describe, use, and remove", () => {
    const s = sim({ ...initial, ready: true });
    s.send("pluginAdd");
    expect(s.state.side).toBe("plugins");
    expect(s.state.pluginsV.custom.map((p) => p.name)).toEqual(["plugin1"]);
    expect(s.state.pluginsV.builtin.map((b) => b.name)).toContain("pg");
    s.send("f.edit", ["pl:plugin1", "external"], { value: "Mail server" });
    s.send("f.edit", ["pl:plugin1", "effects"], {
      value: "send | send it | | fire",
    });
    const m = () => s.state.hist.present;
    expect(m().plugins[0].external).toBe("Mail server");
    expect(m().plugins[0].effects[0]).toMatchObject({
      type: "plugin1.send",
      replies: false,
    });
    expect(
      s.state.palette
        .find((g) => g.lane === "Plugins")!
        .items.map((i) => i.title),
    ).toContain("plugin1.send");
    // an external of the plugin stands behind it
    s.send("addNodeOf", ["external", "Mail server"]);
    expect(m().nodes.find((n) => n.title === "Mail server")!.plugin).toBe(
      "plugin1",
    );
    s.send("addNodeOf", ["effect", "plugin1.send"]);
    s.send("pluginDel", "plugin1");
    expect(m().plugins).toHaveLength(1);
    expect(s.state.message).toContain("still uses the plugin");
  });

  test("manifests are imported from a sheet", () => {
    const s = sim({ ...initial, ready: true });
    s.send("sheet", "plugins").send("importText", undefined, {
      value: JSON.stringify([stripe()]),
    });
    s.send("importApply");
    expect(s.state.hist.present.plugins.map((p) => p.name)).toEqual(["stripe"]);
    expect(s.state.sheet.open).toBe("");
    s.send("sheet", "plugins").send("importText", undefined, { value: "nope" });
    s.send("importApply");
    expect(s.state.sheet.error).toContain("Not valid JSON");
  });

  test("Quick add knows the effects of a plugin of the project", () => {
    const s = sim({ ...initial, ready: true });
    s.send("sheet", "plugins").send("importText", undefined, {
      value: JSON.stringify([stripe()]),
    });
    s.send("importApply");
    s.send("quickAdd", undefined, { value: "stripe.charge POST /v1/x" });
    expect(s.state.hist.present.nodes.at(-1)).toMatchObject({
      kind: "effect",
      title: "stripe.charge",
      plugin: "stripe",
      detail: "POST /v1/x",
    });
  });
});
