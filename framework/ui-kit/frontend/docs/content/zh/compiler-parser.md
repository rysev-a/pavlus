---
summary: 解析器如何把模板的行和缩进变成带类型的 AST。你将了解每种节点类型的真实字段、表达式如何被解析、节点 id 如何分配，以及错误如何报告行号和列号。
---
## 解析器做什么

解析器是编译器的第一个阶段。它接收模板的文本，返回一棵**树**，即 AST（抽象语法树）。它不运行任何东西，不知道你的 state，也不写任何 JavaScript。它只回答“这段文本说了什么？”这个问题，当文本没有表达出任何合理的含义时，它会给出清晰的错误信息并失败。

函数是 `parse(source)`，结果的形状如下：

```ts
interface TemplateAst {
  imports: { local: string; from: string }[];
  nodes: Node[];
}
```

`imports` 是顶部的 `import` 行。`nodes` 是模板的顶层节点。节点有六种类型：`element`、`text`、`if`、`for`、`embed` 和 `outlet`。顶层以下的一切都挂在某个 `element`、某个 `if` 分支或某个 `for` 之下。

最小的、有点意思的模板是一个带一处插值的元素。demo 以本站使用的格式展示它的 AST（每个节点一行，带有节点 id 以及它读取的内容）。

::demo ids-small open=ast

这里有两个节点：节点 id 为 `#0` 的元素 `p`，以及它里面的文本节点 `#1`。这个清单背后的真实对象如下所示（解析器的输出，已格式化以便阅读）：

```json
{
  "imports": [],
  "nodes": [
    {
      "type": "element",
      "nid": 0,
      "tag": "p",
      "classes": [],
      "toggles": [],
      "attrs": [],
      "events": [],
      "children": [
        {
          "type": "text",
          "nid": 1,
          "line": 1,
          "parts": ["Hello, ", { "k": "id", "name": "name" }]
        }
      ],
      "pos": { "line": 1, "col": 1 }
    }
  ]
}
```

有两个细节值得记住。文本节点是一个 **parts** 列表：每个 part 要么是普通字符串，要么是表达式对象（`k` 是表达式的种类）。另外，`p Hello, {name}` 的行内文本并不是元素的属性：解析器会把它变成一个真正的子节点。从这里开始，编译器看到的只是一棵节点树。

## 行与缩进

解析器逐行工作。它首先准备这些行：

1. 它在换行处拆分源码，并跳过空行。
2. 缩进中的制表符是错误：`Tabs are not allowed, use spaces`。
3. 以 `//` 开头的行会被丢弃。在其他行上，行尾的 `// comment` 会被切掉，但前提是 `//` 前面有空格，并且不在引号、圆括号和花括号之内。这就是 `href="http://example.com"` 是安全的原因。
4. 剩下的每一行都会记住它的行号、它的缩进（开头空格的个数）和去掉首尾空白后的文本。

然后它用一个**打开的父节点栈**来构建树。对于每一行，解析器会从栈中移除所有缩进不小于该行的父节点。留在栈顶的就是这一行的父节点。这一行被追加到该父节点的子节点中，然后它自己被压入栈。

::demo indent open=ast

在这个模板中，`li Two` 有一个子节点 `b`，因为 `b bold` 的缩进比 `li Two` 多。`p After` 这一行的缩进与 `ul` 相同，所以直到 `li Two` 和 `b bold` 为止的所有节点都从栈中弹出，`p` 成为下一个顶层节点。

有两条规则保证树的正确。

- **同一个父节点的所有子节点必须使用相同的缩进。** 第一个子节点确定缩进，之后任何缩进不同的同级节点都会给出 `Inconsistent indentation`。用几个空格由你决定（惯例是两个）；比父节点多几个并没有固定要求。重要的是同级节点保持一致。
- **有些行是叶子。** 空元素（`br`、`img`、`input` 以及其他 HTML 空标签）、文本行、embed 和 outlet 不能有子节点。它们下面的子行会给出 `This line cannot have children`。

```pavlus-invalid bad-indent.pavlus
div
  p one
    span child of one
   p two
```

```text
bad-indent.pavlus: Inconsistent indentation (line 4, col 1)
```

