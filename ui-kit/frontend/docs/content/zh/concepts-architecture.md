---
summary: pavlus 应用从事件到打过 patch 的 DOM 的完整数据流。纯代码带来什么，effect 作为数据长什么样，plugin 可以做什么、不可以做什么，message 按什么顺序运行，以及如何用普通断言测试一个 handler。
---
## 一个循环

每个 pavlus 应用都是同一个循环。发生了某件事，生成一条 message，你的纯代码把 message 变成 effect，plugin 执行这些 effect，新的 state 显示在屏幕上。下面是完整的路径，并标出了每一步由哪个部件负责。

```text
 DOM event / HTTP reply / timer tick / socket frame / location change
        |
        |  a plugin turns it into a message
        v
 { id, payload, event }                           message: plain data
        |
        |  core: createApp puts it in the queue
        v
 handler(message, state)  ->  Effect[]            your code: pure
        |
        |  core: each effect goes to plugins[effect.plugin]
        v
 store.handle(set ...)    http.handle(request)    plugins: all side effects
        |                       |
        |                       |  later: ctx.dispatch(reply message)
        v                       +-------------------> back to the queue
 store: state replaced by a new object
        |
        |  core: state !== previous state  ->  onState(next) on every plugin
        v
 dom.onState:  view.diff(prev, next)  ->  Patch[]
        |
        v
 the dom plugin changes the real DOM
```

这张图左侧的一切都是数据或纯函数。所有接触外部世界的东西都是 plugin。core，也就是 `createApp`，是它们之间那个很薄的循环。它的源码大约一百行，不依赖 DOM。

为什么是这种形态？它把程序中经常变化、又不容易写对的部分（用户做了 X 之后应该发生什么），与很少变化、可以一次写好的部分（如何挂上监听器、如何调用 `fetch`）分开。前一部分变成作用于普通数据的普通函数，因此容易阅读、测试和复用。

## “纯”带来什么

**纯**函数只依赖它的参数，并且不改变自身以外的任何东西。你的 handler 的签名是 `(message, state, ctx) => Effect[]`。因为它们是纯的：

- **你可以不用浏览器测试它们。** 输入是两个普通值，输出是一个普通值的列表。你用 `assert` 比较它们。本页末尾有完整的例子。
- **你可以在服务端运行它们。** 没有 DOM，同样的组件也能渲染成字符串。[服务端渲染](page:concepts-ssr) 一页就用到了这一点。
- **你可以回放一次会话。** 记录下 message，把它们喂给一个全新的 app，就会得到相同的 state。core 甚至提供了一个钩子 `onStep(message, effects)`，每处理一条 message 就会调用它。
- **你可以看清发生了什么。** effect 是一个可以打印、记录和比较的对象，回调函数则不行。

Pavlus **不会**检查纯净性。文档把它称为作者自己的责任。调用 `Math.random()` 或读取 `Date.now()` 的 handler 可以正常工作，但会让应用难以测试。经验法则是向 plugin 去要。随机数或时间是一个 effect，它的答案以 message 的形式返回。

## effect 是纯数据

effect 是至少有两个字段的对象：`plugin` 是处理它的 plugin 的名字，`type` 是要做什么。其他字段由 plugin 自己决定。下面是内置 plugin 中的真实例子。你用每个 plugin 的 *effector*（一个小型构造器对象）来写它们，但得到的结果正是所示的对象。

```ts
{ plugin: "store", type: "set", path: "count", value: 1 }
{ plugin: "store", type: "merge", path: "user", value: { name: "Ann" } }
{ plugin: "http", type: "request", id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }
{ plugin: "time", type: "setTimeout", id: "search", ms: 300, replyTo: "searchFire", payload: "ann" }
{ plugin: "router", type: "navigate", url: "/users" }
{ plugin: "logger", type: "log", level: "info", message: "user removed", data: { id: 3 } }
{ plugin: "dom", type: "focus", selector: "#name" }
```

有两点要注意。第一，需要答复的 effect 会说明**用哪条 message 来答复**：`onSuccess: "loaded"`、`replyTo: "searchFire"`。答复稍后以 message 的形式到达，`{ id: "loaded", payload: ... }`，并走同一个循环。你的代码从不等待。第二，带有 `id` 的 effect（`http`、`time`、`ws`）会替换一个具有相同 id、正在运行的 effect。这就是“最新的请求获胜”以及 debounce 在你的代码里不需要任何 state 就能写出来的原因。

