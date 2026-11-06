import { describe, expect, test } from "vitest";
import {
  EFFECTS,
  addEdge,
  addNode,
  blankNode,
  condHolds,
  condName,
  condNames,
  defaultMsg,
  effectDef,
  emptyModel,
  fieldsOf,
  findNode,
  inferKind,
  moveNode,
  msgOfRoute,
  onErrorOf,
  parseProject,
  payloadOf,
  projectText,
  readModel,
  removeEdge,
  removeNode,
  setDeep,
  setOnError,
  slugify,
  specOf,
  updateEdge,
  updateNode,
} from "../templates/flow-studio/model.ts";
import {
  History,
  canRedo,
  canUndo,
  commit,
  redo,
  start,
  undo,
} from "../templates/visual-builder/history.ts";
import { DEMOS } from "../templates/flow-studio/demos.ts";
import { Kit, ping } from "./fs-kit.ts";

describe("nodes and edges", () => {
  test("a new model is empty and ids count up", () => {
    const m = emptyModel();
    expect(m.nodes).toEqual([]);
    const a = addNode(m, "route", "GET /x");
    const b = addNode(a.model, "handler");
    expect([a.id, b.id]).toEqual(["n1", "n2"]);
    expect(b.model.seq).toBe(2);
  });
  test("a node goes to the right of the others in its lane", () => {
    let m = emptyModel();
    m = addNode(m, "handler", "a").model;
    m = addNode(m, "handler", "b").model;
    m = addNode(m, "effect", "pg.query").model;
    expect(m.nodes[1].x).toBeGreaterThan(m.nodes[0].x);
    expect(m.nodes[2].x).toBe(0);
  });
  test("an effect brings the example detail of its type, a respond its status", () => {
    const m = addNode(emptyModel(), "effect", "http.respond").model;
    expect(m.nodes[0]).toMatchObject({
      plugin: "http",
      status: 200,
      detail: "{}",
    });
    const q = addNode(emptyModel(), "effect", "pg.query").model.nodes[0];
    expect(q.detail).toContain("select");
    expect(q.plugin).toBe("pg");
  });
  test("a route gets its message id from the path", () => {
    expect(msgOfRoute("POST /login")).toBe("login.post");
    expect(msgOfRoute("GET /todos/:id")).toBe("todos.get");
    expect(msgOfRoute("DELETE /a/b/:id")).toBe("a.b.delete");
    expect(msgOfRoute("GET /")).toBe("root.get");
    expect(
      addNode(emptyModel(), "route", "PATCH /todos/:id").model.nodes[0].detail,
    ).toBe("todos.patch");
  });
  test("updating an effect type keeps its plugin in step", () => {
    const m = addNode(emptyModel(), "effect", "pg.query");
    const u = updateNode(m.model, m.id, { title: "redis.cmd" });
    expect(u.nodes[0].plugin).toBe("redis");
  });
  test("removing a node removes its edges, requests and faults", () => {
    const m = ping();
    const r = removeNode(
      {
        ...m,
        scenario: {
          ...m.scenario,
          faults: [
            {
              id: "f",
              kind: "error",
              target: "pg",
              rid: "",
              code: "",
              ms: 0,
              on: true,
            },
          ],
        },
      },
      "pg",
    );
    expect(findNode(r, "pg")).toBeUndefined();
    expect(r.edges.some((e) => e.from === "pg" || e.to === "pg")).toBe(false);
    expect(r.scenario.faults).toEqual([]);
    expect(removeNode(m, "xc").scenario.requests).toEqual([]);
  });
  test("moving a node rounds its position", () => {
    const m = moveNode(ping(), "h1", 10.6, 20.2);
    expect(findNode(m, "h1")).toMatchObject({ x: 11, y: 20 });
  });
  test("an edge needs two different nodes that exist, and is not added twice", () => {
    const m = ping();
    expect(addEdge(m, "h1", "h1")).toBeNull();
    expect(addEdge(m, "h1", "nope")).toBeNull();
    expect(addEdge(m, "h1", "pg")).toBeNull(); // the same kind and message already exist
    expect(addEdge(m, "h1", "ok", { msg: "other" })).not.toBeNull();
  });
  test("the kind of an edge follows its ends", () => {
    const m = ping();
    const n = (id: string) => findNode(m, id)!;
    expect(inferKind(n("xc"), n("rt"))).toBe("request");
    expect(inferKind(n("h1"), n("pg"))).toBe("effect");
    expect(inferKind(n("pg"), n("h2"), "ok")).toBe("reply");
    expect(inferKind(n("pg"), n("bad"), "err")).toBe("error");
    expect(inferKind(n("rt"), n("h1"))).toBe("request");
    expect(inferKind(n("ok"), n("h1"))).toBe("reply");
  });
  test("a new edge takes its message id from its ends", () => {
    const m = ping();
    const n = (id: string) => findNode(m, id)!;
    expect(defaultMsg(m, n("h1"), n("pg"), "effect")).toBe("pg.query");
    expect(defaultMsg(m, n("pg"), n("h2"), "reply")).toBe("ping.found");
    expect(defaultMsg(m, n("xc"), n("rt"), "request")).toBe("http.request");
    expect(defaultMsg(m, n("rt"), n("h1"), "request")).toBe("ping.get");
  });
  test("the rid rides on the edges of the server, not on the ones of the browser", () => {
    let m = new Kit()
      .n("ev", "ui-event", "click")
      .n("fh", "fe-handler", "go")
      .n("rt", "route", "GET /a")
      .n("h", "handler", "a.get")
      .done();
    m = addEdge(m, "ev", "fh")!.model;
    m = addEdge(m, "fh", "rt")!.model;
    m = addEdge(m, "rt", "h")!.model;
    expect(m.edges.map((e) => e.rid)).toEqual([false, true, true]);
  });
  test("edges can be updated and removed", () => {
    const m = ping();
    const id = m.edges[0].id;
    expect(updateEdge(m, id, { cond: "x" }).edges[0].cond).toBe("x");
    expect(removeEdge(m, id).edges).toHaveLength(m.edges.length - 1);
  });
});

