---
summary: 应用代码只返回 effect，也就是描述应该发生什么的普通数据，由 plugin 去执行。学习 plugin 的约定，effect 和答复如何传递，事情以什么顺序发生，错误如何处理，以及如何测试 plugin。
---
## 纯代码，不洁净的 plugin

在 pavlus 应用中，你写的代码从不接触外部世界。handler 不调用 `fetch`，不读取时钟，不写 `localStorage`，也不修改 DOM。它接收一个 message 和 state，并**返回一个 effect 列表**。effect 是描述应该发生某件事的普通对象。

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

去做这件事是 **plugin** 的工作。plugin 是一个带有名字和一个函数的对象。核心把两者连接起来：它把每个 effect 发送给名字等于 `effect.plugin` 的 plugin。

```text
DOM event / HTTP reply / timer tick / WS frame
        |  plugins turn the outside world into messages
        v
  core:   app(message, state) -> effects[]        pure, deterministic
        |  effects are plain data: { plugin: "http", type: "request", ... }
        v
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

这幅图是一个循环。世界产生一条 **message**（一次点击、一个答复、一次 tick）。纯代码把 message 变成 **effect**。plugin 执行 effect，当之后发生了什么事，它们再发送新的 message。你的代码只是中间一步，而中间这一步是一个函数，你可以在测试中调用它，完全不需要浏览器。

连点击也是 message。模板里的事件不是函数，而是数据。demo 展示了按钮得到的 vnode：

::demo event-as-data open=vnodes

vnode 的 `events.click` 是 `{ id: "remove", payload: 3 }`。真正的监听器由 DOM plugin 持有。点击发生时，它把 message `{ id: "remove", payload: 3, event: { type: "click" } }` 发送进应用。`event` 字段是 DOM 事件的一份小型普通数据副本，在有意义的地方带有 `value`、`checked` 和 `key`。

## plugin 的约定

这就是 plugin 的完整接口。它是 `src/core/types.ts` 中的一个类型，主包将它导出为 `Plugin`：

```ts
export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
```

只有两个成员是必需的：`name` 和 `handle`。

- `name` 是 `effect.plugin` 所指向的字符串。它在一个应用中必须唯一。
- `handle(effect, ctx)` 会为每个发给这个 plugin 的 effect 调用。第一个参数是 effect；泛型 `E` 是这个 plugin 接受的 effect 的类型，通常是按 `type` 区分的联合类型。
- `init(ctx)` 在应用创建时运行一次。需要记住上下文的 plugin（DOM plugin 保留它以便 dispatch 事件）在这里保存它。
- `onState(state, ctx)` 在 state 变化之后运行。DOM plugin 在其中重新 render。
- `dispose()` 在应用被 dispose 时运行，并进行清理：监听器、定时器、socket。

第二个类型是每个钩子都会收到的上下文：

```ts
export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}
```

`dispatch` 是 plugin 与你的代码交谈的唯一方式。`getState` 是存在的，DOM plugin 需要它来 render。`dispatchEffect` 用于开发者工具和测试。普通的 plugin 只用 `dispatch`，别无其他。

message 是 `{ id, payload?, event? }`。`id` 是将接收它的 handler 的名字。

## effect 是数据

effect 有两个必需字段，`plugin` 和 `type`。其余的都由 plugin 决定。`plugin` 选择 plugin；`type` 选择在其中做什么。store plugin 有 `set`、`merge` 和 `remove`；http plugin 有 `request` 和 `cancel`。

因为 effect 是数据，所以带来三个好处。

1. **测试不需要 mock。** 要测试 handler，就调用它，并把它返回的列表与你期望的列表比较。
2. **effect 可以被记录、回放和展示。** `createApp` 的 `onStep` 选项会收到每条 message 及其 effect；logger 和开发者工具就用它。
3. **不会意外发生任何事。** 返回一个 effect 并不等于执行它。在测试中被调用十次的 handler 什么也不会执行。

### effector

你可以手写 effect，但每个 plugin 都带有一个 **effector**：一个由若干函数组成的小对象，用来构建恰好那个对象，并带有类型。写错字段就是编译错误，而 handler 读起来像一句话。

```ts
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";

