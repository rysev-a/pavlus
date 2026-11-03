---
summary: 用表格整理的 pavlus 模板语言速查表，包含编译器的真实错误信息、常见陷阱，以及三个较大的示例（表单、带过滤的表格、标签页面板）。
---
## 如何使用本页

本页是一份参考。它简要重复了前面几页逐步讲解的内容：[元素、文本与属性](page:syntax-elements)、[表达式与插值](page:syntax-expressions)、[事件与消息](page:syntax-events)、[条件与循环](page:syntax-control-flow)和[组件、导入与出口](page:syntax-components)。如果下面某一行看不明白，请先去读那些页面。需要核对拼写时，再回到这里。

模板是一个文本文件。它会被编译成一个带有两个纯函数的模块：`render(state)` 返回虚拟节点，`diff(prev, next)` 返回两个 state 之间的 patch 列表。下面描述的都是你可以在文件中写的内容。

## 行

每个非空行都代表一件事。缩进（只能用空格）会把一行嵌套到它上面的那一行里。

| 你写的内容 | 它是 | 说明 |
| --- | --- | --- |
| `tag.class#id(attrs) text` | 一个元素 | 除了 tag、class、id 中的第一个以外，其余部分都可以省略 |
| `.card`、`#app` | 一个 `div` | tag 默认是 `div` |
| 以竖线开头、后面跟文本的行 | 文本行 | 一个文本节点；允许有 hole |
| `{expr} more text` | 文本行 | 以 `{` 开头的行也是文本 |
| `// note` | 注释 | 会被丢弃；空格后面的行尾 `// note` 也会被丢弃 |
| `if expr` | 条件的开始 | 末尾的冒号是可选的 |
| `else if expr`、`else` | 后续分支 | 必须跟在同一缩进层级的 `if` 之后 |
| `for item in list` | 循环 | `for item, i in list key expr` 会加上索引和 key |
| `import Name from "path"` | 导入一个子组件 | 只能写在文件顶部，名称以大写字母开头 |
| `+Name#id(props)` | embed 一个已导入的子组件 | `#id` 是可选的 |
| `+{expr}#id(props)` | embed 一个作为值的 view | `#id` 是必需的 |
| `+outlet` | 路由选出的子页面 | 后面不能再跟任何内容 |

空元素（`area`、`base`、`br`、`col`、`embed`、`hr`、`img`、`input`、`link`、`meta`、`source`、`track`、`wbr`）不能有子行。

文本会被连接起来：连续的两个文本行，或者元素的行内文本后面紧跟一个文本行，会用换行符隔开，HTML 会把它显示成一个空格。

::demo comments

## 属性

属性写在 tag 后面的圆括号里，用空格或逗号分隔。名称可以包含字母、数字、`_`、`-`、`:`、`.` 和 `@`。

| 你写的内容 | 含义 |
| --- | --- |
| `disabled` | 布尔属性，存在且值为空 |
| `type="button"` | 固定字符串 |
| `title="Open {name}"` | 带 hole 的字符串；每个 hole 遵循文本规则 |
| `href=url`、`value=user.name` | 表达式，一个不含空格的单词 |
| `title={a + " " + b}` | 含空格的表达式，写在花括号里 |
| `title="{note}"` | 与 `title={note}` 相同：只有一个 hole |
| `class:on=cond` | 当 `cond` 为真值时添加 class `on` |
| `class="a b"` | 多个 class，会与 `.a` 和 `class:` 的 class 合并 |
| `@click=save` | 事件绑定，message 为 `save` |
| `@click.prevent.stop=save(item.id)` | 同上，带修饰符和 payload |
| `\{` 和 `\}` | 文本或带引号的值中的字面花括号 |

`class:name` 或 `@event` 的值必须是表达式：没有值的 `class:on` 是错误。

## 文本与属性中的值

同一个值在文本和属性中的渲染结果不同。

