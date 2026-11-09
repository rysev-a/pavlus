---
summary: 用 {expression} 把动态的值放进模板。学习哪里可以放这样的洞，其中的小型表达式语言，哪些不被支持，以及值究竟如何变成文本和属性。
---
## 文本中的一个洞

总是说同一句话的模板用处不大。要显示 state 中的值，就把一个**表达式**放进花括号里。花括号及其中的内容称为*插值*，或者叫洞：编译器在文本里留下一个洞，每次 render 模板时用值把它填上。

最简单的情形是一个名字。`name` 不是文本，而是 state 的字段 `name`。

::demo hello

看这两个步骤。当 `name` 从 Ann 变成 Bob 时，`diff` 返回一个替换文本的 patch。当 `name` “变成”相同的值时，`diff` 什么也不返回：编译器生成了一个比较新旧文本的检查，只有两者不同时才产生 patch。

`{` 和 `}` 之间的一切都由 pavlus 自己解析。它**不是**用 `eval` 运行的 JavaScript：它是一门小型的纯语言，有自己的解析器，编译器再把它翻译成普通的 JavaScript。本页其余部分就描述这门语言。

## 哪里可以放洞

洞可以出现在三个地方：

- 在文本中：标签之后（`p Hello, {name}`）和 `|` 文本行里；
- 在带引号的属性值中：`title="Open {user.name}"`；
- 作为整个属性值：`alt={user.name}` 或 `src=user.avatar`。

class 切换（`class:late=order.late`）、`@event` 的参数、`if` 条件、`for` 列表和组件 props 也接受表达式。它们在各自的页面中介绍。

::demo in-attributes

在第二行，`src=user.avatar` 既没有花括号也没有引号。裸值是表达式，到第一个空格处结束，所以它必须是单个“词”（不含空格）。当表达式内部需要空格时，用花括号把它包起来：`alt={user.name}`。两种写法意思相同。

> [!NOTE] 引号决定值是什么
> `alt="user.name"` 是字面文本 `user.name`。`alt=user.name` 和 `alt={user.name}` 读取 state。`alt="{user.name}"` 也读取 state，下面关于属性值的一节会说明其中的细微差别。

## 名字与成员访问

表达式中的裸词是一个**名字**。它在你传给 `render` 的 state 中查找；在 `for` 循环内部，它也可以是循环变量（见 [条件与循环](page:syntax-control-flow)）。点号读取一个值的属性。

::demo members

phone 和 zip 根本不在 state 里，但什么也没坏。pavlus 中的每一个点都是 **null-safe** 的：`user.phone.number` 编译成 `((state.user)?.phone)?.number`，所以只要途中任何一步是 `null` 或 `undefined`，整个表达式就是 `undefined`，而 `undefined` 渲染为空。你永远不必写 `user && user.phone && user.phone.number` 这样的保护。

表达式 `?.` 也被接受，意思和 `.` 相同：

```pavlus
p {user?.name} is the same as {user.name}
```

因此，模板永远不会因为 state 不完整而抛出异常。这在数据仍在加载时很有用。这也意味着字段名的拼写错误不会大声失败：它只会渲染成空文本。如果某个值没有显示出来，请先检查拼写。

> [!TIP] 读取按根名字来追踪
> 编译器会记录表达式读取了哪些名字。`user.address.city` 读取 `user`。当 `diff` 比较两个 state 时，它首先问：“`prev.user` 和 `next.user` 是同一个对象吗？”如果是，整个节点都被跳过。如果是新对象，就重新计算文本并比较，只有结果不同才产生 patch。这就是为什么你应该替换 state 中的对象，而不是原地修改它们。

## 字面量

表达式可以包含字面量。

| 种类 | 示例 | 说明 |
| --- | --- | --- |
| 数字 | `0`, `42`, `3.14`, `.5`, `1e3` | 始终是 JavaScript 数字 |
| 字符串 | `"text"`, `'text'` | 两种引号都可以；`\n`、`\t` 和 `\r` 是转义，对其他任意 `x`，`\x` 就是 `x` |
| 布尔值 | `true`, `false` | |
| 空值 | `null`, `undefined` | 和 JavaScript 一样是单词 |
| 数组 | `[1, 2, 3]`, `[a, b]` | 元素是表达式 |

没有对象字面量（`{ a: 1 }`），没有正则表达式，也没有用反引号的模板字符串。

