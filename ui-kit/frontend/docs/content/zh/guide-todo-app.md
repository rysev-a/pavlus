---
summary: 分五个可运行的步骤构建一个完整的小应用：一个带有添加、切换、删除和过滤功能的待办事项列表，由你自己的 plugin 保存，并在路由后面有第二个页面。你会看到每一个文件，以及测试。
---
## 我们要构建什么

一个待办事项列表。你输入标题并按下 Enter，勾选一个待办事项，删除它，并按全部、未完成和已完成来过滤列表。列表保存在 `localStorage` 中，所以刷新后它仍然在。第二个页面 About 位于它自己的地址之后，顶部栏把两个页面链接起来。

本指南有五个步骤。每个步骤结束时都有一个能运行的应用：你可以用 `npm run dev` 启动它，并点击体验。每个步骤增加一个思路。

| 步骤 | 增加了什么 | 思路 |
| --- | --- | --- |
| 0 | 项目 | 带有 pavlus plugin 的 Vite 项目 |
| 1 | 来自 state 的列表 | 模板、state、组件 |
| 2 | 添加、勾选、删除 | 事件是 message，handler 返回 effect |
| 3 | 过滤 | 派生 state，在 handler 中计算 |
| 4 | 保存 | 你自己的 plugin，以 message 作为答复 |
| 5 | 第二个页面 | 路由、`enter`、shell |

最终的文件：

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

## 步骤 0：项目

你需要一个文件夹、一个 `package.json`、一份带有 pavlus plugin 的 Vite 配置，以及一个带有挂载元素的 `index.html`。在本仓库中，`@service-laboratory/pavlus` 是 `framework` 工作区包，所以它的版本是 `*`。

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
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "jsdom": "^30.1.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

Vite 配置中有两行很重要。`pavlus()` plugin 把每个 `*.pavlus` 文件编译成带有 `render` 和 `diff` 的模块。`environment: "jsdom"` 这一设置是给测试用的，测试需要 DOM。

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

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

`src/env.d.ts` 文件告诉 TypeScript 两件事：`import view from "./page.pavlus"` 返回什么，以及 Vite 本身的类型。没有它，你会得到 `Cannot find module './todos.pavlus'`。

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@service-laboratory/pavlus/env" />
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

## 步骤 1：来自 state 的列表

第一个版本显示来自 state 的两个待办事项。它有一个模板、一个拥有该模板的组件，以及一个启动应用的 `main.ts`。

模板是一个标题和一个列表。`for todo in items key todo.id` 为每个条目重复它下面的那一行；`key` 说明用哪个字段来标识条目，这样添加或删除一个条目时只会触及那一个条目。当字段为 true 时，`class:done=todo.done` 会加上 class `done`。

::demo list

这个 demo 是真实的模板配上真实的 state。在第一步中，你会看到一次插入：一个新条目被插入到列表的结束标记之前，页面中其他任何东西都没有被触及。在第二步中，一个条目的 class 变了，这是一次属性 patch。

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}
```

组件是继承 `Component` 的类。它用 `view` 指定自己的模板。它还没有 handler。

```ts src/todos.ts
import { Component } from "@service-laboratory/pavlus";
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

`main.ts` 创建应用。**store** plugin 保存 state，并从 `initialTodos` 开始；**dom** plugin 负责 render。`mount: "#app"` 把组件的 view render 到该元素中。

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [createStorePlugin(initialTodos), createDomPlugin()],
  mount: "#app",
});
```

运行 `npm run dev`。你会看到标题和两个待办事项；第二个有 class `done`，所以样式表可以给它加上删除线。

## 步骤 2：添加、勾选、删除

现在应用有了反应。在模板中添加一个表单、一个复选框和一个按钮。看看这些事件。

::demo form

`@input=typing` 不是函数调用。它是 message `typing`，DOM plugin 会把输入框的文本作为 `msg.event.value` 加上。`@change=toggle(todo.id)` 是 payload 为 `todo.id` 的 message `toggle`。`@submit.prevent=add` 阻止浏览器重新加载页面，并发送 `add`。demo 的第一步展示了输入框中的草稿：模板读取 `value=draft`，diff 是一次属性 patch。

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

每条 message 都是组件上同名的方法。方法接收 message 和 state，并返回 **effect**。它不改变任何东西：`store.set("draft", "")` 是一个请求 store plugin 去做这件事的对象。

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
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

这个文件有四个细节是有意为之的。

- **不修改。** `add` 不会向 `state.items` 里 `push`；它用展开构建一个新数组。编译后的 `diff` 用 `===` 比较，而被修改的数组还是同一个数组。
- **没有时钟，也没有随机数。** 新待办事项的 id 来自 `nextId`，一个存在 state 中的计数器。在 handler 中使用 `Date.now()` 或 `Math.random()` 会使它不纯，下面的测试就无法再说出它返回什么。
- **只有数据穿过。** handler 读取 `state`（message 之前的 state）和 `msg`。它不读取 DOM。
- **空草稿返回 `[]`。** 不返回任何 effect 是合法的答复。对于没人处理的 message，答复也是它，这就是事件名中的拼写错误是静默的原因。[故障排查页面](page:guide-troubleshooting) 展示了如何捕获它。

handler 是纯的，所以测试不需要浏览器。它把组件当作函数调用，并把 `store` effect 应用到 state 的一份副本上。这个辅助函数（`send`）很小，它让测试不依赖 effect 的具体列表，所以当后面的步骤改变它时，测试仍然有效。

```ts src/todos.test.ts
import { type Message, toHandler } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
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

