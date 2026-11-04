---
summary: 组件如何工作。函数组件与类组件，唯一的 state 树以及 store.set 如何到达它，模板如何读取 state，view 字段，props，mounted、enter 和 leave message，为什么实例是共享的，以及 handler 命名规则。最后是一个完整的 todo 组件。
---
## 组件是什么

pavlus 中的组件是一段回答 message 的逻辑。给定一条 message 和当前 state，它返回一个 effect 列表。它还可以有一个 **view**：显示 state 的、编译后的模板。除此之外不需要别的东西。没有 render 方法，没有生命周期类，也没有 hook。

组件有两种形式。可以是**一个函数**：

```ts
import { type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";

interface CounterState {
  count: number;
}

export const counter = (msg: Message, state: CounterState) => {
  switch (msg.id) {
    case "inc":
      return [store.set("count", state.count + 1)];
    case "dec":
      return [store.set("count", state.count - 1)];
    default:
      return [];
  }
};
```

也可以是**一个继承 `Component` 的类的实例**。每个方法是同名 message 的 handler，所以 `switch` 就消失了：

```ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./counter.pavlus";

interface CounterState {
  count: number;
}

class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }

  dec(_msg: Message, state: CounterState) {
    return [store.set("count", state.count - 1)];
  }
}

export const counter = new Counter();
```

两种形式做同样的事，`createApp({ app })` 都接受。区别在于类形式能容纳什么。函数没有 `view`，所以不能用 `createApp({ mount })` 渲染：core 会抛出 `mount needs an app that is a component with a view`。它也没有 `children` 和 `routing`。小型的纯逻辑和包装器用函数，所有显示在屏幕上的东西用类。

类必须**以实例的形式传入**。`createApp({ app: Counter })` 会抛出错误：`Counter is a class: pass an instance (new Counter()), not the class`。带方法的普通对象，或没有继承 `Component` 的类，同样会被拒绝，错误信息会告诉你该怎么写。

## state 树

应用只有**一个 state**：一个由 store plugin 持有的纯对象。每个组件都从它读取，没有一个组件拥有私有副本。小型应用把所有字段放在顶层。较大的应用则把它们分成多个分支，例如 `state.users` 和 `state.tasks`，每个子组件一个分支。

state 是一棵纯数据的树。它可以包含字符串、数字、数组和对象。它应该容易打印和比较。唯一的例外是组件值：`+{expr}` 嵌入（见 [消息与子组件](page:concepts-messages)）可以从 state 中读取组件，但这时 state 就不再是 JSON 了。

handler 从不修改 state。它返回一个 effect，由 store plugin 构建新的 state 对象。我们来看 store effect 能做什么。每个 effect 都有一个 `path`，可以写成用点连接的字符串（`"user.name"`），也可以写成数组（`["items", 3, "done"]`）。数组路径中的数字表示数组下标。

| Effect | 构造器 | store 的行为 |
| --- | --- | --- |
| `set` | `store.set(path, value)` | 把 `value` 放到 `path`，并创建缺失的父级。 |
| `merge` | `store.merge(path, object)` | 把 `object` 的字段浅合并到 `path` 处的对象中。 |
| `remove` | `store.remove(path)` | 删除该字段。数组元素会被剪除。 |
| `undo` | `store.undo(steps?)` | 撤销最近 `steps` 次变更（默认一次）。 |
| `restoreTo` | `store.restoreTo(timestamp)` | 撤销该时间之后记录的所有变更。 |

store 只改变路径上的分支。其他分支上的对象保持原有标识，所以设置 `state.users.status` 时，读取 `state.tasks` 的模板看不到任何变化。再次写入相同的值不会改变任何东西，也不会被记录。每次变更都保存了它自己的逆操作，`undo` 就是这样在没有快照的情况下工作的。

## state 如何到达模板

模板不接收 props，也不接收上下文。它读取的是 **state 对象**。表达式中的标识符是 state 的字段，或者是循环变量。在 `p Hello, {user.name}` 中，`user` 就是 `state.user`。

::demo state-and-template

这个 demo 展示了双方。模板读取两个字段，`user` 和 `unread`。当 `unread` 从 3 变成 4 时，编译后的 `diff` 为那个段落返回一个 `text` patch。这就是组件与模板之间的全部关系：**handler 写 state，模板读 state。** 两者不互相调用。

这决定了你如何设计 state。模板可以用表达式做一些小事：比较、相加、判断是否为空、调用 `includes` 这类方法。它不能运行任意代码，因为表达式是 JavaScript 的一个小型纯子集。任何需要真正计算的东西，比如未完成任务的数量、排序后的副本或格式化后的日期，都在 handler 中算出，再作为字段保存。本页末尾的 todo 例子就用 `left` 这样做。

## view

字段 `view` 保存组件的模板，它是 `.pavlus` 文件的默认导出：

