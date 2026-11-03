---
summary: message 如何携带信息，以及它们如何找到自己的组件。message id、payload 和 event 字段，前缀如何把 message 路由到子组件，父组件如何启动和观察它的子组件，动态子组件，包装器 mapMessage、mapEffects 和 compose，以及一个带两个子组件的父组件的完整流程。
---
## message 是什么

message 是你的应用的输入。它是一个纯对象，最多有三个字段：

```ts
interface Message {
  id: string;
  payload?: unknown;
  event?: { type: string; value?: string; checked?: boolean; key?: string };
}
```

- **`id`** 说明发生了什么。它也是 handler 的名字：message `inc` 调用方法 `inc`。
- **`payload`** 是随之而来的数据。你在模板中选择它，或者由 plugin 设置，例如 HTTP 请求的响应。
- **`event`** 是浏览器事件的简短摘要，DOM plugin 会为来自页面的 message 添加它。它包含事件的 `type`，以及目标或事件拥有的 `value`、`checked` 和 `key`。它是数据，而不是浏览器事件本身，所以 message 保持可序列化，可以被记录和回放。

来自其他 plugin 的 message 没有 `event`。定时器发送 `{ id: "tick" }` 或你给它的 `payload`，完成的请求发送 `{ id: "loaded", payload: { status: 200, data } }`。

## 模板中的 message

模板不调用函数。事件属性只是给一条 message 命名。编译器把它变成数据，`diff` 就可以按值比较 handler。

::demo message-ids

看这个 demo 的 `vnodes` 部分（展开它）。`li` 上的点击带有 `id: "select"`，payload 是用户的 id。按钮上的点击带有 `id: "remove"` 和 `"stop": true`，因为写了修饰符 `.stop`。`.prevent` 修饰符的工作方式相同。这些正是 DOM plugin 将要变成 message 的对象。

参数的规则很简单。没有参数时，message 没有 payload。一个参数时，如 `select(u.id)`，这个参数就是 payload。多个参数时，如 `move(a, b)`，payload 是数组 `[a, b]`。参数是在模板 render 时针对 state 求值的表达式，这就是为什么你传的是 `u.id` 而不是整个用户：id 又小又稳定。

> [!TIP] 把身份放进 payload，把新值放进 event
> payload 用来表示*哪一个对象*（`remove(note.id)`），`msg.event.value` 用来表示*用户输入了什么*（`@input=setDraft`）。其余的一切，handler 都从 state 中读取。它永远不需要 DOM。

## message 对应的 handler

在类组件中，message 的 `id` 会被当作方法名来查找。handler 接收 message、state 和带有两个函数的上下文，并返回 effect 数组：

```ts
select(msg: Message, state: UsersState, ctx: ComponentCtx) {
  return [store.set("selectedId", msg.payload)];
}
```

上下文里有 `send(child, id, payload?)`，用来向子组件请求它的 effect，还有用于路由的 `setRoute(location)`。两者都是纯的：它们只调用其他 handler 并构造数据。没有 handler 的 message 不返回任何 effect。永远不会是 message 的名字以及默认的 handler，列在 [组件与状态](page:concepts-components) 中。

## 发给子组件的 message

一个界面常常由多个部分组成。仪表盘显示一个用户列表和一个任务列表，每个部分都有自己的 state 和逻辑。在 pavlus 中，每个部分是一个**子组件**，父组件一次性声明它的子组件，并给每个子组件一个名字。

**一个名字把一切联系起来。** 名字 `users` 出现在三个地方：

| 位置 | 这个名字的作用 |
| --- | --- |
| 父组件的模板 | `+Users#users(...)` 嵌入子组件的 view。`#users` 是实例名。 |
| 父组件类的 `children` | 键 `users` 把 message `users.*` 路由到子组件。 |
| state | `state.users` 是属于子组件的 state 片段。 |

要记住的规则是：模板里的 `users`、`children` 里的 `users`、state 里的 `users`。

### 前缀完成路由

