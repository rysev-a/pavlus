---
summary: Build a complete small application in five runnable steps - a todo list with add, toggle, remove and a filter, saved by your own plugin, with a second page behind a route - and see every file, with tests.
---
## What we build

A todo list. You type a title and press Enter, tick a todo, remove it, and filter the list by All, Active and Done. The list is kept in `localStorage`, so it is still there after a reload. A second page, About, is behind its own address, and the top bar links the two.

The guide has five steps. Each step ends with an application that runs: you can start it with `npm run dev` and click through it. Each step adds one idea.

| Step | What is added | Idea |
| --- | --- | --- |
| 0 | The project | A Vite project with the pavlus plugin |
| 1 | A list from the state | Templates, state, a component |
| 2 | Add, tick, remove | Events are messages, handlers return effects |
| 3 | A filter | Derived state, computed in the handler |
| 4 | Saving | Your own plugin, replies as messages |
| 5 | A second page | Routing, `enter`, a shell |

The files at the end:

```text
todo/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    env.d.ts
    main.ts          creates the app and its plugins
    app.ts           the shell: the routing table
    app.pavlus       the shell's template: a top bar and an outlet
    todos.ts         the todo page: state, handlers
    todos.pavlus     the todo page's template
    about.pavlus     a page that is only a template
    not-found.pavlus another one
    storage.ts       the plugin that talks to localStorage
    todos.test.ts    tests of the handlers
    app.test.ts      a test of the whole app
```

## Step 0: the project

You need a folder, a `package.json`, a Vite configuration with the pavlus plugin, and an `index.html` with an element to mount into. In this repository `@pavlus/frontend` is the `framework` workspace package, which is why its version is `*`.

```json package.json
{
  "name": "todo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pavlus/frontend": "*"
  },
  "devDependencies": {
    "jsdom": "^30.1.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

The Vite configuration has two lines that matter. The `pavlus()` plugin compiles every `*.pavlus` file into a module with `render` and `diff`. The `environment: "jsdom"` setting is for the tests, which need a DOM.

```ts vite.config.ts
import { pavlus } from "@pavlus/frontend/vite";

export default {
  plugins: [pavlus()],
  test: { environment: "jsdom" },
};
```

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Todo</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The `src/env.d.ts` file tells TypeScript two things: what `import view from "./page.pavlus"` returns, and the types of Vite itself. Without it you get `Cannot find module './todos.pavlus'`.

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@pavlus/frontend/env" />
```

```json tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src","ov"]
}
```

## Step 1: a list from the state

The first version shows two todos from the state. It has a template, a component that owns the template, and a `main.ts` that starts the application.

The template is a heading and a list. `for todo in items key todo.id` repeats the line below it for each item; `key` says which field identifies an item, so that adding or removing one touches only that item. `class:done=todo.done` puts the class `done` when the field is true.

::demo list

The demo is the real template with the real state. In the first step you see an insert: a new item inserted before the end marker of the list, and nothing else in the page is touched. In the second step the class of one item changed, and it is one attribute patch.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}
```

A component is a class that extends `Component`. It names its template with `view`. It has no handlers yet.

```ts src/todos.ts
import { Component } from "@pavlus/frontend";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export interface TodosState {
  items: Todo[];
}

export const initialTodos: TodosState = {
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
};

export class Todos extends Component<TodosState> {
  view = view;
}

export const todos = new Todos();
```

`main.ts` creates the application. The **store** plugin holds the state and starts from `initialTodos`; the **dom** plugin renders. `mount: "#app"` renders the component's view into the element.

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [createStorePlugin(initialTodos), new DomPlugin()],
  mount: "#app",
});
```

Run `npm run dev`. You see the heading and two todos; the second one has the class `done`, so a stylesheet could strike it out.

## Step 2: add, tick, remove

Now the application reacts. Add a form, a checkbox and a button to the template. Look at the events.

::demo form