运行 `npm test`。

## 步骤 3：过滤

过滤器显示全部、未完成或已完成。模板无法过滤列表：它没有箭头函数，也没有带回调的调用。这不是缺陷，而是设计。依赖其他值的值**在 handler 中计算一次，并被存储**。模板只负责显示它。

我们向 state 添加三个字段：`filter`、`visible`（要显示的列表）和 `left`（未完成待办事项的数量）。函数 `show(items, filter)` 返回让它们保持一致的四个 `store.set` effect，每个改变列表的 handler 都会调用它。

::demo filters

选择 Done 会从 DOM 中移除第一个条目（一次 `remove` patch，作用于该条目标记之间的区间），把 class `active` 从一个按钮移到另一个按钮，而对计数器什么也不做，因为 `left` 没有变。生成的 `diff` 比较了 `prev.left` 和 `next.left`，并跳过了这段文本。

模板读取 `visible` 而不是 `items`，并带有计数器和按钮：

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

state、`show` 函数和初始 state：

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

以及有变化的 handler。`add`、`toggle` 和 `remove` 以 `show(...)` 结尾，`setFilter` 是新增的：

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

再向 `todos.test.ts` 添加一个测试：

```ts src/todos.test.ts
test("the filter decides what is visible and how many are left", () => {
  const next = send(initialTodos, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});
```

> [!TIP] 把派生 state 放在一个函数里
> 如果 `visible` 在三个地方更新，迟早会有一个被忘掉。单独一个 `show` 让列表和依赖它的一切在同一条 message 中一起变化，所以页面永远不会显示更新了一半的 state。

## 步骤 4：保存，用你自己的 plugin

一个刷新就忘掉一切的页面没有用。保存需要 `localStorage`，而 handler 不能接触它。面向外部世界的工具是 **plugin**。框架没有用于存储的 plugin，所以我们自己写一个。它很短，[编写自己的插件](page:plugins-custom) 这一页解释了其中的每一行。

这个 plugin 有两个 effect，`load` 和 `save`。`load` 用 message 作答，`save` 不作答：

```ts src/storage.ts
import type { Plugin } from "@service-laboratory/pavlus";

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

组件在三个地方使用它。应用启动时，message `mounted`（由 `createApp({ mount })` 发送）请求已保存的列表。列表变化时，handler 添加一个 `storage.save` effect。还有两个小 handler 接收答复。

初始 state 现在是空的，因为真正的列表来自存储。下面是这一步中整个文件的样子，带有 `mounted`：

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
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

看看 `loaded`。当没有保存任何东西时它会收到 `null`，并把它当作空列表。它还根据已保存的 id 计算 `nextId`，所以新的待办事项永远不会重复使用某个 id。再看看一次点击复选框的流程：

1. DOM plugin 发送 `toggle`，payload 为 `3`。
2. `toggle` 返回 `show(...)` 的四个 `store.set` effect 和一个 `storage.save` effect。
3. store plugin 改变 state；DOM plugin 给页面打 patch；storage plugin 写入 JSON。

因为初始 state 现在是空的，handler 测试需要自己的示例 state。这是这一步完整的 `todos.test.ts`。它增加了一个启动应用的测试和一个针对 `loaded` 的测试：

```ts src/todos.test.ts
import { type Message, toHandler } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
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