字符串可用于运算符的后备值，也可用于三元表达式某个分支的文本，下面会看到。字符串中的花括号不会结束洞：`{"}"}` 是一个打印右花括号的洞。

## 索引访问与调用

方括号按位置或按键读取一项。索引是表达式，所以它可以来自 state。和点号一样，索引也是 null-safe 的。

::demo indexing

调用的形式是 `callee(arguments)`。被调用者可以是名字或成员，所以你可以调用 state 中值的方法。在模板里格式化一个值就是这样做的：

::demo calls

`{missing.toUpperCase()}` 是空的，而不是错误：调用同样是 null-safe 的，调用 `undefined` 的结果是 `undefined`。这和点号一样会掩盖错误，所以要在知情的情况下使用。

调用生成的代码是 `((state.tags)?.join)?.(", ")`：方法仍然是在 `state.tags` 上调用的，所以 `this` 是正确的。

函数只能通过 state 或 state 中的值到达。模板没有全局变量：`Math.round(x)` 读取的是名为 `Math` 的 state 字段。如果你需要计算出来的值，就在改变 state 的 handler 中计算，并把结果保存在 state 里（`total`、`visibleItems`、`label`）。

> [!WARNING] 可选链只用于属性
> `?.` 只在属性名之前被接受。`items?.[0]` 和 `callback?.()` 是错误：`Expected property name`。你并不需要它们，因为 `items[0]` 和 `callback()` 本来就是 null-safe 的。

## 运算符

支持以下运算符，从优先级最高到最低：

| 运算符 | 含义 |
| --- | --- |
| `.` `[ ]` `( )` | 成员、索引、调用 |
| `!` `-` `+`（在值之前） | 非、取负、转为数字 |
| `*` `/` `%` | 乘、除、取余 |
| `+` `-` | 加（或连接字符串）、减 |
| `<` `>` `<=` `>=` | 比较 |
| `==` `!=` `===` `!==` | 相等、不相等、严格相等、严格不相等 |
| `&&` | 与：第一个假值，或最后一个值 |
| 双竖线 | 或：第一个真值，或最后一个值 |
| `??` | nullish：仅当左侧为 `null` 或 `undefined` 时取右侧 |
| `a ? b : c` | 三元，优先级最低 |

“双竖线”一词指两根竖线 `||`。圆括号 `( )` 用来分组，和算术中一样。

::demo operators

注意 demo 中的这几行：

- `{qty > 1 && "many"}` 在这里是 `"many"`。如果 `qty` 是 1，值会是 `false`，渲染为空：这是“仅当……时才显示这段文本”的简便写法。
- `{qty >= 3 || "few"}` 在这里是 `true`，而 `true` 渲染为文本 `true`。比较的结果是布尔值，所以 `||` 是针对值的后备工具，而不是针对条件的。需要文本时，使用三元表达式。
- `{label ?? "no label"}` 替换 `null`。

`??` 与双竖线的区别，对 `0` 这类值很重要。双竖线替换每一个假值，`??` 只替换 `null` 和 `undefined`：

::demo nullish

当 `count` 等于 `0` 时，第一行回退到 `none`，第二行显示 `0`。当零或空字符串是有意义的值时，使用 `??`。

有两处与 JavaScript 不同，所以从你的代码里复制表达式时要小心。第一，没有位运算符，没有 `**`，没有 `typeof`、`in`、`new`，没有赋值（`=`、`++`），也没有逗号运算符。第二，`??` 是普通运算符，可以不加括号地与 `&&` 和 `||` 混用。它的结合比 `||` 更松：`a ?? b || c` 表示 `a ?? (b || c)`。

::demo precedence

拿不准时就加括号。它们在生成的代码中不花任何代价，因为编译器本来就会在每个运算周围写上它自己的括号。

## 三元表达式：选择一个值

`condition ? a : b` 在两个值中选一个。三元表达式向右嵌套，所以一连串写起来像 `else if`：

::demo ternary

在第二步中，计数从 2 变到 9：两行都变了。在第一步（1 到 2）中只有第一行变化，因为 `few` 仍然是 `few`。编译器比较的是每一行的最终文本，而不是输入。

对于页面中整块出现或消失的部分，使用 `if`，而不是三元表达式。三元表达式产生的是*值*；`if` 产生的是*节点*。

## 数组

数组字面量创建一个数组。它主要用来给方法提供数据，或按索引取值。

::demo arrays