`@input=typing` is not a function call. It is the message `typing`, and the DOM plugin adds the text of the input as `msg.event.value`. `@change=toggle(todo.id)` is the message `toggle` with the payload `todo.id`. `@submit.prevent=add` stops the browser from reloading the page and sends `add`. The first step of the demo shows the draft in the input: the template reads `value=draft`, and the diff is one attribute patch.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  form.todos__add(@submit.prevent=add)
    input(type="text" placeholder="What needs to be done?" value=draft @input=typing)
    button(type="submit") Add
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done)
        input(type="checkbox" checked={todo.done} @change=toggle(todo.id))
        span {todo.title}
        button(type="button" @click=remove(todo.id)) Remove
```

Every message is a method of the component with the same name. A method takes the message and the state and returns **effects**. It does not change anything: `store.set("draft", "")` is an object that asks the store plugin to do it.

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export interface TodosState {
  items: Todo[];
  draft: string;
  nextId: number;
}

export const initialTodos: TodosState = {
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
  draft: "",
  nextId: 3,
};

export class Todos extends Component<TodosState> {
  view = view;

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    return [
      store.set("items", [
        ...state.items,
        { id: state.nextId, title, done: false },
      ]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    return [
      store.set(
        "items",
        state.items.map((t) =>
          t.id === msg.payload ? { ...t, done: !t.done } : t,
        ),
      ),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    return [
      store.set(
        "items",
        state.items.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}

export const todos = new Todos();
```

Four details of this file are on purpose.

- **No mutation.** `add` does not `push` into `state.items`; it builds a new array with a spread. The compiled `diff` compares with `===`, and a mutated array is the same array.
- **No clock and no random.** The id of the new todo comes from `nextId`, a counter in the state. `Date.now()` or `Math.random()` in a handler would make it impure, and the test below would no longer be able to say what it returns.
- **Only data crosses.** The handler reads `state`, the state before the message, and `msg`. It does not read the DOM.
- **An empty draft returns `[]`.** Returning no effects is a valid answer. It is also the answer for a message that nobody handles, which is why a typo in an event name is silent. The [troubleshooting page](page:guide-troubleshooting) shows how to catch it.

Handlers are pure, so the test needs no browser. It calls the component as a function and applies the `store` effects to a copy of the state. This helper (`send`) is small, and it makes the tests independent of the exact list of effects, so they stay valid when later steps change it.

```ts src/todos.test.ts
import { type Message, toHandler } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { initialTodos, todos, type TodosState } from "./todos.ts";

/** Runs one message and returns the state after its store effects. */
function send(state: TodosState, message: Message): TodosState {
  const store = createStorePlugin(state);
  const ctx = {
    dispatch() {},
    getState: () => store.getState(),
    dispatchEffect() {},
  };
  for (const effect of toHandler(todos)(message, state)) {
    if (effect.plugin === "store") store.handle(effect as never, ctx);
  }
  return store.getState();
}

test("add turns the draft into a todo and clears the draft", () => {
  const next = send({ ...initialTodos, draft: " Pay rent " }, { id: "add" });
  expect(next.items.at(-1)).toEqual({ id: 3, title: "Pay rent", done: false });
  expect(next.draft).toBe("");
  expect(next.nextId).toBe(4);
});

test("an empty draft adds nothing", () => {
  const next = send({ ...initialTodos, draft: "  " }, { id: "add" });
  expect(next.items).toEqual(initialTodos.items);
});

test("toggle flips one todo and remove drops it", () => {
  const toggled = send(initialTodos, { id: "toggle", payload: 1 });
  expect(toggled.items.map((t) => t.done)).toEqual([true, true]);
  const removed = send(initialTodos, { id: "remove", payload: 1 });
  expect(removed.items.map((t) => t.title)).toEqual(["Write the docs"]);
});
```

Run `npm test`.

## Step 3: a filter

The filter shows All, Active or Done. A template cannot filter a list: it has no arrow functions and no calls with callbacks. That is not a gap, it is a design. A value that depends on other values is **computed once, in the handler, and stored**. The template then only displays it.

