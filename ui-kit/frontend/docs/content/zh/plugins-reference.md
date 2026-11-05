---
summary: 所有内置 plugin 集中在一处：dom、store、http、router、time、logger 和 ws，包括它们所有的 effect、字段和回送的 message，另外还有 ui-kit 的四个 plugin，作为应用专用 plugin 的示例。
---
## 七个 plugin，末尾一张表

框架自带七个 plugin。你在 `createApp({ plugins })` 中注册需要的那些，其他的不产生任何开销。本页描述每一个：它是做什么的，它处理的每个 effect 及其字段，在 handler 中的简短用法，以及回送的 message。最后一节是所有 effect 的表，方便快速查找。

每个例子都使用 effector 的简短别名，就像在 [plugin 如何工作](page:plugins-overview) 中一样：

```ts
import {
  DomPlugin,
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
  wsEffector as ws,
} from "@service-laboratory/pavlus/plugins";
```

每个 plugin 都由名为 `createXPlugin(options)` 的函数创建——dom 插件是例外，它是类：`new DomPlugin(options)`——每个选项的存在，都是为了让测试可以替换外部世界。这些选项在本页末尾也有列出。

## store

**用途：**保存应用的 state，以及对它所做的每一次改动的历史。它是核心唯一向其索要 state 的 plugin：handler 收到的是 store 的值，当它变化时，其他 plugin 会得到通知。

```ts
const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
plugin.getState();
plugin.history;
```

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `set` | `path`, `value` | 设置 `path` 处的值，缺失的父级会被创建。根路径（空字符串）会替换整个 state。 |
| `merge` | `path`, `value` | 把一个对象浅合并到 `path` 处的对象中。 |
| `remove` | `path` | 移除一个值。对于数组元素，数组会缩短。 |
| `undo` | `steps?` | 回退最近 `steps` 次（默认 1 次）记录的改动。 |
| `restoreTo` | `timestamp` | 回退 `timestamp` 之后记录的每一次改动。 |

**路径**是用点分隔的字符串（`"user.name"`、`"todos.0.done"`）或数组（`["todos", 0, "done"]`）。数字段用来索引数组。

```ts
rename(msg: Message): Effect[] {
  return [
    store.set("user.name", String(msg.payload)),
    store.merge("user", { edited: true }),
    store.remove("todos.1"),
  ];
}
```

**回送：**无。`store` effect 的结果就是新的 state，下一条 message 和模板都会看到它。

state 是**不可变**的。每次改动都会沿着路径构建新对象，其余部分保持不变，所以 `diff` 只用一次 `===` 就能跳过未触及的分支。把一个值设为它已有的值，不会改变任何东西，也不会记录任何东西。永远不要就地修改 state：store 和 `diff` 都看不到这种修改。

每次改动都会连同一个 `restoreEffect` 一起记录，也就是能把 state 恢复到改动之前的 effect。`undo` 和 `restoreTo` 应用这些 effect，且不记录任何东西。历史保留最近 1000 次改动（`maxHistory`）。

## dom

**用途：**唯一接触 DOM 的代码。它 render 编译后的 view，应用 `diff` 返回的 patch，并拥有每一个事件监听器。事件以 message 的形式回送。

你的应用的根由 `createApp({ mount })` 挂载。下面的 effect 用于其他一切：另一个位置的第二个 view、模态框、面板。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `mount` | `target`, `view`, `onMounted?` | 用当前 state 把 `view` render 到 `target`（CSS 选择器或元素）中。 |
| `unmount` | `target` | 移除挂载到 `target` 中的内容及其监听器。 |
| `focus` | `selector` | 让第一个匹配的元素获得焦点。 |
| `blur` | `selector` | 让第一个匹配的元素失去焦点。 |

```ts
open(): Effect[] {
  return [DomPlugin.mount("#panel", panelView, { onMounted: "panelMounted" })];
}

panelMounted(): Effect[] {
  return [DomPlugin.focus("input.filter")];
}
```

`view` 是一个编译后的模板（`import panelView from "./panel.pavlus"`），或者对于模板中有 `+outlet` 或子组件的组件，使用 `viewOf(component)`。

**回送：**

| 时机 | Message |
| --- | --- |
| view 已在 DOM 中，并且给了 `onMounted` | `{ id: onMounted }` |
| 用户触发了模板中绑定的事件，例如 `@click=save(item)` | `{ id, payload, event }` |

对于事件，`id` 是模板中的 message id（带有被 embed 的子组件的前缀），`payload` 是 handler 的参数，`event` 是一份普通快照：`{ type, value?, checked?, key? }`。`value` 和 `checked` 来自事件的目标，`key` 来自键盘事件。`@submit.prevent` 和 `.stop` 会在 message 发送之前调用 `preventDefault()` 和 `stopPropagation()`。