## 箭头函数

箭头函数在需要回调的地方可用：作为 `filter`、`map`、`find`、`some`、`sort` 等方法的参数。只支持表达式形式（`x => x.on`、`(a, b) => a - b`）；没有语句，也没有块主体。参数是全新的名字：它们会遮住同名的 state 字段，而变更检查不会把它们算作读取。

::demo arrows

在模板里写一个短的 `filter` 或 `map` 是可以的。当表达式变长时，请在 handler 中计算列表并把结果保存在 state 里 —— 这样模板只需要读取它。

## 真值判断

在期望条件的地方（`?:`、`&&`、`||`、`!`、`if`、`class:name=...`），pavlus 使用 JavaScript 的规则，因为生成的代码就是 JavaScript。下列值是**假值**：`false`、`0`、`""`、`null`、`undefined` 和 `NaN`。其他一切都是真值。

::demo truthiness

其中有两行会让来自其他语言的人吃惊。空数组是真值，所以对空列表 `if items` 为真；要询问其中是否有东西，请写 `if items.length`。另外，字符串 `"0"` 是真值。

## 值如何写成文本

文本中的洞会调用名为 `toText` 的辅助函数。下面是它在 runtime 中的完整定义：

```ts
export function toText(value: unknown): string {
  return value == null || value === false ? "" : String(value);
}
```

所以 `null`、`undefined` 和 `false` 变成空字符串。其他一切都用 `String(...)` 转换。

::demo text-values

这是有意为之。它让 `{cond && "text"}` 能够表示“条件成立时显示这段文本”，也让缺失的数据不可见。注意三个可能让你意外的结果：

- `0` 显示为 `0`。对于计数，这通常正是你想要的。
- `true` 显示为单词 `true`。
- 对象没有有用的文本：它变成 `[object Object]`，数组则变成用逗号连接的各项。如果你看到其中任何一种，说明你打印的是整个值，而你本想打印的是某个字段。

## 值如何写成属性

属性与文本不同，因为属性可以*不存在*。辅助函数是 `toAttr`：

```ts
export function toAttr(value: unknown): string | null {
  if (value == null || value === false) return null;
  return value === true ? "" : String(value);
}
```

- `null`、`undefined` 和 `false` 表示**没有属性**。该属性不会被渲染，如果它之前存在，`diff` 会用 `rmAttr` patch 把它移除。
- `true` 表示一个值为空的属性，如 `disabled=""`。布尔属性就是这样被打开的。
- 其他一切都是字符串形式的值，包括 `0` 和空字符串。

::demo attr-values

阅读输出和三个步骤。`checked={on}` 变成了 `checked=""`。`disabled=off` 不存在，因为 `off` 是 `false`。`title="{note}"` 在 `note` 为 `null` 时不存在，随后一步把它加上，最后一步又把它移除。`data-count=count` 保留了 `0`。

不带值的裸属性，比如 `button(disabled)` 中的 `disabled`，根本不是表达式：它是固定的空属性。

### 一个洞，还是带洞的字符串

如果带引号的值**只有**一个洞，`title="{note}"`，编译器会把它完全当作 `title={note}`，并使用 `toAttr`。如果值在洞的周围还有其他文本，`title="Note: {note}"`，则整个值是一个由多段拼接而成的字符串，其中每个洞都使用 `toText`。字符串永远不会缺失。

::demo attr-strings

当 `note` 为 `null` 时，第一行没有 `title`。第二行有 `title="Note: "`。当“没有值”应当移除属性时选第一种写法，需要前缀时选第二种。

要用条件来显示或隐藏属性，使用返回 `null` 的三元表达式：

::demo ternary-attr

这里 `data-state` 不存在，因为 `busy` 为 false，而 `aria-pressed` 的文本是 `"true"` 或 `"false"`。对于像 `[data-state="busy"]` 这样的 CSS 规则所读取的属性，这也是正确的写法：布尔值 `true` 会是空值，匹配不上。

## 插值字符串是如何编译的

拿一个有三个洞的模板，打开编译器为它生成的模块：

::demo compiled open=module

在 `render` 中，文本是用 `+` 连接各段构建的：字面量部分是 JavaScript 字符串，每个洞都包在 `toText(...)` 里。这是编译器为上面的模板写出的那一行：

```ts
text: "" + toText((state.user)?.name) + " wrote " + toText(state.count) + " " + toText(((state.count === 1) ? "post" : "posts"))
```

