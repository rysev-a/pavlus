import { afterEach, describe, expect, it, vi } from "vitest";
import { debugStats, html, root, signal } from "../../src/mod.ts";
import { cleanup, fire, flush, mount } from "../../src/testing/mod.ts";
import { SearchBox, debounced } from "./debounced-search.ts";
import { InfiniteList } from "./infinite-scroll.ts";
import type { ObserveFn } from "./infinite-scroll.ts";
import { Modal } from "./modal-focus-trap.ts";
import { Toasts, createToaster } from "./toast-queue.ts";
import { OptimisticList, createOptimisticList } from "./optimistic-list.ts";
import { ThemeButton, ThemeProvider, useTheme } from "./dark-mode.ts";
import { SortableList, move } from "./drag-reorder.ts";
import { createHistory } from "./undo-redo.ts";
import { useSocket } from "./websocket.ts";
import type { SocketLike } from "./websocket.ts";
import { createI18n } from "./i18n.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("debounced search", () => {
  it("settles after the quiet period, not on every keystroke", async () => {
    vi.useFakeTimers();
    const t = mount(() =>
      SearchBox({ items: ["apple", "apricot", "banana"], delay: 200 }),
    );
    const input = t.query<HTMLInputElement>("input");
    fire(input, "input", { value: "ap" });
    await vi.advanceTimersByTimeAsync(100);
    fire(input, "input", { value: "apr" });
    await vi.advanceTimersByTimeAsync(150); // 250 ms since the first key, 150 since the last
    expect(t.queryAll("li").map((l) => l.textContent)).toEqual(["nothing"]); // still the empty state: nothing settled yet
    await vi.advanceTimersByTimeAsync(100);
    expect(t.queryAll("li").map((l) => l.textContent?.trim())).toEqual([
      "apricot",
    ]);
  });

  it("clears its timer when disposed", async () => {
    vi.useFakeTimers();
    const s = signal("a");
    let out!: () => string;
    const dispose = root((d) => {
      out = debounced(s, 50);
      return d;
    });
    s.set("b");
    await flush();
    dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(out()).toBe("a");
  });
});

describe("infinite scroll", () => {
  it("loads the next page when the sentinel becomes visible, stops at the end", async () => {
    let show!: () => void;
    let stopped = false;
    const observe: ObserveFn = (_el, onVisible) => {
      show = onVisible;
      return () => (stopped = true);
    };
    const pages = [["a", "b"], ["c"], []];
    const loadPage = vi.fn(async (n: number) => pages[n] ?? []);
    const t = mount(() => InfiniteList({ loadPage, observe }));
    show();
    await flush();
    expect(t.queryAll("li").length).toBe(2);
    show();
    show(); // second call while loading is ignored
    await flush();
    expect(t.queryAll("li").length).toBe(3);
    show();
    await flush();
    expect(t.query(".sentinel").textContent?.trim()).toBe("end");
    show();
    await flush();
    expect(loadPage).toHaveBeenCalledTimes(3);
    t.unmount();
    expect(stopped).toBe(true);
  });
});

