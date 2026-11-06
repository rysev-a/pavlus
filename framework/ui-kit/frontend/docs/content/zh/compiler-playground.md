---
summary: 一个可编辑的实验场，在你的浏览器里运行真正的编译器。修改模板和 state，就能看到 HTML、生成的模块，以及每个节点读取什么。七个实验会告诉你该改什么、该看什么。
---
## 试一试

下面有两个文本框：左边是模板，右边是 state，用 JSON 书写。按钮 **Compile and run** 会把两者发送给真正的编译器（就在你的浏览器里），并在文本框下面显示结果。不会向任何服务器发送任何东西。**Reset** 会恢复你一开始的示例。

::playground

第一次请不做任何修改，直接按 **Compile and run**。起始示例有一个标题、一句在文本内部带条件的话、一个带 class 切换的带 key 列表，以及一个带 `else` 的 `if`。然后继续往下读，了解输出的各个部分的含义，并尝试下面的实验。

## Compile and run 之后你看到什么

输出的各个部分与本章其他页面中的 demo 相同：

- **Template** 和 **State**：你编译的内容，以及解析出来的 JSON。
- **Result (HTML of render(state))**：`render` 针对你的 state 返回的 HTML。这里不显示标记。
- **Generated module**：`compileTemplate` 返回的模块的完整文本，默认展开。
- **AST and what each node reads**：每个节点一行，带有它所依赖的 state 的根名称。这就是构成 `diff` 守卫的依赖集合。默认展开。
- **The vnodes render(state) returns**：原始数据，默认折叠。展开它可以看到 id 和标记。

如果模板有错误，你会看到 **The compiler stopped:** 和错误信息，其中带有文件名 `playground.pavlus` 以及行号和列号。如果 state 不是有效的 JSON，你会看到 **The state is not valid JSON:** 和解析器给出的信息。

> [!NOTE] 实验场做不到什么
> 它只对你给出的 state 运行一次 `render`。它没有第二个 state，所以这里没有 patch 列表：要看 patch，请使用本页之前几页中的 demo，或者像[API、Vite 插件与错误](page:compiler-tooling)中所展示的那样，在测试中调用 `diff`。你仍然可以在生成的模块里阅读 `diff` 函数，下面的实验就是这样做的。import、`+{expr}` embed 和 `+outlet` 需要 JSON 无法携带的 view 和组件，所以它们在这里会以错误停止。

## 七个实验

对于每个实验，把模板粘贴到左边的框里，把 state 粘贴到右边的框里，然后按 **Compile and run**。

### 1. 什么都不读取的模板

```pavlus
p Hello, world
```

```json
{}
```

打开生成的模块，找到 `diff`。里面只有 `if (prev === next) return patches;` 和 `return patches;`。没有 import 行，因为不需要任何 helper，vnode 也没有 `id` 字段。这个模板里没有任何东西可能改变，所以编译器没有为它写任何东西。

### 2. 读取一个字段

```pavlus
p Hello, {name}
```

```json
{ "name": "Ann", "theme": "light" }
```

AST 显示 *reads: name*，`diff` 中的守卫比较 `prev.name !== next.name`。字段 `theme` 在 state 里，却从未在模块中被提到。现在把模板改成 `p Hello, {name}, theme {theme}` 并再次编译：守卫多了一个比较，文本也多了一部分。

### 3. 依赖相同的父节点与子节点

```pavlus
p(title=text) {text}
```

```json
{ "text": "Hi" }
```

找到守卫 `if (prev.text !== next.text)`。在它里面你会看到 `title` 属性，也有文本。注释 `// line 1: text` 没有自己的 `if`，因为段落的守卫已经覆盖了它。把属性改成 `title=other` 并再次编译：现在文本有了自己的守卫。

### 4. 分支索引

```pavlus
if n > 1
  p many
else if n === 1
  p one
else
  p none
```

```json
{ "n": 1 }
```