因为这个字符串以洞开头，编译器会先放一个 `""`，这样即使第一个洞是数字，结果也总是字符串。以字面文本开头的字符串，比如 `Hello, {name}!`，则以那段文本开头。

`diff` 会构建两次同样的表达式，一次针对 `prev`，一次针对 `next`，然后比较两个字符串。这就是为什么 patch 是带完整新文本的单个 `text` 操作，以及为什么未改变的文本什么也不产生。生成代码中的注释 `(reads: user, count)` 是该节点读取的名字列表。它下面的 `if (prev.user !== next.user || prev.count !== next.count)` 一行，是在它们都没有变化时跳过工作的保护。

输出中每个运算符都被括号包起来，每次成员访问都用 `?.`，每次调用都用 `?.( )`。编译期不会求值任何东西，你的表达式里的任何内容也无法触及 state 之外：编译后的函数只能看到 `state`、辅助函数，以及它自己构建的值。

## 转义花括号

文本中字面的 `{` 会开始一个洞。要写出花括号，就在它前面加反斜杠。没有关闭任何洞的 `}` 可以直接写。

::demo escapes

`\{` 和 `\}` 是文本中仅有的转义。在带引号的属性值内部它们同样有效。引号则不同：在 `"..."` 内部你不能写双引号（反斜杠会留在值里），所以要在值外面用单引号，`title='He said "hi"'`，或者把字符串放进洞里。

## 不被支持的内容

这门语言有意做得很小。这样编译器更容易推理，节点的每个依赖都能在编译期列出，模板也不能运行任意代码。下面是你最先会尝试的写法，以及你会得到的真实错误。

```pavlus-invalid
p {2 ** 8}
```

幂运算：`Unexpected "*" (line 1, col 7)`。没有 `**`；请写 `x * x` 或在 handler 中计算。

```pavlus-invalid
p {`Hello ${name}`}
```

模板字符串：`Unexpected character "`" (line 1, col 4)`。请改用属性中的 `"Hello {name}"`，或带洞的文本。

```pavlus-invalid
p {count = 1}
```

赋值：`Unexpected character "=" (line 1, col 10)`。模板从不改变 state。改变 state 是事件的事，它们向你的代码发送 message。

```pavlus-invalid
p {typeof user}
```

表中没有的 JavaScript 运算符：`Unexpected "user" (line 1, col 11)`。单词 `typeof` 被当作名字读取，然后 `user` 前面没有运算符。

```pavlus-invalid
p {a, b}
```

逗号运算符：`Unexpected "," (line 1, col 5)`。逗号只用来分隔调用的参数和数组的元素。

```pavlus-invalid
p {}
```

里面什么也没有的洞：`Empty expression (line 1, col 4)`。

```pavlus-invalid
p {name
```

一个从未关闭的洞：`Unclosed { (line 1, col 1)`。

对于所有这些情况，通用的答案都一样：在 state 变化的地方，也就是 handler 中做这些工作，并在 state 中保存一个现成可显示的值。这样模板只需读取值并在它们之间做选择。

## 组合起来

这个订单摘要用到了成员访问、方法调用、三元表达式、比较、`??`、`class:` 以及属性中的洞。

::demo all-in-one

在这一步中，客户被移除了。有两样东西变化，其他都没变：`title` 属性（带洞的字符串，所以被重新计算为 `Placed by someone`）和段落的文本。标题和行数读取 `order`，它在这一步中没有改变标识，所以它们的检查在第一次比较时就被跳过。

`order.customer?.name ?? 'someone'` 和 `order.customer.name ?? 'someone'` 都能工作。`?.` 只是给读者的提醒。

## 你学到了什么

- `{expr}` 可以出现在文本中、带引号的属性值中，或者作为整个属性值（`alt={x}` 或 `alt=x`）。
- 这门语言有字面量、名字、`.` 和 `[ ]`（都是 null-safe 的）、调用、一元和二元运算符、`?:`、数组以及表达式体的箭头函数。没有赋值，也没有模板字符串或对象字面量。
- `null`、`undefined` 和 `false` 是空文本和缺失的属性；`true` 是空属性；`0` 和 `""` 是值。
- 编译器把带洞的字符串变成 `"literal" + toText(expr) + ...`，并比较 `prev` 和 `next` 的结果来决定是否产生 patch。

下一页：[事件与消息](page:syntax-events)。
