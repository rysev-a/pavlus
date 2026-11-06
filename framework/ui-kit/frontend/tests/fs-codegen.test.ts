// The generated code must parse (the TypeScript parser of vite) and the generated
// scenario tests must have the shapes of server/src/testing: `scenario(app, steps,
// opts)` with `{ send }`, `{ expect, from, reply | error }` steps.

import { parseSync } from "vite";
import { describe, expect, test } from "vitest";
import {
  generateAll,
  generateFrontend,
  generateServer,
  generateTests,
  jsonExpr,
  pathExpr,
  planOf,
  scenarioSteps,
  textExpr,
} from "../templates/flow-studio/codegen.ts";
import {
  abortDemo,
  chatDemo,
  DEMOS,
  loginDemo,
  paymentDemo,
  todoDemo,
} from "../templates/flow-studio/demos.ts";
import { simulate, variantsOf } from "../templates/flow-studio/engine.ts";
import { Kit, ping } from "./fs-kit.ts";

type Node = { type: string; [k: string]: unknown };

function parse(
  path: string,
  code: string,
): { program: Node; errors: { message: string }[] } {
  const r = parseSync(path, code, { lang: "ts" });
  return {
    program: r.program as unknown as Node,
    errors: r.errors as { message: string }[],
  };
}

function walk(n: unknown, f: (x: Node) => void): void {
  if (Array.isArray(n)) return n.forEach((x) => walk(x, f));
  if (n && typeof n === "object") {
    const o = n as Node;
    if (typeof o.type === "string") f(o);
    for (const v of Object.values(o)) walk(v, f);
  }
}

const calls = (program: Node, name: string): Node[] => {
  const out: Node[] = [];
  walk(program, (x) => {
    const c = x.callee as Node | undefined;
    if (
      x.type === "CallExpression" &&
      c?.type === "Identifier" &&
      c.name === name
    )
      out.push(x);
  });
  return out;
};
const keys = (o: Node): string[] =>
  (o.properties as Node[]).map(
    (p) => ((p.key as Node).name ?? (p.key as Node).value) as string,
  );

