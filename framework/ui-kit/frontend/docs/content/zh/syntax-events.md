---
summary: 把点击、输入和表单提交连接到你的代码。学习 @event=message(args) 语法、payload、prevent 和 stop 修饰符、message 如何得到它的 id，以及编译后的模板里到底有什么。
---
## 事件就是数据

只显示数值的页面只是一份文档。要让它能交互，模板必须表达“当用户做了这件事，通知应用”。在 pavlus 中，这通过**事件绑定**完成，而被发送的东西不是函数。它是一条 *message*：一小块带 id 和可选 payload 的纯数据。

事件绑定是名字以 `@` 开头的属性。`@` 之后的部分是 DOM 事件（`click`、`input`、`submit`、`keydown` 等）。值是要发送的 message 的 id。

::demo click open=vnodes

看这些 vnode：`render` 结果中的按钮元素带有 `events: { click: { id: "save" } }`。里面没有函数。模板不知道 `save` 做什么。它只表明这次点击对应哪条 message。你的应用有 `save` 的 handler，由它决定 state 中要改变什么。

这样设计是有原因的。只是数据的 virtual node 可以被比较、记录、保存和回放。模板始终是 state 的纯函数，所有逻辑集中在一处，即组件里，在那里很容易测试。

## 随 message 发送一个值

大多数事件需要说明点击的是*哪一个*。绑定可以写得像带**参数**的调用。参数是普通的 [表达式](page:syntax-expressions)，在模板 render 时针对 state 求值。结果作为 **payload** 随 message 一起传递。

::demo payload open=vnodes

Remove 按钮携带 `{ id: "remove", payload: 1 }`：即 render 时 `item.id` 的值。用户点击时，`remove` 的 handler 收到这个 payload，就知道要删除哪一项。

看第一步。当 `item.id` 从 1 变成 2 时，`diff` 返回一个操作为 `handler` 的 patch：

```text
{"op":"handler","id":"3","event":"click","msg":{"id":"remove","payload":2}}
```

监听器已经在真实的 DOM 元素上了。这个 patch 只是替换监听器将要发送的 message。在第二步中标题变了，payload 没变，唯一的 patch 是文本的那个。

### 多个参数

只有一个参数时，payload 就是那个值。有两个或更多参数时，payload 是按顺序排列的它们的**数组**。

::demo several-args

这里的 payload 是 `[5, "up", 1]`。没有参数或括号为空时，根本没有 payload，所以 `@click=save` 和 `@click=save()` 是一样的。

::demo empty-parens

> [!NOTE] 一个值，还是一个数组
> payload 的形状取决于你写了多少个参数：一个参数得到那个值，两个或更多则得到数组。如果你打算以后再添加第二个参数，请记住 handler 必须从 `msg.payload` 改成 `msg.payload[0]`。很多作者因此只发送单个值，或在 state 中构造好的单个对象。

## handler 处可以写什么

括号之前的部分是 **message id**。它是一个名字，或是用点连接的多个名字：

::demo dotted

这里的 id 是 `users.open`。带点的 id 适合给 message 分组，组件前缀的工作方式也依赖它（见下文）。

编译器只接受一个名字，或一串名字，后面可以跟一次调用。其他写法都是错误：

```pavlus-invalid
button(@click=ready ? start : stop) Go
```

这个会在属性解析器中失败：`Unexpected "?" in attributes (line 1, col 21)`，因为裸值在第一个空格处结束。用花括号包起来后，它会通过这一关，到达下一个检查，得到这样的信息：

```pavlus-invalid
button(@click={ready ? start : stop}) Go
```

