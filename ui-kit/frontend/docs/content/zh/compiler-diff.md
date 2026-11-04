---
summary: 编译器如何写出 `diff(prev, next)`，即把两个 state 变成一小串 DOM patch 的函数。你将了解守卫、八种 patch 操作，以及为文本、属性、class 和事件 handler 生成的确切代码。
---
## diff 的用途

pavlus 模板会被编译成两个纯函数。`render(state)` 针对一个 state 返回整个模板，形式是称为 **vnode** 的普通对象。`diff(prev, next)` 接收两个 state，旧的和新的，并返回一个 **patch** 列表：这些是小的普通对象，例如“把节点 4 的文本设为 `Bob`”。DOM plugin 是唯一应用它们的代码。

思路很简单：当 state 改变时，没有人会重建页面。编译器已经知道模板的每个部分读取 state 的哪个部分，所以 `diff` 只查看可能发生了变化的部分。

最简单的情形是一个什么都不读取的模板。

::demo static open=module

看一下生成的 `diff`。它只有两行：`if (prev === next) return patches;` 和 `return patches;`。编译器发现模板不读取任何 state，所以没有什么需要比较。无论两个 state 是什么，答案都是空列表。

## 每个 diff 的形状

现在来看一个读取 state 中两个字段的模板。

::demo text open=module

第一步改变了 `count`，`diff` 返回一个 patch。第二步同时改变了两个字段，仍然只有一个 patch：段落的文本是一个节点，所以一个 patch 就替换了它。第三步什么都没改，列表为空。下面是生成的函数：

```ts
function diff(prev, next, idSuffix = "", messagePrefix = "", env) {
  const patches = [];
  if (prev === next) return patches;
  // line 1: <p> (reads: name, count)
  if (prev.name !== next.name || prev.count !== next.count) {
    // line 1: text
    const prevText = "Hello, " + toText(prev.name) + "! You have " + toText(prev.count) + " items.";
    const nextText = "Hello, " + toText(next.name) + "! You have " + toText(next.count) + " items.";
    if (prevText !== nextText) patches.push({ op: "text", id: "1" + idSuffix, text: nextText });
  }
  return patches;
}
```

请逐行阅读，因为每个 diff 都有相同的形状：

1. `const patches = [];` 是将要返回的答案。
2. `if (prev === next) return patches;` 是最廉价的出口。state 对象常常根本没有变，调用在这里就结束了。
3. 注释 `// line 1: <p> (reads: name, count)` 说明这个代码块来自模板的哪一行，以及它依赖 state 的哪些部分。
4. **守卫** `if (prev.name !== next.name || prev.count !== next.count)` 是依赖检查。如果段落读取的字段都没有变化，整个代码块就被跳过。
5. 在守卫内部，文本用同样的表达式计算两次，一次来自 `prev`，一次来自 `next`。只有两个字符串不同，才会产生 patch。

这段代码里有两点值得停下来想一想。第一，守卫用 `!==` 比较，这是引用比较，几乎不花任何成本。里面的文本比较是字符串比较，只在守卫通过时才发生。第二，文本是在构建之后才比较的。如果 `count` 从 `2` 变成 `"2"`，守卫会通过，但两段文本都是 `You have 2 items.`，所以不会产生 patch。

## 为什么 diff 比较的是 state 而不是树

许多框架在每次更新时都会构建一棵新的节点树，然后把新树与旧树比较。pavlus 不这样做。`diff` 接收两个 **state**，在更新路径上从不构建树。

- 编译器在构建时就知道哪个节点读取哪个字段。树的比较则必须在运行时、逐个节点地重新发现这一点。
- 没有任何模板读取的字段是免费的。在下一个 demo 中，state 有一个 `theme` 字段，但模板只读取 `name`。

::demo other-field open=module

守卫是 `prev.name !== next.name`。`theme` 的改变永远不会进入这个代码块，所以答案是 `[]`，一个字符串都不用比较。

- 更新时不会调用 `render`。只有出现新的片段（`if` 的一个分支、`for` 的一个新条目）时，才会 render 那个片段，而且只 render 那个片段。
- 结果是普通数据。你可以在测试中调用 `diff`，打印 patch，或者通过网络发送它们。一切都不需要浏览器。

## 守卫从哪里来

编译器为每个节点计算它读取的**自由名称**集合：state 的根字段，以及外层循环的变量。这就是*依赖集合*。你可以在每个 demo 的 AST 部分（*reads: name*）以及生成代码的 `(reads: ...)` 注释中看到它。

