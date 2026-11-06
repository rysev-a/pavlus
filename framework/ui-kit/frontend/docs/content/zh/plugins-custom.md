---
summary: 一步一步编写 plugin，从三行的标题 plugin，到用 message 作答的存储 plugin，再到会自行清理的视口 plugin。学习各项规则，如何用假上下文测试 plugin，以及什么时候不该写 plugin。
---
## 最小的 plugin

plugin 是一个带有 `name` 和 `handle` 函数的对象。框架只需要这些。下面是一个设置浏览器标签页标题的 plugin：

```ts title.ts
import type { Plugin } from "@pavlus/frontend";

export const titlePlugin: Plugin = {
  name: "title",
  handle(effect) {
    document.title = String(effect.text);
  },
};
```

你把它和其他 plugin 一起注册：

```ts
createApp({
  app: shell,
  plugins: [createStorePlugin(initialState), new DomPlugin(), titlePlugin],
  mount: "#app",
});
```

handler 通过返回对应的 effect 来请求设置标题：

```ts
count(msg: Message): Effect[] {
  return [{ plugin: "title", type: "set", text: `${msg.payload} left` }];
}
```

这就是完整的路径。handler 保持纯净：它返回数据。核心找到 `name` 为 `"title"` 的 plugin，并调用 `handle(effect, ctx)`。带有 `document.title` 的那一行，是整个应用中唯一不纯的一行，而且它位于一个容易找到的地方。

它能工作，但还不够好。`effect.text` 是 `unknown`，所以我们需要 `String(...)`。handler 中的拼写错误（把 `text` 写成 `txt`）不会是编译错误。而且 `document` 是全局变量，测试必须去伪造它。接下来的步骤修复这三件事。

## 给 effect 加类型，并提供 effector

给 plugin 它的 effect 的类型。effect 是带有 `plugin` 和 `type` 的对象的联合类型；`Plugin<E>` 接收这个联合类型。然后是 effector：一个由若干函数组成、用来构建 effect 的小对象。最后，把外部世界（这里是 document）作为带默认值的参数。

```ts title.ts
import type { Plugin } from "@pavlus/frontend";

export type TitleEffect = { plugin: "title"; type: "set"; text: string };

export const titleEffector = {
  set: (text: string): TitleEffect => ({ plugin: "title", type: "set", text }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect> {
  return {
    name: "title",
    handle(effect) {
      doc.title = effect.text;
    },
  };
}
```

从头开始读。

- `TitleEffect` 是数据的形状。`plugin: "title"` 和 `type: "set"` 是字面量类型，所以这个 effect 不会和别的 plugin 的 effect 混淆。如果之后你添加第二个 effect，就把类型改成联合类型：`type TitleEffect = SetTitle | ResetTitle`，这样 `handle` 就可以根据 `effect.type` 分支。
- `titleEffector.set(text)` 返回的正是第一版中的那个对象，但带有类型。现在 handler 读起来是 `title.set(...)`，写错字段就是编译错误。
- `createTitlePlugin(doc)` 是一个工厂函数。默认值是全局 `document`，在调用工厂时才解析，所以在没有 `document` 的服务器上，你只需不创建这个 plugin。测试可以传入 jsdom 的 document，或任何带有 `title` 字段的对象。
- 返回类型是 `Plugin<TitleEffect>`。在 `handle` 内部，`effect.text` 是 `string`。

现在 handler 看起来就像内置 plugin 的那样：

```ts
import { titleEffector as title } from "./title.ts";

count(msg: Message): Effect[] {
  return [title.set(`${msg.payload} left`)];
}
```

> [!NOTE] 给 effect 加类型的两种方式
> ui-kit 的 plugin 写作 `interface RandomEffect extends Effect`，它接受任何额外的字段。框架的 plugin 使用精确对象类型的联合类型，更加严格：不存在的字段是错误。两者都可以赋值给 `Effect`，所以两者都可以从 handler 返回。有多个 effect 的 plugin 请使用严格的形式。

## 会作答的 plugin

标题 plugin 从不答复。大多数 plugin 会：工作需要时间，或者可能失败。规则和内置 plugin 的一样。effect 给用来答复的 message 命名，plugin 调用 `ctx.dispatch`。

我们来写一个用于 `localStorage` 的 plugin。它有两个 effect：`load` 读取一个 key 并用值答复，`save` 写入它。值以 JSON 存储。

