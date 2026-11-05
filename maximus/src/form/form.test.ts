import { afterEach, describe, expect, it, vi } from "vitest";
import { each, html } from "../dom/mod.ts";
import { effect, flushSync, root, signal } from "../core/mod.ts";
import { cleanup, fire, flush, mount } from "../testing/mod.ts";
import {
  createForm,
  email,
  equalsField,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  required,
} from "./mod.ts";
import type { StandardSchemaV1 } from "./mod.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** A tiny Standard Schema implementation for the tests. */
function schemaOf<T>(
  check: (
    v: T,
  ) => Array<{
    message: string;
    path?: Array<string | number | { key: string | number }>;
  }>,
  transform?: (v: T) => T,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (v) => {
        const issues = check(v as T);
        return issues.length > 0
          ? { issues }
          : { value: transform ? transform(v as T) : (v as T) };
      },
    },
  };
}

describe("fields", () => {
  it("has per-field value, dirty and touched signals", () => {
    const f = createForm({ initial: { email: "", age: 3 } });
    const email = f.field("email");
    const reads: string[] = [];
    const stop = root((dispose) => {
      effect(() => void reads.push(email.value()));
      return dispose;
    });
    expect(email.value()).toBe("");
    expect(email.dirty()).toBe(false);
    email.set("a@b.co");
    flushSync();
    expect(reads).toEqual(["", "a@b.co"]);
    expect(email.dirty()).toBe(true);
    expect(f.dirty()).toBe(true);
    expect(f.field("age").dirty()).toBe(false);
    expect(email.touched()).toBe(false);
    email.touched.set(true);
    expect(email.touched()).toBe(true);
    email.set("");
    expect(email.dirty()).toBe(false);
    expect(f.values()).toEqual({ email: "", age: 3 });
    stop();
  });

  it("only notifies readers of the changed field", () => {
    const f = createForm({ initial: { a: "", b: "" } });
    let runsA = 0;
    let runsB = 0;
    const fa = f.field("a");
    const fb = f.field("b");
    const stop = root((dispose) => {
      effect(() => void (fa.value(), runsA++));
      effect(() => void (fb.value(), runsB++));
      return dispose;
    });
    fa.set("x");
    flushSync();
    expect([runsA, runsB]).toEqual([2, 1]);
    stop();
  });

  it("supports nested objects", () => {
    const f = createForm({
      initial: { address: { city: "Oslo", geo: { lat: 1 } } },
    });
    const city = f.field("address.city");
    const lat = f.field("address.geo.lat");
    expect(city.value()).toBe("Oslo");
    city.set("Bergen");
    lat.set(5);
    expect(f.values()).toEqual({
      address: { city: "Bergen", geo: { lat: 5 } },
    });
    expect(f.field("address.city")).toBe(city);
    expect(city.dirty()).toBe(true);
  });

  it("does not mutate the initial value", () => {
    const initial = { address: { city: "a" }, tags: ["x"] };
    const f = createForm({ initial });
    f.field("address.city").set("b");
    f.array("tags").add("y");
    expect(initial).toEqual({ address: { city: "a" }, tags: ["x"] });
  });

  it("reset returns to the initial state", async () => {
    const f = createForm({
      initial: { n: "a" },
      validators: { n: [required()] },
    });
    const n = f.field("n");
    n.set("");
    await n.validate();
    n.touched.set(true);
    expect(n.error()).toBe("This field is required");
    f.reset();
    expect(n.value()).toBe("a");
    expect(n.error()).toBeUndefined();
    expect(n.touched()).toBe(false);
    expect(f.dirty()).toBe(false);
    f.reset({ n: "z" });
    expect(n.value()).toBe("z");
    n.set("q");
    f.reset();
    expect(n.value()).toBe("z");
  });
});