describe("the failure policy: onError", () => {
  test("is the target of the error edge of an effect", () => {
    expect(onErrorOf(ping(), "pg")).toBe("bad");
  });
  test("setting it replaces the error edge, clearing it removes it", () => {
    const m = ping();
    const moved = setOnError(m, "pg", "h2");
    expect(onErrorOf(moved, "pg")).toBe("h2");
    expect(
      moved.edges.filter((e) => e.from === "pg" && e.kind === "error"),
    ).toHaveLength(1);
    expect(onErrorOf(setOnError(m, "pg", ""), "pg")).toBe("");
    expect(setOnError(m, "pg", "nope")).toBe(m);
  });
  test("the new error edge carries the code and message of the plugin", () => {
    const m = setOnError(setOnError(ping(), "pg", ""), "pg", "bad");
    const e = m.edges.find((x) => x.from === "pg" && x.kind === "error")!;
    expect(e.payload.map((f) => f.name)).toEqual(["code", "message"]);
    expect(e.msg).toBe("ping.failed");
  });
});

describe("payloads", () => {
  test("dotted names nest", () => {
    const o: Record<string, unknown> = {};
    setDeep(o, "body.user.name", "ann");
    setDeep(o, "body.n", 2);
    expect(o).toEqual({ body: { user: { name: "ann" }, n: 2 } });
  });
  test("examples are typed by their field", () => {
    const f = fieldsOf(
      'a:string=hi; n:number=3; ok:boolean=true; list:array=[1,2]; o:object={"k":1}; z:any',
    );
    expect(payloadOf(f)).toEqual({
      a: "hi",
      n: 3,
      ok: true,
      list: [1, 2],
      o: { k: 1 },
      z: null,
    });
  });
  test("a bad number is 0, a bad json is kept as text", () => {
    expect(payloadOf(fieldsOf("n:number=abc; l:array=[oops"))).toEqual({
      n: 0,
      l: "[oops",
    });
  });
  test("the text of the fields reads back", () => {
    const f = fieldsOf("a:string=x; b:number");
    expect(specOf(f)).toBe("a:string=x; b:number");
    expect(fieldsOf(specOf(f))).toEqual(f);
  });
  test("an example may contain an equals sign and a colon", () => {
    expect(fieldsOf("url:string=https://x.y/?a=b")[0].example).toBe(
      "https://x.y/?a=b",
    );
  });
});

describe("conditions", () => {
  test("names and negations", () => {
    expect(condName("!limited")).toBe("limited");
    expect(condName("  ! x ")).toBe("x");
    expect(condHolds("", {}, {})).toBe(true);
    expect(condHolds("a", { a: true }, {})).toBe(true);
    expect(condHolds("!a", { a: true }, {})).toBe(false);
    expect(condHolds("a", { a: true }, { a: false })).toBe(false);
    expect(condHolds("z", {}, {})).toBe(false);
  });
  test("a model lists the conditions its edges and values use", () => {
    expect(condNames({ ...ping(), conds: { b: true } })).toEqual(["b"]);
    const m = new Kit()
      .n("a", "handler", "a")
      .n("b", "effect", "log")
      .e("a", "b", "log", { cond: "!x" })
      .conds({ y: false })
      .done();
    expect(condNames(m)).toEqual(["x", "y"]);
  });
});