```ts storage.ts
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

值得注意的地方：

- **答复的名字。** `load` 有 `onSuccess` 和 `onError`，这是标准名字。子组件的 message 前缀会被加在这些字段前面，于是答复能找回子组件。名为 `onDone` 的字段不会被加前缀，答复会去往根组件。请使用 `replyTo`、`onSuccess`、`onError`、`onOpen`、`onMessage`、`onClose` 或 `onChange`。
- **失败是 message。** `try`/`catch` 把异常（被阻止的存储、不是 JSON 的值）变成带着原因的 message `onError`。由应用决定怎么办。没有任何东西被抛进核心。对于 `save`，`onError` 是可选的：如果没人要求，错误就被丢弃。
- **世界是一个选项。** `storage` 默认是全局的 `localStorage`，在处理 effect 时才读取，测试则传入一个带有 `getItem` 和 `setItem` 的普通对象。
- **答复可以是同步的。** 在 `handle` 内部调用 `ctx.dispatch` 是安全的。核心会把 message 排入队列，并在当前 message 之后处理它，所以请求 `load` 的 handler 此时已经结束了。
- **缺失的 key 不是错误。** `getItem` 返回 `null`，答复就是 `null`。由 handler 决定这意味着什么。

使用它的代码是两个 handler，一个发出请求，一个接收答复：

```ts
load(): Effect[] {
  return [storage.load("todos", "loaded", "loadFailed")];
}

loaded(msg: Message): Effect[] {
  const items = Array.isArray(msg.payload) ? msg.payload : [];
  return [store.set("items", items)];
}
```

流程就是常见的那个循环。`load` 返回一个 `storage` effect；plugin 读取 key，并 dispatch `{ id: "loaded", payload: [...] }`；下一个回合，`loaded` 存储这个值。没有 promise，没有回调，store 之外也没有任何 state。

## 用假上下文测试 plugin

plugin 接收一个上下文，而上下文是三个函数。测试可以用四行代码构建一个：

```ts storage.test.ts
import type { Message, PluginContext } from "@pavlus/frontend";
import { expect, test } from "vitest";
import { createStoragePlugin, storageEffector as storage } from "./storage.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("storage loads, saves and reports errors", () => {
  const data: Record<string, string> = { a: '{"n":1}', bad: "{oops" };
  const plugin = createStoragePlugin({
    storage: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value),
    },
  });
  const { ctx, sent } = fakeContext();
  plugin.handle(storage.load("a", "ok", "failed"), ctx);
  plugin.handle(storage.load("missing", "ok", "failed"), ctx);
  plugin.handle(storage.load("bad", "ok", "failed"), ctx);
  plugin.handle(storage.save("b", [1, 2]), ctx);
  expect(sent).toEqual([
    { id: "ok", payload: { n: 1 } },
    { id: "ok", payload: null },
    { id: "failed", payload: expect.stringContaining("SyntaxError") },
  ]);
  expect(data.b).toBe("[1,2]");
});
```

测试传入一个用普通对象做的假 `storage`，用 effector 构建的 effect 调用 `handle`，并把 dispatch 出去的内容与一个列表比较。它检查了三种重要的情况：存在的值、缺失的 key，以及不是 JSON 的值。这里没有应用，没有浏览器存储，也没有 mock 库。

还有两种测试也很有用，它们都只需几行：

```ts title.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type PluginContext,
} from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { createTitlePlugin, titleEffector as title } from "./title.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the title plugin sets document.title", () => {
  const { ctx } = fakeContext();
  createTitlePlugin(document).handle(title.set("3 left"), ctx);
  expect(document.title).toBe("3 left");
});

test("a handler asks for a title, the app performs it", () => {
  const app = createApp({
    app: (message: Message): Effect[] =>
      message.id === "count" ? [title.set(`${message.payload} left`)] : [],
    plugins: [createStorePlugin({}), createTitlePlugin(document)],
  });
  app.dispatch({ id: "count", payload: 2 });
  expect(document.title).toBe("2 left");
});
```

第二个测试用真实的 title plugin 启动真实的核心：handler 返回 effect，文档标题随之改变。对应用所使用的 plugin 用它。对 plugin 本身则使用假上下文。

## 会清理的 plugin

`title` 和 `storage` 不持有任何东西。注册了监听器、定时器或 socket 的 plugin 拥有了某些东西，必须把它还回去。当应用被 dispose 时，核心会按注册的相反顺序调用 `dispose()`。

下面是一个报告窗口尺寸的 plugin。effect `listen` 启动一个 `resize` 监听器，`stop` 移除它。

```ts viewport.ts
import type { Plugin } from "@pavlus/frontend";

