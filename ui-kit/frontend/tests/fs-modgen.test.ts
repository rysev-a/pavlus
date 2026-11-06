// One file per module, the ports as types, the pipe as a composition, the stubs of
// the plugins of the project. The generated TypeScript is parsed with the parser of vite.
import { describe, expect, test } from "vitest";
import { parseSync } from "vite";
import {
  generateAll,
  generateServer,
  generateTests,
  payloadType,
  usedModules,
} from "../templates/flow-studio/codegen.ts";
import { modulesDemo } from "../templates/flow-studio/demos.ts";
import {
  type Model,
  addEdge,
  addNode,
  blankPort,
  emptyModel,
  fieldsOf,
  findDef,
} from "../templates/flow-studio/model.ts";
import {
  addInstance,
  addModule,
  addPipe,
  addStage,
  updateModule,
  updatePort,
} from "../templates/flow-studio/modules.ts";
import { addPlugin, updatePlugin } from "../templates/flow-studio/plugins.ts";

const file = (m: Model, path: string): string => {
  const f = generateAll(m).find((x) => x.path === path);
  if (!f)
    throw new Error(
      `no ${path} in ${generateAll(m)
        .map((x) => x.path)
        .join(", ")}`,
    );
  return f.code;
};
const parses = (path: string, code: string): void => {
  const r = parseSync(path, code, { lang: "ts" });
  expect(r.errors.map((e) => e.message)).toEqual([]);
};

