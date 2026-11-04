---
summary: 真实的问题及其解决办法。带有准确信息的模板错误，常见的错误（引号、缺失的 key、修改 state、不返回任何东西的 handler），配置和部署问题，如何用 logger 和编译器调试，以及一份常见问题列表。
---
## 如何解读问题

pavlus 应用中的问题来自三个地方，每个地方的表现方式都不同。

- **模板无法编译。** 错误在构建时由 Vite plugin 给出，带有文件路径和位置：`(line 3, col 5)`。行和列从 1 开始。
- **应用在运行时抛出异常。** 信息以 `pavlus:`（或 `pavlus/dom:`、`pavlus/ssr:`、`pavlus/ws:`）开头，说明哪里出错了，多数时候还会说明该怎么做。它出现在浏览器控制台中。
- **什么都没有发生。** 完全没有任何信息。这些最难处理，本页的大部分内容都是关于它们的。要记住的规则：没人处理的 message 不是错误，它只是一个空的 effect 列表。

如果你迷路了，请按顺序过一遍这份清单。它几乎能找到每一个“什么都没发生”。

1. 打开控制台。有 `pavlus:` 错误吗？
2. message 的名字对吗？记录每一步（见下面的“调试”），然后找你期望的那条 message。
3. handler 返回了你期望的 effect 吗？
4. 该 effect 对应的 plugin 在 `createApp({ plugins })` 中注册了吗？
5. state 变了吗？在开发中，查看 `pavlus.store.getState()`。
6. 模板读取了那个字段吗？不读取某个字段的节点，在该字段变化时永远不会变。

## 模板错误

编译器在遇到第一个错误时就会停止。下面是把模板交给 `compileTemplate` 运行得到的真实信息。Vite 会在它们前面显示文件的路径。