在 handler 中你使用 effector，因为它们有类型，读起来也顺：

```ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";

interface SearchState {
  query: string;
  status: "idle" | "loading";
  results: string[];
}

export class Search extends Component<SearchState> {
  type(msg: Message) {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      time.setTimeout("search", 300, "fire", query),
    ];
  }

  fire(msg: Message) {
    return [
      store.set("status", "loading"),
      http.request({
        id: "search",
        url: `/api/search?q=${msg.payload}`,
        onSuccess: "found",
        onError: "failed",
      }),
    ];
  }

  found(msg: Message) {
    const reply = msg.payload as { data: string[] };
    return [store.set("status", "idle"), store.set("results", reply.data)];
  }

  failed() {
    return [store.set("status", "idle"), store.set("results", [])];
  }
}
```

这是一个完整的带 debounce 的搜索。每次按键都会用同一个 id 重启定时器，所以只会发送最后一次查询。如果在请求运行期间又发出了新的查询，同一个 id 会取消旧的请求。这个组件没有定时器，没有 `AbortController`，也没有可变字段。

## 从 state 到 patch

循环的最后几步属于编译器。store 替换了 state 之后，DOM plugin 调用已挂载 view 的 `diff(prev, next)` 函数。它返回 **patch**：同样是纯数据，是八种操作之一（`text`、`attr`、`rmAttr`、`handler`、`insert`、`clear`、`remove`、`move`）。DOM plugin 是唯一把 patch 变成 DOM 调用的代码。

::demo state-to-patches

看这个 demo 的两个步骤。第一步只有 `status` 变化，所以唯一的 patch 是插入“Loading...”段落。列表没有被触碰。第二步 `status` 和 `items` 都变了：段落被清除，两个列表项被插入。只读取未变化字段的节点什么也不产生。编译器会算出每个节点读取哪些字段，所以 `diff` 只用一次 `===` 检查就能跳过整个子树。

> [!WARNING] 不可变性是约定的一部分
> core 通过比较对象标识（`next !== state`）来判断 state 是否变化，`diff` 也用同样的方式比较字段。store plugin 会替换 state 对象，并共享没有变化的分支，所以这两种检查既便宜又正确。如果你原地修改 state，就不会通知任何 plugin，也不会产生任何 patch。

## 事情的顺序

core 严格地一次处理一条 message。这些规则都在 `createApp` 中，你可以放心依赖它们。

1. **队列。** `dispatch(message)` 把 message 推入队列。如果循环已经在运行，调用会立即返回，message 稍后在同一次运行中、当前 message 处理完毕之后再处理。
2. **effect 按顺序。** 对于一条 message，effect 按你的 handler 返回的顺序交给各自的 plugin。
3. **答复排队。** plugin 在处理 effect 时可以调用 `ctx.dispatch`，甚至可以立刻调用。答复会在队列中排在当前 message 之后。handler 在同一条 message 的处理过程中，永远看不到对自己 effect 的答复。
4. **每条 message 只通知一次。** 一条 message 的所有 effect 运行完之后，core 读取一次 state。如果它与处理这条 message 之前不是同一个对象，每个拥有 `onState` 的 plugin 都会用最终的 state 被调用一次。三个 `set` effect 只引起一次 render，而不是三次。
5. **安全阀。** 如果一次运行中处理的 message 超过 `maxMessagesPerTick`（默认 10 000），队列会被清空并抛出错误。这意味着 message 在循环地互相触发。
6. **错误。** handler 或 `plugin.handle` 中的异常会从 `dispatch` 中传出。指向未注册 plugin 的 effect 会抛出 `pavlus: no plugin "x" for effect "y"`。两个同名的 plugin 会在应用启动时抛出错误。
7. **关闭。** `dispose()` 按注册的相反顺序销毁各个 plugin，之后的 message 会被忽略。

handler 收到的 state 来自第一个拥有 `getState()` 方法的 plugin，也就是 store。你也可以在选项中自己传入 `getState`，例如在测试中。

## plugin 可以做什么、不可以做什么

plugin 是一个对象：`{ name, init?, handle(effect, ctx), onState?, dispose? }`。core 会给它一个带有三个函数的上下文：`dispatch(message)`、`getState()` 和 `dispatchEffect(effect)`。

plugin **可以**：