export type ViewportEffect =
  | { plugin: "viewport"; type: "listen"; onChange: string }
  | { plugin: "viewport"; type: "stop" };

export const viewportEffector = {
  listen: (onChange: string): ViewportEffect => ({
    plugin: "viewport",
    type: "listen",
    onChange,
  }),
  stop: (): ViewportEffect => ({ plugin: "viewport", type: "stop" }),
};

export function createViewportPlugin(
  win: Window = window,
): Plugin<ViewportEffect> {
  let stop: (() => void) | undefined;
  const size = () => ({ width: win.innerWidth, height: win.innerHeight });

  return {
    name: "viewport",
    handle(effect, ctx) {
      stop?.();
      stop = undefined;
      if (effect.type === "stop") return;
      const report = () =>
        ctx.dispatch({ id: effect.onChange, payload: size() });
      win.addEventListener("resize", report);
      stop = () => win.removeEventListener("resize", report);
      report();
    },
    dispose() {
      stop?.();
    },
  };
}
```

从中可以得到三点。

1. plugin 把撤销自己工作的方法 `stop` 保存在工厂的一个变量中。这个变量是 plugin 的私有 state。应用代码永远看不到它。
2. 每次 `handle` 首先调用 `stop?.()`。再次监听会**替换**之前的监听器，就像 router plugin 那样。没有这一步，两个 `listen` effect 会让一次 resize 产生两次报告。
3. `dispose` 移除监听器。没有它，创建并 dispose 十个应用的测试会泄漏十个监听器。

测试用 jsdom 的真实 window 来驱动它：

```ts viewport.test.ts
import type { Message, PluginContext } from "@pavlus/frontend";
import { expect, test } from "vitest";
import {
  createViewportPlugin,
  viewportEffector as viewport,
} from "./viewport.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the viewport plugin reports the size, and stops when disposed", () => {
  const { ctx, sent } = fakeContext();
  const plugin = createViewportPlugin(window);
  plugin.handle(viewport.listen("resized"), ctx);
  expect(sent).toEqual([
    { id: "resized", payload: { width: 1024, height: 768 } },
  ]);

  Object.assign(window, { innerWidth: 500 });
  window.dispatchEvent(new Event("resize"));
  expect(sent.at(-1)).toEqual({
    id: "resized",
    payload: { width: 500, height: 768 },
  });

  plugin.dispose?.();
  window.dispatchEvent(new Event("resize"));
  expect(sent).toHaveLength(2);
});
```

对任何有身份的东西都使用同样的模式。包装图表库的 plugin 会保留一张从 id 到图表的映射，在同一个 id 再次绘制时替换图表，并在 `dispose` 中销毁所有图表。

## 阅读真实的 plugin：random

ui-kit 有一个短到可以一口气读完的 plugin。handler 不能调用 `Math.random()`，因为同一条 message 会产生不同的 effect。所以它向 plugin 索要一个数字，并以 message 的形式拿回来：

```ts random.ts
import type { Effect, Plugin } from "@pavlus/frontend";

/**
 * The application is pure: it cannot call `Math.random()`. It asks this plugin
 * for a number and gets it back as a message, like an HTTP answer.
 */
export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  /** The answer is an integer from 0 up to, not including, `max`. */
  max: number;
  /** The id of the message that carries the answer as its payload. */
  replyTo: string;
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({
    plugin: "random",
    type: "int",
    max,
    replyTo,
  }),
};

export function createRandomPlugin(
  random: () => number = Math.random,
): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({
        id: effect.replyTo,
        payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)),
      });
    },
  };
}
```

- `RandomEffect` 继承 `Effect`，所以允许额外的字段。`max` 是需要多少个取值，`replyTo` 是携带答案的 message。
- `randomEffector.int(max, replyTo)` 是应用构建这个 effect 的唯一方式。
- `createRandomPlugin(random)` 把随机性的来源作为参数，默认是 `Math.random`。这是测试的接缝：传入 `() => 0` 或 `() => 0.999999`，答案就是已知的。
- `handle` 只做一件事，并通过 `ctx.dispatch` 答复。即使自定义的来源恰好返回 1，`Math.min` 也能让答案保持在 `max` 以下。

它被 Theming 页面的随机按钮所使用。一个 handler 发出请求，另一个 handler 接收答案：

```ts
"theming.random"(): Effect[] {
  return [randomEffector.int(allThemes().length, "randomPicked")];
}

