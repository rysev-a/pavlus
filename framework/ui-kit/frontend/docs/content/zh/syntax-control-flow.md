---
summary: 用 if / else if / else 仅在条件成立时显示一个块，用 for 为列表中的每一项重复一个块。学习为什么 key 很重要，diff 如何反应，以及如何构建带过滤的列表。
---
## 选择页面上有什么

到目前为止，模板中的每一行都始终存在。真实的页面还需要两种能力：*仅当*某件事为真时才显示一个块，以及为列表中的*每一项各显示一次*一个块。pavlus 为它们各提供一个关键字：`if` 和 `for`。它们不是元素，不产生自己的标签。它们只决定自己的子节点是否存在。

两者都把缩进在其下的行当作它们的主体，和元素一样。

## if

最简单的条件是 `if` 后面跟一个 [表达式](page:syntax-expressions)。当值为真值时，主体被渲染；否则主体根本不存在。

::demo if-simple

看这两个步骤。当 `loggedIn` 从 `true` 变成 `false` 时，`diff` 返回一个 patch，`clear`，它移除名为 `0s` 和 `0e` 的两个标记之间的所有内容。当它变回 `true` 时，`diff` 返回一个 `insert` patch，带有一个新渲染的 `p`。

标记是编译器在每个 `if` 和每个 `for` 周围添加的不可见的注释节点。它们让 patch 可以说“替换这两点之间的内容”，而不必知道里面有什么。它们不会出现在 demo 的 HTML 中，但会出现在 vnode 里，你也会在本页的 patch 中看到它们。

末尾的冒号可以接受，但没有任何含义：`if loggedIn:` 与 `if loggedIn` 相同。

> [!NOTE] 真值判断
> 条件遵循 JavaScript 的规则：`0`、`""`、`null`、`undefined`、`false` 和 `NaN` 是假值。空数组是真值，所以要测试“有内容”，请写 `if items.length`。

## else 和 else if

`else if` 或 `else` 行延续它上面的 `if`。它们必须与 `if` 缩进相同，紧接在它的主体之后。

::demo if-else

第一步把整个问候语替换为登录提示：分支变了，所以标记之间的内容被替换。第二步保持同一个分支，只更新其中的文本。编译器能区分这两种情形，并且永远不会重新渲染一个保持不变的分支。

分支按顺序尝试，第一个为真值的条件胜出。`else` 分支没有条件，并且必须是最后一个。

::demo else-if open=module

打开模块，找到 `prevBranch` 和 `nextBranch`。对于两个 state 中的每一个，生成的代码都会算出所显示的*分支编号*（这里是 0 到 3；如果没有 `else` 且无一匹配，则为 -1）：

```ts
const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "error") ? 1 : ((prev.items)?.length === 0) ? 2 : 3;
const nextBranch = (next.status === "loading") ? 0 : (next.status === "error") ? 1 : ((next.items)?.length === 0) ? 2 : 3;
```

如果两个数字不同，分支就被替换：在标记之间 `clear`，然后 `insert` 从头渲染的新分支。如果相同，则只对该分支内部的变化打 patch。“items 2 → 5”这一步做的正是这样：一个 `text` patch，没有别的。

解析器会为你报告的一种错误，是没有可延续对象的 `else`：

```pavlus-invalid
p First
else
  p Second
```

```text
`else` without matching `if` (line 2, col 1)
```

当第二个 `else` 跟在一个 `else` 后面，或者 `else if` 跟在 `else` 后面时，会出现同样的错误。`if` 与其 `else` 之间隔了其他行，也会打断这条链。

元素内部的 `if` 只是它的一个子节点，元素的其他子节点留在原处：

::demo if-inside

当 `subtitle` 变成非空字符串时，在 `if` 所在的位置，即标题与页脚之间，有一个 `insert` patch。标记就是它落在正确位置的原因。

## for

`for` 为列表的每一项重复它的主体。头部的形式是 `for item in list`：当前项的名字、单词 `in`，以及给出列表的表达式。

::demo for-simple