`onMounted` 不属于子组件会被加前缀的那七个答复字段，所以 message 会以你写的名字到达。

plugin 还做了另外两件事。每当 state 变化时，它会对每个已挂载的 view 运行 `view.diff(previous, state)` 并应用 patch；你从不发送更新 effect。而当目标中包含服务端 render 时，`mount` 会对标记进行 hydrate，而不是构建它（见 [服务端渲染](page:concepts-ssr)）。

一个节点的每种事件类型在整个生命周期内只有**一个**监听器。当 handler 的 message 变化时，plugin 只是替换存储的 message。表单字段既写成属性（attribute），也写成 property（`value`、`checked`、`selected`），因为用户输入之后，只有 property 才会改变显示的内容。

## http

**用途：**请求。每个请求都有一个 **id**，id 也是取消它的方式：用一个正在运行的请求的 id 启动新请求，会取消旧的请求。“最新的请求获胜”不需要应用里有任何 state。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | 发送请求。 |
| `cancel` | `id` | 取消正在运行的请求 `id`。 |

除非你另行指定，`method` 是 `GET`。字符串 `body` 原样发送；其他任何东西都以 JSON 发送，并且除非你自己设置，否则会加上 `content-type: application/json`。`responseType` 是 `"json"`（默认）或 `"text"`。不是有效 JSON 的响应体会得到 `data: null`。

```ts
search(msg: Message): Effect[] {
  return [
    http.request({
      id: "search",
      url: `/api/users?q=${msg.payload}`,
      onSuccess: "found",
      onError: "searchFailed",
    }),
  ];
}

save(msg: Message): Effect[] {
  return [
    http.request({
      id: "save",
      method: "POST",
      url: "/api/users",
      body: { name: msg.payload },
      onSuccess: "saved",
      onError: "saveFailed",
    }),
  ];
}
```

**回送：**

| 时机 | Message |
| --- | --- |
| 2xx 响应 | `{ id: onSuccess, payload: { status, data } }` |
| 任何其他状态码 | `{ id: onError, payload: { status, error: statusText, data } }` |
| 网络故障 | `{ id: onError, payload: { error: message } }` |
| 被取消或被替换 | 无 |

下面是一个假的 `fetch` 分别应答 200、404 和网络故障时的真实 payload：

```json
[
  { "id": "ok", "payload": { "status": 200, "data": [1] } },
  { "id": "err", "payload": { "status": 404, "error": "Not Found", "data": { "m": 1 } } },
  { "id": "err", "payload": { "error": "offline" } }
]
```

> [!WARNING] 被取消的请求是静默的
> 被取消的请求永远不会产生 message，连错误也没有，被替换的请求之后才到达的应答也会被忽略。如果你显示了加载指示器，不要等 `onError` 在 `cancel` 之后把它隐藏：请自己在执行取消的 handler 中把它隐藏。

plugin 有 `pending()`，即进行中的 id，以及 `settled()`，一个在没有任何请求进行中时 resolve 的 promise（用于服务端渲染）。

## router

**用途：**URL 和历史记录。应用以 message 的形式得知位置，并用 effect 修改它；它从不读取 `window.location`。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `listen` | `onChange` | 开始报告。立即用当前位置答复。 |
| `navigate` | `url`, `replace?`, `absolute?` | 前往 `url`。从被路由的子组件出发时，除非设置了 `absolute`，否则 url 相对于该子组件的 base。 |
| `back` | 无 | `history.back()` |
| `forward` | 无 | `history.forward()` |

```ts
init(): Effect[] {
  return [router.listen("route.changed")];
}

login(): Effect[] {
  return [router.navigate("/login", { replace: true })];
}
```

**回送：**`{ id: onChange, payload: { path, search, hash } }`。在 `https://example.com/users?page=2#top` 处，payload 是：

```json
{ "path": "/users", "search": "?page=2", "hash": "#top" }
```

它会在处理 `listen` 时、每次 `navigate` 之后（plugin 会自己 dispatch 一个 `popstate`，因为 `pushState` 不触发事件），以及用户后退或前进时发送。再次调用 `listen` 会替换监听器。`navigate` 只有在有活动的 `listen` 时才会报告。

plugin 不会对 URL 做这三部分之外的解析。匹配路由是 `routing` 表的工作，见 [路由](page:concepts-routing)。在 base 路径下，请给 `createRouterPlugin({ window })` 传入一个隐藏 base 的 window。

## time

