// Every snippet kept in docs/concepts/{async,routing,forms,ssr}.md runs here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  action,
  clearCache,
  createForm,
  createMemoryHistory,
  createRouter,
  email,
  errorBoundary,
  html,
  hydrate,
  invalidate,
  registerPending,
  renderToStream,
  renderToString,
  required,
  resource,
  signal,
  suspense,
  useServer,
} from "../../src/mod.ts";
import { cleanup, fire, flush, mount, waitFor } from "../../src/testing/mod.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  db.set(1, { id: 1, name: "Ada" });
  db.set(2, { id: 2, name: "Grace" });
});
afterEach(() => {
  cleanup();
  clearCache();
  document.body.innerHTML = "";
});

// ------------------------------------------------------------------ async

type User = { id: number; name: string };
const db = new Map<number, User>([
  [1, { id: 1, name: "Ada" }],
  [2, { id: 2, name: "Grace" }],
]);
const calls: string[] = [];
const fetchUser = async (id: number, signal?: AbortSignal): Promise<User> => {
  calls.push(`get ${id}`);
  await sleep(5);
  signal?.throwIfAborted();
  const u = db.get(id);
  if (!u) throw new Error("not found");
  return { ...u };
};
const saveUser = async (u: User): Promise<void> => {
  await sleep(5);
  db.set(u.id, u);
};

