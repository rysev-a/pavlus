import { describe, expect, test } from "vitest";
import {
  type Run,
  envOf,
  execute,
  finish,
  fire,
  formInput,
  formSubmit,
  startRun,
  writeKey,
} from "../templates/visual-builder/actions.ts";
import {
  coerce,
  evalExpr,
  exprError,
  fill,
  getPath,
  initialData,
  interpolate,
  parseInitial,
  refsOf,
  scopeOf,
  setPath,
  splitTemplate,
  templateError,
  unsafeExpr,
} from "../templates/visual-builder/bind.ts";
import {
  DEMOS,
  counterDemo,
  directoryDemo,
  landingDemo,
  salesDemo,
  todoDemo,
} from "../templates/visual-builder/demos.ts";
import {
  matchPath,
  parseUrl,
  routeMock,
} from "../templates/visual-builder/mock.ts";
import { allElements, findElement } from "../templates/visual-builder/model.ts";
import { walk } from "../templates/visual-builder/chain.ts";
import { http, notice, set } from "../templates/visual-builder/build.ts";
import type { Action } from "../templates/visual-builder/model.ts";

const S = (state: Record<string, unknown>, extra = {}) => scopeOf(state, extra);

describe("expressions", () => {
  test("the framework's expression subset, evaluated against the state", () => {
    const s = S({ n: 2, user: { name: "Ann" }, list: [1, 2, 3] });
    expect(evalExpr("state.n * 3 + 1", s)).toEqual({ ok: true, value: 7 });
    expect(evalExpr('state.user.name + "!"', s)).toEqual({
      ok: true,
      value: "Ann!",
    });
    expect(evalExpr("state.list.length > 2 ? 'many' : 'few'", s)).toEqual({
      ok: true,
      value: "many",
    });
    expect(evalExpr("state.missing.deep", s)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(evalExpr("", s)).toEqual({ ok: true, value: undefined });
  });

  test("helpers: the subset has no method calls", () => {
    const s = S({
      rows: [
        { a: 1, r: "x" },
        { a: 4, r: "y" },
        { a: 5, r: "x" },
      ],
      q: "AN",
    });
    const v = (e: string) => (evalExpr(e, s) as { value: unknown }).value;
    expect(v('sum(state.rows, "a")')).toBe(10);
    expect(v('avg(state.rows, "a")')).toBe(10 / 3);
    expect(v('max(state.rows, "a")')).toBe(5);
    expect(v('min(state.rows, "a")')).toBe(1);
    expect(v('len(where(state.rows, "r", "x"))')).toBe(2);
    expect(v('count(state.rows, "r", "x")')).toBe(2);
    expect(v('join(pick(state.rows, "r"), "-")')).toBe("x-y-x");
    expect(v('contains("Hannah", state.q)')).toBe(true);
    expect(v('obj("a", 1, "b", state.q)')).toEqual({ a: 1, b: "AN" });
    expect(v('first(sortBy(state.rows, "a")).a')).toBe(1);
    expect(v("round(2.567, 1)")).toBe(2.6);
  });

  test("errors are reported, not thrown", () => {
    expect(exprError("1 +")).not.toBe("");
    expect(exprError("state.a")).toBe("");
    expect(evalExpr("1 +", S({})).ok).toBe(false);
    expect(templateError("Hi {state.a +}")).not.toBe("");
    expect(templateError("Hi {state.a}")).toBe("");
  });

  test("unsafe names and computed access are refused", () => {
    expect(unsafeExpr("state.constructor")).not.toBe("");
    expect(unsafeExpr("a['x']")).not.toBe("");
    expect(unsafeExpr("[1, 2]")).toBe("");
    const r = evalExpr("state.constructor.constructor", S({}));
    expect(r.ok).toBe(false);
  });
});

describe("templates", () => {
  test("holes, escaped braces, nested braces and strings", () => {
    expect(splitTemplate("a {x} b")).toEqual(["a ", { expr: "x" }, " b"]);
    expect(splitTemplate("\\{x}")).toEqual(["{x}"]);
    expect(splitTemplate('{a + "}"}')).toEqual([{ expr: 'a + "}"' }]);
    expect(splitTemplate("open { never closed")).toEqual([
      "open { never closed",
    ]);
  });

  test("interpolation reads the live state", () => {
    const s = S({ user: { name: "Ann" }, n: 3, o: { a: 1 }, nil: null });
    expect(
      fill("Hello {state.user.name}, {state.n} items {state.nil}.", s),
    ).toBe("Hello Ann, 3 items .");
    expect(fill("{state.o}", s)).toBe('{"a":1}');
    expect(interpolate("{1 +} ok", s)).toMatchObject({
      errors: [expect.any(String)],
    });
  });

  test("which keys a text reads", () => {
    expect(
      refsOf('{state.user.name} and {sum(state.rows, "a")} state.x'),
    ).toEqual(["user", "rows", "x"]);
    expect(refsOf("mystate.x")).toEqual([]);
  });
});

describe("paths and typed keys", () => {
  test("getPath / setPath are immutable", () => {
    const d = { a: { b: 1 }, l: [1] };
    const e = setPath(d, "a.c.d", 5);
    expect(getPath(e, "a.c.d")).toBe(5);
    expect(d.a).toEqual({ b: 1 });
    expect(setPath(d, "__proto__.x", 1)).toBe(d);
  });
  test("initial values by type", () => {
    expect(parseInitial({ key: "a", type: "number", initial: "3" }).value).toBe(
      3,
    );
    expect(
      parseInitial({ key: "a", type: "number", initial: "x" }).error,
    ).not.toBe("");
    expect(
      parseInitial({ key: "a", type: "boolean", initial: "true" }).value,
    ).toBe(true);
    expect(
      parseInitial({ key: "a", type: "json", initial: "[1]" }).value,
    ).toEqual([1]);
    expect(
      parseInitial({ key: "a", type: "json", initial: "[" }).error,
    ).not.toBe("");
    expect(initialData([{ key: "x", type: "string", initial: "hi" }])).toEqual({
      x: "hi",
    });
    expect(coerce("number", "4")).toBe(4);
    expect(coerce("number", "")).toBe(0);
    expect(coerce("boolean", "true")).toBe(true);
  });
});

describe("mock router", () => {
  const routes = [
    {
      id: "a",
      method: "GET",
      path: "/api/users",
      status: 200,
      body: '[{"id":1}]',
      delay: 5,
    },
    {
      id: "b",
      method: "GET",
      path: "/api/users/:id",
      status: 200,
      body: '{"id":"$param:id","q":"$query:q"}',
      delay: 0,
    },
    {
      id: "c",
      method: "POST",
      path: "/api/users",
      status: 201,
      body: '{"ok":true}',
      delay: 0,
    },
    {
      id: "d",
      method: "GET",
      path: "/bad",
      status: 200,
      body: "{nope",
      delay: 0,
    },
    {
      id: "e",
      method: "GET",
      path: "/files/*",
      status: 200,
      body: "1",
      delay: 0,
    },
  ];
  test("method + path", () => {
    expect(routeMock(routes, "GET", "/api/users")).toMatchObject({
      status: 200,
      data: [{ id: 1 }],
      delay: 5,
      route: "a",
    });
    expect(routeMock(routes, "post", "/api/users")).toMatchObject({
      status: 201,
      route: "c",
    });
  });
  test("params, query and absolute urls", () => {
    expect(
      routeMock(routes, "GET", "https://x.test/api/users/42?q=a%20b").data,
    ).toEqual({ id: 42, q: "a b" });
  });
  test("unknown route is a 404, bad json a 500, wildcard matches", () => {
    expect(routeMock(routes, "GET", "/nope")).toMatchObject({
      status: 404,
      route: "",
    });
    expect(routeMock(routes, "DELETE", "/api/users").status).toBe(404);
    expect(routeMock(routes, "GET", "/bad").status).toBe(500);
    expect(routeMock(routes, "GET", "/files/a/b").status).toBe(200);
  });
  test("helpers", () => {
    expect(parseUrl("/a/b/?x=1&y=2")).toEqual({
      path: "/a/b",
      query: { x: "1", y: "2" },
    });
    expect(matchPath("/a/:id", "/a/7")).toEqual({ id: "7" });
    expect(matchPath("/a/:id", "/a")).toBeNull();
  });
});

describe("actions", () => {
  const model = todoDemo();
  const env = envOf(model);
  const run0: Run = startRun(model);

  test("set / toggle / push / remove / notice", () => {
    const chain: Action[] = [
      set("count", "1 + 1"),
      { t: "toggle", key: "flag" },
      { t: "push", key: "todos", value: 'obj("title", "x")' },
      { t: "remove", key: "todos", index: "0" },
      notice("n={state.count}"),
    ];
    const r = execute(
      chain,
      { ...run0, data: { ...run0.data, flag: false } },
      {},
      env,
    ).run;
    expect(r.data.count).toBe(2);
    expect(r.data.flag).toBe(true);
    expect((r.data.todos as unknown[]).length).toBe(2); // 2 + 1 - 1
    expect(r.notice).toBe("n=2");
    expect(r.log.length).toBe(5);
  });

  test("remove by index and by item; a bad expression is logged, not thrown", () => {
    const data = { ...run0.data, l: [{ a: 1 }, { a: 2 }, { a: 3 }] };
    const base = { ...run0, data };
    expect(
      execute([{ t: "remove", key: "l", index: "1" }], base, {}, env).run.data
        .l,
    ).toEqual([{ a: 1 }, { a: 3 }]);
    expect(
      execute(
        [{ t: "remove", key: "l", index: "item" }],
        base,
        { item: { a: 3 } },
        env,
      ).run.data.l,
    ).toEqual([{ a: 1 }, { a: 2 }]);
    const bad = execute([set("x", "1 +"), set("y", "5")], base, {}, env).run;
    expect(bad.data.y).toBe(5);
    expect(bad.log[0]).toContain("set x");
  });

  test("the event brings its own scope", () => {
    const r = execute(
      [set("q", "event.value")],
      run0,
      { event: { value: "abc" } },
      env,
    ).run;
    expect(r.data.q).toBe("abc");
  });

  test("an http action asks for a request, with interpolation, and waits", () => {
    const a = http("POST", "/api/x/{state.n}", {
      headers: "X-A: {state.n}\nY: 2",
      body: 'obj("n", state.n)',
      okKey: "res",
      loadingKey: "loading",
      then: [set("after", "response.v")],
      catch: [set("bad", "error")],
    });
    const base = { ...run0, data: { ...run0.data, n: 7 } };
    const step = execute([a, set("sync", "1")], base, {}, env);
    expect(step.requests).toHaveLength(1);
    expect(step.requests[0]).toMatchObject({
      method: "POST",
      url: "/api/x/7",
      headers: { "X-A": "7", Y: "2" },
      body: { n: 7 },
    });
    expect(step.run.data.loading).toBe(true);
    expect(step.run.data.sync).toBe(1); // the chain does not wait
    const slot = step.requests[0].slot;
    const ok = finish(step.run, slot, { status: 200, data: { v: 9 } }, env);
    expect(ok.run.data).toMatchObject({
      res: { v: 9 },
      loading: false,
      after: 9,
    });
    expect(ok.run.slots[slot]).toBeNull();
    const bad = finish(
      step.run,
      slot,
      { status: 500, data: { error: "boom" } },
      env,
    );
    expect(bad.run.data.bad).toBe("boom");
    expect(bad.run.data.loading).toBe(false);
  });

  test("okPath stores a part of the response; errKey the error; a late answer is ignored", () => {
    const a = http("GET", "/u", {
      okKey: "users",
      okPath: "data.list",
      errKey: "err",
    });
    const step = execute([a], run0, {}, env);
    const slot = step.requests[0].slot;
    expect(
      finish(
        step.run,
        slot,
        { status: 200, data: { data: { list: [1] } } },
        env,
      ).run.data.users,
    ).toEqual([1]);
    const bad = finish(
      step.run,
      slot,
      { status: 0, data: null, error: "offline" },
      env,
    );
    expect(bad.run.data.err).toEqual({
      message: "offline",
      status: 0,
      data: null,
    });
    const again = finish(bad.run, slot, { status: 200, data: 1 }, env);
    expect(again.run).toBe(bad.run);
  });

  test("a nested then can start another request; slots run out gracefully", () => {
    const inner = http("GET", "/two", { okKey: "b" });
    const a = http("GET", "/one", { okKey: "a", then: [inner] });
    const s1 = execute([a], run0, {}, env);
    const s2 = finish(
      s1.run,
      s1.requests[0].slot,
      { status: 200, data: 1 },
      env,
    );
    expect(s2.requests[0].url).toBe("/two");
    const many = execute(
      Array.from({ length: 30 }, () => http("GET", "/x")),
      run0,
      {},
      env,
    );
    expect(many.requests).toHaveLength(24);
    expect(many.run.notice).toContain("Too many");
  });

  test("navigate: a page by slug, an absolute url, an unknown path", () => {
    const m = landingDemo();
    const e = envOf(m);
    const r0 = startRun(m);
    expect(
      execute([{ t: "navigate", url: "/pricing" }], r0, {}, e).run.page,
    ).toBe(m.pages[1].id);
    expect(
      execute([{ t: "navigate", url: "pricing" }], r0, {}, e).run.location,
    ).toBe("/pricing");
    expect(
      execute([{ t: "navigate", url: "https://example.com" }], r0, {}, e).opens,
    ).toEqual(["https://example.com"]);
    expect(
      execute([{ t: "navigate", url: "/nowhere" }], r0, {}, e).run.notice,
    ).toContain("No page");
  });

  test("bound inputs write typed values", () => {
    const e = envOf(counterDemo());
    const r = writeKey(startRun(counterDemo()), e, "step", "5");
    expect(r.data.step).toBe(5);
  });
});

describe("forms", () => {
  const m = landingDemo();
  const env = envOf(m);
  const form = allElements(m).find((e) => e.type === "form")!;

  test("submit validates, shows errors, mirrors them to the errors key, runs `invalid`", () => {
    const run = startRun(m);
    const step = formSubmit(form, run, env);
    expect(step.requests).toHaveLength(0);
    const errors = step.run.ui[form.id].errors!;
    expect(Object.keys(errors).sort()).toEqual(["email", "name"]);
    expect(step.run.data.leadErrors).toEqual(errors);
    expect(step.run.notice).toContain("fix");
  });

  test("typing clears the error of a field; a valid form runs submit", () => {
    let run = formSubmit(form, startRun(m), env).run;
    run = formInput(form, run, "name", "Ann");
    expect(run.ui[form.id].errors).not.toHaveProperty("name");
    run = formInput(form, run, "email", "ann@x.co");
    run = formInput(form, run, "seats", 3);
    const step = formSubmit(form, run, env);
    expect(step.requests).toHaveLength(1);
    expect(step.requests[0]).toMatchObject({
      method: "POST",
      url: "/api/leads",
      headers: { "X-Source": "landing" },
    });
    expect(step.requests[0].body).toMatchObject({
      name: "Ann",
      email: "ann@x.co",
    });
    expect(step.run.data.sending).toBe(true);
    const done = finish(
      step.run,
      step.requests[0].slot,
      { status: 201, data: { id: 5 } },
      env,
    );
    expect(done.run.page).toBe(m.pages[2].id);
    expect(done.run.data.lead_result).toEqual({ id: 5 });
  });
});

describe("demos", () => {
  test("every demo is a consistent model", () => {
    for (const d of DEMOS) {
      const m = d.make();
      const ids = allElements(m).map((e) => e.id);
      expect(new Set(ids).size, d.id).toBe(ids.length);
      expect(m.seq).toBeGreaterThanOrEqual(ids.length);
      for (const e of allElements(m)) {
        expect(findElement(m, e.id)).not.toBeNull();
        for (const t of Object.values(e.props))
          expect(templateError(t), `${d.id} ${e.id}`).toBe("");
        expect(exprError(e.visible), `${d.id} ${e.id}`).toBe("");
        for (const k of ["source", "filter", "value", "disabled"])
          if (e.props[k] && !e.props[k].includes("{"))
            expect(exprError(e.props[k]), `${d.id} ${e.id} ${k}`).toBe("");
        for (const chain of Object.values(e.events))
          walk(chain ?? [], (a) => {
            for (const f of [a.value, a.index, a.body])
              expect(exprError(f ?? ""), `${d.id} ${e.id} ${a.t}`).toBe("");
            for (const f of [a.url, a.text, a.headers])
              expect(templateError(f ?? ""), `${d.id} ${e.id}`).toBe("");
          });
      }
      for (const k of m.keys)
        expect(parseInitial(k).error, `${d.id} ${k.key}`).toBe("");
    }
  });

  test("the user directory loads through the mock into the state on `load`", () => {
    const m = directoryDemo();
    const env = envOf(m);
    const table = allElements(m).find((e) => e.type === "table")!;
    const step = fire(table, "load", startRun(m), {}, env);
    const req = step.requests[0];
    const answer = routeMock(m.mocks, req.method, req.url);
    const done = finish(
      step.run,
      req.slot,
      { status: answer.status, data: answer.data },
      env,
    );
    expect((done.run.data.users as unknown[]).length).toBe(8);
    expect(done.run.data.loading).toBe(false);
    const clicked = fire(
      table,
      "click",
      done.run,
      { row: (done.run.data.users as { id: number }[])[2], index: 2 },
      env,
    );
    expect((clicked.run.data.selected as { name: string }).name).toBe(
      "Grace Hopper",
    );
    const detail = routeMock(
      m.mocks,
      clicked.requests[0].method,
      clicked.requests[0].url,
    );
    expect(detail.data).toMatchObject({ id: 3 });
  });

  test("the sales dashboard filters by region", () => {
    const m = salesDemo();
    const env = envOf(m);
    const select = allElements(m).find((e) => e.type === "select")!;
    let run = writeKey(startRun(m), env, "region", "North");
    run = fire(select, "change", run, {}, env).run;
    expect((run.data.shown as unknown[]).length).toBe(4);
    expect(fill('{sum(state.shown, "amount")}', scopeOf(run.data))).toBe("595");
  });

  test("the todo demo adds and removes", () => {
    const m = todoDemo();
    const env = envOf(m);
    const input = allElements(m).find((e) => e.type === "input")!;
    const list = allElements(m).find((e) => e.type === "list")!;
    let run = writeKey(startRun(m), env, "draft", "Water plants");
    run = fire(input, "enter", run, {}, env).run;
    expect(run.data.draft).toBe("");
    expect((run.data.todos as { title: string }[]).at(-1)!.title).toBe(
      "Water plants",
    );
    run = fire(list, "remove", run, { item: {}, index: 0 }, env).run;
    expect((run.data.todos as unknown[]).length).toBe(2);
  });
});