describe("arrays", () => {
  it("adds, removes and moves items with stable keys", () => {
    const f = createForm({ initial: { tags: ["a", "b", "c"] } });
    const tags = f.array("tags");
    const keys = (): number[] => tags.items().map((i) => i.key);
    const [ka, kb, kc] = keys() as [number, number, number];
    expect(tags.length()).toBe(3);
    tags.add("d");
    expect(f.values().tags).toEqual(["a", "b", "c", "d"]);
    tags.remove(1);
    expect(f.values().tags).toEqual(["a", "c", "d"]);
    expect(keys().slice(0, 2)).toEqual([ka, kc]);
    tags.move(0, 2);
    expect(f.values().tags).toEqual(["c", "d", "a"]);
    expect(keys()[0]).toBe(kc);
    expect(keys()[2]).toBe(ka);
    tags.swap(0, 2);
    expect(f.values().tags).toEqual(["a", "d", "c"]);
    tags.add("ins", 1);
    expect(f.values().tags).toEqual(["a", "ins", "d", "c"]);
    expect(tags.items().map((i) => i.index)).toEqual([0, 1, 2, 3]);
    expect(kb).toBeDefined();
    tags.clear();
    expect(f.values().tags).toEqual([]);
  });

  it("fields of items follow their item (touched and errors move with it)", async () => {
    const f = createForm({
      initial: { tags: ["", "ok"] },
      validators: { "tags.*": [required()] },
    });
    const t0 = f.field("tags.0");
    await t0.validate();
    t0.touched.set(true);
    expect(t0.error()).toBeDefined();
    f.array("tags").move(0, 1);
    expect(f.field("tags.1").error()).toBeDefined();
    expect(f.field("tags.1").touched()).toBe(true);
    expect(f.field("tags.0").error()).toBeUndefined();
    expect(f.field("tags.0").touched()).toBe(false);
    f.array("tags").remove(1);
    expect(f.errors()).toEqual({});
  });

  it("renders rows keyed by item with reactive paths and bind", async () => {
    const f = createForm({ initial: { tags: ["a", "b"] } });
    const tags = f.array("tags");
    const t = mount(
      () =>
        html`<div>
          ${each(
            tags.items,
            (i) => i.key,
            (item) => {
              const field = f.field(() => `tags.${item().index}`);
              return html`<input class="row" ${field.bind} />`;
            },
          )}
        </div>`,
    );
    const inputs = t.queryAll<HTMLInputElement>("input.row");
    expect(inputs.map((i) => i.value)).toEqual(["a", "b"]);
    tags.move(0, 1);
    await flush();
    const after = t.queryAll<HTMLInputElement>("input.row");
    expect(after.map((i) => i.value)).toEqual(["b", "a"]);
    expect(after[0]).toBe(inputs[1]);
    fire(after[0]!, "input", { value: "B!" });
    expect(f.values().tags).toEqual(["B!", "a"]);
    tags.add("c");
    await flush();
    expect(t.queryAll("input.row")).toHaveLength(3);
  });
});

describe("validators", () => {
  const run = async (
    v: ReturnType<typeof required>,
    value: unknown,
  ): Promise<string | undefined> => {
    const f = createForm({ initial: { x: value }, validators: { x: [v] } });
    await f.field("x").validate();
    return f.field("x").error();
  };

  it("built-ins", async () => {
    expect(await run(required(), "")).toBe("This field is required");
    expect(await run(required(), "  ")).toBe("This field is required");
    expect(await run(required(), [])).toBe("This field is required");
    expect(await run(required(), false)).toBe("This field is required");
    expect(await run(required(), 0)).toBeUndefined();
    expect(await run(required("need"), undefined)).toBe("need");
    expect(await run(minLength(3), "ab")).toBe("Must be at least 3 characters");
    expect(await run(minLength(3), "abc")).toBeUndefined();
    expect(await run(minLength(3), "")).toBeUndefined();
    expect(await run(maxLength(2), "abc")).toBe("Must be at most 2 characters");
    expect(await run(pattern(/^\d+$/), "a1")).toBe("Invalid format");
    expect(await run(pattern(/^\d+$/g), "11")).toBeUndefined();
    expect(await run(email(), "nope")).toBe("Enter a valid email address");
    expect(await run(email(), "a@b.io")).toBeUndefined();
    expect(await run(min(5), 4)).toBe("Must be at least 5");
    expect(await run(max(5), 6)).toBe("Must be at most 5");
    expect(await run(max(5), 5)).toBeUndefined();
  });

  it("equalsField compares with another field", async () => {
    const f = createForm({ initial: { pw: "a", again: "b" } });
    const again = f.field("again", { validate: equalsField("pw", "No match") });
    await again.validate();
    expect(again.error()).toBe("No match");
    again.set("a");
    await again.validate();
    expect(again.error()).toBeUndefined();
  });

  it("plain functions, several messages and thrown errors", async () => {
    const f = createForm({ initial: { x: "" } });
    const x = f.field("x", {
      validate: [
        () => ["one", "two"],
        () => undefined,
        () => {
          throw new Error("boom");
        },
      ],
    });
    await x.validate();
    expect(x.errors()).toEqual(["one", "two", "boom"]);
    expect(x.error()).toBe("one");
  });

  it("exposes the form values to validators", async () => {
    const f = createForm({ initial: { a: 1, b: 2 } });
    const b = f.field("b", {
      validate: (v, ctx) =>
        v === ctx.values.a ? undefined : `b must equal a (${ctx.path})`,
    });
    await b.validate();
    expect(b.error()).toBe("b must equal a (b)");
  });
});