| 值 | 在文本 `{v}` 中 | 在属性 `a=v` 中 |
| --- | --- | --- |
| `null`、`undefined` | 什么都不显示 | 没有这个属性 |
| `false` | 什么都不显示 | 没有这个属性 |
| `true` | 单词 `true` | 值为空的属性 |
| `0` | `0` | `a="0"` |
| 空字符串 | 什么都不显示 | `a=""` |
| 数字或字符串 | 它的文本 | 它的文本 |
| 数组 | 各项用逗号连接 | 相同 |
| 对象 | `[object Object]` | 相同 |

在含有多个部分的字符串中，例如 `title="Note: {v}"`，每个 hole 都遵循文本那一列的规则，而且属性始终存在。

## 表达式

`{ }` 里的所有内容，以及每个不带引号的属性值，都会被当作表达式解析。

| 分组 | 支持的内容 |
| --- | --- |
| 字面量 | 数字（`1`、`.5`、`1e3`）、字符串（`"a"`、`'a'`）、`true`、`false`、`null`、`undefined`、数组 `[a, b]` |
| 名称 | state 的一个字段，或者循环变量 |
| 成员 | `a.b`、`a?.b`（两者都是空值安全的） |
| 索引 | `a[expr]`（空值安全） |
| 调用 | `f(x, y)`、`a.b(x)`（空值安全） |
| 一元 | `!a`、`-a`、`+a` |
| 算术 | 先 `*` `/` `%`，再 `+` `-` |
| 比较 | 先 `<` `>` `<=` `>=`，再 `==` `!=` `===` `!==` |
| 逻辑 | 先 `&&`，然后是双竖线，最后是 `??` |
| 三元 | `a ? b : c`，向右嵌套 |
| 分组 | `( )` |

不支持：对象字面量、箭头函数、模板字符串、正则表达式、赋值、`++`、`typeof`、`in`、`new`、`**`、位运算符、逗号运算符、`?.[ ]` 和 `?.( )`。名称只会在 state 中查找：没有全局变量。

真值判断与 JavaScript 相同：`false`、`0`、`""`、`null`、`undefined` 和 `NaN` 是假值；空数组和空对象是真值。

## 事件

| 部分 | 含义 |
| --- | --- |
| `@click` | DOM 事件名（元素能触发的任何事件） |
| `=save` | message 的 id；允许带点：`users.open` |
| `(a, b)` | 参数；没有参数表示没有 payload，一个参数就是 payload，多个参数组成数组 |
| `.prevent` | 在发送 message 之前调用 `preventDefault()` |
| `.stop` | 在发送 message 之前调用 `stopPropagation()` |

到达应用的 message 是 `{ id, payload, event }`，其中 `event` 是 `{ type, value?, checked?, key? }`。由被 embed 的子组件发送的 message，其 id 前面会加上实例名（`row.toggle`）。未知的修饰符会被忽略；同一个事件绑定两次时，最后一个绑定生效。

## 组件

| 你写的内容 | 含义 |
| --- | --- |
| `import Card from "./card.pavlus"` | 让 `Card` 可用 |
| `+Card` | embed 它，实例名为 `card` |
| `+Card#intro(title="Hi")` | 显式的实例名，一个固定的 prop |
| `+Card(title=post.title count=3 active)` | 表达式 props 保持原有类型；单独的名称表示 `true` |
| `+Card(...post)` | 展开一个对象的字段；后面的 props 优先 |
| `+{view}#slot(...)` | 来自 state 的 view 或组件；`null` 什么都不渲染 |
| `+outlet` | 由组件的 `routing` 表选出的页面 |

子组件只能把它的 props 当作自己的 state。实例名会作为它的 message 的前缀、节点 id 的前缀，并且在逻辑中是 `children` 里的 key。

## `diff` 能返回什么

patch 是纯数据。以下就是全部的 patch。

| `op` | 字段 | 产生时机 |
| --- | --- | --- |
| `text` | `id`、`text` | 节点的文本改变了 |
| `attr` | `id`、`name`、`value` | 属性有了新值 |
| `rmAttr` | `id`、`name` | 属性变成了 `null` 或 `false` |
| `handler` | `id`、`event`、`msg` | 绑定的 message 改变了 |
| `insert` | `before`、`nodes` | 出现了一个分支、一个条目或一个子组件 |
| `clear` | `from`、`to` | 两个标记之间的所有内容都被移除 |
| `remove` | `from`、`to` | 一个带 key 的条目连同它的标记一起被移除 |
| `move` | `from`、`to`、`before` | 一个带 key 的条目换了位置 |