describe("a design with graph modules", () => {
  const m = modulesDemo();
  const files = generateAll(m);

  test("one file per module, and the shared emit; all of it parses", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("server/modules/rate-limit.ts");
    expect(paths).toContain("server/modules/check-credentials.ts");
    expect(paths).toContain("server/modules/emit.ts");
    expect(paths).toContain("server/modules.test.ts");
    for (const f of files) parses(f.path, f.code);
  });

  test("the ports are the interface of the file", () => {
    const code = file(m, "server/modules/rate-limit.ts");
    expect(code).toContain('export const inputs = ["auth.login"] as const;');
    expect(code).toContain(
      'export const outputs = ["login.allowed", "rate.limited"] as const;',
    );
    expect(code).toContain('case "auth.login"');
    expect(code).toContain('case "auth.login.counted"');
  });

  test("a message to the next module is an emit, kept behind the condition of its edge", () => {
    const code = file(m, "server/modules/rate-limit.ts");
    expect(code).toMatch(
      /if \(!limited\(msg, state\)\) out\.push\(emit\("login\.allowed", p\)\)/,
    );
    expect(code).toContain('import { emit } from "./emit.ts";');
  });

  test("an effect on an outer edge of an output port is made by the module", () => {
    const code = file(m, "server/modules/check-credentials.ts");
    expect(code).toMatch(
      /if \(passwordOk\(msg, state\)\) out\.push\(crypto\.randomToken\(/,
    );
  });

  test("the app composes the route handlers and the modules", () => {
    const app = file(m, "server/app.ts");
    expect(app).toContain('from "./modules/rate-limit.ts"');
    expect(app).toContain('from "./modules/check-credentials.ts"');
    expect(file(m, "server/routes.ts")).toContain(
      '"POST /login": "auth.login"',
    );
  });

  test("the conditions of the bodies of the modules are in conditions.ts", () => {
    const c = file(m, "server/conditions.ts");
    for (const name of ["limited", "firstHit", "userFound", "passwordOk"])
      expect(c).toContain(`export const ${name}`);
  });

  test("the module tests take the example of each input port", () => {
    const t = file(m, "server/modules.test.ts");
    expect(t).toContain('describe("Rate limit"');
    expect(t).toContain('it("takes auth.login"');
    expect(t).toContain("leaves the other messages to the others");
  });

  test("modules are listed in the order of the library", () => {
    expect(usedModules(m).map((d) => d.name)).toEqual([
      "Rate limit",
      "Check credentials",
    ]);
  });

  test("a design without modules generates as before", () => {
    const paths = generateServer(emptyModel()).map((f) => f.path);
    expect(paths.some((p) => p.includes("modules/"))).toBe(false);
  });
});

/** POST /hello -> a module with code -> pg.query and http.respond */
function codeProject(): Model {
  let m = emptyModel();
  const made = addModule(m, "Hello", "backend", "code");
  m = made.model;
  const d = findDef(m, made.id)!;
  m = updateModule(m, made.id, {
    source: `switch (msg.id) {
  case "hello.in":
    return [rq.merge({ who: msg.payload.who }), pg.query("select 1", { replyTo: "hello.found" }), emit("hello.out", msg.payload)];
}
return [];`,
  });
  m = {
    ...m,
    modules: m.modules.map((x) =>
      x.id === made.id
        ? {
            ...x,
            inputs: [
              blankPort(d.inputs[0].id, "hello.in", "", {
                fields: fieldsOf(
                  "who:string=ann; age:number=3; opts.vip:boolean=true",
                ),
              }),
            ],
            outputs: [blankPort(d.outputs[0].id, "hello.out")],
          }
        : x,
    ),
  };
  const inst = addInstance(m, made.id, { id: "H" })!;
  m = inst.model;
  m = addNode(m, "route", "POST /hello", {
    id: "rt",
    detail: "hello.in",
  }).model;
  m = addEdge(m, "rt", "H")!.model;
  return m;
}

describe("a module with code", () => {
  const m = codeProject();
  const code = file(m, "server/modules/hello.ts");

  test("the source is the body of handle, between the ports", () => {
    parses("hello.ts", code);
    expect(code).toContain('export const inputs = ["hello.in"] as const;');
    expect(code).toContain("export interface HelloInPayload");
    expect(code).toContain("who: string;");
    expect(code).toContain("age: number;");
    expect(code).toContain("vip: boolean;");
    expect(code).toContain("rq.merge({ who: msg.payload.who })");
    expect(code).toContain('import { emit } from "./emit.ts";');
  });

  test("only the plugins the source calls are imported", () => {
    expect(code).toMatch(/pgEffector as pg/);
    expect(code).toMatch(/requestsEffector as rq/);
    expect(code).not.toMatch(/redisEffector/);
  });

  test("the test expects the effects the examples make the code return", () => {
    const t = file(m, "server/modules.test.ts");
    parses("modules.test.ts", t);
    expect(t).toContain(
      'expect.objectContaining({ plugin: "pg", type: "query" })',
    );
    expect(t).toContain('replyTo: "hello.out"');
  });

  test("main wires the timer for emit, the database for pg", () => {
    const main = file(m, "server/main.ts");
    expect(main).toContain("createPostgresPlugin");
    expect(main).toContain("createTimePlugin");
  });
});

describe("a pipe", () => {
  function pipeProject(): Model {
    let m = emptyModel();
    const a = addModule(m, "Guard", "backend", "code");
    m = updateModule(a.model, a.id, {
      source: `return [emit("guard.ok", msg.payload)];`,
    });
    const gd = findDef(m, a.id)!;
    m = updatePort(m, a.id, "outputs", gd.outputs[0].id, {
      name: "guard.ok",
      pass: true,
    });
    m = updatePort(m, a.id, "inputs", gd.inputs[0].id, { name: "req.in" });
    const b = addModule(m, "Answer", "backend", "code");
    m = updateModule(b.model, b.id, {
      source: `return [http.json({ ok: true }, 200)];`,
    });
    const bd = findDef(m, b.id)!;
    m = updatePort(m, b.id, "inputs", bd.inputs[0].id, { name: "pass.along" });
    m = updatePort(m, b.id, "outputs", bd.outputs[0].id, {
      name: "http.respond",
    });
    const p = addPipe(m, "Chain");
    m = addStage(addStage(p.model, p.id, a.id), p.id, b.id);
    m = addInstance(m, p.id, { id: "P" })!.model;
    m = addNode(m, "route", "POST /x", { id: "rt", detail: "req.in" }).model;
    m = addEdge(m, "rt", "P")!.model;
    return m;
  }
  const m = pipeProject();

  test("is a composition of its stages; the stages are reached through it", () => {
    const code = file(m, "server/modules/chain.ts");
    parses("chain.ts", code);
    expect(code).toContain('import * as stage0_guard from "./guard.ts";');
    expect(code).toContain('import * as stage1_answer from "./answer.ts";');
    expect(code).toContain(
      "export const stages = [stage0_guard, stage1_answer];",
    );
    // guard passes "guard.ok" and answer takes "pass.along": the pipe renames it
    expect(code).toContain('{"guard.ok":"pass.along"}');
    const app = file(m, "server/app.ts");
    expect(app).toContain('from "./modules/chain.ts"');
    expect(app).not.toContain('from "./modules/guard.ts"');
    expect(app).not.toContain('from "./modules/answer.ts"');
  });

  test("every file parses", () => {
    for (const f of generateAll(m)) parses(f.path, f.code);
    expect(file(m, "server/modules/emit.ts")).toContain("retarget");
  });
});

describe("the plugins of the project", () => {
  test("a stub per plugin, its builder in the handlers, its factory in main", () => {
    let m = emptyModel();
    m = addPlugin(m, "stripe").model;
    m = updatePlugin(m, "stripe", {
      external: "Stripe API",
      effectsText: "charge | charge a card | POST /v1/charges | reply",
    });
    m = addNode(m, "route", "POST /pay", {
      id: "rt",
      detail: "pay.post",
    }).model;
    m = addNode(m, "handler", "pay.post", { id: "h1" }).model;
    m = addNode(m, "effect", "stripe.charge", {
      id: "c",
      detail: "POST /v1/charges",
    }).model;
    m = addNode(m, "handler", "pay.charged", { id: "h2" }).model;
    m = addNode(m, "effect", "http.respond", {
      id: "ok",
      status: 200,
      detail: "{}",
    }).model;
    for (const [a, b, o] of [
      ["rt", "h1", { msg: "pay.post" }],
      ["h1", "c", { kind: "effect" }],
      ["c", "h2", { kind: "reply", msg: "pay.charged" }],
      ["h2", "ok", { kind: "effect" }],
    ] as const)
      m = addEdge(m, a, b, o as Parameters<typeof addEdge>[3])!.model;
    const files = generateAll(m);
    for (const f of files) parses(f.path, f.code);
    const stub = files.find((f) => f.path === "server/plugins/stripe.ts")!.code;
    expect(stub).toContain("createStripePlugin");
    const handlers = files
      .filter((f) => f.path.startsWith("server/handlers/"))
      .map((f) => f.code)
      .join("\n");
    expect(handlers).toContain(
      'stripe.charge("POST /v1/charges", { replyTo: "pay.charged" })',
    );
    expect(handlers).toContain(
      'import { stripeEffector as stripe } from "../plugins/stripe.ts";',
    );
    const main = files.find((f) => f.path === "server/main.ts")!.code;
    expect(main).toContain(
      'import { createStripePlugin } from "./plugins/stripe.ts";',
    );
    expect(main).toContain("createStripePlugin()");
  });
});

describe("payloadType", () => {
  test("nests dotted names and maps the types", () => {
    expect(
      payloadType(
        fieldsOf("body.email:string; body.age:number; tags:array; any:any"),
      ),
    ).toBe(
      "{\n  body: {\n    email: string;\n    age: number;\n  };\n  tags: unknown[];\n  any: unknown;\n}",
    );
    expect(payloadType([])).toBe("Record<string, unknown>");
  });
});

describe("generateTests", () => {
  test("a design with modules gets the module tests, not the flat scenario", () => {
    const t = generateTests(modulesDemo());
    expect(t.map((f) => f.path)).toEqual(["server/modules.test.ts"]);
  });
});