We add three fields to the state: `filter`, `visible` (the list to show) and `left` (the number of active todos). A function `show(items, filter)` returns the four `store.set` effects that keep them consistent, and every handler that changes the list calls it.

::demo filters

Choosing Done removes the first item from the DOM (one `remove` patch, a range between the item's markers), moves the class `active` from one button to another, and does nothing for the counter, because `left` did not change. The generated `diff` compared `prev.left` and `next.left` and skipped the text.

The template reads `visible` instead of `items`, and has the counter and the buttons:

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  form.todos__add(@submit.prevent=add)
    input(type="text" placeholder="What needs to be done?" value=draft @input=typing)
    button(type="submit") Add
  ul.todos__list
    for todo in visible key todo.id
      li(class:done=todo.done)
        input(type="checkbox" checked={todo.done} @change=toggle(todo.id))
        span {todo.title}
        button(type="button" @click=remove(todo.id)) Remove
  p.todos__left {left} left
  div.todos__filters
    button(type="button" class:active={filter === "all"} @click=setFilter("all")) All
    button(type="button" class:active={filter === "active"} @click=setFilter("active")) Active
    button(type="button" class:active={filter === "done"} @click=setFilter("done")) Done
```

The state, the `show` function and the initial state:

```ts src/todos.ts
export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

const items: Todo[] = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write the docs", done: true },
];

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export const initialTodos: TodosState = {
  items,
  filter: "all",
  draft: "",
  nextId: 3,
  visible: items,
  left: 1,
};
```

And the handlers that changed. `add`, `toggle` and `remove` end with `show(...)`, and `setFilter` is new:

```ts src/todos.ts
  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return show(items, state.filter);
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return show(items, state.filter);
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }
```

Add one more test to `todos.test.ts`:

```ts src/todos.test.ts
test("the filter decides what is visible and how many are left", () => {
  const next = send(initialTodos, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});
```

> [!TIP] Keep derived state in one function
> If `visible` were updated in three places, one of them would be forgotten sooner or later. A single `show` makes the list and everything that depends on it change together, in one message, so the page never shows a half-updated state.

## Step 4: saving, with your own plugin

A page that forgets everything on reload is not useful. Saving needs `localStorage`, which a handler may not touch. The tool for the outside world is a **plugin**. The framework has none for storage, so we write one. It is short, and the page [writing your own plugin](page:plugins-custom) explains every line.

The plugin has two effects, `load` and `save`. `load` answers with a message, `save` does not:

```ts src/storage.ts
import type { Plugin } from "@pavlus/frontend";

export type StorageEffect =
  | {
      plugin: "storage";
      type: "load";
      key: string;
      onSuccess: string;
      onError: string;
    }
  | {
      plugin: "storage";
      type: "save";
      key: string;
      value: unknown;
      onError?: string;
    };

export const storageEffector = {
  load: (key: string, onSuccess: string, onError: string): StorageEffect => ({
    plugin: "storage",
    type: "load",
    key,
    onSuccess,
    onError,
  }),
  save: (key: string, value: unknown, onError?: string): StorageEffect => ({
    plugin: "storage",
    type: "save",
    key,
    value,
    ...(onError !== undefined && { onError }),
  }),
};

export interface StorageOptions {
  /** Defaults to `localStorage`; replace it in tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export function createStoragePlugin(
  opts: StorageOptions = {},
): Plugin<StorageEffect> {
  return {
    name: "storage",
    handle(effect, ctx) {
      const storage = opts.storage ?? localStorage;
      try {
        if (effect.type === "load") {
          const text = storage.getItem(effect.key);
          ctx.dispatch({
            id: effect.onSuccess,
            payload: text === null ? null : JSON.parse(text),
          });
        } else {
          storage.setItem(effect.key, JSON.stringify(effect.value));
        }
      } catch (error) {
        if (effect.onError) {
          ctx.dispatch({ id: effect.onError, payload: String(error) });
        }
      }
    },
  };
}
```

The component uses it in three places. When the application starts, the message `mounted` (sent by `createApp({ mount })`) asks for the saved list. When the list changes, the handler adds a `storage.save` effect. And two small handlers receive the answers.

The initial state is now empty, because the real list comes from the storage. Here is the whole file in its form for this step, with `mounted`:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { storageEffector as storage } from "./storage.ts";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

export const initialTodos: TodosState = {
  items: [],
  filter: "all",
  draft: "",
  nextId: 1,
  visible: [],
  left: 0,
};

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export class Todos extends Component<TodosState> {
  view = view;

  mounted(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }

  loaded(msg: Message, state: TodosState): Effect[] {
    const items = Array.isArray(msg.payload) ? (msg.payload as Todo[]) : [];
    const nextId = items.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    return [store.set("nextId", nextId), ...show(items, state.filter)];
  }

  loadFailed(msg: Message): Effect[] {
    return [log.warn("could not load the todos", msg.payload)];
  }

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }

  saveFailed(msg: Message): Effect[] {
    return [log.warn("could not save the todos", msg.payload)];
  }
}

export const todos = new Todos();
```

Look at `loaded`. It receives `null` when nothing is saved, and treats that as an empty list. It also computes `nextId` from the saved ids, so a new todo never reuses an id. And look at the flow of one click on a checkbox:

1. The DOM plugin sends `toggle` with the payload `3`.
2. `toggle` returns the four `store.set` effects of `show(...)` and a `storage.save` effect.
3. The store plugin changes the state; the DOM plugin patches the page; the storage plugin writes the JSON.

Because the initial state is now empty, the handler tests need a sample state of their own. This is the whole `todos.test.ts` for this step. It adds a test for starting the app and one for `loaded`:

```ts src/todos.test.ts
import { type Message, toHandler } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { storageEffector as storage } from "./storage.ts";
import { initialTodos, todos, type TodosState } from "./todos.ts";

/** Runs one message and returns the state after its store effects. */
function send(state: TodosState, message: Message): TodosState {
  const store = createStorePlugin(state);
  const ctx = {
    dispatch() {},
    getState: () => store.getState(),
    dispatchEffect() {},
  };
  for (const effect of toHandler(todos)(message, state)) {
    if (effect.plugin === "store") store.handle(effect as never, ctx);
  }
  return store.getState();
}

const sample: TodosState = {
  ...initialTodos,
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
  nextId: 3,
};

test("add turns the draft into a todo and clears the draft", () => {
  const next = send({ ...sample, draft: " Pay rent " }, { id: "add" });
  expect(next.items.at(-1)).toEqual({ id: 3, title: "Pay rent", done: false });
  expect(next.draft).toBe("");
  expect(next.nextId).toBe(4);
});

test("an empty draft adds nothing", () => {
  const next = send({ ...sample, draft: "  " }, { id: "add" });
  expect(next.items).toEqual(sample.items);
});

test("toggle flips one todo and remove drops it", () => {
  const toggled = send(sample, { id: "toggle", payload: 1 });
  expect(toggled.items.map((t) => t.done)).toEqual([true, true]);
  const removed = send(sample, { id: "remove", payload: 1 });
  expect(removed.items.map((t) => t.title)).toEqual(["Write the docs"]);
});

test("the filter decides what is visible and how many are left", () => {
  const next = send(sample, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});

test("starting the app asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "mounted" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});

test("loaded puts the saved list into the state", () => {
  const saved = [{ id: 7, title: "Saved", done: false }];
  const next = send(sample, { id: "loaded", payload: saved });
  expect(next.items).toEqual(saved);
  expect(next.nextId).toBe(8);
});
```

`main.ts` registers the two new plugins. The logger prints the warnings that `loadFailed` and `saveFailed` return:

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createLoggerPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [
    createStorePlugin(initialTodos),
    new DomPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

To test saving without a real storage, give the plugin an object with `getItem` and `setItem`. The test mounts the real application with the real DOM plugin in jsdom, so it also checks the template:

```ts src/persistence.test.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

function start(saved: Record<string, string>) {
  document.body.innerHTML = '<div id="app"></div>';
  const storage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (saved[key] = value),
  };
  return createApp({
    app: todos,
    plugins: [
      createStorePlugin(initialTodos),
      new DomPlugin(),
      createStoragePlugin({ storage }),
    ],
    mount: "#app",
  });
}
const titles = () =>
  [...document.querySelectorAll("li span")].map((s) => s.textContent);

test("the saved list is loaded when the app starts", () => {
  const app = start({
    todos: JSON.stringify([{ id: 4, title: "Saved", done: false }]),
  });
  expect(titles()).toEqual(["Saved"]);
  app.dispose();
});

test("a change is saved", () => {
  const saved: Record<string, string> = {};
  const app = start(saved);
  const input = document.querySelector("input[type=text]") as HTMLInputElement;
  input.value = "Pay rent";
  input.dispatchEvent(new Event("input"));
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  expect(titles()).toEqual(["Pay rent"]);
  expect(JSON.parse(saved.todos)).toEqual([
    { id: 1, title: "Pay rent", done: false },
  ]);
  app.dispose();
});
```

## Step 5: a second page

The last step adds an address for each page. We need a **shell**: a component whose template has a top bar and a place for the current page, and whose `routing` table says which page is at which path. The todo list becomes one page of the shell, and does not change at all, except for one word.

The shell's template is a link bar and an outlet:

::demo nav

```pavlus src/app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
    a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About
  main.app__main
    +outlet
```

Each link is a real link with a real `href`, and a click handler that cancels the navigation of the browser and sends `navigate`. Nobody handles `navigate`, so the framework does the default: it turns the message into the effect `router.navigate("/about")`. The class `active` follows `route.path`; the demo shows that moving from `/` to `/about` is two class patches.

Two pages are only templates:

```pavlus src/about.pavlus
section.about
  h1 About
  p A todo list written with pavlus. The list is kept in localStorage.
  a(href="/" @click.prevent=navigate("/")) Back to the list
```

```pavlus src/not-found.pavlus
section.not-found
  h1 Not found
  a(href="/" @click.prevent=navigate("/")) Go to the list
```

The shell component is the routing table:

```ts src/app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@pavlus/frontend";
import aboutView from "./about.pavlus";
import view from "./app.pavlus";
import notFoundView from "./not-found.pavlus";
import { initialTodos, todos, type TodosState } from "./todos.ts";

export interface AppState {
  route: Route | null;
  todos: TodosState;
}

export const initialState: AppState = { route: null, todos: initialTodos };

export class AppShell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = {
    "/": { component: todos, key: "todos", name: "todos" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}

export const app = new AppShell();
```

Three things are in this file.

- The todo page is at `/` with `key: "todos"`. That key means the page sees `state.todos`, and its `store.set("items", ...)` lands at `todos.items`. This is why the page did not have to change: it never knew where its state lives. The state of the application is now `{ route, todos }`.
- `name: "todos"` is the message prefix. The page's events reach the shell as `todos.add`, `todos.toggle`, and the replies of its effects come back with the same prefix, so `loaded` arrives at the page as `loaded`.
- `/about` and `"*"` are view-only pages. The default `routeChanged` and `mounted` handlers of the shell do all the router wiring.

The page changes by one word. A routed page is not the root of the application, so it does not get `mounted`. It gets `enter` when its route becomes active, and that is also the right time to load the list again when the visitor comes back from About:

```ts src/todos.ts
  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }
```

`main.ts` adds the router plugin and starts from the new state:

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { app, type AppState, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

createApp<AppState>({
  app,
  plugins: [
    createStorePlugin(initialState),
    new DomPlugin(),
    createRouterPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

In the tests of the handlers one test changes, because the page now gets `enter` instead of `mounted`:

```ts src/todos.test.ts
test("entering the page asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "enter" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});
```

A new test drives the whole application, including the router, and the About link:

```ts src/app.test.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { app, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

function start(saved: Record<string, string> = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", "/");
  const storage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (saved[key] = value),
  };
  const running = createApp({
    app,
    plugins: [
      createStorePlugin(initialState),
      new DomPlugin(),
      createRouterPlugin(),
      createStoragePlugin({ storage }),
    ],
    mount: "#app",
  });
  return { running, saved };
}

const titles = () =>
  [...document.querySelectorAll(".todos__list span")].map((s) => s.textContent);

test("add a todo, tick it, filter, and it is saved", () => {
  const { running, saved } = start();
  const input = document.querySelector("input[type=text]") as HTMLInputElement;
  input.value = "Buy milk";
  input.dispatchEvent(new Event("input"));
  (document.querySelector("form") as HTMLFormElement).dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
  expect(titles()).toEqual(["Buy milk"]);
  expect(JSON.parse(saved.todos)).toEqual([
    { id: 1, title: "Buy milk", done: false },
  ]);
  (
    document.querySelector("li input[type=checkbox]") as HTMLInputElement
  ).click();
  expect(document.querySelector(".todos__left")!.textContent).toBe("0 left");
  running.dispatch({ id: "todos.setFilter", payload: "active" });
  expect(titles()).toEqual([]);
  running.dispose();
});

test("the saved list is loaded when the page is entered", () => {
  const { running } = start({
    todos: JSON.stringify([{ id: 7, title: "Saved", done: false }]),
  });
  expect(titles()).toEqual(["Saved"]);
  running.dispose();
});

test("the About link changes the page", () => {
  const { running } = start();
  (document.querySelectorAll(".app__nav a")[1] as HTMLElement).click();
  expect(location.pathname).toBe("/about");
  expect(document.querySelector("h1")!.textContent).toBe("About");
  expect(document.querySelectorAll(".app__nav a.active")).toHaveLength(1);
  running.dispose();
});
```

The first test dispatches `todos.setFilter` to the root: the prefix `todos.` sends it to the page. The second shows the page entered on start: the saved list is there without any click. The third clicks the link.

And the final version of the todo component, as it stands at the end of the guide:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { storageEffector as storage } from "./storage.ts";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

export const initialTodos: TodosState = {
  items: [],
  filter: "all",
  draft: "",
  nextId: 1,
  visible: [],
  left: 0,
};

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export class Todos extends Component<TodosState> {
  view = view;

  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }

  loaded(msg: Message, state: TodosState): Effect[] {
    const items = Array.isArray(msg.payload) ? (msg.payload as Todo[]) : [];
    const nextId = items.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    return [store.set("nextId", nextId), ...show(items, state.filter)];
  }

  loadFailed(msg: Message): Effect[] {
    return [log.warn("could not load the todos", msg.payload)];
  }

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }

  saveFailed(msg: Message): Effect[] {
    return [log.warn("could not save the todos", msg.payload)];
  }
}

export const todos = new Todos();
```

> [!NOTE] Deploying
> `vite build` makes a static site. Every path of a single-page application must answer with `index.html`: Vite's own dev and preview servers do, and a static host needs a rule or a `404.html` copy. If the site is not at the root of its domain, the router needs to be told. [Routing](page:concepts-routing) shows both.

## Where to go from here

- **Change the storage.** Replace `createStoragePlugin()` with a plugin that sends the list to a server, or write the handlers against `http.request` and keep `storage` for a draft. Nothing else in the application changes, because handlers only know the effect.
- **Edit a title.** Add a `editing` field to a todo, a double click that sets it, and an input that replaces the span. It is one more `if` in the template and two handlers.
- **Render on the server.** The todo page needs no server data, but the About page and the list shell could be rendered ahead of time. [Server-side rendering](page:concepts-ssr) explains how.

## What you learned

- An application is a store, a DOM plugin and a component; every feature is a message, a handler that returns effects, and a piece of state.
- Anything that a template cannot compute is computed in the handler and stored. Handlers do not mutate, do not read the clock and do not touch the DOM.
- Your own plugin is a short object with a name and a `handle` function, and its answers come back as messages.
- A shell with a `routing` table gives every page an address; a page keeps working when it moves, because `key` and the message prefix hide where it lives.

Next: [troubleshooting and FAQ](page:guide-troubleshooting).