## 编译器报告的错误

每条信息都以行号和列号结尾。当编译器拿到文件名时（Vite 插件就是这样做的），信息会以文件名开头：`page.pavlus: Empty expression (line 1, col 4)`。这些都是真实的信息，每一条都来自能触发它的模板。

```text
Tabs are not allowed, use spaces (line 1, col 1)
Inconsistent indentation (line 3, col 1)
This line cannot have children (line 2, col 1)
Cannot parse line "%x" (line 1, col 1)
Unexpected "!" (line 1, col 2)
Unclosed ( (line 1, col 2)
Unterminated string (line 1, col 5)
Unexpected "=" in attributes (line 1, col 5)
Unexpected "?" in attributes (line 1, col 7)
Unexpected "/" (line 1, col 5)
Unclosed { (line 1, col 1)
Empty expression (line 1, col 4)
Expected ":" (line 1, col 9)
Expected property name (line 1, col 7)
Unexpected "b" (line 1, col 6)
Unexpected character "=" (line 1, col 6)
"@click" needs an expression value (line 1, col 8)
"class:on" needs an expression value (line 1, col 4)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
`...spread` is only allowed in component props (+Name(...)) (line 1, col 3)
```

组件相关的信息：

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 1, col 2)
Unexpected "x" after component (line 2, col 8)
Instance name must be an identifier (line 2, col 6)
"data-x" is not a valid prop name (line 2, col 7)
A dynamic component needs an instance name: +{expr}#name(...) (line 1, col 7)
`+outlet` takes nothing after it (line 1, col 8)
Expected a component name or {expression} after + (line 1, col 2)
```

有两个错误不是编译器发现的，而是在运行时才出现：`pavlus: duplicate key 1`（循环中的两个条目有相同的 key，由 `diff` 抛出），以及 `pavlus: +{...} needs a view or a component with a view`。

关于 `Unclosed {` 的列号，有一点要说明：它是从这一行文本的起点开始数的，而不是从行首开始数，所以可能比你预期的小。行号是正确的。

## 常见陷阱

这些是人们最常犯的错误。前几个完全不会报错，所以代价也最高。

- **引号决定含义。** `class="x"` 是文本 `x`；`class=x` 读取 state 字段 `x`。`target=_blank` 读取一个名为 `_blank` 的字段，什么也找不到，于是丢掉这个属性。请写成 `target="_blank"`。
- **文本需要竖线。** 只有单词的一行是元素：`Hello world` 就是 `<Hello>world</Hello>`。单独成行的文本要以 `|` 开头。
- **循环需要单词 `in`。** `for x of xs` 会被当作一个名为 `for` 的元素。页面里会出现 `<for>`，却没有任何错误。
- **零会被显示。** 当 `count` 为 `0` 时，`{count && "items"}` 会渲染出 `0`，因为 `0` 是一个值，而不是空。请使用 `{count > 0 && "items"}` 或三元表达式。
- **空数组是真值。** `if items` 对 `[]` 为真。请写 `if items.length`。
- **裸值在空格处结束。** `title=a + b` 和 `class:on=a === b` 会失败，报 `Unexpected "=" in attributes` 或 `Unexpected "?" in attributes`。请把表达式包起来：`title={a + b}`。
- **裸值是表达式。** `href=/docs` 会失败，报 `Unexpected "/"`。路径要加引号：`href="/docs"`。
- **双引号值里面的双引号**会保留它的反斜杠。请在值外面使用单引号。
- **可选链。** `a?.[0]` 和 `f?.()` 是错误。索引和调用本来就是空值安全的。
- **拼写错误是静默的。** 写错的字段名会渲染成空文本，没有 handler 的 message 什么也不会做。
- **Key。** 没有 `key` 时，位置就是 key，重新排序的列表会被整个重写。重复的 key 会在 `diff` 中抛出错误，而不是在第一次 `render` 时。
- **多个参数会改变 payload。** `@click=pick(id)` 发送的是值；`@click=pick(id, kind)` 发送的是数组。handler 必须与之匹配。
- **模板不会调用 handler。** `@click=save(item)` 不会调用任何东西：它只是构建带有 payload 的 message `save`。
- **先写 import。** `import` 行放在顶部，而且 `+Name` 需要有对应的 import。对于来自 state 的 view，请使用 `+{name}#id`。
- **空元素没有子节点。** `input`、`br`、`img` 等不能有缩进的行。

::demo bare-words

::demo loop-typo

::demo unquoted-target

上面三个 demo 展示了那些静默出错的情况：变成了 `<Hello>` 的文本行，变成了 `<for>` 的循环，以及第一行里缺少 `target` 的链接。

## 综合示例：表单

一个注册表单，用到了带修饰符的事件、`class:` 切换、用于错误提示的条件、布尔属性，以及用于按钮文字的三元表达式。

::demo form

state 保存页面需要的一切：各个值、一个 `errors` 映射，以及标志 `busy` 和 `done`。你的组件的 handler 负责修改它，模板只负责描述每一种情况。

- **出现验证错误。** 姓名输入框获得 class `invalid`（`attr`），两条错误信息被插入到各自的 `if` 所在的位置。没有错误的邮箱字段不会被触碰。
- **输入姓名。** 该字段的输入值、class 和错误都会更新。条款字段的错误保持不变。
- **提交。** 同一个按钮上有三个 patch：`disabled` 和 `class` 出现，文字也变了。`disabled={busy}` 之前是 `false`，之后是 `true`，所以这个属性被添加和移除；`toAttr(true)` 是一个空值。
- **完成。** 按钮恢复原样，并插入 `success` message。

表单上的 `@submit.prevent=submit` 会阻止浏览器重新加载页面。`submit` 的 handler 从 state 中读取这些值，因为每个输入框都已经通过 `@input` 把自己的值复制到了那里。

## 综合示例：带过滤的表格

一个用户表格，带有过滤按钮、搜索框和每行的操作。表格显示的列表是 `visible`，由组件根据完整数据、过滤条件和查询词计算出来。模板自己不能过滤和计数，所以由 handler 来做，模板只显示结果。

::demo table

- **过滤：paused。** 过滤按钮在一个带 key 的循环里，class `active` 从一个按钮移到另一个按钮。其他两个用户的行被移除，页脚文字被更新。
- **过滤：nobody。** 最后一行被移除，用于空行的 `if` 插入 "No users match"。
- **Bob 恢复了。** 这一行保持原位。它的 `paused` class 被移除，按钮的标签改变，并且一个 `handler` patch 给按钮设置了新的 payload `[2, "active"]`。两个参数：一个数组。
- **顺序反转。** 带 key 的行被移动，而不是被重写。

## 综合示例：标签页面板

一个由数据构建的标签栏，以及一个显示三个面板之一的主体。标签栏是带 `class:active` 的带 key 循环，面板是 `if` / `else if` / `else`。

::demo tabs

- 切换标签会改变两个按钮（每个按钮一个 class 和 `aria-selected`，后者写成文本 `"true"` 或 `"false"`，因为 ARIA 需要的是这些单词，而不是空属性），并且**替换**主体：分支变了，所以是 `clear` 和 `insert`。
- 当活动标签打开时有新事件到达，分支保持不变。只有列表改变：新条目一个 `insert`，因为循环是以事件的文本作为 key 的。

这就是整个语言。其余的一切，例如 DOM plugin 如何处理 patch、store 如何改变 state、页面如何路由，都在组件和 plugin 中。

## 你学到了什么

- 模板由行组成：元素、文本行、`if` / `for`、import 和 embed。属性承载 class、事件和 props。
- 值遵循固定的规则：`null`、`undefined` 和 `false` 表示空；`true` 是空属性；`0` 和 `""` 是值。
- 编译器的错误信息很短，并带有行号和列号；危险的错误是那些合法但含义不同的写法。
- 大型页面由同样少数几个部分构建：包含现成可显示值的 state、条件、带 key 的循环，以及带 payload 的事件。

下一页：[编译流水线](page:compiler-pipeline)。