- 拥有可变数据：监听器、正在进行的请求、定时器、socket、缓存。应用代码永远看不到它，也不需要清理它。
- 调用任何外部 API：DOM、`fetch`、`setTimeout`、`localStorage`、`console`。
- 随时用 `ctx.dispatch` 把外部事件变成 message。
- 用 `ctx.getState()` 读取 state，并在 `onState` 中对变化作出反应。
- 在 `dispose` 中做清理。

plugin **不应该**：

- 自己修改应用的 state。只有 store plugin 会修改 state，而且只因为 `set`、`merge`、`remove`、`undo` 或 `restoreTo` effect。
- 持有业务规则。它为一族 effect 只做一件事。“收到答复之后发生什么”属于 handler。
- 因为可预期的失败而抛出异常。请求失败或 socket 关闭，应作为 message（`onError`）报告，让 handler 去处理。

框架同样不会强制检查这些规则。[plugin 相关页面](page:plugins-overview) 展示每个内置 plugin 做什么，以及如何编写你自己的 plugin。

## 用普通断言测试 handler

因为组件是纯函数，单元测试不需要任何准备。`toHandler` 把组件变成一个普通函数 `(message, state) => Effect[]`。调用它，然后比较。这个测试只用标准库：

```ts search.test.ts
import assert from "node:assert/strict";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { toHandler } from "@service-laboratory/pavlus";
import { Search } from "./search.ts";

const search = toHandler(new Search());
const state = { query: "ann", status: "idle" as const, results: [] };

assert.deepEqual(search({ id: "fire", payload: "ann" }, state), [
  store.set("status", "loading"),
  http.request({
    id: "search",
    url: "/api/search?q=ann",
    onSuccess: "found",
    onError: "failed",
  }),
]);

assert.deepEqual(search({ id: "nobody-handles-this" }, state), []);
```

没有 handler 的 message 返回空列表，而不是错误。你比较的是 effector 自己的输出，所以如果某个 plugin 的 effect 改变了形状，测试就会失败，而且你永远不必手写这些对象。

要一起测试多个步骤，可以只用 store plugin 来运行真正的 core。不需要 `dom` plugin，因为你想检查的只是 state。选项 `onStep` 会收集发生的事情。

```ts flow.test.ts
import assert from "node:assert/strict";
import { createApp, type Plugin } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { Search } from "./search.ts";

const fakeHttp: Plugin = {
  name: "http",
  handle(effect, ctx) {
    ctx.dispatch({
      id: effect.onSuccess as string,
      payload: { status: 200, data: ["Ann Lee", "Anna Fox"] },
    });
  },
};
const fakeTime: Plugin = {
  name: "time",
  handle(effect, ctx) {
    ctx.dispatch({ id: effect.replyTo as string, payload: effect.payload });
  },
};

const store = createStorePlugin({ query: "", status: "idle", results: [] });
const steps: string[] = [];
const app = createApp({
  app: new Search(),
  plugins: [store, fakeHttp, fakeTime],
  onStep: (message) => steps.push(message.id),
});

app.dispatch({ id: "type", event: { type: "input", value: "ann" } });

assert.deepEqual(steps, ["type", "fire", "found"]);
assert.deepEqual(store.getState().results, ["Ann Lee", "Anna Fox"]);
assert.equal(store.getState().status, "idle");
```

两个假的 plugin 各只有四行。它们立刻作出答复，测试因此能看到整条链路：`type`，然后是定时器触发的 `fire`，再然后是请求返回的 `found`。没有时钟，没有网络，没有浏览器。

当你确实想在 DOM 中检查模板时，`@service-laboratory/pavlus/testing` 提供了 `mountView(viewOrComponent, initialState)`。它不经过 core，在一个新的容器里挂载 view，并返回这个容器、页面 dispatch 出的 `messages`，以及一个用来改变 state 的 `set(next)`。点击按钮会给你一条可以比较的 message，而 `set` 则展示打过 patch 的 DOM。

## 你学到了什么

- 循环是：事件、message、handler、effect、plugin、store、新 state、`diff`、patch、DOM。message、effect 和 patch 都是纯数据。
- 纯 handler 可以用 `assert` 测试，可以在服务端运行，也可以回放。纯净性是一种框架不强制执行的约定。
- message 一次运行一条。effect 按返回顺序运行，答复在队列中等待，plugin 每条 message 只会被通知一次 state。
- Plugin 拥有所有副作用及其可变数据。它们用 message 作答，只有 store 会修改 state。
- 你可以用 `toHandler` 直接测试一个 handler，也可以用 `createApp`、store 和小型的假 plugin 测试整条流程。

下一页：[组件与状态](page:concepts-components)。