依赖始终是表达式的**根**。`{user.name}` 依赖 `user`，而不是 `user.name`；`{items[page]}` 依赖 `items` 和 `page`。

::demo member open=module

在这一步中，`user` 是一个 `name` 相同的新对象。守卫 `prev.user !== next.user` 通过，文本被重新构建，两个字符串相等，结果是 `[]`。守卫便宜而粗糙；里面的字符串比较则是精确的。

> [!WARNING] state 必须是不可变的
> `diff` 信任 `!==`。如果你原地修改 `state.user.name`，`prev.user` 和 `next.user` 就是同一个对象，守卫不通过，也不会产生 patch。务必给发生变化的值一个新的身份：构建一个新对象或新数组。store plugin 会替你做到这一点。

## patch 操作

patch 是带有 `op` 字段的对象。共有八种。前四种改变一个已有的节点，后四种改变结构。

| 操作 | 字段 | 含义 |
| --- | --- | --- |
| `text` | `id`、`text` | 设置节点 `id` 的文本内容。 |
| `attr` | `id`、`name`、`value` | 设置元素 `id` 的属性 `name`。 |
| `rmAttr` | `id`、`name` | 移除元素 `id` 的属性 `name`。 |
| `handler` | `id`、`event`、`msg` | 替换元素 `id` 的事件 `event` 所发送的 message。 |
| `insert` | `before`、`nodes` | 创建 vnode `nodes`，并把它们插入到已有节点 `before` 之前。 |
| `clear` | `from`、`to` | 移除标记 `from` 和 `to` 之间（不含两端）的所有内容。 |
| `remove` | `from`、`to` | 移除从 `from` 到 `to` 的同级范围，两端都包含。 |
| `move` | `from`、`to`、`before` | 移动从 `from` 到 `to` 的同级范围，使它位于节点 `before` 之前。 |

本页讲的是前四种。另外四种是[下一页](page:compiler-control-flow)的主题，因为它们属于 `if`、`for` 和 embed。

每个 `id` 都是字符串。只有节点有 id 才能被 patch，所以编译器**只有在 patch 可能以某个节点为目标时**才给它 id：带有 `{expressions}` 的文本节点、带有动态属性、class 切换或带参数事件的元素。静态节点完全没有 id。DOM plugin 保存着一张从 id 到 DOM 节点的映射，在构建节点的过程中填充，并通过查找 id 来应用 patch。如果 id 未知，它会抛出 `pavlus/dom: unknown node id`。

id 是节点在模板中的编号（解析器按阅读顺序给节点编号），后面跟着实例的**后缀**。顶层模板的后缀是 `""`，所以它的 id 看起来像 `"1"`。在 `for` 的条目或被 embed 的子级内部，后缀会更长，这就是同一个模板可以在页面上出现多次而没有两个节点共用同一个 id 的原因。

## text patch

你已经见过 `text` patch。当模板有多个文本节点时，每个节点都有自己的 id 和自己的守卫，所以一次变化只会触及读取它的那个节点。

::demo guards open=module

`div` 读取 `title` 和 `author`，所以它的守卫是它各个子节点守卫的并集。在它内部，`h2` 和 `p` 各有自己的守卫。静态行 `Static line` 什么都不读取，在 `diff` 里根本没有代码。第四步先传入字符串 `"1"` 的 `title`，再传入数字 `1`：守卫通过，两侧的文本都是 `"1"`，所以不产生 patch。

下面是展示嵌套结构的那部分生成代码：

```ts
  // line 1: <div.card> (reads: title, author)
  if (prev.title !== next.title || prev.author !== next.author) {
    // line 2: <h2> (reads: title)
    if (prev.title !== next.title) {
      // line 2: text
      const prevText = "" + toText(prev.title);
      const nextText = "" + toText(next.title);
      if (prevText !== nextText) patches.push({ op: "text", id: "2" + idSuffix, text: nextText });
    }
    // line 3: <p.muted> (reads: author)
    if (prev.author !== next.author) {
      // line 3: text
      const prevText = "by " + toText(prev.author);
      const nextText = "by " + toText(next.author);
      if (prevText !== nextText) patches.push({ op: "text", id: "4" + idSuffix, text: nextText });
    }
  }
```