解析器读到第 4 行（`   p two`，三个空格）。它的父节点是 `div`，而 `div` 的子节点使用的缩进是 2，所以这一行被拒绝。错误总是指向第 1 列，因为问题出在缩进整体上。

## 这是哪一种行？

缩进确定之后，解析器查看这一行的开头，并判断它是什么。检查按这个顺序进行，第一个匹配的生效。

| 行的开头 | 它是 | 节点 |
| --- | --- | --- |
| `import Name from "path"` | 一个 import（只能在文件顶部） | `imports` 的一个条目 |
| `if expr` | 条件 | `IfNode` |
| `else if expr` 或 `else` | 前一个 `if` 的下一个分支 | 该 `IfNode` 中的新分支 |
| `for item in list` | 循环 | `ForNode` |
| 竖线字符和一个空格 | 文本行 | `TextNode` |
| `{` | 以表达式开头的文本行 | `TextNode` |
| `+outlet` | 路由选出的子级 | `OutletNode` |
| `+` | 子 view | `EmbedNode` |
| 其他任何内容 | 元素 | `ElementNode` |

`if x:` 和 `for a in b:` 末尾的冒号是可选的，会被忽略。`else` 必须跟在同一层级的 `if` 或 `else if` 之后；否则你会得到 ``` `else` without matching `if` ```。

## 元素

元素行的形式是：可选的 tag、任意数量的 `.class` 和 `#id`、可选的 `(attributes)`，然后是可选的行内文本。tag 默认是 `div`。我们来解析一行用到了大部分组成部分的代码。

::demo selector-attrs open=ast

AST 只显示依赖，所以这里是真实的节点，较长的部分已被裁剪：

```json
{
  "type": "element",
  "nid": 0,
  "tag": "a",
  "classes": ["btn"],
  "toggles": [{ "name": "on", "test": { "k": "id", "name": "open" } }],
  "attrs": [
    { "name": "id", "value": ["go"] },
    { "name": "href", "value": [{ "k": "id", "name": "url" }] },
    { "name": "disabled", "value": null }
  ],
  "events": [
    {
      "name": "click",
      "msg": "save",
      "args": [{ "k": "id", "name": "id" }, { "k": "lit", "value": 2 }],
      "prevent": true,
      "stop": false
    }
  ],
  "children": [{ "type": "text", "nid": 1, "line": 1, "parts": ["Go"] }],
  "pos": { "line": 1, "col": 1 }
}
```

这一行的每一部分都落在各自的字段里：

- `.btn` 进入 `classes`。`#go` 被存为名为 `id` 的普通属性（它最先添加，排在圆括号中的属性之前）。
- `class:on=open` 进入 `toggles`：一个 class 名称和一个条件。它不是属性。
- `@click.prevent=save(id, 2)` 进入 `events`。`@` 后面的部分是 DOM 事件名，修饰符（`prevent`、`stop`）被转成标志。表达式必须是 `save`、`users.remove` 这样的 message id，或者对它的调用；调用的参数是表达式。其他任何写法都是错误：`Event handler must be a message id like `save` or `remove(item)``。
- `href=url` 是一个属性，它的值是只含一个表达式的列表。没有值的 `disabled` 是 `value: null`：布尔属性。

属性值始终是一个 parts 列表，和文本节点一样。不带花括号的带引号的值，例如 `"go"`，是只含一个字符串的列表。编译器就是这样区分静态属性（只有字符串）和动态属性（含有表达式）的。这个区别在后面会起很大作用。

### 属性值的三种写法

属性值可以用三种方式书写，解析器对每种的读取方式都不同。

- **带引号**：`title="Open {name}"`。引号之间的文本被拆分为字符串和 `{expressions}`，与文本行完全一样。
- **带花括号**：`hidden={count === 0}`。花括号之间的所有内容是一个表达式，所以可以包含空格。
- **裸值**：`href=url`。值在第一个不处于括号或引号内的空格、逗号或右 `)` 处结束。它被解析为一个表达式。

最常见的新手错误就出在裸值这种写法上。含空格的表达式需要花括号：

```pavlus-invalid bare.pavlus
ul
  for link in links
    a(class:current=link.href === page) {link.label}
```

