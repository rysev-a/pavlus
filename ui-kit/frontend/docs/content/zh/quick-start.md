---
summary: 从一个空文件夹开始，构建一个可运行的计数器，再构建一个带输入框的小笔记列表。然后逐条 message 跟踪一次点击如何穿过整个框架，并查看它产生的 patch。
---
## 你将构建什么

你将构建两个小程序。第一个是计数器：一个段落和一个按钮。第二个是带文本输入框的笔记列表。两者合起来用到了 pavlus 应用的每一个部分：模板、带 handler 的组件类、保存 state 的 store，以及显示结果并监听事件的 DOM plugin。

最后，你会一条 message 一条 message 地跟踪一次点击如何穿过框架，并准确看到它改变了页面的什么地方。

你需要 Node.js 和一个包管理器。代码是 TypeScript，但下面只用到基本的类型。

## 搭建项目

pavlus 项目就是一个普通的 [Vite](https://vite.dev) 项目，外加一个 plugin。这个 plugin 会在你导入每个 `.pavlus` 文件时把它编译成 JavaScript。先写 `package.json`。框架的包名是 `@service-laboratory/pavlus`。

```json package.json
{
  "name": "counter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "^8.3.5"
  }
}
```

Vite 配置里加上 pavlus plugin。它有一个可选设置 `runtime`，用来改变编译后的模板从哪里导入它们的小辅助函数。现在你用不到它。

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default { plugins: [pavlus()] };
```

页面只有一个空元素（应用会去填充它）和一个脚本。

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

TypeScript 需要知道 `import view from "./counter.pavlus"` 返回什么。一个声明文件就够了，框架已经自带。

```ts env.d.ts
/// <reference types="@service-laboratory/pavlus/env" />
```

## 第一个模板

创建 `counter.pavlus`。模板是一棵缩进的元素树。`{count}` 是一个读取 state 字段 `count` 的表达式。`@click=inc` 表示点击按钮时发送 id 为 `inc` 的 message。

```pavlus counter.pavlus
div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me
```

注意这里没有什么。没有在点击时运行的函数。模板只是给 message 起了个名字。这条 message 会发生什么，由别处决定，那里的代码可以单独测试。

## 组件

创建 `counter.ts`。组件是一个继承 `Component` 的类。它的字段 `view` 就是模板。其他每个方法都是同名 message 的 **handler**，所以方法 `inc` 处理 message `inc`。

handler 接收 message 和当前 state，返回一个 effect 列表。这个 handler 只返回一个 effect，由 store plugin 的辅助函数 `store.set` 构造：“把字段 `count` 设为旧值加一”。

```ts counter.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./counter.pavlus";

export interface CounterState {
  count: number;
}

export class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }
}

export const counter = new Counter();
```

> [!TIP] 给参数加上类型注解
> TypeScript 不会推断类方法的参数类型。请自己写出 `msg: Message` 和你的 state 类型。第一个参数常常用不到，可以命名为 `_msg`。

## 启动应用

创建 `main.ts`。`createApp` 把组件与它的 plugin 连接起来。现在你需要两个 plugin。**store** plugin 保存 state，初始值就是你给它的对象。**DOM** plugin 渲染 view，并把浏览器事件变成 message。选项 `mount` 指定要渲染进哪个元素。

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { counter, type CounterState } from "./counter.ts";

createApp<CounterState>({
  app: counter,
  plugins: [createStorePlugin<CounterState>({ count: 0 }), createDomPlugin()],
  mount: "#app",
});
```

运行 `npx vite`，打开它打印出的地址，然后点击按钮。数字会增加。下面是同一个模板的在线 demo，其中有编译器的 `diff` 对前两次点击返回的两个 patch：

::demo counter

每次点击只产生一个 `text` 类型的 patch。它按 id 指明节点，并给出新的文本。页面中的其他内容都没有被触碰，因为没有别的节点读取 `count`。

> [!NOTE] state 从哪里来
> 第一个 state 就是你传给 `createStorePlugin` 的对象。模板读取的每个字段都必须在其中，否则模板会读到 `undefined`。store 保存的是一个纯对象，handler 从不修改它。它们返回 `set` effect，由 store 生成新对象。

## 跟踪一次点击

现在是前面承诺的导览。下面按顺序列出从点击到文本变化之间发生的一切。每一行都是 `createApp` 的一个真实步骤。

1. **启动。** `createApp` 初始化各个 plugin，把 view 渲染到 `#app` 中，并 dispatch message `{ id: "mounted" }`。计数器没有 `mounted` handler，所以它不返回任何 effect。
2. **点击。** DOM plugin 在按钮上放了一个监听器。它读取模板给这个按钮的 message `{ id: "inc" }`，加上浏览器事件的摘要，然后 dispatch `{ id: "inc", event: { type: "click", value: "" } }`。`value` 是按钮的 value 属性，即一个空字符串。
3. **队列。** core 把 message 放进它的队列。message 一次处理一条。
4. **handler。** core 用 message 和当前 state `{ count: 0 }` 调用你的代码。方法 `inc` 返回 `[{ plugin: "store", type: "set", path: "count", value: 1 }]`。
5. **effect。** core 把这个 effect 交给其中指明的 plugin，即 `store`。store 构造出新的 state `{ count: 1 }`。
6. **state 变了。** core 再次读取 state。它是另一个对象，所以每个 plugin 都会收到 `onState(next)`。
7. **diff。** DOM plugin 调用 view 的 `diff(prev, next)`。结果是一个 patch：`{ op: "text", id: "2", text: "Clicked 1 times" }`，plugin 把这段文本设置到 id 为 `2` 的节点上。