class Users extends Component<UsersState> {
  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
      log.info("loading users"),
    ];
  }
}
```

effector 自己什么也不做。`store.set("status", "loading")` 返回本页顶部展示的那个对象，仅此而已。在测试中，你把 handler 的结果与同样的 effector 调用比较：

```ts
expect(toHandler(users)({ id: "load" }, state)).toEqual([
  store.set("status", "loading"),
  http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
  log.info("loading users"),
]);
```

每个内置 plugin 都有它的 effector。常用的简短别名在第二列。

| Plugin | Effector（别名） |
| --- | --- |
| store | `storeEffector` as `store` |
| dom | `DomPlugin` (static builders) |
| http | `httpEffector` as `http` |
| ws | `wsEffector` as `ws` |
| time | `timeEffector` as `time` |
| logger | `loggerEffector` as `log` |
| router | `routerEffector` as `router` |

你可以从某个 plugin 的入口（`@pavlus/frontend/plugins/store`）导入它们，也可以从汇总入口 `@pavlus/frontend/plugins` 导入。导入汇总入口不会运行任何代码，打包工具只保留你用到的部分。

## 注册 plugin

plugin 在创建应用时列出：

```ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";

createApp({
  app: dashboard,
  plugins: [createStorePlugin(initialState), new DomPlugin(), createHttpPlugin()],
  mount: "#app",
});
```

- `app` 是一个函数，或者是继承自 `Component` 的类的实例。
- 每个 plugin 都有一个 `name`，effect 会发给名字等于 `effect.plugin` 的 plugin。
- 两个同名的 plugin 会在启动时报错：`pavlus: duplicate plugin "store"`。
- 发给列表中不存在的 plugin 的 effect，会在执行时报错：`pavlus: no plugin "nope" for effect "x"`。添加新 effect 后如果有东西抛出异常，这是第一个要检查的地方。
- state 来自第一个有 `getState()` 方法的 plugin，也就是 store plugin。没有它，handler 收到的 state 是 `undefined`。
- `mount` 需要 dom plugin 和一个带有 `view` 的 `app`。
- `init` 是一条 message，在所有 plugin 都就绪之后、`mount` 之后 dispatch 一次。

你并不是为每种 effect 类型注册一个 plugin，而是为每个 effect *家族*注册一个：所有的 `http` effect 都发给同一个保存着运行中请求表的 plugin 对象。

## message 会回来

大多数 plugin 会稍后答复：一个响应、一个定时器、一帧。effect 携带**用来答复的 message 的 id**，plugin 在拿到结果时调用 `ctx.dispatch`。

```ts
http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })
// later, the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

答复字段有约定俗成的名字：`replyTo`、`onSuccess`、`onError`、`onOpen`、`onMessage`、`onClose` 和 `onChange`。这些名字很重要，因为有组件。子组件挂载在一个 message 前缀（`users`）之下。子组件写 `onSuccess: "loaded"`，框架会在恰好这七个字段前面加上前缀，于是答复以 `users.loaded` 的形式找回子组件。下面是子组件的 effect 离开子组件之后的样子：

```json
[
  { "plugin": "time", "type": "setTimeout", "id": "t", "ms": 10, "replyTo": "kid.tick" },
  { "plugin": "q", "type": "q", "onDone": "done", "onSuccess": "kid.ok" }
]
```

看看第二个 effect。另一个名字的字段，这里是 `onDone`，不会被改变，它的 message 会去往根组件，而不是子组件。所以想在组件内部工作的 plugin 必须使用标准名字。

## 谁拥有什么

- **store** plugin 拥有应用的 state。每条 message 之后，如果 state 变了，核心会对每个定义了 `onState` 的 plugin 调用 `onState(state)`。
- 每个 plugin 拥有自己的**私有可变 state**：DOM plugin 拥有它的监听器，http 拥有运行中的请求，time 拥有它的定时器，ws 拥有它的 socket。你的代码永远看不到它，也永远不需要清理它。
- 任何带有 **id** 的东西（http 请求、定时器、连接）在同一个 id 再次被使用时会被替换，并且可以通过那个 id 取消。防抖或“最新的请求获胜”不需要应用里有任何 state：用同一个 id 再启动一次即可。

## 顺序、生命周期与循环

message **严格地一次处理一条**。对于一条 message，核心调用应用，按返回的顺序执行 effect，然后在 state 变化时，对每个 plugin 调用 `onState`。plugin 在处理 effect 时 dispatch 的 message 不会被立刻处理。它在队列中等待，并在当前 message 完成后运行。

一个测试能把它说得具体。plugin `echo` 立即答复，但答复仍然排在两个 effect 之后：

```ts overview.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
} from "@pavlus/frontend";
import {
  createStorePlugin,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";

const echo: Plugin = {
  name: "echo",
  handle(effect, ctx) {
    ctx.dispatch({ id: "echoed", payload: effect.text });
  },
};

test("effects run in order, replies wait for the next turn", () => {
  const seen: string[] = [];
  const app = createApp({
    app: (message: Message): Effect[] => {
      seen.push(message.id);
      return message.id === "start"
        ? [
            { plugin: "echo", type: "say", text: "a" },
            { plugin: "echo", type: "say", text: "b" },
          ]
        : [];
    },
    plugins: [createStorePlugin({}), echo],
  });
  app.dispatch({ id: "start" });
  expect(seen).toEqual(["start", "echoed", "echoed"]);
});
```