发给子组件的 message，其 id 前面带有子组件的名字和一个点。父组件去掉它，把剩下的传下去：

1. message `users.select` 到达父组件。
2. 父组件查找名为 `users.select` 的自有 handler（下面会详述）。
3. id 以 `users.` 开头，而 `users` 是一个子组件，所以父组件用 message `select` 和子组件的 state 片段 `state.users` 调用子组件。
4. 子组件用 effect 作答。这些 effect 在返回途中会被改写。`store.set("selectedId", 2)` 变成 `store.set("users.selectedId", 2)`，因为 store 路径被放在了子组件的 `key` 之下。像 `onSuccess: "loaded"` 这样的答复 id 变成 `"users.loaded"`，所以答复会回到同一个子组件。

携带答复 id 的字段有 `replyTo`、`onSuccess`、`onError`、`onOpen`、`onMessage`、`onClose` 和 `onChange`。使用这些名字的 plugin 可以免费得到这套路由。

反方向也是自动的。子组件模板里的事件是带着前缀发送的：`Users` 中写着 `@click=select(u.id)` 的点击，会以 `users.select` 到达父组件。子组件的代码从不写前缀，也永远不知道自己的名字。**子组件看不到父组件。** 它只能看到自己的 state，以及父组件选择给它的 `props`。

### 父组件启动子组件

父组件常常需要在启动时让它的子组件开始工作。`ctx.send(name, id, payload?)` 返回子组件针对发给它的 message 所产生的 effect。它不 dispatch 任何东西。它用正确的 state 和前缀调用子组件的 handler，并把 effect 交还，所以你要从自己的 handler 中返回它们：

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

这些 effect 已经为子组件改写过了：对 `status` 的 `set` 变成对 `users.status` 的 `set`，HTTP 的答复 id 是 `users.loaded`。如果这个名字不是子组件，`send` 会抛出 `no child "name" to send "id" to`。

### 父组件观察子组件

在 message 被传给子组件之前，父组件针对同一个 id 的**自有** handler 会先运行。所以父组件可以通过一个使用完整的、带引号 id 的方法，来观察子组件中发生的事：

```ts
"users.select"(msg: Message, state: DashboardState) {
  const user = state.users.items.find((u) => u.id === msg.payload);
  return [store.set("selectedName", user ? user.name : "")];
}
```

对于一条 message，两个 handler 都会运行。父组件的 effect 排在列表前面，子组件的跟在后面。当 message 两边都没有触及时（既没有自有 handler，也没有子组件），组件会回退到默认行为，例如把 `navigate` 变成 router effect。

观察是单向的。子组件永远不知道父组件看过它。如果父组件必须*改变*子组件，它要通过 store 中子组件的 state，或者用 `send` 发送 message 来实现。

## 由 state 选择的子组件

有时子组件不是固定的。页面显示列表或表格，访客可以切换。子组件可以是 **state 中的一个值**。在模板中，动态 embed `+{expr}#name(...)` 渲染表达式给出的任何组件。在类中，`select` 取代 `component`，为 message 选出同一个组件：

```ts
children: Children<PageState> = {
  users: { select: (state) => state.usersComponent, key: "users" },
};
```

```pavlus
div.page
  +{usersComponent}#users(...users filter=filter)
```

当 `state.usersComponent` 中的值改变时，旧的 DOM 被移除，新模板从头开始 render。当它保持不变时，只运行子组件的 `diff`。如果 `select` 返回 `null` 或 `undefined`，那一刻就没有子组件：发给它的 message 被忽略，向它 `ctx.send` 也不返回任何 effect。

注意，子组件的 state 是片段 `state.users`，它在切换后依然保留。切换组件的那条 message 也应该重置这个片段。另外，state 中的组件不是 JSON，所以序列化的历史不会显示它。永远不要对组件值*内部*的路径执行 `store.set`，因为 store 会把类实例当作纯对象复制，从而丢失它的原型。

## 包装器：mapMessage、mapEffects、compose