describe("async.md", () => {
  it("resource: keyed, shared, stale-while-revalidate", async () => {
    calls.length = 0;
    const id = signal(1);
    const user = resource(
      () => id(),
      (id, { signal }) => fetchUser(id, signal),
      { key: (id) => ["user", id], staleTime: 30_000 },
    );
    const t = mount(
      () =>
        html`<p>${() => (user.loading() ? "loading..." : user()?.name)}</p>`,
    );
    expect(t.text()).toBe("loading...");
    await waitFor(() => expect(t.text()).toBe("Ada"));
    id.set(2);
    await waitFor(() => expect(t.text()).toBe("Grace"));
    id.set(1); // cached and fresh: no request
    await flush();
    expect(t.text()).toBe("Ada");
    expect(calls).toEqual(["get 1", "get 2"]);
  });

  it("action: optimistic update, rollback, invalidation", async () => {
    calls.length = 0;
    db.set(1, { id: 1, name: "Ada" });
    const user = resource(
      () => 1,
      (id) => fetchUser(id),
      { key: (id) => ["user", id] },
    );
    const t = mount(() => html`<p>${() => user()?.name}</p>`);
    await waitFor(() => expect(t.text()).toBe("Ada"));

    const rename = action(
      async (name: string, { optimistic }) => {
        optimistic(() => user.mutate((u) => ({ ...u!, name })));
        await saveUser({ id: 1, name }); // if this throws, the mutate is rolled back
      },
      { invalidates: [["user"]] }, // refetch everything keyed ["user", ...] afterwards
    );
    const p = rename.run("Ada L.");
    await flush();
    expect(t.text()).toBe("Ada L."); // before the server answered
    expect(rename.pending()).toBe(true);
    await p;
    expect(rename.pending()).toBe(false);
    expect(calls.length).toBe(2); // the invalidation refetched
    expect(user()?.name).toBe("Ada L.");
  });

  it("action: a failure rolls back and lands in error()", async () => {
    const user = resource(
      () => 2,
      (id) => fetchUser(id),
      { key: (id) => ["user", id] },
    );
    const t = mount(() => html`<p>${() => user()?.name}</p>`);
    await waitFor(() => expect(t.text()).toBe("Grace"));
    const save = action(async (name: string, { optimistic }) => {
      optimistic(() => user.mutate((u) => ({ ...u!, name })));
      throw new Error("offline");
    });
    await save.run("X");
    expect(save.error()).toEqual(new Error("offline"));
    expect(user()?.name).toBe("Grace");
  });

  it("suspense shows the fallback while a resource loads", async () => {
    const t = mount(() =>
      suspense(
        () => html`<p>loading...</p>`,
        () => {
          const user = resource(
            () => 1,
            (id) => fetchUser(id),
          ); // created inside the boundary: it registers with it
          return html`<h1>${() => user()?.name}</h1>`;
        },
      ),
    );
    expect(t.text()).toBe("loading...");
    await waitFor(() => expect(t.text()).toBe("Ada"));
  });

  it("registerPending for your own async work", async () => {
    function Avatar() {
      const el = document.createElement("img");
      registerPending(sleep(5));
      return el;
    }
    const t = mount(() =>
      suspense(
        () => html`<p>wait</p>`,
        () => html`<div>${Avatar()}</div>`,
      ),
    );
    expect(t.text()).toBe("wait");
    await waitFor(() => expect(t.query("img")).not.toBeNull());
  });

  it("errorBoundary around suspense, with throwOnError and reset", async () => {
    let fail = true;
    const t = mount(() =>
      errorBoundary(
        (e, reset) =>
          html`<p>${String(e)} <button @click=${reset}>retry</button></p>`,
        () =>
          suspense(
            () => html`<p>loading</p>`,
            () => {
              const data = resource(
                () => 1,
                async () => {
                  await sleep(2);
                  if (fail) throw new Error("boom");
                  return "ok";
                },
                { throwOnError: true },
              );
              return html`<h1>${() => data()}</h1>`;
            },
          ),
      ),
    );
    await waitFor(() => expect(t.text()).toContain("boom"));
    fail = false;
    clearCache();
    fire(t.query("button"), "click");
    await waitFor(() => expect(t.text()).toBe("ok"));
  });

  it("invalidate() refetches what is in use", async () => {
    calls.length = 0;
    const user = resource(
      () => 1,
      (id) => fetchUser(id),
      { key: (id) => ["user", id], staleTime: 60_000 },
    );
    const t = mount(() => html`<p>${() => user()?.name}</p>`);
    await waitFor(() => expect(t.text()).toBe("Ada"));
    await invalidate(["user"]);
    expect(calls.filter((c) => c === "get 1").length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------- routing

describe("routing.md", () => {
  it("routes, loader, guard, nested layout, links, query", async () => {
    const loggedIn = signal(true);
    const Home = () => html`<h1>Home</h1>`;
    const Login = () => html`<h1>Login</h1>`;
    const NotFound = () => html`<h1>Not found</h1>`;
    const router = createRouter({
      history: createMemoryHistory(["/"]), // omit in a browser: the History API is used
      routes: [
        { path: "/", title: "Home", component: Home },
        { path: "/login", component: Login },
        {
          path: "/users/:id",
          title: ({ params }) => `User ${params.id}`,
          guard: () => (loggedIn() ? true : "/login"),
          load: ({ params, signal }) => fetchUser(Number(params.id), signal),
          component: (p) =>
            html`<section>
              <h1>${() => p.data()?.name}</h1>
              ${router.a("/users/1/posts", "Posts")} ${router.outlet()}
            </section>`,
          children: [
            { path: "", component: () => html`<p>overview</p>` },
            { path: "posts", component: () => html`<p>posts</p>` },
          ],
        },
        { path: "*", component: NotFound },
      ],
    });
    const t = mount(
      () =>
        html`<nav>
            ${router.a("/", "Home")} ${router.a("/users/2", "Grace")}
          </nav>
          <main>${router.outlet()}</main>`,
    );
    expect(t.query("main").textContent).toBe("Home");
    expect(t.query("a[href='/']").getAttribute("aria-current")).toBe("page");

    fire(t.query("a[href='/users/2']"), "click");
    await waitFor(() => expect(t.query("main h1")?.textContent).toBe("Grace"));
    expect(router.path()).toBe("/users/2");
    expect(t.query("main").textContent).toContain("overview");

    await router.navigate("/users/1/posts");
    expect(t.query("main").textContent).toContain("posts");
    expect(router.params().id).toBe("1");

    await router.navigate("/users/1?tab=a");
    expect(router.query().tab).toBe("a");
    await router.setQuery({ tab: "b" });
    expect(router.query().tab).toBe("b");

    loggedIn.set(false);
    await router.navigate("/users/1");
    expect(router.path()).toBe("/login");
    await router.navigate("/nothing/here");
    expect(t.query("main").textContent).toBe("Not found");
    router.back();
    await flush();
    expect(router.path()).toBe("/login");
  });

  it("resource keyed by a route param", async () => {
    const router = createRouter({
      history: createMemoryHistory(["/users/1"]),
      routes: [
        {
          path: "/users/:id",
          component: () => {
            const user = resource(
              () => Number(router.params().id),
              (id) => fetchUser(id),
              { key: (id) => ["user", id] },
            );
            return html`<h1>${() => user()?.name}</h1>`;
          },
        },
      ],
    });
    const t = mount(() => router.outlet());
    await waitFor(() => expect(t.text()).toBe("Ada"));
    await router.navigate("/users/2");
    await waitFor(() => expect(t.text()).toBe("Grace"));
  });
});

// ------------------------------------------------------------------ forms

describe("forms.md", () => {
  it("createForm with sync, async and server errors", async () => {
    const taken = new Set(["ada@example.com"]);
    const submitted: unknown[] = [];
    function SignUp() {
      const f = createForm({
        initial: { email: "", password: "" },
        onSubmit: async (values) => {
          submitted.push(values);
        },
      });
      const mail = f.field("email", {
        validate: [
          required(),
          email(),
          async (v, { signal }) => {
            await sleep(3);
            signal.throwIfAborted();
            return taken.has(v) ? "already registered" : undefined;
          },
        ],
      });
      const pw = f.field("password", { validate: [required()] });
      return html`<form @submit=${f.submit}>
        <input type="email" ${mail.bind} />
        <small id=${mail.errorId}
          >${() => (mail.touched() ? mail.error() : "")}</small
        >
        <input type="password" ${pw.bind} />
        <button ?disabled=${f.submitting}>Sign up</button>
      </form>`;
    }
    const t = mount(SignUp);
    const [mail, pw] = t.queryAll<HTMLInputElement>("input");
    fire(mail!, "input", { value: "ada@example.com" });
    fire(mail!, "change");
    fire(mail!, "blur");
    await waitFor(() =>
      expect(t.query("small").textContent).toBe("already registered"),
    );
    expect(mail!.getAttribute("aria-invalid")).toBe("true");
    fire(mail!, "input", { value: "new@example.com" });
    fire(pw!, "input", { value: "secret" });
    fire(t.query("form"), "submit");
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toEqual({
      email: "new@example.com",
      password: "secret",
    });
  });
});

// -------------------------------------------------------------------- ssr

describe("ssr.md", () => {
  it("renders for a url, transfers resources, hydrates in place", async () => {
    const fetches = vi.fn((id: number) => fetchUser(id));
    function App() {
      const router = createRouter({
        routes: [
          { path: "/", component: () => html`<h1>Home</h1>` },
          {
            path: "/users/:id",
            component: () => {
              const user = resource(() => Number(router.params().id), fetches, {
                key: (id) => ["user", id],
                staleTime: 60_000,
              });
              return html`<h1>${() => user()?.name}</h1>`;
            },
          },
        ],
        // on the client: the router picks the browser history by itself;
        // on the server: it reads useServer()?.url and uses a memory history
        history: useServer() ? undefined : createMemoryHistory(["/users/2"]),
      });
      return html`<main>${router.outlet()}</main>`;
    }

    const body = await renderToString(App, { url: "/users/2" });
    expect(body).toContain("Grace");
    expect(body).toContain("__MAXIMUS_STATE__"); // the resource result rides along
    expect(fetches).toHaveBeenCalledTimes(1);

    const app = document.body.appendChild(document.createElement("div"));
    app.innerHTML = body;
    const h1 = app.querySelector("h1")!;
    const dispose = hydrate(App, app);
    await sleep(15);
    expect(fetches).toHaveBeenCalledTimes(1); // no refetch within staleTime
    expect(app.querySelector("h1")).toBe(h1); // same node
    dispose();
  });

  it("renderToStream: shell first, then each ready boundary", async () => {
    const App = () =>
      html`<main>
        <h1>Shop</h1>
        ${suspense(
          () => html`<p>loading...</p>`,
          () => {
            const user = resource(
              () => 1,
              (id) => fetchUser(id),
              { key: (id) => ["user", id] },
            );
            return html`<p>${() => user()?.name}</p>`;
          },
        )}
      </main>`;
    const chunks: string[] = [];
    const reader = renderToStream(App, { url: "/" }).getReader();
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
    }
    expect(chunks[0]).toContain("<h1");
    expect(chunks[0]).toContain("loading...");
    expect(chunks.join("")).toContain("<template id=");
    expect(chunks.join("")).toContain("Ada");
  });
});