外层守卫只是一个捷径：当两个字段都没变时，一次检查代替了两次。依赖与父节点相同的子节点不会得到自己的守卫，因为父节点的检查已经覆盖了它。你可以在下一个 demo 中看到这一点，其中一个元素和它的文本都读取字段 `text`。

::demo redundant open=module

`title` 属性和文本都在同一个守卫 `if (prev.text !== next.text)` 里面。注释 `// line 1: text` 没有自己的 `if`。

## 属性 patch

值是表达式、或者是带 `{holes}` 的字符串的属性，可能发生变化。对于每个这样的属性，编译器都写同样的四行：在两侧计算值，比较，然后推入 `attr` 或 `rmAttr`。

::demo attributes open=module

这三步分别改变 `url`、`name`，以及两者。下面是这两个属性的代码：

```ts
    const prevHref = toAttr(prev.url);
    const nextHref = toAttr(next.url);
    if (prevHref !== nextHref) {
      patches.push(nextHref === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "href" }
        : { op: "attr", id: "0" + idSuffix, name: "href", value: nextHref });
    }
    const prevTitle = "Open " + toText(prev.name);
    const nextTitle = "Open " + toText(next.name);
    if (prevTitle !== nextTitle) {
      patches.push(nextTitle === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "title" }
        : { op: "attr", id: "0" + idSuffix, name: "title", value: nextTitle });
    }
```

运行时 helper `toAttr` 把 state 的值转成属性值。`null`、`undefined` 和 `false` 变成 `null`，意思是“没有属性”。`true` 变成空字符串，这就是 HTML 书写布尔属性的方式。其他任何值变成它的字符串。带 hole 的字符串，例如 `"Open {name}"`，始终是字符串，所以对它来说 `null` 分支永远不会运行；编译器为每个属性写同样的代码，因为这样能让生成器保持简单。

下一个 demo 展示三种结果：属性被移除、被设为空值、被设为一段文本。

::demo attribute-removed open=module

- `locked` 从 `true` 变成 `false`：`toAttr(false)` 是 `null`，所以 patch 是 `rmAttr`。
- `locked` 从 `false` 变成 `true`：值是空字符串，所以 patch 是带 `value: ""` 的 `attr`，按钮再次被禁用。
- `hint` 从 `null` 变成一段文本，再变回去：先是 `attr`，然后是 `rmAttr`。
- `hint` 从一段文本变成空字符串 `""`。这不是 `null`，所以属性仍然保留，值为空。只有 `null`、`undefined` 和 `false` 会移除属性。

## class patch

class 和其他属性一样，只有一点不同：模板可以从三个来源构建它，即静态 class（`li.item`）、切换（`class:active=cond`）和 `class` 属性。当其中任何一个是动态的时，编译器会用 helper `joinClasses` 把它们全部连接起来，并比较整个结果。

::demo classes open=module

```ts
    const prevClass = joinClasses(["item", (prev.active ? "active" : ""), (prev.done ? "done" : "")]);
    const nextClass = joinClasses(["item", (next.active ? "active" : ""), (next.done ? "done" : "")]);
    if (prevClass !== nextClass) {
      patches.push(nextClass === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "class" }
        : { op: "attr", id: "0" + idSuffix, name: "class", value: nextClass });
    }
```

所以切换不是添加或移除某一个 class 名称。它用新的完整字符串 `item` 或 `item active done` 替换整个 `class` 属性。这既简单又安全：DOM 永远不会持有模板不知道的 class 列表。代价是，你用 JavaScript 手动添加的 class 会在下一次变化时被覆盖。在 pavlus 中，属性归模板所有。

当没有任何 class 剩下时，例如模板只有切换而且全部关闭时，`joinClasses` 返回 `null`。

::demo class-removed

当 `on` 变成 `false` 时，class 列表为空，helper 返回 `null`，patch 就是针对 `class` 的 `rmAttr`。

## 事件 handler patch

在 pavlus 中，事件 handler 不是函数。`@click=pick(id)` 是**数据**：message `{ id: "pick", payload: id }`。这对 `diff` 有一个后果：handler 可以按值比较，而没有变化的 handler 不花任何成本。

handler 只有在带有参数时才可能变化。`@click=save` 在每个 state 中都是同一个 message，所以编译器把它当作静态的，在 `diff` 中从不提到它。

::demo static-handler

有参数时，payload 是 state 的一部分，编译器会比较这些 payload。

::demo handler open=module

```ts
    const prevClickPayload = prev.id;
    const nextClickPayload = next.id;
    if (!(prevClickPayload === nextClickPayload)) {
      patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
    }
```