describe("every generated file parses", () => {
  for (const d of DEMOS) {
    test(d.title, () => {
      const files = generateAll(d.make());
      expect(files.length).toBeGreaterThan(5);
      for (const f of files.filter((x) => x.path.endsWith(".ts"))) {
        const r = parse(f.path, f.code);
        expect(
          r.errors.map((e) => e.message),
          f.path,
        ).toEqual([]);
      }
    });
  }
  test("a failed parse is detected (the check can fail)", () => {
    expect(parse("x.ts", "const a: = ;").errors.length).toBeGreaterThan(0);
  });
  test("the paths are in three groups", () => {
    const files = generateAll(loginDemo());
    const paths = files.map((f) => f.path);
    expect(paths).toContain("server/routes.ts");
    expect(paths).toContain("server/app.ts");
    expect(paths).toContain("server/main.ts");
    expect(paths).toContain("server/conditions.ts");
    expect(paths).toContain("server/flow.scenario.test.ts");
    expect(paths).toContain("frontend/handlers.ts");
    expect(new Set(files.map((f) => f.group))).toEqual(
      new Set(["server", "tests", "frontend"]),
    );
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("the server skeleton", () => {
  const files = generateServer(loginDemo());
  const file = (p: string) => files.find((f) => f.path === p)!.code;

  test("the routes table maps METHOD /path to the message id", () => {
    expect(file("server/routes.ts")).toContain('"POST /login": "auth.login"');
    const todo = generateServer(todoDemo()).find(
      (f) => f.path === "server/routes.ts",
    )!.code;
    expect(todo).toContain('"GET /todos": "todos.list"');
    expect(todo).toContain('"POST /todos/reorder": "todos.reorder"');
  });
  test("websocket routes are kept apart from the http table", () => {
    const code = generateServer(chatDemo()).find(
      (f) => f.path === "server/routes.ts",
    )!.code;
    expect(code).toContain('"GET /chat/:room": "chat.open"');
    expect(code).toContain("wsRoutes");
    expect(code).toContain('"WS /chat/:room": "chat.message"');
  });
  test("a pure handler module per route, in the style of todo-api", () => {
    const code = file("server/handlers/auth-login.ts");
    expect(code).toContain(
      "export function handle(msg: Message, state: ServerState): Effect[] | undefined",
    );
    expect(code).toContain("switch (msg.id)");
    expect(code).toContain('case "auth.login":');
    expect(code).toContain('case "auth.login.counted":');
    expect(code).toContain("return undefined;");
    // effects are built with the effectors, never written by hand
    expect(code).toContain("redis.incr(");
    expect(code).toContain("pg.query(");
    expect(code).toContain("crypto.verify(");
    expect(code).toContain("crypto.randomToken(");
    expect(code).toContain("http.json(");
    expect(code).toContain("rq.merge(");
    expect(code).toContain("rq.sharedSet(");
    expect(code).toContain(
      'import type { Effect, Message } from "@pavlus/frontend"',
    );
    expect(code).toContain('from "@pavlus/backend"');
  });
  test("every effect names its replyTo and onError", () => {
    const code = file("server/handlers/auth-login.ts");
    expect(code).toContain(
      'replyTo: "auth.login.counted", onError: "auth.failed"',
    );
    expect(code).toContain('replyTo: "auth.login.found"');
    expect(code).toContain('replyTo: "auth.login.stored"');
    expect(code).toContain("ex: 3600");
  });
  test("the conditions become calls of a conditions module", () => {
    const code = file("server/handlers/auth-login.ts");
    expect(code).toContain("if (limited(msg, state))");
    expect(code).toContain("if (!limited(msg, state))");
    expect(code).toContain('from "../conditions.ts"');
    const cond = file("server/conditions.ts");
    expect(cond).toContain("export const limited");
    expect(cond).toContain('flag(state, "firstHit", true)');
    expect(cond).toContain('flag(state, "limited", false)');
  });
  test("shared handlers (the failure of every route) go to common.ts", () => {
    const todo = generateServer(todoDemo());
    expect(todo.map((f) => f.path)).toContain("server/handlers/common.ts");
    expect(
      todo.find((f) => f.path === "server/handlers/common.ts")!.code,
    ).toContain('case "todos.failed"');
    const plan = planOf(todoDemo());
    expect(plan.modules.map((m) => m.slug)).toEqual([
      "todos-list",
      "todos-reorder",
    ]);
  });
  test("the app composes the modules", () => {
    const code = file("server/app.ts");
    expect(code).toContain(
      'import { handle as authLogin } from "./handlers/auth-login.ts"',
    );
    expect(code).toContain("const modules = [authLogin");
    expect(code).toContain(
      "export const app = (msg: Message, state: ServerState): Effect[]",
    );
  });
  test("main.ts wires only the plugins the design uses", () => {
    const main = file("server/main.ts");
    for (const p of [
      "createLogPlugin",
      "createPostgresPlugin",
      "createRedisPlugin",
      "createCryptoPlugin",
      "createHttpServerPlugin",
    ])
      expect(main).toContain(p);
    expect(main).not.toContain("createFetchPlugin");
    expect(main).not.toContain("createWsServerPlugin");
    expect(main).toContain("createServerApp({");
    expect(main).toContain("process.env.DATABASE_URL");
    const pay = generateServer(paymentDemo()).find(
      (f) => f.path === "server/main.ts",
    )!.code;
    expect(pay).toContain("createFetchPlugin()");
    const chat = generateServer(chatDemo()).find(
      (f) => f.path === "server/main.ts",
    )!.code;
    expect(chat).toContain("createWsServerPlugin({ http })");
  });
  test("the effectors the code uses are imported, and only those", () => {
    const code = file("server/handlers/auth-login.ts");
    expect(code).toContain("pgEffector as pg");
    expect(code).not.toContain("fetchEffector");
    const pay = generateServer(paymentDemo()).find((f) =>
      f.path.includes("payment-hook"),
    )!.code;
    expect(pay).toContain("fetchEffector as fetch");
    expect(pay).toContain("as Effect");
  });
  test("transactions and timers and pipelines", () => {
    const todo = generateServer(todoDemo())
      .map((f) => f.code)
      .join("\n");
    expect(todo).toContain("pg.begin(");
    expect(todo).toContain("pg.commit(");
    expect(todo).toContain("pg.rollback(");
    expect(todo).toContain("redis.pipeline(");
    expect(todo).toContain("redis.get(");
    const abort = generateServer(abortDemo())
      .map((f) => f.code)
      .join("\n");
    expect(abort).toContain("time.after(3000");
  });
  test("a design without a route has no handler modules", () => {
    const files2 = generateServer(new Kit().done());
    expect(files2.filter((f) => f.path.startsWith("server/handlers"))).toEqual(
      [],
    );
  });
});

describe("expressions", () => {
  test("paths", () => {
    expect(pathExpr("payload.rows.0.id", "server")).toBe("p?.rows?.[0]?.id");
    expect(pathExpr("req.token", "server")).toBe("req?.token");
    expect(pathExpr("shared.n", "server")).toBe("(state.shared as any)?.n");
    expect(pathExpr("rid", "server")).toBe("String(msg.ctx?.rid)");
    expect(pathExpr("ip", "server")).toBe("(req.ip ?? p.ip)");
    expect(pathExpr("payload.body.token", "client")).toBe(
      "(msg.payload as any)?.data?.token",
    );
    expect(pathExpr("client.email", "client")).toBe("state?.email");
  });
  test("texts: a literal, a reference, a template", () => {
    expect(textExpr("plain", "server")).toBe('"plain"');
    expect(textExpr("12", "server")).toBe("12");
    expect(textExpr("{req.a}", "server")).toBe("req?.a");
    expect(textExpr("rl:{req.ip}", "server")).toBe("`rl:${req?.ip}`");
    expect(textExpr("a`b {req.x}", "server")).toBe("`a\\`b ${req?.x}`");
  });
  test("a json body with references", () => {
    expect(jsonExpr('{"token":"{req.token}"}', "server")).toBe(
      "{ token: req?.token }",
    );
    expect(jsonExpr('{"rows":{req.rows},"n":1}', "server")).toBe(
      "{ rows: req?.rows, n: 1 }",
    );
    expect(jsonExpr('{"id":"pay_{req.id}"}', "server")).toBe(
      "{ id: `pay_${req?.id}` }",
    );
    expect(jsonExpr("not json", "server")).toContain("TODO");
    expect(jsonExpr("{}", "server")).toBe("{}");
  });
});

describe("the generated scenario tests", () => {
  const m = loginDemo();
  const test1 = generateTests(m)[0].code;
  const { program } = parse("t.ts", test1);

  test("use scenario() of @pavlus/backend/testing against the app", () => {
    expect(test1).toContain(
      'import { scenario } from "@pavlus/backend/testing"',
    );
    expect(test1).toContain('import { app } from "./app.ts"');
    const sc = calls(program, "scenario");
    // the deadline path needs a request.timeout handler; this design has none
    expect(sc.length).toBe(
      variantsOf(m).filter((v) => v.id !== "deadline").length,
    );
    for (const c of sc) {
      const args = c.arguments as Node[];
      expect(args).toHaveLength(3);
      expect((args[0] as Node).name).toBe("app");
      expect((args[1] as Node).type).toBe("ArrayExpression");
      expect(keys(args[2] as Node)).toEqual(["routes", "state"]);
    }
  });
  test("each test is named after the path it plays", () => {
    expect(test1).toContain('it("happy path"');
    expect(test1).toContain("limited is true");
    expect(test1).toContain("client aborts mid-flight");
    expect(test1).toMatch(/it\("(redis|pg|crypto)\.[\w.]+ fails/);
  });
  test("steps are { send } or { expect, from?, reply | error }", () => {
    let sends = 0;
    let expects = 0;
    for (const c of calls(program, "scenario")) {
      const steps = (c.arguments as Node[])[1].elements as Node[];
      expect((steps[0].properties as Node[]).length).toBeGreaterThan(0);
      expect(keys(steps[0])).toEqual(["send"]);
      for (const s of steps) {
        const k = keys(s);
        if (k.includes("send")) {
          sends++;
          expect(k).toEqual(["send"]);
          const send = (s.properties as Node[])[0].value as Node;
          expect(keys(send).slice(0, 2)).toEqual(["id", "ctx"]);
          expect(keys(send).length).toBeLessThanOrEqual(3);
        } else {
          expects++;
          expect(k[0]).toBe("expect");
          // an answer is a reply or an error, and says which effect it answers
          if (k.includes("reply") || k.includes("error"))
            expect(k).toContain("from");
          if (k.includes("from"))
            expect(k.includes("reply") || k.includes("error")).toBe(true);
          for (const key of k)
            expect(["expect", "from", "reply", "error"]).toContain(key);
        }
      }
    }
    expect(sends).toBeGreaterThan(5);
    expect(expects).toBeGreaterThan(sends);
  });
  test("the first message is the http.request of the route, with the same rid", () => {
    expect(test1).toContain('{ send: { id: "http.request", ctx, payload: {');
    expect(test1).toContain('"method":"POST","path":"/login"');
    expect(test1).toContain('"email":"ann@example.com"');
  });
  test("the expectations are plugin and type patterns, the replies the payloads of the design", () => {
    expect(test1).toContain(
      '{ plugin: "redis", type: "cmd", args: (a: unknown[]) => a[0] === "INCR" }',
    );
    expect(test1).toContain('{ plugin: "pg", type: "query" }');
    expect(test1).toContain('{ plugin: "crypto", type: "verify" }');
    expect(test1).toContain('{ plugin: "http", type: "respond", status: 200 }');
    expect(test1).toContain('{ plugin: "http", type: "respond", status: 429 }');
    expect(test1).toContain('{ plugin: "requests", type: "req.merge" }');
    expect(test1).toContain('reply: { payload: {"count":1} }');
    expect(test1).toContain('error: {"code":"40001"');
  });
  test("a fault path answers onError, a flipped condition changes the flags", () => {
    expect(test1).toContain('"limited":true');
    expect(test1).toContain('"userFound":false');
  });
  test("`from` points at an effect of the step it answers", () => {
    for (const v of variantsOf(m)) {
      const { steps } = scenarioSteps(
        m,
        v,
        simulate(m, v.scenario, v.scenario.seed),
      );
      let patterns = 0;
      for (const s of steps) {
        const p = /expect: \[(.*)\],/.exec(s.code);
        if (!p) continue;
        patterns = (p[1].match(/\{ plugin:/g) ?? []).length;
        const from = /from: (\d+)/.exec(s.code);
        if (from) expect(Number(from[1])).toBeLessThan(patterns);
      }
    }
  });
  test("the abort path sends http.aborted and expects what the app logs", () => {
    const code = generateTests(abortDemo())[0].code;
    expect(code).toContain('{ send: { id: "http.aborted", ctx } }');
    expect(code).toContain('{ plugin: "log", type: "log" }');
    expect(code).toContain("rolls back its transaction");
  });
  test("the deadline path sends request.timeout when a handler takes it", () => {
    expect(generateTests(abortDemo())[0].code).toContain(
      '{ send: { id: "request.timeout", ctx } }',
    );
    // no handler for it: the runtime answers 504, nothing to assert on the app
    expect(generateTests(loginDemo())[0].code).not.toContain("request.timeout");
  });
  test("a websocket flow sends the message of its route without the router", () => {
    const code = generateTests(chatDemo())[0].code;
    expect(code).toContain(
      'id: "chat.message", ctx: { rid, conn: "ws", connId: "c1" }',
    );
  });
  test("fault paths use the fault they were simulated with", () => {
    const pay = generateTests(paymentDemo())[0].code;
    expect(pay).toContain("fetch.request fails");
    expect(pay).toContain('{ plugin: "fetch", type: "request" }');
  });
  test("a design that reaches no route makes no tests", () => {
    const empty = generateTests(new Kit().n("a", "handler", "a").done())[0]
      .code;
    expect(calls(parse("e.ts", empty).program, "scenario")).toEqual([]);
  });
  test("ping, the small design, has a happy path and a failure", () => {
    const code = generateTests(ping())[0].code;
    expect(code).toContain('it("happy path"');
    expect(code).toContain("pg.query fails");
    expect(parse("p.ts", code).errors).toEqual([]);
  });
});

describe("the frontend skeleton", () => {
  const code = generateFrontend(loginDemo())[0].code;
  test("a method per frontend handler, a state and an initial", () => {
    expect(code).toContain("export class AppHandlers extends Component<State>");
    expect(code).toContain("login(msg: Message, state: State): Effect[]");
    expect(code).toContain("onLoggedIn(msg: Message, state: State): Effect[]");
    expect(code).toContain(
      "onLoginFailed(msg: Message, state: State): Effect[]",
    );
    expect(code).toContain("export interface State");
    expect(code).toContain("export const initial: State");
  });
  test("a UI event, the http.request effect, the reply and the state set", () => {
    expect(code).toContain("// UI: click Sign in");
    expect(code).toContain("http.request({");
    expect(code).toContain('method: "POST"');
    expect(code).toContain('url: "/login"');
    expect(code).toContain(
      "body: { email: state?.email, password: state?.password }",
    );
    expect(code).toContain('onSuccess: "onLoggedIn"');
    expect(code).toContain('onError: "onLoginFailed"');
    expect(code).toContain('store.set("status", "loading")');
    expect(code).toContain(
      'store.set("session", (msg.payload as any)?.data?.token)',
    );
  });
  test("a path parameter becomes a template literal", () => {
    const k = new Kit()
      .n("ev", "ui-event", "click")
      .n("fh", "fe-handler", "open")
      .n("rt", "route", "GET /items/:id", { detail: "items.get" })
      .e("ev", "fh", "ui.click")
      .e("fh", "rt", "http.request")
      .done();
    const out = generateFrontend(k)[0].code;
    expect(out).toContain(
      '`/items/${(state as Record<string, any>).id ?? ""}`',
    );
    expect(parse("f.ts", out).errors).toEqual([]);
  });
  test("a design with no frontend still parses", () => {
    const out = generateFrontend(ping())[0].code;
    expect(parse("f.ts", out).errors).toEqual([]);
  });
});
