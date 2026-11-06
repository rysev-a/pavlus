---
summary: 用 import 和 +Name 把页面拆分成多个模板并组合起来。学习 props、实例名和 message 前缀，用 +{expr} 的动态 embed，什么都不渲染的子 view，以及用于路由页面的 +outlet 行。
---
## 一个模板，多个文件

页面会不断增长。页眉、卡片、表格行和表单字段都想只写一次，却在很多地方使用。在 pavlus 中，每个 `.pavlus` 文件都是一个模板，一个模板可以**嵌入**另一个。被嵌入的模板称为*子 view*（或简称子级），嵌入它的称为它的父级。

嵌入分两步：在文件顶部**导入**子级，然后用以加号开头的一行来**使用**它。

::demo badge

第一行 `import Badge from "./badge.pavlus"` 以本地名字 `Badge` 引入子级。`+Badge#status(label=text)` 这一行在该位置渲染它。`label=text` 传递一个 **prop**：在 `badge.pavlus` 内部（这里是 `span.badge {label}`），state 有一个字段 `label`，其值就是父级的 `text`。

子级什么也看不到。它不知道父级的 state，只知道交给它的 props。这就是子级可复用的原因：它的输入都列在使用它的地方。

看这一步：当 `text` 改变时，产生一个 id 为 `1/2` 的 `text` patch。子级自己的节点 id 会从嵌入它的那一行得到后缀（`/2`），所以同一个子级的两个实例永远不会产生相同的 id。

## import 行

```pavlus
import Card from "./card.pavlus"
import UserList from "../users/view.pavlus"

section
  +Card#intro(title="Welcome")
```

所有 `import` 行都放在最前面，在任何元素之前，位于第 0 列。名字必须以大写字母开头。解析器会报告这些错误：

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
```

大写字母是模板区分组件和标签的方式：`+Card` 只可能是导入的组件。`String`、`Array`、`Map`、`Set` 和 `Error` 被拒绝，是因为生成的代码自己要用到它们。

路径按你的打包器将会解析的方式书写。编译器把这一行作为普通的 ES import 复制到生成的模块中（`import Badge from "./badge.pavlus";`，打开上面 demo 的模块就能看到），Vite plugin 以同样的方式编译被导入的文件。子级是一个带有 `render` 和 `diff` 的模块，每个模板都是如此。

如果你使用了没有导入的名字，会得到一条说明该怎么做的消息：

```text
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 2, col 4)
```

## embed 行：+Name#id(props)

embed 的完整语法是：

```text
+Name#instance(prop=value other="text {x}" flag ...spread)
```

- `Name` 是导入的名字。
- `#instance` 是**实例名**。对于静态 embed 它是可选的。没有它时，名字就是导入的名字，首字母小写：`+UserCard` 是 `userCard`。
- 带 props 的括号是可选的。
- 这一行上不能再跟任何东西，而且 embed 不能有子行。其后的文本会得到 `Unexpected "x" after component`，其下缩进的行会得到 `This line cannot have children`。

实例名承担三项工作。它为子级的 **message** 加前缀（见下文）。它是逻辑中 `children` 表里子级的 key（见本页末尾）。并且编译器会把它列在模块的 `meta.embeds` 中。

## Props

prop 的写法与属性相同，值的形式也相同。区别在于它的去向：它不会被放进 HTML，而是成为子级 state 的一个字段。

::demo props

阅读这三个 embed：

| 值 | 示例 | 子级得到什么 |
| --- | --- | --- |
| 带引号的文本 | `kind="static"` | 字符串 |
| 带洞的文本 | `kind="user {user.id}"` | 字符串，每个洞使用 `toText` |
| 表达式 | `label=user.name`, `count=items.length` | 值本身，保持其类型 |
| 裸名字 | `active` | `true` |
| 展开 | `...user` | 对象的每个字段 |

表达式**保持类型**：`count=items.length` 给子级一个数字，`label=user.items` 会给它数组本身，而不是文本。带洞并含有其他文本的字符串始终是字符串。只有一个洞的带引号 prop，`kind="{x}"`，与 `kind=x` 相同：类型保持不变。

props 按顺序书写，后面的优先：在第三个 embed 中，`...user` 带来 `label`（“From spread”），而 `count=0` 替换了展开中可能带来的 `count`。没有给出的 prop 是 `undefined`，这就是为什么第三个 chip 的标题以 `: ` 开头：缺少 `kind`，而 `toText(undefined)` 为空。