结果是 `<p>one</p>`。在模块中找到 `nextBranch`：一串条件，以 `else` 分支的编号结束。删除 `else` 和它的那一行，再次编译：这串条件现在以 `-1` 结束，即“什么都不显示”的值。打开 vnode：`if` 被两个标记节点包住，id 为 `0s` 和 `0e`。

### 5. 带 key 与不带 key 的循环

```pavlus
ul
  for item in items key item.id
    li {item.name}
```

```json
{ "items": [{ "id": 7, "name": "Ann" }, { "id": 9, "name": "Bob" }] }
```

找到以 `const prevItemKeys` 开头的那一行。它把每个条目映射成 `String((item)?.id)`。现在从模板中删除 ` key item.id` 并再次编译：这一行变成 `String(itemIndex)`。看一下两个版本的 vnode：条目的标记以 key 命名，第一个版本是 `1[#7` 和 `1[#9`，第二个版本是 `1[#0` 和 `1[#1`。`remove` 和 `move` 这些 patch 使用的就是这些名称。

### 6. 带参数的事件

```pavlus
button(class:on=on @click=pick(id, kind)) Pick
```

```json
{ "on": true, "id": 1, "kind": "a" }
```

按钮的 vnode 有一个 `events` 字段，其中是 `"click": { "id": "pick", "payload": [1, "a"] }`：handler 是数据。在 `diff` 中，这两个参数用 `sameValues` 比较，class 用 `joinClasses` 重建。把 `@click=pick(id, kind)` 改成 `@click.prevent=pick(id, kind)`，然后找 `prevent: true`。把它改成 `@click=pick`，handler 就会从 `diff` 中消失，因为不带参数的 handler 不可能改变。按钮仍然保留它的 `id`，因为它的 class 还可能改变。

### 7. 错误

故意把模板弄坏。去掉右花括号：

```pavlus-invalid
p Hello, {name
```

输出会被替换成信息 `playground.pavlus: Unclosed { (line 1, col 8)`。把花括号放回去，然后写一行带有 `if` 但没有条件的内容：

```pavlus
if
  p one
```

这不是错误。结果是 `<if><p>one</p></if>`，一个名为 `if` 的元素。这提醒我们，输出是了解编译器理解了什么的最好办法。

## 在模块里看什么

当你打开任何模板生成的模块时，请按这个顺序浏览：

1. **import 行**告诉你模板需要哪些 helper。这一行越长，说明用到的特性越多。
2. **`meta`** 列出被 embed 的子级，并说明是否有 outlet。
3. 在 **`render`** 中，跟着注释 `// line N: ...` 走。每一条都对应你模板的一行。变量以它命名：`liChildren` 是 `li` 的子节点，`userList` 是 `for user in ...` 的列表。
4. 在 **`render`** 中，看哪些节点有 `id`。只有可以被 patch 的节点才有。
5. 在 **`diff`** 中，找注释 `(reads: ...)`。每一条下面那一行就是守卫。
6. 在 **`diff`** 中，找 `patches.push` 的调用。每一个都是八种 patch 操作之一，它的字段就是 DOM plugin 收到的内容。
7. 看一看 **`idSuffix`** 和 **`messagePrefix`**。它们出现在每个 id 和每个 message 中，所以模板可以用在循环里或另一个模板里。

## 你学到了什么

- 实验场在你的浏览器里运行 `compileTemplate` 和 `render`。它显示 HTML、模块以及每个节点的依赖集合，没有 patch 列表。
- 一次只改一处，并比较前后的模块，是学习编译器最快的方式。
- 什么都不读取的模板得到空的 `diff`；与父节点依赖相同的节点共用父节点的守卫；key 会改变条目的命名方式。
- 拼写错误仍然可能通过编译。请阅读结果，而不只是看有没有错误。

下一页：[架构：纯代码与副作用](page:concepts-architecture)。