在主体内部，`name` 是当前项。它是一个*循环变量*：只在循环内部存在，并且如果有同名的 state 字段，它会把那个字段遮住。主体可以有任意多行和任意结构。

如果你还需要位置，在逗号之后为它命名：

::demo for-index

`i` 从 0 开始计数。这里的 `{i + 1}` 生成了便于人阅读的数字。索引和其他表达式值一样，是普通的值。

### 空列表与缺失的列表

空列表什么也不渲染。`null` 或 `undefined` 的列表和空列表一样，所以仍在加载的 state 不会弄坏页面。

::demo for-missing

下一个 demo 的第一步向空列表中添加一个名字。`ul` 保留，新的 `li` 被插入到循环的标记之间：

::demo for-empty

如果你想显示一条消息来代替空列表，请把循环放在 `if` 的一个分支中：

::demo for-if-else

当列表不是数组时，结果取决于它的形状：字符串按字母逐个读取，没有 `length` 的对象什么也不渲染。请把真正的列表放在 state 中。

> [!WARNING] 看起来像关键字的词
> 只有 `for x in list` 才是循环。像 `for x of list` 这样的行不匹配，解析器会把 `for` 当作元素的标签名：页面中会出现 `<for>`，且没有错误。后面什么都没有的单独一个 `if` 也是同样的情况。如果循环没有出现，请检查单词 `in`。

## 为什么 key 很重要

列表会随时间变化：项被添加、移除和重新排序。当 `diff` 比较旧列表和新列表时，它必须决定哪个旧项对应哪个新项。这个决定是通过 **key** 做出的。

key 加在头部、列表之后：`for task in tasks key task.id`。它是针对每一项求值的表达式，必须在列表中唯一，并且对同一件事保持不变。数据中的 id 是最理想的。

::demo keyed-reorder

逐步阅读。

1. 最后一项移到最前面。`diff` 返回两个 `move` patch：它移动已有的 DOM 节点。它不创建、不删除、也不重写任何文本，所以存在于这些节点上的东西（获得焦点的输入框、文本选区、正在运行的动画）都会被保留。这个算法简单但并不最小：为了把最后一项移到最前面，它移动了其后的另外两项，结果顺序是一样的。
2. 第一项被移除：只针对该项的一个 `remove` patch。
3. 末尾新增一项：一个 `insert` patch。
4. 第 2 项的标题改变：一个 `text` patch。文本节点的 id 是 `3#2`：模板 id、一个 `#`，以及 key。

现在是同一个列表，但**没有** key：

::demo unkeyed-reorder

没有 `key` 时，每一项的 key 就是它的**位置**。第 0 项无论内容是什么都仍是第 0 项。所以当最后一项移到最前面时，`diff` 看到三项的文本都变了，于是重写三段文本（`3#0`、`3#1`、`3#2`）。当第一项被移除时，它移除的是*最后一个*元素，并重写其余的，因为元素是按位置识别的。

对于纯文本的列表，这给出的结果是正确的，只是工作量更大。对于 DOM 中带有状态的列表，比如输入框或正在播放的视频，则会给出错误的结果：输入的文本留在第一个输入框里，但第一项的数据现在属于第二个。

> [!TIP] 经验法则
> 如果项可能被添加、移除或重新排序，或者它们持有任何状态，就用数据中的 key 给循环加上 key。只有永远不变的列表才使用索引。

key 按文本比较（`String(key)`），所以 `1` 和 `"1"` 是同一个 key。它们必须唯一：如果两项给出相同的 key，`diff` 会抛出 `pavlus: duplicate key 1`。这种列表的第一次 `render` 不做检查，但第一次 `diff` 会检查，所以错误会在列表变化时才出现。

key 可以是任意表达式，例如两个字段的拼接：

::demo key-expression

## 循环中的循环

循环可以嵌套。每个循环有自己的变量，内层的主体能看到两者的变量。

::demo nested

外层循环用组名作 key，内层用项本身作 key。`group.name` 在内层主体中使用。在这一步中，一个分组里出现了新项，`diff` 为它产生一个 `insert` patch。标记的 id，如 `4e#Veg`，带有外层项的 key，所以两个分组永远不会混在一起。