**用途：**时钟、超时和间隔。应用代码不能调用 `Date.now()` 或 `setTimeout`，因为那会让它变得不纯。它向这个 plugin 索要，答案以 message 的形式回来。每个定时器都有一个 **id**，可以通过它重启或取消。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `now` | `replyTo` | 用当前时间答复。 |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | 在 `ms` 之后发送一次 `replyTo`。 |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | 每隔 `ms` 发送一次 `replyTo`。 |
| `cancel` | `id` | 停止定时器 `id`。 |
| `cancelAll` | 无 | 停止所有定时器。 |

```ts
typing(msg: Message): Effect[] {
  return [
    store.set("query", msg.event?.value ?? ""),
    time.setTimeout("search", 300, "searchFire", msg.event?.value),
  ];
}

searchFire(msg: Message): Effect[] {
  return [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })];
}
```

用已经在运行的 id 启动定时器，会**取消正在运行的那个**。这个例子是一个不带 state 的防抖：访客不停输入时，每次按键都会替换定时器，`searchFire` 在最后一次按键 300 毫秒之后到达。

**回送：**

| Effect | Message |
| --- | --- |
| `now` | `{ id: replyTo, payload: <ms since the epoch> }` |
| `setTimeout` | `{ id: replyTo, payload }` 一次；之后定时器被遗忘 |
| `setInterval` | 每次 tick 都发送 `{ id: replyTo, payload }` |

要给文档打上时间戳，就去索要时间，等答案到来时再完成工作：`save` 返回 `time.now("save.stamped")`，而 `"save.stamped"` 存储 `msg.payload`。这样，同样的 message 日志总是产生同样的 effect。

## logger

**用途：**控制台。应用代码是纯的，所以连日志也是 effect。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `log` | `message`, `level?`, `data?` | 写入一条记录。`level` 是 `debug`、`info`、`warn` 或 `error`，默认 `info`。 |

```ts
removed(msg: Message): Effect[] {
  return [log.info("user removed", { id: msg.payload }), log.warn("slow response", 2400)];
}
```

effector 有 `log.debug`、`log.info`、`log.warn`、`log.error` 和 `log.log(level, message, data)`。记录会交给 `console` 的对应方法，存在 `data` 时作为第二个参数。

**回送：**无。

主包中的 `withLogging(component, label)` 包装一个组件，并为它处理的每条 message 添加一条 `debug` 记录，其中包含 payload，以及它返回的 effect 的 plugin 和类型。它添加了一个 effect，所以必须注册 logger plugin。

```ts
createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
```

## ws

**用途：**按 **id** 管理的 WebSocket 连接。plugin 保存 socket；应用看到的是 message。

| Effect | 字段 | 含义 |
| --- | --- | --- |
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | 打开连接 `id`。 |
| `send` | `id`, `data` | 在连接 `id` 上发送。对象以 JSON 发送，字符串原样发送。 |
| `close` | `id`, `code?`, `reason?` | 关闭连接 `id`。 |

```ts
join(): Effect[] {
  return [
    ws.connect({ id: "chat", url: "wss://example.com/chat", onOpen: "opened", onMessage: "received", onClose: "closed", onError: "failed" }),
  ];
}

opened(): Effect[] {
  return [ws.send("chat", { text: "hi" })];
}
```

**回送：**

| 时机 | Message |
| --- | --- |
| 连接打开 | `{ id: onOpen }` |
| 收到一帧 | `{ id: onMessage, payload }`。是有效 JSON 的文本帧会被解析。 |
| 连接关闭 | `{ id: onClose, payload: { code, reason } }`；id 被遗忘 |
| 出错 | `{ id: onError }` |

用一个已打开连接的 id 去连接，会先关闭旧的连接，且不发送 `onClose` message。对没有连接的 id 执行 `send` 会**抛出异常**（`pavlus/ws: no connection "chat"`）。只在 `onOpen` 之后发送，如果需要知道连接状态，请在 state 中保留一个 `connected` 标志。

## effect 一览

七个 plugin 的全部 24 个 effect：