describe("modal with focus trap", () => {
  it("moves focus in, traps Tab, closes on Escape, restores focus", async () => {
    const open = signal(false);
    const t = mount(
      () => html`
        <div>
          <button id="opener" @click=${() => open.set(true)}>open</button>
          ${Modal({
            open,
            onClose: () => open.set(false),
            children: () => html`
              <button id="one">one</button><button id="two">two</button>
            `,
          })}
        </div>
      `,
    );
    const opener = t.query("#opener");
    opener.focus();
    opener.click();
    await flush();
    const one = document.getElementById("one")!;
    const two = document.getElementById("two")!;
    expect(document.activeElement).toBe(one);
    two.focus();
    const tab = fire(two, "keydown", { key: "Tab" });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(one); // wrapped around
    const back = fire(one, "keydown", { key: "Tab", shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(two);
    fire(two, "keydown", { key: "Escape" });
    await flush();
    expect(document.querySelector(".dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("toast queue", () => {
  it("shows at most max toasts, promotes queued ones, auto-dismisses", async () => {
    vi.useFakeTimers();
    const toaster = createToaster({ max: 2, ttl: 1000 });
    const t = mount(() => Toasts({ toaster }));
    toaster.push("one");
    toaster.push("two");
    toaster.push("three", "error");
    await flush();
    expect(
      t
        .queryAll(".toast")
        .map((e) => e.textContent?.trim().replace(/\s+x$/, "")),
    ).toEqual(["one", "two"]);
    t.query("button").click(); // dismiss "one" by hand
    await flush();
    expect(t.queryAll(".toast").length).toBe(2);
    expect(t.query(".toast.error").textContent).toContain("three");
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(t.queryAll(".toast").length).toBe(0);
    t.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("optimistic list", () => {
  it("shows the item at once, confirms on success, rolls back on failure", async () => {
    let resolve!: (id: number) => void;
    let reject!: (e: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<number>((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    const list = createOptimisticList(save);
    const t = mount(() => OptimisticList({ list }));
    const add = async (text: string) => {
      const input = t.query<HTMLInputElement>("input");
      input.value = text;
      fire(t.query("form"), "submit");
      await flush();
    };
    await add("milk");
    expect(t.query("li").className).toBe("pending");
    resolve(42);
    await flush();
    expect(t.query("li").className).toBe("");
    expect(list.items()[0]!.id).toBe(42);

    await add("eggs");
    expect(t.queryAll("li").length).toBe(2);
    reject(new Error("offline"));
    await flush();
    expect(t.queryAll("li").length).toBe(1);
    expect(t.query(".error").textContent).toBe("offline");
  });
});

describe("dark mode with context", () => {
  it("provides a theme signal to descendants and persists it", async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    const rootEl = document.createElement("div");
    const t = mount(() =>
      ThemeProvider({
        storage,
        prefersDark: () => true,
        root: rootEl,
        children: () => html`<section>${ThemeButton()}</section>`,
      }),
    );
    await flush();
    expect(t.text()).toBe("theme: dark");
    expect(rootEl.dataset.theme).toBe("dark");
    t.query("button").click();
    await flush();
    expect(t.text()).toBe("theme: light");
    expect(rootEl.dataset.theme).toBe("light");
    expect(mem.get("theme")).toBe("light");
  });

  it("falls back to the default context outside a provider", () => {
    root((d) => {
      expect(useTheme().theme()).toBe("light");
      d();
    });
  });
});

describe("drag reorder", () => {
  it("move() is pure", () => {
    const a = [1, 2, 3, 4];
    expect(move(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(move(a, 3, 0)).toEqual([4, 1, 2, 3]);
    expect(a).toEqual([1, 2, 3, 4]);
  });

  it("reorders rows and keeps their DOM nodes", async () => {
    const items = signal([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ]);
    const t = mount(() => SortableList({ items }));
    const [a, , c] = t.queryAll("li");
    fire(a!, "dragstart");
    fire(c!, "dragover");
    fire(c!, "drop");
    await flush();
    expect(t.queryAll("li").map((l) => l.textContent?.trim())).toEqual([
      "B",
      "C",
      "A",
    ]);
    expect(t.queryAll("li")[2]).toBe(a); // same node, moved
    expect(a!.className).toBe("");
  });
});

describe("undo / redo with a store", () => {
  it("undoes and redoes whole steps, updating readers", async () => {
    const h = createHistory({ todos: [{ id: 1, text: "a", done: false }] });
    const t = mount(
      () =>
        html`<p>
          ${() => h.state.todos.map((x) => x.text + (x.done ? "!" : "")).join(",")}
        </p>`,
    );
    h.change((s) => s.todos.push({ id: 2, text: "b", done: false }));
    h.change((s) => (s.todos[0]!.done = true));
    await flush();
    expect(t.text()).toBe("a!,b");
    h.undo();
    await flush();
    expect(t.text()).toBe("a,b");
    h.undo();
    await flush();
    expect(t.text()).toBe("a");
    expect(h.canUndo()).toBe(false);
    h.redo();
    h.redo();
    await flush();
    expect(t.text()).toBe("a!,b");
    expect(h.canRedo()).toBe(false);
    h.undo();
    h.change((s) => s.todos.pop()); // a new change drops the redo branch
    expect(h.canRedo()).toBe(false);
  });
});

describe("websocket subscription", () => {
  it("receives messages and closes the socket on dispose", () => {
    const sock: SocketLike & { closed: boolean } = {
      onopen: null,
      onmessage: null,
      onclose: null,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    const stats = debugStats();
    let api!: ReturnType<typeof useSocket<{ n: number }>>;
    const dispose = root((d) => {
      api = useSocket<{ n: number }>("ws://x", { create: () => sock });
      return d;
    });
    expect(api.status()).toBe("connecting");
    sock.onopen!({});
    sock.onmessage!({ data: '{"n":1}' });
    sock.onmessage!({ data: '{"n":2}' });
    expect(api.status()).toBe("open");
    expect(api.last()).toEqual({ n: 2 });
    expect(api.log().length).toBe(2);
    dispose();
    expect(sock.closed).toBe(true);
    expect(sock.onmessage).toBeNull();
    expect(debugStats()).toEqual(stats);
  });
});

describe("i18n", () => {
  it("re-renders when the locale changes, interpolates and pluralises", async () => {
    const i18n = createI18n(
      {
        en: {
          hello: "Hello, {name}!",
          "items.one": "{n} item",
          "items.other": "{n} items",
        },
        de: {
          hello: "Hallo, {name}!",
          "items.one": "{n} Ding",
          "items.other": "{n} Dinge",
        },
      },
      "en",
    );
    const n = signal(1);
    const t = mount(
      () =>
        html`<p>
          ${() => i18n.t("hello", { name: "Ada" })}${" "}${() =>
            i18n.t("items", { n: n() })}
        </p>`,
    );
    expect(t.text()).toBe("Hello, Ada! 1 item");
    n.set(3);
    await flush();
    expect(t.text()).toBe("Hello, Ada! 3 items");
    i18n.locale.set("de");
    await flush();
    expect(t.text()).toBe("Hallo, Ada! 3 Dinge");
    expect(i18n.t("missing.key")).toBe("missing.key");
    i18n.locale.set("fr"); // no dictionary yet: falls back to the default locale
    await flush();
    expect(t.text()).toBe("Hello, Ada! 3 items");
    i18n.addDictionary("fr", { hello: "Bonjour, {name} !" });
    await flush();
    expect(t.text()).toBe("Bonjour, Ada ! 3 items");
  });
});