组件归根到底是函数，`(message, state) => Effect[]`，所以你可以包装它们。包装器返回的是普通函数，它们同样是组件。它们从主包中导出。

```ts
import {
  compose,
  mapEffects,
  mapMessage,
  namespace,
  toHandler,
  withLogging,
} from "@service-laboratory/pavlus";

const counter = toHandler(new Counter());

const renamed = mapMessage(counter, (msg) =>
  msg.id === "bump" ? { ...msg, id: "inc" } : msg.id === "drop" ? null : msg,
);

const quiet = mapEffects(counter, (effects) =>
  effects.filter((effect) => effect.plugin !== "logger"),
);

const twice = compose(counter, counter);

const nested = namespace("c", counter, { key: "k" });

const logged = withLogging(counter, "counter");
```

- `mapMessage(inner, f)` 改变输入。`f` 接收 message 和 state，返回一条 message，或者返回 `null` 来丢弃它。这里 `bump` 被当作 `inc` 处理，`drop` 被忽略。
- `mapEffects(inner, f)` 改变输出。`f` 接收 effect、message 和 state，返回要使用的 effect。用它来过滤、添加或改写 effect。
- `compose(a, b, ...)` 让它们全部处理同一条 message，并把它们的 effect 拼接起来。上面的 `twice` 会把 `set` effect 返回两次。
- `namespace(prefix, child, { key, props })` 是 `children` 背后的基础原语。只有以 `c.` 开头的 id 能通过，子组件看到的是去掉前缀后的其余部分，它的 `store` 路径和答复 id 会被改写。如果 `inc` 执行 `store.set("n", state.n + 1)`，那么对于 `{ id: "c.inc" }` 和 state `{ k: { n: 5 } }`，结果是 `store.set("k.n", 6)`。
- `withLogging(inner, label)` 在这些 effect 之前放一个级别为 `debug` 的 `logger` effect。对于带一个 effect 的 `inc`，它显示为 `[counter] inc -> 1 effect(s)`，data 中包含 payload 以及以 `plugin.type` 表示的 effect 列表。

因为这些都是作用于函数的函数，它们可以相互组合，也可以与类组合：`compose` 在同一次调用中既接受类实例，也接受函数。

## 带两个子组件的父组件：完整流程

现在是完整的图景。仪表盘有一个过滤输入框、一个用户列表和一个任务列表。用户列表把过滤条件当作 prop 读取。父组件在启动时加载两个列表，并记录用户何时到达以及哪个用户被选中。

用户列表由一个模板和一个组件构成。模板读取子组件 state 的字段，以及 prop `filter`：

```pavlus users.pavlus
ul.users
  for u in items key u.id
    if !filter || u.name.includes(filter)
      li(class:selected={u.id === selectedId} @click=select(u.id)) {u.name}
```

```ts users.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./users.pavlus";

export interface User {
  id: number;
  name: string;
}

export interface UsersState {
  status: "idle" | "loading" | "failed";
  items: User[];
  selectedId: number;
  filter?: string;
}

export class Users extends Component<UsersState> {
  view = view;

  load() {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: User[] };
    return [store.set("items", reply.data), store.set("status", "idle")];
  }

  failed() {
    return [store.set("status", "failed")];
  }

  select(msg: Message) {
    return [store.set("selectedId", msg.payload)];
  }
}

export const users = new Users();
```

任务列表思路相同，只是多了一个复选框：

```pavlus tasks.pavlus
ul.tasks
  for t in items key t.id
    li(class:done=t.done)
      input(type="checkbox" checked=t.done @change=toggle(t.id))
      span {t.title}
```

```ts tasks.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./tasks.pavlus";

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export interface TasksState {
  items: Task[];
}

export class Tasks extends Component<TasksState> {
  view = view;

  load() {
    return [
      http.request({
        id: "tasks",
        url: "/api/tasks",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: Task[] };
    return [store.set("items", reply.data)];
  }

  toggle(msg: Message, state: TasksState) {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [store.set("items", items)];
  }
}

export const tasks = new Tasks();
```