整条链路的中间都是纯数据：一条 message、一个 effect 列表、一个 patch 列表。你可以把其中任何一个打印出来。

## 带输入框的列表

第二个程序需要用到更多语言特性。它有一个文本输入框、一个添加笔记的表单，以及一个每条笔记都带删除按钮的列表。它也需要更多 state：正在输入的文本、笔记列表，以及一个给每条笔记分配 id 的计数器。

::demo notes-list

把这个模板保存为 `notes.pavlus`（demo 中显示了它的源码）。从头往下读。`input(value=draft ... @input=setDraft)` 显示字段 `draft`，并在每次按键时发送 `setDraft`。`form(@submit.prevent=add)` 在表单提交时发送 `add`，`.prevent` 阻止浏览器刷新页面。循环 `for note in notes key note.id` 重复生成 `li`，而 `key` 让 `diff` 在列表变化时分得清哪条是哪条。`@click=remove(note.id)` 发送 message `remove`，并以该笔记的 id 作为 **payload**。

组件跟随模板，每个 message 一个 handler：

```ts notes.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./notes.pavlus";

export interface Note {
  id: number;
  text: string;
}

export interface NotesState {
  draft: string;
  notes: Note[];
  nextId: number;
}

export class Notes extends Component<NotesState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: NotesState) {
    const text = state.draft.trim();
    if (text === "") return [];
    return [
      store.set("notes", [...state.notes, { id: state.nextId, text }]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  remove(msg: Message, state: NotesState) {
    return [
      store.set(
        "notes",
        state.notes.filter((note) => note.id !== msg.payload),
      ),
    ];
  }
}

export const notes = new Notes();
```

有三点值得细看：

- `setDraft` 读取 `msg.event?.value`。DOM plugin 会给每条来自页面的 message 附上 `event`，对输入框来说，`value` 就是它当前保存的文本。
- `add` 返回三个 effect。它们按这个顺序应用。当文本为空时，它返回一个空列表，意思是“什么都不用发生”。
- `remove` 从 `msg.payload` 读取 id。模板里写的是 `remove(note.id)`，一个参数就成为 payload。

`main.ts` 和之前一样，只是改成 `app: notes`，初始 state 为 `{ draft: "", notes: [], nextId: 1 }`。

## 一次按键和一次提交做了什么

笔记程序运行起来后，每条 message 都会重复同样的七个步骤，只是 patch 更丰富。上面 demo 的三个步骤展示了它们。

- **输入。** message 是 `{ id: "setDraft", event: { type: "input", value: "Call Ann" } }`。handler 返回一个针对 `draft` 的 `set`。唯一的 patch 是针对输入框 `value` 的 `attr` patch。列表和计数都没有被触碰。
- **提交。** message 是 `{ id: "add", event: { type: "submit" } }`。三个 `set` effect 依次运行，然后各 plugin 只被告知一次新的 state。产生的 patch：输入框的 `value` 回到空字符串，一个 `insert` 添加新笔记，一个 `text` patch 更新计数。
- **删除。** message 是 `{ id: "remove", payload: 1, event: { type: "click", value: "" } }`。一个 `remove` patch 把该笔记移除，计数随之改变。

patch 由 `diff` 仅根据 state 生成。组件从不说“插入一个节点”。它只说 state 应该是什么样，编译后的模板会算出 DOM 的变化。

> [!WARNING] 绝不要原地修改 state
> 不要在 handler 里写 `state.notes.push(note)`。store 给你的当前 state 只用来读。`diff` 通过 `===` 比较来判断是否有变化，所以被修改过的数组看起来没有变，屏幕就不会更新。请始终像 `add` 那样返回新数组：`[...state.notes, ...]`。

## 你学到了什么

- pavlus 项目是一个带有 `pavlus()` plugin 的 Vite 项目，包含 `index.html`、`env.d.ts`、一个模板、一个组件类和一次 `createApp` 调用。
- 模板给 message 命名（`@click=inc`）。组件类用每个 message 一个方法来处理它们，并返回诸如 `store.set(path, value)` 的 effect。
- `createApp` 接收一个组件和若干 plugin。store 保存 state，DOM plugin 显示 view，并把事件作为带 `event` 字段的 message 上报。
- 一次点击的路径是：message、handler、effect、store、新 state、`diff`、patch、DOM。中间的各个环节都是你可以打印的纯数据。
- handler 绝不能修改 state，它们返回新的值。

下一页：[元素、文本与属性](page:syntax-elements)。