prop 名必须是普通的标识符。像 `data-x` 这样的名字是错误：`"data-x" is not a valid prop name`。并且展开只允许用于组件（`+Name(...x)`）；用在元素上会得到 `` `...spread` is only allowed in component props ``。

## 子级何时更新？

每个 embed 在父级的 `diff` 中都有自己的保护。下面是带两个 props 的 embed 生成的代码：

```ts
if (prev.noteTitle !== next.noteTitle || prev.noteBody !== next.noteBody) {
  patches.push(...Card.diff(
    { "title": prev.noteTitle, "body": prev.noteBody },
    { "title": next.noteTitle, "body": next.noteBody },
    idSuffix + "/2",
    messagePrefix + "note.",
    childEnv(env, "note", next),
  ));
}
```

父级根据它的两个 state 构建旧的 props 和新的 props，并用它们调用子级自己的 `diff`。如果 props 读取的名字都没有改变，就根本不会调用子级。

::demo child-diff

在第一步中，body 变化，卡片的 `diff` 返回一个 `text` patch。在第二步中，只有标题变化，卡片根本不被查看。子级和父级模板的一部分一样便宜。

## 来自子级的 message

子级的事件以实例名作为前缀发送。这在 [事件页](page:syntax-events) 中解释过：计数器的 `reset` 按钮会根据实例变成 `apples.reset` 或 `pears.reset`。

::demo two-instances

同一个 `Counter` 的两个实例有两个名字，所以应用可以区分它们。在这一步中，`pears` 改变了。`value` prop 改变，所以产生了 text patch，同时也产生了 `handler` patch，因为 `reset(value)` 的 payload 也变了。该 patch 中的 id 已经是 `pears.reset`：

```text
{"op":"handler","id":"5/1","event":"click","msg":{"id":"pears.reset","payload":6}}
```

前缀随每一层增长：子级的子级得到 `apples.cell.reset`。循环内部的标识则是另一回事。实例名在模板中是固定的，不能依赖循环项，所以在循环内部你用 payload 来区分实例：

::demo in-loop

每一行都发送 message `row.toggle`，以其任务的 id 作为 payload。父级的 handler `"row.toggle"` 得到这个 id。注意 class patch 的 id `0#2/2`：行的节点（`0`）、项的 key（`#2`）和 embed（`/2`）都出现在其中。

## if 和 for 内部的 embed

embed 和其他节点一样。它可以在 `if`、`else`、`for` 或另一个元素内部。它的位置由周围的行决定。

::demo in-if

当 `open` 变为 true 时，面板从头渲染并被插入。当它变回 false 时，它被清除。子级的 state 不会留在 DOM 中：下次它会根据 props 重新渲染。

## 什么都不渲染的子级

子级模板是普通的模板，所以它可以没有东西可显示，例如因为它唯一的节点是一个为 false 的 `if`。这是允许的。父级为它保留一个位置，父级的其他行不会被移动。

::demo empty-child

跟随这些步骤。一开始页面中没有提示，`After the notice` 在正确的位置。当 `message` 变成 `Saved` 时，子级的 `if` 在子级所在的位置插入一个 `p`（注意以 `/2` 结尾的标记 id）。当 message 改变时，只有文本变化。当它变空时，提示被清除。父级没有做任何特别的事：所有工作都在子级自己的 `diff` 中。

## 动态 embed：+{expr}

有时在你写模板时并不知道子级是什么：每个标签页显示不同 view 的标签栏，或者由用户选择的小部件。你不能导入来自 state 的东西，所以 pavlus 有第二种形式，其中子级是**表达式的值**：

```pavlus
div.tabs
  +{tab.component}#content(...tab.state)
```

表达式给出一个 view，或一个带有 `view` 的组件。动态 embed *必须*有实例名（`#content`），因为没有导入的名字可用来取名：`+{tab}(x=1)` 是错误，`A dynamic component needs an instance name: +{expr}#name(...)`。

值改变时页面的行为：

- 值是**同一个 view**：运行它自己的 `diff`，和静态 embed 一样；
- 值是**另一个 view**：旧内容在两个标记之间被清除，新 view 从头渲染。两个模板永远不会互相比较；
- 值是 `null` 或 `undefined`：embed 什么都不渲染。