父组件在 `children` 中声明两个子组件，并在它的模板中嵌入两者。下面的 demo 用的正是这些子模板。它的三个步骤每次只改变一个片段。看看 patch 的 id：`3/2#2` 表示子模板的节点 3，位于父组件中 id 为 2 的 embed 里，对应 key 为 2 的列表项。每个子组件都有自己的 id，所以 patch 永远不会冲突。

::demo dashboard

父组件的模板（demo 中的那个）保存为 `dashboard.pavlus`。它遵循名字的规则：`#users` 和 `#tasks` 既是 `children` 的键，也是 state 的字段。展开 `...users` 传入子组件的片段，`filter=filter` 加入输入框的值。输入框的事件属于父组件，没有前缀，而子组件内部的事件则以 `users.select` 和 `tasks.toggle` 出现。

```ts dashboard.ts
import {
  Component,
  type Children,
  type ComponentCtx,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { tasks, type TasksState } from "./tasks.ts";
import { users, type UsersState } from "./users.ts";
import view from "./dashboard.pavlus";

export interface DashboardState {
  filter: string;
  users: UsersState;
  tasks: TasksState;
  selectedName: string;
  usersLoaded: number;
}

export class Dashboard extends Component<DashboardState> {
  view = view;

  children: Children<DashboardState> = {
    users: {
      component: users,
      key: "users",
      props: (state) => ({ filter: state.filter }),
    },
    tasks: { component: tasks, key: "tasks" },
  };

  mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
    return [...send("users", "load"), ...send("tasks", "load")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.event?.value ?? "")];
  }

  "users.select"(msg: Message, state: DashboardState) {
    const user = state.users.items.find((u) => u.id === msg.payload);
    return [store.set("selectedName", user ? user.name : "")];
  }

  "users.loaded"(_msg: Message, state: DashboardState) {
    return [store.set("usersLoaded", state.usersLoaded + 1)];
  }
}

export const dashboard = new Dashboard();
```

使用一个立即作答的假 HTTP plugin，逐条 message 的运行过程如下：

```text
mounted       -> store.set, http.request, http.request
users.loaded  -> store.set, store.set, store.set
tasks.loaded  -> store.set
```

message `mounted` 由父组件处理。它返回对 `users.status` 的 `set` 和两个请求，都已经为它们的子组件加好了前缀。然后两个答复分别以 `users.loaded` 和 `tasks.loaded` 到达，各占一轮。对于 `users.loaded`，父组件的自有 handler 先运行，对 `usersLoaded` 做一个 `set`，随后子组件的 `loaded` 再加两个。这三个 `set` effect 在同一步里。两个子组件都不知道对方的存在。

> [!WARNING] 让三个名字保持一致
> 如果 `children` 中的键是 `users`，而模板写的是 `#user`，点击就会以 `user.select` 到达，没有子组件叫这个名字，这条 message 什么也不做。不会有任何错误，因为没人处理的 message 不算错误。当某个子组件看起来没有反应时，先对比这三个名字。

## 你学到了什么

- message 是 `{ id, payload?, event? }`。模板创建 id 和 payload，DOM plugin 添加 `event`，一个参数就是 payload，多个参数则组成数组。
- 同一个名字把模板 embed（`#users`）、`children` 的键和 state 片段联系在一起。前缀 `users.` 把 message 路由到子组件，子组件看到的是去掉前缀后的 message。
- 子组件的 effect 在返回途中被改写：store 路径加上 `key`，答复 id 加上前缀。子组件永远看不到它的父组件。
- 父组件用 `ctx.send` 启动子组件，用带引号的 handler（如 `"users.select"`）观察它，这个 handler 先于子组件运行。用 `select` 选出且返回 `null` 的子组件会被忽略。
- `mapMessage`、`mapEffects`、`compose`、`namespace` 和 `withLogging` 包装组件，并返回函数。

下一页：[路由](page:concepts-routing)。