```text
bare.pavlus: Unexpected "=" in attributes (line 3, col 31)
```

裸值 `link.href` 在空格处结束，然后解析器遇到了 `===`，而它期望的是属性名。修复方法是加花括号：`class:current={link.href === page}`。

## 文本行、连接与转义

以 `|` 开头的行是文本节点。解析器会去掉竖线以及它后面的一个空格。文本行可以包含花括号中的表达式，花括号前面的反斜杠会让它保持为字面字符。

::demo escapes open=ast

注释行不见了，`Home` 后面的行尾注释也不见了，不过带引号的 URL 保留了它的 `//`。在段落里，`\{` 和 `\}` 变成了普通花括号，而 `{n}` 变成了表达式。

当两个文本节点前后相连时，解析器会在第二个节点前面放一个换行符。在 HTML 中，单词之间的换行符显示为空格，所以两行读起来就是一个段落，和 pug 模板语言一样。

::demo text-join open=ast

第二个文本节点的 parts 是 `"\n"`、`"two "` 和表达式 `x`。你可以在 HTML 中看到这个换行：`one` 和 `two 2` 在源码的不同行上。同样的规则也会把元素的行内文本（`p Hello`）与它下面的 `|` 行连接起来。

## 条件与循环

`if` 行开启一个 `IfNode`。这个节点有一个 `branches` 列表。每个分支有一个 `test`（一个表达式，对 `else` 则是 `null`）和它的 `children`。`else if` 和 `else` 这两种行不会创建自己的节点：它们给紧挨在前面的 `if` 节点增加一个分支。

::demo if-chain open=ast

AST 视图为每个 `if` 打印一个节点，然后在它下面打印 `then`、`else if` 和 `else` 分组。节点 id 显示了一点需要记住的事：`if` 是 `#0`，三个 `p` 元素及其文本是 `#1` 到 `#6`，而分支本身没有 id。分支不是节点。

节点的真实字段（省略了 children）：

```json
{
  "type": "if",
  "nid": 0,
  "line": 1,
  "branches": [
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "loading" } }, "children": [] },
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "error" } }, "children": [] },
    { "test": null, "children": [] }
  ]
}
```

`for` 行有更多组成部分：一个条目名称、一个可选的索引名称、列表表达式，以及一个可选的 `key` 表达式。

::demo for-index open=ast

```json
{
  "type": "for",
  "nid": 0,
  "line": 1,
  "item": "u",
  "index": "i",
  "of": { "k": "id", "name": "users" },
  "key": { "k": "member", "obj": { "k": "id", "name": "u" }, "prop": "id" },
  "children": []
}
```

解析器在单词 `key` 处拆分 `users key u.id`。当列表变化时，循环用 key 来区分条目；没有 key 时，条目在列表中的位置就是 key。名称 `u` 和 `i` 只在循环内部可见。下一页[依赖分析](page:compiler-analysis)会展示编译器如何使用这一点。

## 子 view 与 outlet

`import` 行给另一个模板起一个名字。以 `+` 开头的行则把它放置到页面上。`#` 前面的名称是**实例名**：它是子级的 message 的前缀，也是子级 state 的 key。

::demo embeds open=ast

```json
{
  "type": "embed",
  "nid": 1,
  "component": "Badge",
  "dynamic": null,
  "name": "first",
  "props": [
    { "name": "label", "value": ["Hi ", { "k": "id", "name": "name" }] },
    { "name": "strong", "value": null }
  ],
  "pos": { "line": 4, "col": 3 }
}
```

AST 视图显示的两个 embed 没有带 props，但依赖显示了区别：`+Badge#first` 读取 `name`，而 `+Badge#second(...extra)` 读取 `extra`，因为展开项（`{ "spread": expr }`）也是一个 prop。没有值的 prop（`strong`）表示 `true`。

解析器会检查下面这些规则，因为编译器无法绕开它们：

- `import` 行只允许出现在文件顶部，缩进为 0，并且在任何节点之前。
- 被导入的名称必须以大写字母开头，并且不能是 `String`、`Array`、`Map`、`Set` 或 `Error`，因为生成的代码自己要用它们。
- `+Name` 需要有匹配的 import：`"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state`。
- 动态 embed `+{expr}` 没有可用来推导实例名的名称，所以它需要显式给出一个：`+{view}#page`。
- `+outlet` 后面不能再跟任何内容。它变成一个 `OutletNode`，只有 `nid` 和 `line`。