钩子的顺序同样是固定的。下面的测试记录了每一次调用。`init` 按数组顺序在其他一切之前调用；store 的 effect 先于 `x` 的 effect 被应用；`onState` 在该 message 的所有 effect 之后，每个 plugin 一次；而 `dispose` 以**相反**的顺序运行，所以依赖前面 plugin 的 plugin 会先被停止。

```ts
test("the hooks run in a fixed order", () => {
  const calls: string[] = [];
  const spy = (name: string): Plugin => ({
    name,
    init: () => void calls.push(`${name}.init`),
    handle: (effect) => void calls.push(`${name}.handle:${effect.type}`),
    onState: (state) =>
      void calls.push(`${name}.onState:${JSON.stringify(state)}`),
    dispose: () => void calls.push(`${name}.dispose`),
  });
  const app = createApp({
    app: () => [store.set("n", 1), { plugin: "x", type: "hello" }],
    plugins: [createStorePlugin({ n: 0 }), spy("x"), spy("y")],
  });
  app.dispatch({ id: "go" });
  app.dispose();
  expect(calls).toEqual([
    "x.init",
    "y.init",
    "x.handle:hello",
    'x.onState:{"n":1}',
    'y.onState:{"n":1}',
    "y.dispose",
    "x.dispose",
  ]);
});
```

message 的循环（handler 以引起同一条 message 的方式来答复一条 message）会在一个回合内达到 `maxMessagesPerTick` 条 message 后被停止，默认是 10 000：

```text
pavlus: more than 50 messages in one tick (message loop?)
```

（message 中的数字是设定的上限。这里是 50，通过 `createApp` 的选项 `maxMessagesPerTick` 设置。）

## 错误

失败有两种，它们的处理方式不同。

**预期中的失败是 message。** 失败的请求、关闭的 socket、找不到的文件：这些不是异常。plugin dispatch 一条错误 message（`onError`），由你的代码决定显示什么。被取消或被替换的请求则什么也不发送。

**bug 会抛出异常。** 如果 `handle` 抛出异常，异常会从 `app.dispatch` 中传出。该 message 其余的 effect 会被跳过，已经应用的 state 变化会保留。应用本身没有坏：下一次 `dispatch` 仍然可以工作。

有两种情况很容易被忽略：

- plugin 的 promise 回调或定时器回调内部的错误永远不会到达核心，因为核心已经不在调用栈上了。plugin 必须自己捕获它的异步错误，并把它们变成错误 message。所有内置 plugin 都是这么做的。
- 不返回数组的 handler 是组件的错误，信息中带有 message 的名字：`pavlus: handler "add" must return an array of effects`。

## 测试 plugin

每个内置 plugin 都把外部世界作为选项接收。http plugin 接收 `fetch`，time plugin 接收时钟，ws plugin 接收 socket 工厂，logger 接收 sink，router 接收 `window`，dom plugin 接收 `document`。测试传入一个假的即可，不需要 mock 库。

你可以不借助应用来测试 plugin。创建一个记录 message 的假上下文，调用 `handle`，并检查 dispatch 了什么：

```ts
test("a plugin is tested with a fake context", () => {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  echo.handle({ plugin: "echo", type: "say", text: "hi" }, ctx);
  expect(sent).toEqual([{ id: "echoed", payload: "hi" }]);
});
```

第三个层次是用真实的 plugin 和假的外部世界测试整个应用。[指南](page:guide-todo-app) 用一个待办事项列表做了这件事。

> [!TIP] 优先测试 handler
> 你的大部分逻辑都在 handler 中，而 handler 是纯函数。通过调用 `toHandler(component)(message, state)` 来测试它。只有在你编写 plugin 时才需要 plugin 测试，并且它测试的是 plugin 对一个 effect 做了什么。

## 你学到了什么

- handler 返回 effect，即形如 `{ plugin, type, ... }` 的普通对象。effector 以带类型的方式构建它们。plugin 是 `{ name, handle }`，外加可选的 `init`、`onState` 和 `dispose`。
- plugin 通过 `ctx.dispatch` 答复。effect 用 `replyTo`、`onSuccess`、`onError` 和其他标准字段给答复的 message 命名，子组件会把前缀找回来。
- message 一次运行一条，effect 按顺序执行，plugin 发出的 message 等待下一个回合。plugin 以相反的顺序被 dispose。
- 预期中的失败是 message，bug 会抛出异常。测试 plugin 只需要一个假上下文。

下一页：[内置 plugin](page:plugins-reference)。