describe("reading a project", () => {
  test("every demo survives a round trip through JSON", () => {
    for (const d of DEMOS) {
      const m = d.make();
      const back = parseProject(projectText(m));
      expect(typeof back).not.toBe("string");
      expect(back).toEqual(m);
    }
  });
  test("bad text gives a message", () => {
    expect(parseProject("{")).toMatch(/Not valid JSON/);
    expect(parseProject("[]")).toMatch(/not a Flow Studio project/);
    expect(parseProject(JSON.stringify({ nodes: 1, edges: [] }))).toMatch(
      /not a Flow Studio/,
    );
  });
  test("what is not understood is dropped, not trusted", () => {
    const r = readModel({
      name: 5,
      nodes: [
        {
          id: "a",
          kind: "handler",
          title: "a",
          x: "far",
          retries: 99,
          latency: -4,
        },
        { id: "a", kind: "handler", title: "dup" },
        { id: "b", kind: "spaceship" },
        { kind: "handler" },
        { id: "c", kind: "effect", title: "pg.query" },
      ],
      edges: [
        {
          id: "e1",
          from: "a",
          to: "c",
          kind: "weird",
          msg: "m",
          payload: [{ name: "x", type: "bad" }],
        },
        { id: "e2", from: "a", to: "zzz" },
        { id: "e3", from: "a", to: "a" },
      ],
      latency: { pg: 9, net: -1, x: "no" },
      scenario: {
        requests: [
          { rid: "r", entry: "a" },
          { rid: "", entry: "a" },
          { rid: "q", entry: "nope" },
        ],
        faults: [{ kind: "error", on: true }, { kind: "bogus" }],
        seed: 4.6,
      },
    });
    expect(typeof r).not.toBe("string");
    const m = r as Exclude<typeof r, string>;
    expect(m.name).toBe("Imported flow");
    expect(m.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(m.nodes[0]).toMatchObject({ x: 0, retries: 10, latency: 0 });
    expect(m.edges).toHaveLength(1);
    expect(m.edges[0]).toMatchObject({ kind: "request", rid: true });
    expect(m.edges[0].payload[0]).toMatchObject({ name: "x", type: "any" });
    expect(m.latency).toEqual({ pg: 9 });
    expect(m.scenario.requests).toEqual([
      { rid: "r", entry: "a", at: 0, payload: {} },
    ]);
    expect(m.scenario.faults).toHaveLength(1);
    expect(m.scenario.seed).toBe(5);
  });
  test("new ids never clash with the ones that were read", () => {
    const r = readModel({
      nodes: [{ id: "n41", kind: "handler", title: "a" }],
      edges: [],
    }) as ReturnType<typeof emptyModel>;
    expect(addNode(r, "handler").id).toBe("n42");
  });
  test("slugify", () => {
    expect(slugify("Login: rate limit!")).toBe("login-rate-limit");
    expect(slugify("???")).toBe("flow");
  });
  test("the effect catalogue has the effects of the brief", () => {
    const types = EFFECTS.map((e) => e.type);
    for (const t of [
      "pg.query",
      "redis.cmd",
      "fetch.request",
      "timer.after",
      "ws.send",
      "ws.broadcast",
      "log",
      "crypto.verify",
      "http.respond",
      "http.sse",
    ])
      expect(types).toContain(t);
    expect(effectDef("http.respond")?.responds).toBe(true);
    expect(blankNode("x", "effect", "redis.cmd").plugin).toBe("redis");
  });
});

describe("undo and redo (the history of the Visual Builder is reused)", () => {
  test("records edits and walks back and forth", () => {
    let h: History<ReturnType<typeof emptyModel>> = start(emptyModel());
    const a = addNode(h.present, "handler", "a").model;
    const b = addNode(a, "handler", "b").model;
    h = commit(commit(h, a), b);
    expect(h.present.nodes).toHaveLength(2);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present.nodes).toHaveLength(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(b);
  });
  test("typing in one field coalesces into one undo step", () => {
    let h = start(emptyModel());
    const n = addNode(h.present, "handler", "a");
    h = commit(h, n.model);
    for (const t of ["b", "bc", "bcd"])
      h = commit(
        h,
        updateNode(h.present, n.id, { title: t }),
        `n:${n.id}:title`,
      );
    expect(h.past).toHaveLength(2);
    expect(undo(h).present.nodes[0].title).toBe("a");
  });
});