::demo dynamic-empty

最后一种情况是子级不存在。`h2` 和 `p` 在原位，两者之间什么也没有。如果值不是 view（例如是数字），`render` 会抛出 `pavlus: +{...} needs a view or a component with a view`。

> [!NOTE] state 中的 view
> view 是一个带有函数的对象，不是 JSON。store 原样保存它，但保存或打印 state 的工具不会显示它。当你需要可序列化的 state 时，在 state 中保存一个名字（`tab: "users"`），并用 `if` 和 `else if` 选择，两个分支都已导入。`+{expr}` 这种形式适用于子级集合是开放的情形。

## +outlet：由路由选择的页面

单页应用有一个外壳（页眉、菜单），中间是由地址选择的页面。外壳需要一个放“页面”的位置。这就是 `+outlet`。

```pavlus
header.shell
  nav
    a(href="/") Home
    a(href="/about") About
main.page
  +outlet
```

`+outlet` 后面不接任何东西：像 `+outlet x` 这样的行是错误。它渲染拥有该模板的组件的**路由子级**。具体是哪个子级，来自组件的 `routing` 表：

```ts shell.ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { component: dashboard, key: "dashboard", name: "dashboard" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

outlet 的行为像动态 embed。当路由切换到另一个页面时，旧页面在标记之间被清除，新页面被渲染。当路由停留在同一个页面时，只运行该页面的 `diff`。它的 message 与任何子级一样，以实例名作为前缀：注册为 `dashboard` 的页面发送 `dashboard.something`。如果没有条目匹配地址，且没有 `"*"` 条目，outlet 就是空的，像 null 子级一样。

因为路由不是模板能看到的字段，编译器无法列出 outlet 读取的名字。它周围的节点在每次 state 改变时都会被检查，其中的页面仍会跳过没有变化的部分。这就是为什么带 outlet 的模板的 `diff` 代码会写 `reads: the route and the routed child`。

outlet 需要组件，而不仅仅是模板。如果你只挂载 view，`render` 会抛出这个错误：

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

出于这个原因，本页的 demo 不渲染 outlet。[路由](page:concepts-routing) 描述了完整的机制。

## 子级的逻辑一侧

以上所有内容都是关于模板的。子级模板也可以有一个带自己 handler 的组件。父级在其组件的 `children` 表中声明它，使用模板给该实例起的同一个名字：

```ts dashboard.ts
class Dashboard extends Component<DashboardState> {
  view = dashboardView;
  children: Children<DashboardState> = {
    users: {
      component: usersList,
      key: "users",
      props: (s) => ({ filter: s.filter }),
    },
  };
}
```

而模板中写 `+UsersList#users(...users filter=filter)`。要记住的规则是：模板里的 `users`、`children` 里的 `users`、state 里的 `users`。message `users.select` 会去掉前缀，交给 `usersList` 的 `select` handler。[组件](page:concepts-components) 有完整的说明。

## 组合起来

一个使用带 key 的循环、一个条件和两种子级的父级。`Row` 和 `Panel` 模板就是上面 demo 中的那些。

```pavlus
import Row from "./row.pavlus"
import Panel from "./panel.pavlus"

section.tasks
  h3 Tasks ({tasks.length})
  ul
    for task in tasks key task.id
      +Row#row(id=task.id title=task.title done=task.done)
  if selected
    +Panel#details(title=selected.title)
  else
    p.muted Select a task
```

每个 `row` message 都带有其任务的 id，每个 `details` message 都会进入面板的逻辑。父级模板自己不包含任何一个事件 handler。它只决定哪些子级存在，以及每个子级收到什么。

## 你学到了什么

- 顶部写 `import Name from "./file.pavlus"`，在子级所在位置写 `+Name#id(props)`；子级只能看到它的 props。
- props 可以是带引号的文本、带洞的文本、表达式（保持类型）、裸标志或 `...spread`；后面的 prop 优先。
- 实例名为子级的 message 加前缀（`pears.reset`），并把子级与其组件的 `children` 联系起来。
- `+{expr}#id` 渲染作为值的 view；`null` 值、空模板和未匹配的 outlet 都什么也不渲染。
- `+outlet` 渲染拥有该模板的组件的路由子级。

下一页：[语法参考](page:syntax-reference)。