```text
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

对于 `@click=items[0]` 以及调用的调用 `a.b(1)(2)`，显示同样的信息。完全没有值的绑定 `button(@click)` 会提示 `"@click" needs an expression value`。

## 修饰符：prevent 和 stop

浏览器会自己做一些事情。点击链接会跳转到该链接。提交表单会刷新页面。点击还会向上冒泡到元素的父级，它们的 handler 也会运行。你常常想把这些关掉。

你可以用**修饰符**做到这一点，写在事件名之后，用点分隔：

| 修饰符 | 作用 |
| --- | --- |
| `.prevent` | 对 DOM 事件调用 `preventDefault()`：不跟随链接，不提交表单 |
| `.stop` | 调用 `stopPropagation()`：父级的监听器看不到该事件 |

它们可以任意顺序组合：`@click.prevent.stop=openHelp`。

::demo modifiers open=vnodes

看这些 vnode。修饰符不是事件名的一部分。它们是 message 上的两个标志，`prevent: true` 和 `stop: true`。DOM plugin 在事件发生时读取它们，调用相应的 DOM 方法，然后才发送 message。所以这里页面同样只是纯数据。

编译器不认识的修饰符会被静默忽略：`@click.foo=save` 与 `@click=save` 相同。当表单仍然刷新页面时，请检查 `.prevent` 的拼写。

> [!WARNING] 同一事件的多个绑定
> 一个元素可以有许多不同的事件（`@input`、`@keydown`、`@focus`），但每个事件名只能有一个绑定。如果你在同一个元素上写了两次 `@click`，最后一个生效，第一个会被丢弃，且没有错误。

::demo many-events

## handler 收到什么

用户点击时，DOM plugin 会向你的应用发送一个带三个字段的 message 对象：

| 字段 | 值 |
| --- | --- |
| `id` | message id，前面带有被嵌入组件的前缀 |
| `payload` | 模板中的 payload，或 `undefined` |
| `event` | DOM 事件的一个小快照 |

快照 `msg.event` 是浏览器信息渗入你的逻辑的唯一地方，而且它刻意做得很小：`type`（事件名）、`value`（元素的 `value`，当它是字符串时）、`checked`（用于复选框）和 `key`（用于键盘事件）。这对表单已经足够。

组件是一个类。**每个方法是同名 message 的 handler。** handler 是纯的：它接收 message 和当前 state，并返回一个 effect 列表，例如“在 store 中设置这个路径”。

```ts todo.ts
import {
  Component,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todo.pavlus";

interface State {
  text: string;
  tasks: { id: number; title: string }[];
}

class Todo extends Component<State> {
  view = view;

  setText(msg: Message) {
    return [store.set("text", msg.event?.value ?? "")];
  }

  remove(msg: Message, state: State) {
    return [
      store.set(
        "tasks",
        state.tasks.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}
```

这个组件的模板里有 `input(value=text @input=setText)` 和 `button(@click=remove(task.id))`。名字与方法名一致。没有方法的 message 不是错误：什么也不会发生，也不返回任何 effect。这使得 message id 中的拼写错误悄无声息，所以请通过点击页面来测试。

输入框里显示的 state 只是一个种子。浏览器保留用户输入的内容。`@input` handler 把它复制到 state，由 state 让应用的其余部分保持最新。

## 循环中的事件

`for` 循环内部的事件是最常见的情形。payload 告诉 handler 点击的是哪一项。

::demo in-loop open=vnodes

每个任务都有自己的一对按钮，各自的 payload 是其任务的 `id`：第一个是 10，第二个是 20。`toggle` 只有一个 handler，而不是每行一个函数，并且对任意行数都有效。第二个按钮上的 `.stop` 阻止点击到达列表项（如果该列表项有自己的 handler 的话）。

为什么用 `task.id` 而不是任务在列表中的位置？列表变化时位置会变，但 id 不会。携带 id 的 message 始终表示同一个任务。另见 [下一页](page:syntax-control-flow) 中关于 `key` 的内容。

## message id 的前缀从哪里来

当一个模板通过 `+Name#instance` 嵌入另一个模板时，被嵌入的模板是一个单独的文件，有自己的 message：它写 `@click=pick(id)`，并不知道谁会使用它。父级给每个被嵌入的实例一个**名字**，编译器把这个名字和一个点放在从它发出的每个 message id 之前。

::demo with-component open=vnodes

`Row` 模板发送 `pick`。两个实例名为 `first` 和 `second`，所以 message 是 `first.pick` 和 `second.pick`。`Reset` 按钮属于父级，没有前缀。生成的模块展示了它的工作方式：

```ts
ulChildren.push(...Row.render(
  { "id": 1, "label": "One" },
  idSuffix + "/1",
  messagePrefix + "first.",
  childEnv(env, "first", state),
));
```

每个编译后的 view 都有一个参数 `messagePrefix`。顶层 view 得到的是空串。embed 传入 `messagePrefix + "first."`，每个事件都写成 `id: messagePrefix + "pick"`。如果 `Row` 自己又嵌入了别的东西，前缀会再多一个名字：`first.cell.pick`。子级不需要了解它的父级，所以同一个模板可以放在任何地方。

如果你不写 `#name`，名字就是导入的名字，首字母小写：

::demo default-name

第一个 embed 发送 `userCard.open`，第二个带 `#admin`，发送 `admin.open`。对于被嵌入多次的模板，请使用显式的名字，这样才能区分各个实例的 message。

在应用一侧，前缀被用来把 message 向下发送给正确的子组件，也让父级可以通过一个名字带引号的 handler 来观察其子级的 message，例如 `"first.pick"(msg) { ... }`。这在 [组件](page:concepts-components) 和 [消息](page:concepts-messages) 中有介绍。

## 什么保持不变，什么会变

比较一下本页中见过的两种情形。不带参数的绑定（`@click=save`）在 vnode 中，其元素上没有 `id`，因为它的任何内容都不可能改变，所以 `diff` 永远不需要找到它。

::demo static-event

当 `busy` 改变时，只产生 class 的 patch。事件绑定根本不被查看。带参数的绑定则不同：编译器会记住元素的 id，当 `diff` 发现 payload 不同时，就发出一个 `handler` patch。绑定、属性和文本都不可能改变的节点，在更新时不花任何代价。

## 组合起来

一个带输入框的小列表，用到了你见过的内容。模板如下，你可以在 [在线实验场](page:compiler-playground) 中试验相同的结构：

```pavlus
section.todo
  form(@submit.prevent=add)
    input(type="text" placeholder="New task" value=text @input=setText)
    button(type="submit") Add
  ul
    for task in tasks key task.id
      li(class:done=task.done)
        input(type="checkbox" checked={task.done} @change=toggle(task.id))
        span {task.title}
        button(type="button" @click.stop=remove(task.id)) x
```

从上往下读这些事件：

- `@submit.prevent=add` 阻止浏览器刷新页面，然后发送 `add`。handler 从 state 中读取文本，因为 `@input=setText` 在每次按键时都在把文本复制到那里。
- `@input=setText` 发送 `setText`，并带有 `msg.event.value`。
- `@change=toggle(task.id)` 发送 `toggle`，并带有任务的 id。handler 也可以读取 `msg.event.checked`。
- `@click.stop=remove(task.id)` 发送 `remove` 并带有 id，同时阻止点击冒泡。

这里有四个 message id 和三个 payload，模板里没有一个函数。

## 你学到了什么

- `@event=name(args)` 发送的是 message，而不是函数。一个参数就是 payload，多个参数组成数组，没有参数则没有 payload。
- `.prevent` 和 `.stop` 是 message 上的标志；DOM plugin 先应用它们，然后发送 message。
- handler 是以 message id 命名的组件方法；它接收 `msg.id`、`msg.payload` 和一个很小的 `msg.event`（`type`、`value`、`checked`、`key`）。
- 被嵌入的模板在发送 message 时，以实例名作为前缀：`first.pick`。
- 当 payload 改变时，`diff` 返回一个 `handler` patch；不带参数的绑定永远不会被打 patch。

下一页：[条件与循环](page:syntax-control-flow)。