describe("validation timing", () => {
  it("validateOn change (default): validates on change, not on input; then re-validates while typing", async () => {
    const f = createForm({
      initial: { n: "" },
      validators: { n: [required()] },
    });
    const t = mount(() => html`<input ${f.field("n").bind} />`);
    const input = t.query<HTMLInputElement>("input");
    fire(input, "input", { value: "a" });
    fire(input, "input", { value: "" });
    expect(f.field("n").error()).toBeUndefined();
    fire(input, "change");
    expect(f.field("n").error()).toBe("This field is required");
    fire(input, "input", { value: "x" }); // validated once: re-validates eagerly
    expect(f.field("n").error()).toBeUndefined();
  });

  it("validateOn input", () => {
    const f = createForm({
      initial: { n: "x" },
      validateOn: "input",
      validators: { n: [required()] },
    });
    const t = mount(() => html`<input ${f.field("n").bind} />`);
    fire(t.query("input"), "input", { value: "" });
    expect(f.field("n").error()).toBeDefined();
  });

  it("validateOn blur marks touched and validates", () => {
    const f = createForm({
      initial: { n: "" },
      validateOn: "blur",
      validators: { n: [required()] },
    });
    const t = mount(() => html`<input ${f.field("n").bind} />`);
    const input = t.query("input");
    fire(input, "change");
    expect(f.field("n").error()).toBeUndefined();
    fire(input, "blur");
    expect(f.field("n").touched()).toBe(true);
    expect(f.field("n").error()).toBeDefined();
  });

  it("validateOn submit only validates on submit", async () => {
    const f = createForm({
      initial: { n: "" },
      validateOn: "submit",
      validators: { n: [required()] },
    });
    const t = mount(() => html`<input ${f.field("n").bind} />`);
    const input = t.query("input");
    fire(input, "input", { value: "a" });
    fire(input, "change");
    fire(input, "blur");
    fire(input, "input", { value: "" });
    expect(f.field("n").error()).toBeUndefined();
    await f.submit();
    expect(f.field("n").error()).toBeDefined();
  });
});