| 你写了 | 信息以此开头 | 解决办法 |
| --- | --- | --- |
| 缩进里有 Tab | Tabs are not allowed | 用空格缩进。约定是两个空格。 |
| 一行在父级下缩进 4，下一行缩进 2 | Inconsistent indentation | 每一层都必须使用相同的步长。 |
| `a(href=url` | Unclosed ( | 闭合属性列表。 |
| `p Hello {name` | Unclosed { | 闭合表达式，或者写 `\{` 表示字面的花括号。 |
| `p(title="abc) x` | Unterminated string | 闭合引号。 |
| `p {items.map(x => x)}` | Unexpected character "=" | 不能用箭头函数。在 handler 中计算这个值。 |
| `p {a = 1}` | Unexpected character "=" | 表达式只读取，从不赋值。 |
| 花括号中的模板字面量 | Unexpected character | 不能用模板字面量。使用 `"a " + b`。 |
| `button(@click) Go` | "@click" needs an expression value | 写 `@click=save`。 |
| `button(@click=1+2) Go` | Event handler must be a message id | 事件是一个 message id，可以带参数。 |
| 上面没有 `if` 的 `else` | else without matching if | 把 `else` 紧跟在 `if` 块之后，缩进相同。 |
| `+Row#r(a=1)` 而没有 import | "Row" is not imported | 在顶部添加 `import Row from "..."` 这一行。 |
| 第一个元素之下的 `import` | import lines must be at the top of the file | 把它移上去。 |
| `import row from "..."` | cannot be used as a component name | 组件以大写字母开头。 |
| `+outlet(a=1)` | +outlet takes nothing after it | 只写 `+outlet`，不带别的。 |
| 文本行（以竖线字符开头的行）之下的子节点 | This line cannot have children | 只有元素才有子节点。 |
| `p {}` | Empty expression | 在花括号之间放点东西。 |

以及每一条的准确文本，便于搜索：

```text
Tabs are not allowed, use spaces (line 2, col 1)
Inconsistent indentation (line 3, col 1)
Unclosed ( (line 1, col 2)
Unclosed { (line 1, col 7)
Unterminated string (line 1, col 9)
Unexpected character "=" (line 1, col 16)
Unexpected character "`" (line 1, col 4)
"@click" needs an expression value (line 1, col 8)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
"Row" is not imported. Add `import Row from "..."` or use +{Row} for a component that comes from the state (line 1, col 2)
`import` lines must be at the top of the file (line 2, col 1)
"row" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
`+outlet` takes nothing after it (line 1, col 8)
This line cannot have children (line 2, col 1)
Empty expression (line 1, col 4)
```

有两种看起来不对的模板却会被接受，这是写模板的人的错，而不是编译器的错：后面什么都没有的 `if`，以及 `for x todos`（没有 `in`），它们不匹配关键字，所以各自被读成名为 `if` 或 `for` 的**元素**。页面会在 DOM 中显示 `<if>`。如果出现了这种名字的元素，请检查那一行。

## 引号决定值是什么

这是最常见的第一个错误。`href="url"` 是文本 `url`。`href=url` 是 state 的字段 `url`。两者都合法，所以编译器无法发出警告。

::demo quotes-text

::demo quotes-expression

第一个 demo 的链接是 `href="url"`，一个普通字符串，无论 state 是什么。第二个读取 state：它的 HTML 中有地址，当 `url` 变化时，是一次 `attr` patch。如果链接去了 `/url`，或者属性显示的是字段的名字，请找找缺少的花括号和多余的引号。模板中的文本则相反：`p Hello, name` 是文本 `name`，而 `p Hello, {name}` 读取字段。

要把花括号显示为文本，请转义它：

::demo braces

## 没有 `key` 的 `for`

`key` 是可选的。没有它时，条目的**索引**就是它的标识。页面能工作，但从开头删除一个条目，看起来就像它后面的每个条目都变了。比较同一个改动的 patch，也就是删除三个人中的第一个。

::demo keyed

::demo unkeyed

有 `key person.id` 时，patch 是对 Ann 那个块的一次 `remove`。没有 key 时，被移除的是最后一个块，剩下两个块的文本被**重写**了（`Bob` 进入第一个块，`Eve` 进入第二个）。对于文本来说，结果是一样的。但对于有自己生命的东西就不一样了：访客输入过内容的输入框、焦点、滚动位置、正在运行的 CSS 动画，会停留在列表中的原位置，而不是随条目移动。只要列表的条目可能被插入、删除或重新排序，就给它加上 key。

## 修改 state

编译后的 `diff` 用 `===` 比较。如果你就地修改数组，下一个 state 里是同一个数组，比较的结果是“什么都没变”，也就没有任何东西被打 patch。store 也遵循同样的规则：对相同的值执行 `store.set` 不会记录任何东西。

::demo mutation

第一步中，数组是用 `push` 修改后再次传入的。patch 列表是空的，尽管数组里已经有了第三个人。第二步中传入了新数组，diff 插入了这个条目。在 handler 中，这意味着：

```ts
// wrong: the same array, the page does not change
state.items.push(todo);
return [store.set("items", state.items)];

// right: a new array
return [store.set("items", [...state.items, todo])];
```

对象（`{ ...todo, done: true }`）以及数组的 `.sort()` 也是一样（要对副本排序）。如果你用 `readonly` 字段和 `ReadonlyArray` 声明 state，TypeScript 会帮上忙。

## handler 的问题

**handler 返回了数组以外的东西。** 这种情况有清楚的信息：

```text
pavlus: handler "add" must return an array of effects
```

通常的原因是写了 `return store.set("a", 1)` 而不是 `return [store.set("a", 1)]`。无事可做的 handler 返回 `[]`。

**找不到 handler。** 这种情况没有任何信息。点击 `@click=remvoe(todo.id)` 会发送 message `remvoe`，没人处理它，结果是一个空的 effect 列表。名字中的拼写错误，以及 `_private` 的 handler（以 `_` 开头的名字和 `#` 成员永远不是 message）：都会导致沉默。要捕获它，请用 `createApp` 的 `onStep` 选项记录每一步：

```ts
const app = createApp({
  app: shell,
  plugins,
  onStep: (message, effects) => {
    if (effects.length === 0) console.debug(`${message.id}: no effects`);
  },
});
```

下面是它在一个处理 `inc` 并被发送了 `incc` 的计数器上的输出：

```text
inc -> 1 effect(s)
incc -> 0 effect(s)  <- nobody handled it?
```

有些 message 确实没有 effect（只对父组件有意义的点击），所以请阅读整个列表，不要把每一行都当作 bug。

**子组件 message 的 id 不对。** 以 `+Row#row` 方式 embed 的子组件的事件，会作为 `row.select` 发送。父组件用带引号的方法名来处理它：`"row.select"(msg) { ... }`。父组件中名为 `select` 的 handler 永远收不到它。对于嵌套的子组件，id 会连接起来：`grid.card.add`。

**对不存在的子组件执行 `ctx.send`** 会抛出异常：`pavlus: no child "nope" to send "x" to`。

**传了类而不是实例。** `createApp({ app: Todos })` 会被拒绝，并给出 `pavlus: Todos is a class: pass an instance (new Todos()), not the class`。普通对象也会被拒绝：`pavlus: a component is a function or an instance of a class extending Component, got a plain object (defineComponent is gone: write a class that extends Component)`。

**路径错误的 `store.set`** 不会失败。它会创建缺失的父级，所以拼写错误（`"itemz"`）会产生一个新字段，而读取 `items` 的模板不会变。请在控制台中查看 state，以及历史记录。

## 配置与 plugin 错误

这些错误在应用启动时或执行 effect 时抛出。每一个都说明了它的解决办法。

```text
pavlus: no plugin "http" for effect "request"
pavlus: duplicate plugin "store"
pavlus: `mount` needs the dom plugin (createDomPlugin)
pavlus/dom: target "#nope" not found
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
pavlus/ws: no connection "chat"
pavlus: more than 10000 messages in one tick (message loop?)
```

- **no plugin** 表示 handler 返回了一个发给不在列表中的 plugin 的 effect。注册它，或者是你把 plugin 的名字写错了。
- **target not found** 表示 `mount` 的元素不在 `index.html` 中，或者脚本在它出现之前就运行了。把脚本放在 `<body>` 的末尾，或者使用被延迟执行的 `type="module"`。
- **two children named** 是一张有两个条目以相同的段结尾的路由表。关于 [路由](page:concepts-routing) 的页面解释了 `name`。
- **+outlet needs a component** 表示挂载了带有 outlet 的 view 而没有它的组件。请挂载组件，而不是 `component.view`。
- **message loop** 表示 handler 在不停地互相答复。常见的情况是 plugin 的 message（答复）被某个 handler 处理，而该 handler 又再次发出请求。
- **ws: no connection** 表示在 `onOpen` message 之前，或者在 socket 关闭之后执行了 `send`。

### 类型：`Cannot find module './page.pavlus'`

TypeScript 不认识 `*.pavlus` 文件。声明在框架中，你的项目必须包含它。在 `src/env.d.ts` 中：

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@service-laboratory/pavlus/env" />
```

没有 `pavlus/env` 这一行，每个模板的导入都会给出这个错误。两行都有的项目可以干净地编译：

```text
src/app.ts(2,23): error TS2307: Cannot find module './about.pavlus' or its corresponding type declarations.
```

### `?raw` 导入

有时你想要的是模板的**文本**，而不是编译后的模块。ui-kit 为它的 Source 标签页这样做：它显示每个页面的模板、逻辑和样式。Vite 的 `?raw` 后缀以字符串形式给出文件，而 pavlus plugin 不会碰 `?raw`、`?url` 和 `?inline` 的导入：

```ts
import source from "./about.pavlus?raw";
import view from "./about.pavlus";
```

在测试中运行时，第一个是文本 `section.about\n  h1 About\n  p A todo list`，第二个是带有 `render`、`diff` 和 `meta` 的 view。有一件事会出错。`pavlus/env` 的声明涵盖 `*.pavlus`，而不涵盖 `*.pavlus?raw`，所以没有 `/// <reference types="vite/client" />` 的话，TypeScript 会说 `Cannot find module './about.pavlus?raw'`。

对于整个文件夹，带有选项 `{ query: "?raw", import: "default" }` 的 `import.meta.glob` 返回一张懒加载器的表，每个文件一个块，ui-kit 的 source plugin 就是这么做的。

## 静态主机上的 404

在 `npm run dev` 上一切正常，而在发布的站点上，点击链接可以工作，但刷新会得到 “404 Not Found”。或者站点位于 `/pavlus/`，而每个页面都显示 “Page not found”。

- **刷新得到 404。** 静态主机会在该路径上找一个文件。单页应用只有 `index.html`。让主机对每个未知路径都用 `index.html` 应答。在 GitHub Pages 上，你无法修改规则，所以请在构建时把 `index.html` 复制为 `404.html`；ui-kit 用一个很小的 Vite plugin 来做这件事。代码在 [路由](page:concepts-routing) 中。
- **前缀之下出现 “Page not found”。** 路由器看到的是 `/pavlus/button`，没有任何模式匹配它。给 router plugin 一个隐藏前缀的 `window`（ui-kit 中的 `windowAt(root)`），并用它构造 `href`。还要在 Vite 配置中设置 `base`，这样脚本和样式才会从 `/pavlus/assets/...` 而不是 `/assets/...` 请求。
- **图片和图标 404。** 在 `index.html` 中使用 `%BASE_URL%favicon.svg`，在代码中使用 `import.meta.env.BASE_URL`。

## 调试

### 记录发生了什么

logger plugin 会打印记录。它不知道发生了什么，所以你要去请求。`withLogging(component, label)` 请求某个组件的每条 message，这是看到应用在做什么的最快方式：

```ts
createApp({
  app: withLogging(shell, "shell"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin(), createDomPlugin()],
  mount: "#app",
});
```

对于 payload 为 5 的 message `inc`，logger 收到这样一条记录：

```json
["[counter] inc -> 1 effect(s)", { "payload": 5, "effects": ["store.set"] }]
```

这条记录是 `debug` 级别的。有些浏览器默认隐藏 `debug` 消息（在 Chrome 中，把控制台切换到 Verbose 级别才能看到）。这个包装添加了一个 effect，所以必须注册 logger plugin，否则核心会抛出 `no plugin "logger"`。

### 在开发中探查应用

ui-kit 仅在开发环境下暴露应用和 store：

```ts
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
```

之后你可以在控制台中发送 message、读取 state，并回到过去，因为 store 会连同撤销它的 effect 一起记录每一次改动：

```text
pavlus.app.dispatch({ id: "header.toggleSidebar" })
pavlus.store.getState().sidebar
pavlus.store.history.length
pavlus.store.history.at(-1)
```

`store.undo()` 和 `store.restoreTo(timestamp)` 是 effect，所以你像应用其他 effect 一样应用它们：从 handler 中，或通过开发者工具。

### 查看编译器的输出

模板是两个纯函数，你可以自己调用它们。`@service-laboratory/pavlus/compiler` 中的 `compileToView` 编译一个字符串，并给你 `render` 和 `diff`，不需要 Vite：

```ts
import { compileToView } from "@service-laboratory/pavlus/compiler";

const view = compileToView("p Hello, {name}");
console.log(JSON.stringify(view.render({ name: "Ann" })));
console.log(JSON.stringify(view.diff({ name: "Ann" }, { name: "Bob" })));
```

第一行打印 **vnode**，第二行打印 **patch**：

```json
[{"t":"el","tag":"p","attrs":{},"events":{},"children":[{"t":"text","id":"1","text":"Hello, Ann"}]}]
[{"op":"text","id":"1","text":"Hello, Bob"}]
```

vnode 展示真实的属性，以及作为数据的事件（`events.click` 是点击将要发送的 message）。patch 展示 DOM 中会发生什么变化。如果你期望有改变而 patch 列表是空的，要么 state 是同一个对象（修改了 state），要么节点不读取那个字段。这些页面上的 demo 展示的是同样的数据，每个 demo 都可以展开 AST：节点下的 `reads: people` 这一行说明了哪些字段可以改变它。

编译后的模板是可读的 JavaScript，无论是在开发中还是在 bundle 里。在 DevTools 的 Sources 面板中打开一个 `.pavlus` 模块（文件名类似 `todos.pavlus?import`）。注释 `// line 12: <li> (reads: user, selectedId)` 说明了一个块来自模板的哪一行，以及它依赖什么。有意没有提供 source map：DevTools 显示的是生成的代码，也就是实际运行的东西。

### 测试页面，而不只是 handler

当 bug 出在模板中时，用 `@service-laboratory/pavlus/testing` 中的 `mountView` 来测试它，它不借助核心，直接在 jsdom 中挂载 view。这是一个计数器模板的测试：

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });
expect(h.root.textContent).toContain("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
```

## 问答

- **我能在模板中使用箭头函数或模板字面量吗？** 不能，两者都是编译错误。表达式语言是 JavaScript 的一个小型纯子集：路径（null 安全）、字面量、运算符、条件运算符、数组字面量、索引访问（`items[0]`）和调用。值的方法调用是可以的：对于 `ann`，`{name.toUpperCase()}` 显示 `ANN`。调用同样是 null 安全的，这会掩盖拼写错误：`{fmt(name)}` 调用的是 state 字段 `fmt`，如果没有这样的字段，它显示空文本，也没有错误。任何比简短表达式更长的东西都属于 handler：在那里计算它，并把结果保存在 state 中。
- **如何显示过滤后或排序后的列表？** 在 handler 中计算它，用 `store.set` 存储，然后遍历存储的列表。[指南](page:guide-todo-app) 为过滤器做了这件事。
- **异步代码放在哪里？** 绝不放在 handler 中。handler 返回 effect，由 plugin 完成异步工作并用 message 作答。请求使用 `http.request`，定时器使用 `time.setTimeout`。
- **如何读取用户输入的内容？** `@input` 用 `msg.event?.value`，复选框的 `@change` 用 `msg.event?.checked`，键盘事件用 `msg.event?.key`。输入框会保留用户输入的内容；`value=field` 只是给它设定初始值，并跟随该字段之后的变化。
- **字段缺失时，为什么我的页面显示空值而不是报错？** 模板中的路径是 null 安全的。当 `user` 为 `null` 时，`{user.name}` 是空文本。handler 是普通的 TypeScript，不是 null 安全的：在那里请使用 `?.`。
- **如何获取时间或随机数？** 向 plugin 要。`time.now("stamped")` 以 message 的形式用时间作答；random plugin 只有几行，[编写自己的插件](page:plugins-custom) 会读一个。
- **如何在应用启动时运行某些东西？** 在根组件中处理 `mounted`（应用进入 DOM 时发送），或者给 `createApp` 传入 `init: { id: "start" }`。在被路由的页面中，处理 `enter`。
- **如何在离开页面时停止定时器？** 处理 `leave` 并返回 `time.cancel(id)`。
- **两个组件可以有同名的 message 吗？** 可以。子组件有命名空间：对它的父组件来说，子组件的 `select` 是 `row.select`。两个实例名相同的同级组件是不允许的。
- **如何把 handler 命名为 `users.remove`？** 用带引号的方法名：`"users.remove"(msg: Message) { ... }`。
- **组件可以把数据保存在类字段中吗？** 会变化的数据不行。实例被每条 message 共享，所以它必须没有可变的 state。请把数据保存在 store 中。
- **我能用 SVG 绘图吗？** 不能作为元素使用。DOM plugin 创建的元素没有 XML 命名空间，所以 `svg` 标签不会被绘制。ui-kit 用 CSS mask 做图标，用方框、渐变和 emoji 做图画。
- **我能不用 Vite 来使用 pavlus 吗？** 编译器是一个普通函数：`compileTemplate(source)` 返回 ES 模块的文本。Vite plugin 是现有的集成，这些页面上的一切都以它为前提。
- **为什么我的首次 render 是空的？** 因为在 router plugin 报告之前，`route` 是 `null`。先挂载，然后 `mounted` 启动 `router.listen`。如果你使用自己的 `mounted`，它也必须返回 `router.listen("routeChanged")`。
- **服务端渲染对所有 plugin 都有效吗？** 不是。请给服务器提供浏览器 plugin 的替身；见 [服务端渲染](page:concepts-ssr)。

## 你学到了什么

- 模板错误带有行和列。运行时错误以 `pavlus:` 开头并指出解决办法。静默的失败几乎总是一条没人处理的 message，或者一个没人执行的 effect。
- 有引号是文本，没有引号是字段。会变化的列表需要 `key`。永远不要修改 state。
- `onStep`、`withLogging`、`compileToView` 和开发控制台可以显示 message、effect、vnode 和 patch。
- 静态主机需要 `index.html` 兜底，位于前缀之下的站点需要隐藏前缀的 router window。

你已经读到了文档的末尾。[框架概览](page:overview) 列出了每个页面，[在线实验场](page:compiler-playground) 可以让你试用自己的模板。