## 在循环中切换 class

来自 [元素](page:syntax-elements) 的 `class:name=condition` 属性，在循环中以相同方式工作，可以使用循环变量。

::demo class-toggle

不带引号的属性值在第一个空格处结束。`task.id === currentId` 有空格，所以必须用花括号包起来：`class:current={task.id === currentId}`。没有花括号，解析器会在第一个空格处停下，并报告 `Unexpected "=" in attributes`。

看这两个步骤。当 `currentId` 从 2 移到 3 时，一项的 class 被移除，另一项的 class 被添加。在第二步中，第 2 项的 `class` 值变成 `done current`：一个元素的所有切换都被收集到同一个 `class` 属性中，由一个 patch 写入整个值。

## 在 for 内部用 if 过滤

短列表可以直接在表达式里过滤（`items.filter(x => x.done)`））；`if` 作为 `for` 的唯一子节点是另一种方式：每一项只在其条件成立时才显示。这是过滤较短列表的好办法，而且不用构建新数组。

::demo filtered open=ast

从头阅读模板。搜索输入框在每次按键时发送 `setQuery`。`for` 以 `task.id` 作为 key。在它内部，`if` 隐藏不匹配查询的任务（`!query` 使空查询匹配所有内容）。列表之后，第二个 `if` 显示计数，或在没有匹配项时显示一条消息。

在第一步中，用户输入 `es`。`diff` 返回：

- 针对输入框 value 的一个 `attr` patch；
- 两个 `clear` patch，清空第 1 项和第 3 项的 `if`，它们不再匹配：这些项仍留在列表中，但它们的内容没有了；
- 针对计数器的一个 `text` patch。

在第二步中，没有任何匹配。最后剩下的一项被清除，计数器的分支从 `else` 变成“No task matches”消息。

计数器 `shown` 是一个普通的 state 字段，由你的组件中 `setQuery` 的 handler 计算。模板无法对匹配的项计数，因为它只能求值表达式，也没有返回值的循环。这是通常的分工：handler 计算，模板显示。

当列表很长时，请改为在 handler 中过滤，只把可见的部分传给模板。这样循环中只有被显示的项，过滤条件变化时产生的是一组 `insert` 和 `remove` patch：

::demo filtered-visible

两种方式都能给出正确的页面。第一种把所有工作留在模板中，第二种让 DOM 保持较小。

## 组合起来

这个收件箱有加载状态、错误状态、列表、针对每一项的条件和空消息。它用到了本页的所有内容。

::demo inbox

逐步查看：

1. **从加载到就绪。** 分支从第一个变为第三个，所以 `p` 被清除，`ul` 被插入。它只渲染一次，带有两封邮件。
2. **邮件 2 已读。** 只有两个 patch：该项的 `unread` class 被移除（`rmAttr`），位于 `if` 中的 `Mark as read` 按钮被清除。其他都没动。
3. **一封新邮件到达顶部。** 一个 `insert` patch，放在 key 为 1 的项之前。
4. **所有邮件被删除。** 两个 `remove` patch，并插入“Nothing here”消息。
5. **出错。** 第三个分支被第二个替换：列表被清除，带重试按钮的消息被插入。

模板描述的是页面在每个 state 下的样子。编译器算出任意两个 state 之间最小的变更集，那就是你看到的 patch。

## 你学到了什么

- `if`、`else if` 和 `else` 显示一个分支。不同的分支意味着 `clear` 和 `insert`；相同的分支只意味着其内部的变化。
- `for item, i in list key expr` 重复一个主体。空的或缺失的列表什么也不渲染。
- key 在两个 state 之间标识一个项。有 key 时，`diff` 移动、插入和移除整个项；没有 key 时，位置就是 key，内容被重写。
- `if` 放在 `for` 内部用来过滤，计数器或派生列表属于 state，属性中带空格的值需要花括号。

下一页：[组件、导入与出口](page:syntax-components)。