randomPicked(msg: Message, state: AppState): Effect[] {
  const pick = allThemes()[msg.payload as number];
  return pick
    ? this._choose(withTheme(state.look, pick.palette, pick.mode))
    : [];
}
```

ui-kit 的测试用一个固定的随机来源来检查它：

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
const plugin = createRandomPlugin(() => 0.999999);
plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
createRandomPlugin(() => 0).handle(
  randomEffector.int(100, "randomPicked"),
  ctx,
);
expect(sent).toEqual([
  { id: "randomPicked", payload: 99 },
  { id: "randomPicked", payload: 0 },
]);
```

注意，这个测试只需要 `dispatch`，所以假上下文就是 `{ dispatch }`。ui-kit 的另外三个 plugin（theme、source、docs）在 [plugin 参考](page:plugins-reference) 中介绍。

## 规则

1. **一个 plugin 有一个名字和一个 effect 家族。** 以它所对话的世界来命名（`storage`、`viewport`、`title`），而不是以使用它的功能来命名。
2. **不要决策，只要执行。** plugin 执行一个 effect。它不读取应用的 state 来选择做什么。它需要的一切都放进 effect。`ctx.getState()` 存在，是因为 DOM plugin 必须 render，但根据 state 分支的 plugin，已经把应用逻辑从纯核心中搬了出去，在那里它无法用一个普通函数来测试。
3. **通过 `ctx.dispatch` 答复，使用 effect 中的 message id。** 不要从 `handle` 返回值，不要保留一个让应用来调用的回调，也不要在 plugin 里给 message 命名。由 effect 决定谁得到答案。
4. **使用标准的答复名字**，这样子组件才能得到它们的前缀。
5. **预期中的失败是 message。** 捕获它们并 dispatch `onError`。让 bug（形状错误的 effect）抛出异常。记住，promise 或定时器回调内部的错误核心是看不到的：请自己捕获。
6. **把世界作为选项。** `fetch`、`storage`、`window`、`document`、时钟、随机来源。默认使用全局变量，在处理 effect 或调用工厂时才解析。
7. **拥有你的资源并释放它们。** 把监听器、定时器和 socket 保存在工厂中，让操作可以按 id 替换，并在 `dispose` 中清理。
8. **提供 effector。** 对于库，导出 effector 的一个 interface 和一个用它标注的常量，因为 JSR 要求每个导出的常量都有显式类型，而 interface 是写文档注释的好地方。

> [!WARNING] 不要在 plugin 中修改 state
> plugin 没有办法改变 state，也不应该去找办法。只有 `store` plugin 会改变它，响应的是你的 handler 返回的 `store.set` effect。如果 plugin 有结果要分享，它 dispatch 一条 message，由 handler 把它变成 `store.set`。

## 什么时候不该写 plugin

plugin 是为外部世界准备的。如果工作是一次计算，plugin 就是错误的地方，函数更简单。开始之前先用这张表：

| 你想要 | 使用 |
| --- | --- |
| 格式化日期、给列表排序、计算总数 | handler 调用的纯函数 |
| 保存一个从 state 派生的值（过滤后的列表） | 在 handler 中计算，用 `store.set` 存储 |
| 调用 API | `http` plugin |
| 等待、重复、防抖 | `time` plugin |
| 让输入框获得焦点 | `dom.focus` |
| 修改 URL | `router` plugin |
| 显示或隐藏某些东西、切换 class | 模板中由 state 驱动的条件 |
| 业务规则、校验 | handler |
| 读取浏览器 API、存储、设备，或有副作用的第三方库 | plugin |

如果你发现自己在 `handle` 里放了一个关于应用数据的 `if`，那段代码应该属于 handler。

## 你学到了什么

- plugin 是 `{ name, handle }`。把它的 effect 写成联合类型，用 effector 构建它们，并把外部世界作为选项。
- 要作答，effect 用标准字段给答复的 message 命名，plugin 调用 `ctx.dispatch`。失败是 message。
- 拥有资源的 plugin 会保存撤销它的办法，并在 `dispose` 中释放它。用三个函数组成的假上下文来测试。
- 不要在 plugin 中做决策，不要触碰 state，也不要为函数就能完成的事情写 plugin。

下一页：[完整应用](page:guide-todo-app)。