describe("async validators", () => {
  it("debounces typing, aborts and drops stale results", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const signals: AbortSignal[] = [];
    const f = createForm({ initial: { name: "" } });
    const name = f.field("name", {
      debounce: 100,
      validate: async (v, ctx) => {
        seen.push(String(v));
        signals.push(ctx.signal);
        await new Promise((r) => setTimeout(r, v === "slow" ? 300 : 10));
        return v === "slow" ? "taken" : undefined;
      },
    });
    const t = mount(() => html`<input ${name.bind} />`);
    const input = t.query<HTMLInputElement>("input");
    fire(input, "change"); // validated once -> input re-validates
    await vi.advanceTimersByTimeAsync(0);
    seen.length = 0;
    fire(input, "input", { value: "s" });
    fire(input, "input", { value: "sl" });
    fire(input, "input", { value: "slow" });
    expect(name.validating()).toBe(true);
    await vi.advanceTimersByTimeAsync(99);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(seen).toEqual(["slow"]);
    expect(name.validating()).toBe(true);
    // a newer value supersedes the slow run
    fire(input, "input", { value: "fast" });
    expect(signals[0]!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(110);
    expect(seen).toEqual(["slow", "fast"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(name.error()).toBeUndefined(); // the stale "taken" never landed
    expect(name.validating()).toBe(false);
  });

  it("explicit validate() skips the debounce", async () => {
    const f = createForm({ initial: { n: "x" } });
    const n = f.field("n", { debounce: 10_000, validate: async () => "bad" });
    expect(await n.validate()).toBe(false);
    expect(n.error()).toBe("bad");
  });

  it("submit waits for async validators", async () => {
    const onSubmit = vi.fn();
    const f = createForm({ initial: { n: "x" }, onSubmit });
    f.field("n", { validate: async () => (await sleep(5), "nope") });
    await f.submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(f.field("n").error()).toBe("nope");
    expect(f.valid()).toBe(false);
  });
});

describe("schemas", () => {
  type V = {
    name: string;
    address: { city: string };
    items: Array<{ qty: number }>;
  };
  const schema = schemaOf<V>((v) => {
    const issues: Array<{
      message: string;
      path?: Array<string | number | { key: string | number }>;
    }> = [];
    if (!v.name) issues.push({ message: "name required", path: ["name"] });
    if (!v.address.city)
      issues.push({
        message: "city required",
        path: ["address", { key: "city" }],
      });
    v.items.forEach(
      (it, i) =>
        it.qty < 1 &&
        issues.push({ message: "qty >= 1", path: ["items", i, "qty"] }),
    );
    if (v.name === "root") issues.push({ message: "form level" });
    return issues;
  });
  const initial: V = { name: "", address: { city: "" }, items: [{ qty: 0 }] };

  it("maps Standard Schema issues to fields on validate()", async () => {
    const f = createForm({ initial, schema });
    expect(await f.validate()).toBe(false);
    expect(f.field("name").error()).toBe("name required");
    expect(f.field("address.city").error()).toBe("city required");
    expect(f.field("items.0.qty").error()).toBe("qty >= 1");
    expect(f.valid()).toBe(false);
    f.field("name").set("root");
    await f.validate();
    expect(f.formErrors()).toEqual(["form level"]);
  });

  it("a field validation only updates that field's schema issues", async () => {
    const f = createForm({ initial, schema });
    await f.validate();
    f.field("name").set("bob");
    await f.field("name").validate();
    expect(f.field("name").error()).toBeUndefined();
    expect(f.field("address.city").error()).toBe("city required");
  });

  it("submits the schema output (transforms apply)", async () => {
    const onSubmit = vi.fn();
    const s = schemaOf<{ name: string }>(
      (v) => (v.name ? [] : [{ message: "x", path: ["name"] }]),
      (v) => ({ name: v.name.trim().toUpperCase() }),
    );
    const f = createForm({ initial: { name: "  ann " }, schema: s, onSubmit });
    await f.submit();
    expect(onSubmit).toHaveBeenCalledWith({ name: "ANN" }, f);
  });

  it("supports async Standard Schemas", async () => {
    const s: StandardSchemaV1<unknown, { n: string }> = {
      "~standard": {
        version: 1,
        vendor: "t",
        validate: async (v) => (
          await sleep(2),
          (v as { n: string }).n
            ? { value: v as { n: string } }
            : { issues: [{ message: "empty", path: ["n"] }] }
        ),
      },
    };
    const f = createForm({ initial: { n: "" }, schema: s });
    expect(await f.validate()).toBe(false);
    expect(f.field("n").error()).toBe("empty");
  });

  it("supports a plain function schema", async () => {
    const f = createForm({
      initial: { a: "", b: "" },
      schema: (v) =>
        v.a === v.b
          ? undefined
          : { b: "must equal a", "": ["form: different"] },
    });
    f.field("a").set("x");
    expect(await f.validate()).toBe(false);
    expect(f.field("b").error()).toBe("must equal a");
    expect(f.formErrors()).toEqual(["form: different"]);
    f.field("b").set("x");
    expect(await f.validate()).toBe(true);
    expect(f.errors()).toEqual({});
  });

  it("drops stale schema results", async () => {
    let calls = 0;
    const s: StandardSchemaV1<unknown, { n: string }> = {
      "~standard": {
        version: 1,
        vendor: "t",
        validate: async (v) => {
          const mine = ++calls;
          await sleep(mine === 1 ? 30 : 1);
          return (v as { n: string }).n === "bad"
            ? { issues: [{ message: "bad!", path: ["n"] }] }
            : { value: v as { n: string } };
        },
      },
    };
    const f = createForm({ initial: { n: "bad" }, schema: s });
    const first = f.field("n").validate();
    f.field("n").set("good");
    const second = f.field("n").validate();
    await Promise.all([first, second]);
    expect(f.field("n").error()).toBeUndefined();
  });
});

describe("bind", () => {
  it("text, textarea, select and number inputs", async () => {
    const f = createForm({
      initial: { name: "Ann", bio: "hi", color: "b", age: 30 },
    });
    const t = mount(
      () =>
        html`<form>
          <input class="name" ${f.field("name").bind} />
          <textarea ${f.field("bio").bind}></textarea>
          <select ${f.field("color").bind}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          <input type="number" class="age" ${f.field("age").bind} />
        </form>`,
    );
    const name = t.query<HTMLInputElement>("input.name");
    const bio = t.query<HTMLTextAreaElement>("textarea");
    const color = t.query<HTMLSelectElement>("select");
    const age = t.query<HTMLInputElement>("input.age");
    expect(name.value).toBe("Ann");
    expect(name.getAttribute("name")).toBe("name");
    expect(bio.value).toBe("hi");
    expect(color.value).toBe("b");
    expect(age.value).toBe("30");

    fire(name, "input", { value: "Bob" });
    fire(bio, "input", { value: "yo" });
    fire(color, "change", { value: "a" });
    fire(age, "input", { value: "41" });
    expect(f.values()).toEqual({ name: "Bob", bio: "yo", color: "a", age: 41 });
    fire(age, "input", { value: "" });
    expect(f.values().age).toBeUndefined();

    f.field("name").set("Cy");
    f.field("color").set("b");
    f.field("age").set(7);
    await flush();
    expect(name.value).toBe("Cy");
    expect(color.value).toBe("b");
    expect(age.value).toBe("7");
  });

  it("checkbox (boolean and group) and radio", async () => {
    const f = createForm({
      initial: { agree: false, tags: ["x"] as string[], size: "m" },
    });
    const t = mount(
      () =>
        html`<div>
          <input type="checkbox" class="agree" ${f.field("agree").bind} />
          <input type="checkbox" class="tx" value="x" ${f.field("tags").bind} />
          <input type="checkbox" class="ty" value="y" ${f.field("tags").bind} />
          <input type="radio" class="s" value="s" ${f.field("size").bind} />
          <input type="radio" class="m" value="m" ${f.field("size").bind} />
        </div>`,
    );
    const agree = t.query<HTMLInputElement>(".agree");
    const tx = t.query<HTMLInputElement>(".tx");
    const ty = t.query<HTMLInputElement>(".ty");
    const s = t.query<HTMLInputElement>(".s");
    const m = t.query<HTMLInputElement>(".m");
    expect([
      agree.checked,
      tx.checked,
      ty.checked,
      s.checked,
      m.checked,
    ]).toEqual([false, true, false, false, true]);
    fire(agree, "change", { checked: true });
    fire(ty, "change", { checked: true });
    fire(tx, "change", { checked: false });
    fire(s, "change", { checked: true });
    expect(f.values()).toEqual({ agree: true, tags: ["y"], size: "s" });
    f.field("size").set("m");
    await flush();
    expect(m.checked).toBe(true);
  });

  it("file inputs and multiple selects", () => {
    const f = createForm({
      initial: { file: null as File | null, many: ["a"] as string[] },
    });
    const t = mount(
      () =>
        html`<div>
          <input type="file" ${f.field("file").bind} /><select
            multiple
            ${f.field("many").bind}
          >
            <option value="a">a</option>
            <option value="b">b</option>
          </select>
        </div>`,
    );
    const input = t.query<HTMLInputElement>("input");
    const file = new File(["x"], "x.txt");
    Object.defineProperty(input, "files", { value: [file] });
    fire(input, "change");
    expect(f.values().file).toBe(file);
    const sel = t.query<HTMLSelectElement>("select");
    expect(sel.options[0]!.selected).toBe(true);
    sel.options[1]!.selected = true;
    fire(sel, "change");
    expect(f.values().many).toEqual(["a", "b"]);
  });

  it("sets aria-invalid and aria-describedby while there is an error and keeps user tokens", async () => {
    const f = createForm({
      initial: { n: "" },
      validators: { n: [required()] },
    });
    const n = f.field("n");
    const t = mount(
      () =>
        html`<div>
          <input aria-describedby="hint" ${n.bind} />
          <p id=${n.errorId}>${n.error}</p>
        </div>`,
    );
    const input = t.query("input");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("hint");
    await n.validate();
    await flush();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const id = t.query("p").id;
    expect(id).toMatch(/^mxf\d+-n-error$/);
    expect(input.getAttribute("aria-describedby")).toBe(`hint ${id}`);
    expect(t.query("p").textContent).toBe("This field is required");
    n.set("ok");
    await n.validate();
    await flush();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("hint");
  });

  it("removes listeners on unmount", () => {
    const f = createForm({ initial: { n: "a" } });
    const t = mount(() => html`<input ${f.field("n").bind} />`);
    const input = t.query<HTMLInputElement>("input");
    t.unmount();
    fire(input, "input", { value: "changed" });
    expect(f.values().n).toBe("a");
  });
});

describe("submit", () => {
  it("prevents default, validates, focuses the first invalid field and does not call onSubmit", async () => {
    const onSubmit = vi.fn();
    const f = createForm({
      initial: { a: "", b: "" },
      onSubmit,
      validators: { a: [required()], b: [required()] },
    });
    const t = mount(
      () =>
        html`<form @submit=${f.submit}>
          <input class="a" ${f.field("a").bind} /><input
            class="b"
            ${f.field("b").bind}
          />
        </form>`,
    );
    const form = t.query("form");
    const ev = fire(form, "submit");
    expect(ev.defaultPrevented).toBe(true);
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(f.field("a").touched()).toBe(true);
    expect(f.field("b").touched()).toBe(true);
    expect(f.submitCount()).toBe(1);
    expect(document.activeElement).toBe(t.query(".a"));
    f.field("a").set("x");
    await f.submit();
    expect(document.activeElement).toBe(t.query(".b"));
  });

  it("runs onSubmit with the values, tracks submitting and ignores double submits", async () => {
    let release!: () => void;
    const onSubmit = vi.fn(
      (_values: unknown) => new Promise<void>((r) => (release = r)),
    );
    const f = createForm({ initial: { n: "x" }, onSubmit });
    const p = f.submit();
    await flush();
    expect(f.submitting()).toBe(true);
    void f.submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({ n: "x" });
    release();
    await p;
    expect(f.submitting()).toBe(false);
    expect(f.submitError()).toBeUndefined();
  });

  it("catches errors into submitError and recovers", async () => {
    let fail = true;
    const f = createForm({
      initial: { n: "x" },
      onSubmit: async () => {
        if (fail) throw new Error("server down");
      },
    });
    await f.submit();
    expect((f.submitError() as Error).message).toBe("server down");
    expect(f.submitting()).toBe(false);
    fail = false;
    await f.submit();
    expect(f.submitError()).toBeUndefined();
  });

  it("setErrors shows server errors and clears them when the value changes or on submit", async () => {
    const f = createForm({
      initial: { email: "a@b.co", address: { city: "" } },
      onSubmit: (_v, form) =>
        form.setErrors({
          email: "already taken",
          "address.city": ["unknown", "really"],
          "": "oops",
        }),
    });
    await f.submit();
    expect(f.field("email").error()).toBe("already taken");
    expect(f.field("address.city").errors()).toEqual(["unknown", "really"]);
    expect(f.formErrors()).toEqual(["oops"]);
    expect(f.valid()).toBe(false);
    f.field("email").set("c@d.co");
    expect(f.field("email").error()).toBeUndefined();
    expect(f.field("address.city").error()).toBe("unknown");
    f.clearErrors();
    expect(f.valid()).toBe(true);
  });

  it("works without an event and without onSubmit", async () => {
    const f = createForm({ initial: { n: 1 } });
    await f.submit();
    expect(f.submitCount()).toBe(1);
  });
});

describe("lifecycle", () => {
  it("cancels pending timers when the owner is disposed", async () => {
    vi.useFakeTimers();
    const validate = vi.fn();
    const f = root((dispose) => {
      const form = createForm({
        initial: { n: "" },
        validateOn: "input",
        debounce: 50,
      });
      form.field("n", { validate });
      return Object.assign(form, { stop: dispose });
    });
    f.field("n").set("a");
    f.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(validate).not.toHaveBeenCalled();
  });

  it("keeps signals independent of renders (computed values)", () => {
    const f = createForm({ initial: { a: 1 } });
    const double = signal(0);
    root((d) => {
      effect(() => double.set(f.field("a").value() * 2));
      return d;
    });
    f.field("a").set(4);
    flushSync();
    expect(double()).toBe(8);
  });
});