`main.ts` 注册这两个新 plugin。logger 打印 `loadFailed` 和 `saveFailed` 返回的警告：

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createLoggerPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [
    createStorePlugin(initialTodos),
    createDomPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

要在没有真实存储的情况下测试保存，给 plugin 一个带有 `getItem` 和 `setItem` 的对象。这个测试在 jsdom 中用真实的 DOM plugin 挂载真实的应用，所以它也检查了模板：

```ts src/persistence.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
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
      createDomPlugin(),
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

## 步骤 5：第二个页面

最后一步为每个页面添加一个地址。我们需要一个 **shell**：这个组件的模板有一个顶部栏和一个放置当前页面的位置，它的 `routing` 表说明哪个页面位于哪个路径。待办事项列表变成 shell 的一个页面，除了一个词之外完全不用改变。

shell 的模板是一个链接栏和一个 outlet：

::demo nav

```pavlus src/app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
    a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About
  main.app__main
    +outlet
```

每个链接都是带有真实 `href` 的真正链接，外加一个取消浏览器导航并发送 `navigate` 的点击 handler。没有人处理 `navigate`，所以框架执行默认行为：把这条 message 变成 effect `router.navigate("/about")`。class `active` 跟随 `route.path`；demo 展示了从 `/` 移动到 `/about` 是两次 class patch。

两个页面只是模板：

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

shell 组件就是路由表：

```ts src/app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
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

这个文件里有三点。

- 待办事项页面位于 `/`，带有 `key: "todos"`。这个 key 意味着页面看到的是 `state.todos`，它的 `store.set("items", ...)` 落在 `todos.items`。这就是页面不需要改变的原因：它从不知道自己的 state 位于哪里。应用的 state 现在是 `{ route, todos }`。
- `name: "todos"` 是 message 前缀。页面的事件以 `todos.add`、`todos.toggle` 的形式到达 shell，页面 effect 的答复也带着同样的前缀回来，所以 `loaded` 到达页面时仍是 `loaded`。
- `/about` 和 `"*"` 是只有 view 的页面。shell 默认的 `routeChanged` 和 `mounted` handler 完成了全部路由器接线。

页面只改动一个词。被路由的页面不是应用的根，所以它不会收到 `mounted`。当它的路由变为活动时，它会收到 `enter`，这也是访客从 About 回来时再次加载列表的恰当时机：

```ts src/todos.ts
  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }
```

`main.ts` 添加 router plugin，并从新的 state 开始：

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app, type AppState, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

createApp<AppState>({
  app,
  plugins: [
    createStorePlugin(initialState),
    createDomPlugin(),
    createRouterPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

在 handler 的测试中，有一个测试要改，因为页面现在收到的是 `enter` 而不是 `mounted`：

```ts src/todos.test.ts
test("entering the page asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "enter" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});
```

一个新的测试驱动整个应用，包括路由器和 About 链接：

```ts src/app.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
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
      createDomPlugin(),
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

第一个测试向根 dispatch `todos.setFilter`：前缀 `todos.` 把它送到页面。第二个展示了启动时进入的页面：无需任何点击，已保存的列表就在那里。第三个点击链接。

最后是待办事项组件的最终版本，也就是指南结束时的样子：

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
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

> [!NOTE] 部署
> `vite build` 生成静态站点。单页应用的每个路径都必须用 `index.html` 应答：Vite 自己的 dev 和 preview 服务器会这样做，而静态主机需要一条规则或一份 `404.html` 副本。如果站点不在域名的根路径，就需要告诉路由器。[路由](page:concepts-routing) 展示了两者。

## 接下来去哪里

- **更换存储。** 把 `createStoragePlugin()` 换成把列表发送到服务器的 plugin，或者针对 `http.request` 编写 handler，把 `storage` 留给草稿。应用中的其他部分都不用改，因为 handler 只认识 effect。
- **编辑标题。** 给待办事项添加一个 `editing` 字段，用双击来设置它，并用一个输入框替换 span。这是模板中多一个 `if` 和两个 handler。
- **在服务器上 render。** 待办事项页面不需要服务器数据，但 About 页面和列表的 shell 可以提前 render。[服务端渲染](page:concepts-ssr) 解释了怎么做。

## 你学到了什么

- 应用是一个 store、一个 DOM plugin 和一个组件；每个功能都是一条 message、一个返回 effect 的 handler，以及一块 state。
- 模板无法计算的一切，都在 handler 中计算并存储。handler 不修改、不读取时钟，也不接触 DOM。
- 你自己的 plugin 是一个带有名字和 `handle` 函数的短小对象，它的答复以 message 的形式回来。
- 带有 `routing` 表的 shell 给每个页面一个地址；页面移动之后仍然可以工作，因为 `key` 和 message 前缀隐藏了它位于何处。

下一页：[故障排查与常见问题](page:guide-troubleshooting)。