```ts
import view from "./todos.pavlus";

class Todos extends Component<TodoState> {
  view = view;
}
```

view 是 `{ render, diff, meta }`：由编译器生成的两个纯函数。`createApp({ app, mount })` 把 `app.view` 渲染到元素 `mount` 中，DOM plugin 让它保持最新。子组件的 view 通过 embed（`+Child#name`）放进父组件的模板。没有 view 的组件也可以：它只有逻辑，例如一个父组件与之通信但不显示的子组件。

`viewOf(component)` 返回与其组件绑定在一起的 view。正是这一点让 `+outlet` 和被嵌入的子组件能找到该组件的 `routing` 和 `children`。你很少自己调用它，因为 `mount` 和测试辅助函数 `mountView` 会替你调用。

## Props

父组件可以通过 `props` 给子组件**只读的输入**。它是一个从父组件 state 到对象的函数，这个对象会被合并进子组件的 state：

```ts
children: Children<DashboardState> = {
  users: {
    component: users,
    key: "users",
    props: (state) => ({ filter: state.filter }),
  },
};
```

子组件看到的是 `{ ...state.users, filter }`。在它的 handler 和模板中，`filter` 就是一个普通字段。有两条规则很重要。props 在子组件自己的那份 slice **之后**合并，所以 prop 会覆盖同名的字段。并且 prop 只是输入：子组件不能写它。子组件中的 `store.set("filter", ...)` 会写入父组件 state 里的 `users.filter`，那是另一个位置。[消息与子组件](page:concepts-messages) 一页展示了完整的接线。

## 生命周期：mounted、enter 和 leave

Pavlus 没有生命周期方法。框架在三个时刻发送的是 **message**，和其他事件一样。组件用同名方法处理它们，并返回 effect。

| Message | 何时发送 | 谁会收到 |
| --- | --- | --- |
| `mounted` | 应用进入 DOM 之后发送一次。它是用 `mount` 创建的应用的第一条 message。 | 根组件。对于由 `dom.mount` effect 挂载的 view，你可以用它的 `onMounted` 选项选择 message。 |
| `enter` | 一个路由子组件变为活动状态，或者叶子页面自己的路由发生变化（例如 `/items/5` 变为 `/items/7`）。payload 是该子组件的路由。 | 路由子组件，作为 `enter`。 |
| `leave` | 一个路由子组件不再活动。payload 是它原来所在的路由。 | 路由子组件，作为 `leave`。 |

`mounted` 是应用开始工作的地方：加载数据、启动定时器、监听 router。嵌入了子组件的父组件用 `ctx.send` 启动它们：

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

`enter` 和 `leave` 属于路由。页面在进入时加载数据，在离开时停止定时器：

```ts
class Tasks extends Component<TasksState> {
  enter() {
    return [store.set("status", "loading")];
  }

  leave() {
    return [store.set("status", "idle")];
  }
}
```

如果一个带有 `routing` 的组件没有自己的 `mounted`，默认的 `mounted` 会返回 `router.listen("routeChanged")`，而默认的 `routeChanged` 会调用 `ctx.setRoute`，它保存路由，并为受这次变化影响的每个路由子组件返回 `leave` 和 `enter` effect。最深的子组件先 leave，新的子组件自上而下 enter。参见 [路由](page:concepts-routing)。

> [!NOTE] 目前还没有模板 hook
> 模板不能在它的节点出现或消失时发送 message。设计笔记把这一项列为尚未实现。目前父组件用 `ctx.send` 显式启动子组件，路由页面则使用 `enter`。

## 一个实例，被每条 message 共享

组件只创建一次，`export const todos = new Todos()`，之后处理应用的每一条 message。core 甚至为每个实例缓存一个 handler 函数。所以实例必须**不持有可变 state**。如果 handler 做了 `this.count++`，这个数字会在 message 之间保留，测试无法预测它，而在服务端它还会被所有请求共享。state 属于 store，作为参数传入。

```ts
class Bad extends Component<{ n: number }> {
  calls = 0;

  inc(_msg: Message, state: { n: number }) {
    this.calls++;
    return [store.set("n", state.n + this.calls)];
  }
}
```

和下面这个版本比较一下：所有会变化的东西都在 state 里。handler 只根据它的参数计算新值。

```ts
class Good extends Component<{ n: number }> {
  inc(_msg: Message, state: { n: number }) {
    return [store.set("n", state.n + 1)];
  }
}
```

不可变的配置没有问题。handler 中的 `this` 就是组件，所以构造函数配置可以用：`new UsersList(20)` 可以保存每页条数。子类可以覆盖 handler 并调用 `super`。Pavlus 并不禁止可变字段。这是作者的责任，和所有纯净性一样。

## handler 命名规则

core 按 message id 查找 handler：即实例上同名的方法。下面这些规则决定哪些算数。