| Plugin | Effect | 字段 | 回送的 message |
| --- | --- | --- | --- |
| store | `set` | `path`, `value` | 无 |
| store | `merge` | `path`, `value` | 无 |
| store | `remove` | `path` | 无 |
| store | `undo` | `steps?` | 无 |
| store | `restoreTo` | `timestamp` | 无 |
| dom | `mount` | `target`, `view`, `onMounted?` | `onMounted` |
| dom | `unmount` | `target` | 无 |
| dom | `focus` | `selector` | 无 |
| dom | `blur` | `selector` | 无 |
| http | `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | `onSuccess` 或 `onError` |
| http | `cancel` | `id` | 无 |
| router | `listen` | `onChange` | `onChange` |
| router | `navigate` | `url`, `replace?`, `absolute?` | 监听器的 `onChange` |
| router | `back` | 无 | 监听器的 `onChange` |
| router | `forward` | 无 | 监听器的 `onChange` |
| time | `now` | `replyTo` | `replyTo` |
| time | `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` 一次 |
| time | `setInterval` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` 反复发送 |
| time | `cancel` | `id` | 无 |
| time | `cancelAll` | 无 | 无 |
| logger | `log` | `message`, `level?`, `data?` | 无 |
| ws | `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | 四个回调 |
| ws | `send` | `id`, `data` | 无 |
| ws | `close` | `id`, `code?`, `reason?` | `onClose` |

以及每个 plugin 中供测试替换的选项：

| Plugin | 选项 | 传入什么 |
| --- | --- | --- |
| store | `now`, `maxHistory` | 用于时间戳的计数器。 |
| dom | `document` | 一个 jsdom document。 |
| http | `fetch` | 一个假的 `fetch`；它只需要 `ok`、`status`、`statusText` 以及 `json()` 或 `text()`。 |
| router | `window` | 一个 jsdom window，或者一个隐藏 base 路径的包装。 |
| time | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | 一个假时钟，或者使用 `vi.useFakeTimers()`。 |
| logger | `sink` | 一个带有 `debug`、`info`、`warn` 和 `error` 并收集调用的对象。 |
| ws | `create` | 一个返回假 socket 的函数。 |

## ui-kit 自己的 plugin

框架没有用于 `localStorage`、随机数或 `<html>` 元素的 plugin，因为应用只是偶尔才需要它们。ui-kit，也就是你正在阅读的这个站点，有四个自己的 plugin。它们展示了应用专用 plugin 是什么样子。四个都在它的 `main.ts` 中注册：

```ts main.ts
export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    new DomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});
```

| Plugin | Effect | 字段 | 回送 |
| --- | --- | --- | --- |
| theme | `apply` | `look`, `vars`, `persist` | 无 |
| random | `int` | `max`, `replyTo` | `{ id: replyTo, payload: n }`，一个从 0 起、小于 `max` 的整数 |
| source | `load` | `path`, `onSuccess`, `onError` | `{ id: onSuccess, payload: { path, text } }`，或 `{ id: onError, payload: path }` |
| docs | `load` | `slug`, `lang`, `onSuccess`, `onError` | 带着完成页面的 `onSuccess`，或带着 slug 的 `onError` |
| docs | `run` | `template`, `state`, `onSuccess` | 带着编译并运行后的 demo 的 `onSuccess` |
| docs | `remember` | `lang` | 无 |

- **theme** 是唯一为了站点外观而接触 `<html>` 的代码：`dark` 或 `light` class、CSS 变量、`data-style` 属性，以及保存在 `localStorage` 中的选择。应用用一个纯函数计算这些变量，并返回 `themeEffector.apply(look)`。
- **random** 的存在，是因为 handler 不能调用 `Math.random()`。下一页 [编写自己的插件](page:plugins-custom) 会逐行解读它。
- **source** 为 Source 标签页加载页面的源码。文件通过 `import.meta.glob` 配合 `query: "?raw"` 被打包成懒加载的 raw 块，plugin 在标签页打开时加载其中一个。应用发出请求，以 message 的形式拿回文本，然后用一个纯函数把它切分成高亮的行。
- **docs** 让这套文档得以工作。`load` 获取页面的 Markdown 和该页面的 demo，按需加载编译器，编译 demo，并用完成的页面答复；`run` 为 playground 做同样的事；`remember` 保存语言。

每一个都遵循与内置 plugin 相同的形态：一个 effect 的类型、一个 effector、一个把外部世界作为参数的 `createXPlugin` 函数，以及通过 `ctx.dispatch` 的答复。

## 你学到了什么

- 七个 plugin 涵盖了 DOM、state、网络、URL、时间、控制台和 socket。每个 effect 都有固定的字段，大多数答复由 effect 自己命名。
- 带有 `id` 的东西（http 请求、定时器、连接）在 id 再次被使用时会被替换，并且可以被取消。这让你无需 state 就能实现防抖和“最新的获胜”。
- 只有 `store` 会改变 state。其他所有 plugin 都用 message 作答，预期中的失败也是 message。
- 应用专用的 plugin 是一个形态相同的小对象：一个 effect 类型、一个 effector 和一个 `handle`。

下一页：[编写自己的插件](page:plugins-custom)。