## 表达式

每个 `{...}`、每个带花括号或裸写的属性值，以及每个条件，都会交给 `expr.ts` 中另一个独立的解析器。它有意只处理 JavaScript 的一个小子集。分为三步：把文本拆分为 token（数字、字符串、名称和标点），然后逐级爬过优先级层次，最后检查没有任何剩余内容。

结果是一棵小树。每个节点都有一个 `k` 字段表示它的种类：

| `k` | 字段 | 写法 |
| --- | --- | --- |
| `lit` | `value` | `1`、`"text"`、`true`、`false`、`null`、`undefined` |
| `id` | `name` | `count` |
| `member` | `obj`、`prop` | `user.name` 和 `user?.name` |
| `index` | `obj`、`index` | `list[0]` |
| `call` | `callee`、`args` | `format(price, "usd")` |
| `unary` | `op`、`arg` | `!done`、`-n`、`+n` |
| `binary` | `op`、`left`、`right` | `a + b`、`a === b`、`x ?? y` |
| `cond` | `test`、`then`、`else` | `ok ? "yes" : "no"` |
| `array` | `items` | `[1, x]` |

二元运算符及其优先级，从最松到最紧：`??`，然后是 `||`，然后是 `&&`，然后是相等运算符（`==`、`!=`、`===`、`!==`），然后是比较运算符（`<`、`>`、`<=`、`>=`），然后是 `+` 和 `-`，然后是 `*`、`/` 和 `%`。三元 `? :` 比它们都松，一元运算符则结合得更紧。圆括号照常分组。所以 `a + b * 2` 就是 `a + (b * 2)`。

::demo expressions open=ast

AST 视图会根据树把每个表达式重新打印出来，`{a + (b * 2)}` 里多出来的圆括号就是这样来的：那是树的样子，不是你写的文本。还要注意 `user?.name` 被打印成 `user.name`。解析器把 `.` 和 `?.` 视为相同，因为生成的代码无论如何都用 `?.` 读取每个成员。模板不会抛出 “cannot read properties of undefined”。

下面是几棵真实的树。左边的文本是表达式，JSON 是 `parseExpr` 返回的内容：

```json
{ "k": "binary", "op": "+",
  "left": { "k": "id", "name": "a" },
  "right": { "k": "binary", "op": "*", "left": { "k": "id", "name": "b" }, "right": { "k": "lit", "value": 2 } } }
```

```json
{ "k": "cond",
  "test": { "k": "unary", "op": "!", "arg": { "k": "id", "name": "ok" } },
  "then": { "k": "id", "name": "n" },
  "else": { "k": "unary", "op": "-", "arg": { "k": "lit", "value": 1 } } }
```

第一棵是 `a + b * 2`，第二棵是 `!ok ? n : -1`。

> [!NOTE] 表达式不能做什么
> 没有赋值，没有箭头函数，没有模板字符串，没有对象字面量，没有 `typeof`，没有 `new`。其中每一项在构建时都会给出清晰的错误，例如 `{x = 1}` 给出 `Unexpected character "="`，而 `{`a`}` 给出 ``Unexpected character "`"``。改变要通过事件发送 message 来完成。

## 节点 id

每个节点在解析器创建它时都会得到一个数字，即它的 **nid**。计数器对每个模板从 0 开始，并按文档顺序逐个加一：父节点先于它的子节点，节点先于它下面的节点。元素的行内文本在元素之后紧接着得到下一个数字。

import 和分支没有数字。分支是 `if` 节点的一部分，而 import 不属于这棵树。

::demo tree open=ast

请读一下清单里的数字。`section` 是 `#0`，然后 `h2` 是 `#1`，它的文本是 `#2`。`if` 是 `#3`，它的两个分支里的所有内容占用 id `#4` 到 `#9`。`if` 之后是 `footer`，为 `#10`，它的文本为 `#11`。这就是单纯的深度优先顺序。