`handler` patch 携带整个新的 message。DOM plugin 不会添加新的监听器：每个元素和事件只有一个监听器，而这个监听器始终读取最新的 message。所以 `handler` patch 只是替换映射中的一个值，patch 之后发生的点击会发送新的 payload。

有多个参数时，payload 是数组，所以编译器使用 helper `sameValues`，它把元素相同的两个数组视为相等。元素相同的新数组不算变化。修饰符 `.prevent` 和 `.stop` 在 message 中变成 `prevent: true` 和 `stop: true`。

::demo handler-many open=module

第一步只改变 `kind`，第二步只改变 `title`。看看每个变化如何恰好对应一种 patch：`kind` 在 handler 的 payload 中，`title` 在文本中，`url` 在属性中。第三步改变了 `url` 和 `id`，产生两个 patch，一个 `attr` 和一个 `handler`。

对于顶层模板，前缀 `messagePrefix` 为空。对于作为子级被 embed 的模板，它是实例名加一个点，子级发出的 message 就是这样找到正确的 handler 的。embed 在[下一页](page:compiler-control-flow)中讲解。

## DOM plugin 如何应用 patch

当应用的 state 改变时，DOM plugin 会对每个已挂载的 view 调用 `view.diff(oldState, newState)`，并按顺序应用这个列表。对于本页的四种操作，工作就是一次查找加一次 DOM 调用：

- `text` 设置节点的 `textContent`。
- `attr` 调用 `setAttribute`。对于 `value`、`checked` 和 `selected`，它还会设置实时属性，因为对表单字段来说，属性只给出初始值。
- `rmAttr` 调用 `removeAttribute`。
- `handler` 替换元素的监听器所发送的 message。

patch 按 `diff` 返回的顺序应用。这个顺序对下一页的结构性 patch 很重要，而且它是稳定的：`diff` 的代码遵循模板的顺序。

## 一个更大的示例

这张商品卡片有一个由两个切换构建的 class、带多个字段的文本、一个带动态属性、title 和 handler 的按钮，以及一个显示徽章的 `if`。打开生成的模块，找出守卫：卡片一个，每个子节点各一个。

::demo product open=module

逐步阅读这些步骤，找出让每一步通过的守卫：

- `stock 3 → 2`：卡片、按钮和 `<p.stock>` 读取 `stock`，所以它们的守卫通过。class 和 `disabled` 属性被重新计算，但它们的值相等，所以只产生一个 `text` patch。
- `stock 1 → 0`：class 增加了 `out`，按钮得到 `disabled`，文本也变了。三个 patch，按模板顺序。
- `price 20 → 15, onSale false → true`：class 增加了 `sale`，价格文本变了，`if` 插入了徽章。`insert` patch 在下一页讲解。
- `another product`：名称、价格、按钮的 `title` 和它的 handler 同时改变。id `2`、`4` 和 `8` 是按阅读顺序排列的节点编号。
- `currency only`：卡片的守卫通过，`<p.price>` 的守卫通过，其余的都被各自的守卫跳过。

整个函数是一系列相互独立的代码块。一次调用的成本是通过的守卫数量乘以其内部内容的大小，而不是模板的大小。

> [!TIP] 阅读生成的代码
> 当你期望的 patch 缺失时，请打开生成的模块（每个 demo 折叠起来的部分，或者浏览器 DevTools 里的文件），找到对应模板那一行的代码块。注释显示它读取什么，守卫显示它比较哪些字段。大多数意外都是由于某个字段不在依赖集合中，或者某个值被原地修改了。

## 你学到了什么

- `diff(prev, next)` 用生成的守卫（对节点读取的根字段使用 `!==`）比较两个 state，并返回普通的 patch；它从不构建或比较树。
- 节点只有在读取 state 时才可能变化，所以静态节点不花任何成本，也没有 id。依赖与父节点相同的子节点共用父节点的守卫。
- `text`、`attr`、`rmAttr` 和 `handler` 按 id 改变一个节点。class 切换会替换整个 `class` 属性，而 `null`、`undefined` 和 `false` 会移除属性。
- handler 是数据，所以带参数的 handler 按值比较，不带参数的 `@click=save` 永远不会被 patch。
- state 必须是不可变的：保持同一个对象的变化对守卫来说是不可见的。

下一页：[编译 if、for 与嵌入](page:compiler-control-flow)。