- id 没有对应方法的 message 得到一个空的 effect 列表，而不是错误。模板中的拼写错误不会有任何提示，所以要检查名字。
- handler 必须返回数组。否则 core 会抛出 `handler "x" must return an array of effects`，并附上 handler 的名字。
- **永远不会是 message 的名字：** `view`、`children`、`routing`、`dispatch`、每个以 `_` 开头的名字、每个 `#private` 成员，以及对象默认拥有的一切（`toString`、`constructor`、`hasOwnProperty`……）。id 为 `view` 或 `_left` 的 message 永远不会调用任何东西。
- 对于从 handler 中调用的辅助方法，使用 `_name`。`this._left(items)` 可以工作，而 message `_left` 永远到不了它。
- handler 可以是值为函数的类字段。`load: Handler<S> = (msg, state, ctx) => [...]` 会像方法一样被找到，并且能给 TypeScript 提供参数类型。
- 带点号的 message id 需要带引号的方法名：`"users.remove"(msg) { ... }`。父组件就是这样观察它的子组件的，下一页会展示。

有两条 message 在没人处理时有默认行为。最后一段是 `navigate` 的 message（如 `navigate` 或 `header.navigate`），如果 payload 是字符串，就变成 `router.navigate(url)`。而在带有 `routing` 的组件中，`mounted` 和 `routeChanged` 负责 router 的接线。同名的 handler 会替换默认行为。

## 完整示例：todo 组件

最后一个例子把各部分放在一起：带表单、过滤器和列表的 view；带草稿、条目和未完成任务计数的 state；以及让派生字段 `left` 保持正确的 handler。

::demo todo

模板读取 `draft`、`filter`、`items` 和 `left`。复选框发送带条目 id 的 `toggle`，按钮发送 `remove`，过滤按钮发送带字符串的 `setFilter`。在 demo 中，第一步切换条目 1：`li` 的 class、复选框的 `checked` 属性和计数器的文本都发生变化。第二步改变过滤器，于是两个过滤按钮的 class 改变，已完成的条目从列表中被清除。

下面是组件。注意只有一个地方 `_left` 知道如何计数，并且每个改变 `items` 的 handler 都会同时返回它的结果。

```ts todos.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./todos.pavlus";

export interface Item {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  draft: string;
  filter: "all" | "open";
  items: Item[];
  nextId: number;
  left: number;
}

export class Todos extends Component<TodoState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.payload)];
  }

  add(_msg: Message, state: TodoState) {
    const text = state.draft.trim();
    if (text === "") return [];
    const items = [...state.items, { id: state.nextId, text, done: false }];
    return [
      store.set("items", items),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
      this._left(items),
    ];
  }

  toggle(msg: Message, state: TodoState) {
    const items = state.items.map((item) =>
      item.id === msg.payload ? { ...item, done: !item.done } : item,
    );
    return [store.set("items", items), this._left(items)];
  }

  remove(msg: Message, state: TodoState) {
    const items = state.items.filter((item) => item.id !== msg.payload);
    return [store.set("items", items), this._left(items)];
  }

  _left(items: Item[]) {
    return store.set("left", items.filter((item) => !item.done).length);
  }
}

export const todos = new Todos();
```

因为组件是纯的，它的测试很短，也不需要浏览器：

```ts todos.test.ts
import assert from "node:assert/strict";
import { toHandler } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { todos, type TodoState } from "./todos.ts";

const handle = toHandler(todos);
const state: TodoState = {
  draft: "Write docs",
  filter: "all",
  items: [],
  nextId: 1,
  left: 0,
};

assert.deepEqual(handle({ id: "add" }, state), [
  store.set("items", [{ id: 1, text: "Write docs", done: false }]),
  store.set("nextId", 2),
  store.set("draft", ""),
  store.set("left", 1),
]);

assert.deepEqual(handle({ id: "add" }, { ...state, draft: "  " }), []);
assert.deepEqual(handle({ id: "_left" }, state), []);
```

最后一行展示了命名规则的作用：辅助方法 `_left` 无法被 message 触达。

## 你学到了什么

- 组件是一个函数，或是继承 `Component` 的类的实例。在类中，每个方法处理与它同名的 message。传入实例，而不是类。
- state 是 store 中的一棵树。handler 返回带路径的 `store.set`、`merge` 或 `remove` effect，模板按名字读取 state。
- `view` 是编译后的模板，`props` 是来自父组件的只读输入，`mounted`、`enter` 和 `leave` 是在合适时刻发送的普通 message。
- 实例被每条 message 共享，所以不要让它持有可变 state。在 handler 中计算派生值并保存起来。
- 永远不会是 message 的名字：`view`、`children`、`routing`、`dispatch`、`_private` 和 `#private`，以及每个对象都有的那些。

下一页：[消息与子组件](page:concepts-messages)。