这些数字对编译器的其余部分很重要。代码生成器把它们写进字符串，这些字符串会成为 vnode 和 patch 中的 id（页脚文本是 `"11"`）。在列表中，节点的 id 是它的 nid 后面加 `#` 和条目 key（`"7#1"`），而子 view 的节点的 id 则扩展为加上 `/` 和 embed 的 nid（`"1/3"`）。同一个模板的两个节点永远不会有相同的 id，因为它们的 nid 不同；而列表中同一个节点的两个副本则靠 key 区分。

> [!TIP] id 不是稳定的名称
> 不要保存 nid，也不要把它写进你自己的代码。在模板顶部加一行，下面的每个数字都会移动一位。这些数字是同一个编译后模块的 `render` 和 `diff` 之间的内部约定。

## 位置与错误

解析器在可能需要报告错误的地方保留源码位置。元素和 embed 有一个 `pos`，包含从 1 开始的 `line` 和 `col`。其他节点有一个 `line`。错误同时带有这两个数字，并且在每个阶段都采用相同的约定。

```ts
class TemplateError extends Error {
  readonly line: number;
  readonly col: number;
}
```

信息以括号中的位置结尾，例如 `Unclosed { (line 1, col 8)`。这两个数字也可以通过 `error.line` 和 `error.col` 获得，所以编辑器之类的工具可以在精确的位置画下划线。`compileTemplate` 在知道文件名时会把它加在前面，这就是你在构建日志里看到的内容。

表达式错误的列号是精确的：解析器把表达式第一个字符的位置传给表达式解析器，后者再加上 token 的偏移量。有一处不精确需要知道：对于文本中的 `Unclosed {`，列号是从 tag 之后的文本起点开始数的，而不是从行首开始数。在下面第一个例子中，`{` 在这一行的第 10 列，而信息说的是 8。以下是编译错误模板得到的一些真实信息：

```pavlus-invalid unclosed.pavlus
p Hello, {user.name
```

```text
unclosed.pavlus: Unclosed { (line 1, col 8)
```

```pavlus-invalid expression.pavlus
p Total: {price *}
```

```text
expression.pavlus: Unexpected end of expression (line 1, col 18)
```

```pavlus-invalid branch.pavlus
p one
else
  p two
```

```text
branch.pavlus: `else` without matching `if` (line 2, col 1)
```

```pavlus-invalid event.pavlus
button(@click=a+b) Save
```

```text
event.pavlus: Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

每个错误都会让解析在第一个问题处停止。解析器不会尝试继续，所以请修复第一条信息，然后重新编译。

> [!WARNING] 引号决定值是什么
> `class="x"` 是文本 `x`。`class=x` 是 state 的字段 `x`。两者都合法，所以都不是错误。如果页面在你期望出现 class 的地方什么也没有，请先检查引号。

## 一个 AST，三个读者

你现在已经看到了解析器产生的全部内容。它是一棵由普通对象组成的普通树，没有方法，后面有三个阶段读取同一棵树：分析读取它来计算每个节点读取什么，`render` 生成读取它来写 vnode，`diff` 生成读取它来写比较。因为各阶段共享同一棵树，它们不可能对模板的含义产生分歧。再用一个包含除 embed 之外所有节点类型的模板来看一下全貌：

::demo if-chain

同一个模板在 AST 中是一个带三个分支的 `if`。在 `render` 中，它变成两个标记之间的 `if / else if / else` 链。在 `diff` 中，它变成对 `prev` 和 `next` 各计算一次分支编号，而分支的变化会变成一个 `clear` 和一个 `insert`。上面这一步展示的正是这些。细节在接下来的几页中。

## 你学到了什么

- `parse` 把行和缩进读成一棵由六种节点类型组成的树。缩进决定父节点，所有同级节点必须保持一致。
- 行内文本会变成真正的文本节点；属性值和文本都是 parts（字符串和表达式）的列表，编译器就是这样知道什么是静态的。
- 表达式由一个独立的小解析器解析成九种节点。`.` 和 `?.` 相同，模板只能读取。
- 节点 id 是深度优先遍历中的创建顺序。它们是内部的，并会成为 vnode 和 patch 的 id。
- 错误是带有行号和列号的 `TemplateError`；构建日志里也会显示文件名。

下一页：[依赖分析](page:compiler-analysis)。
