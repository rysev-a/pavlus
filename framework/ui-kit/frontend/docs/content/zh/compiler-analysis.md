---
summary: 编译器如何算出每个节点读取 state 的哪一部分，以及这一个答案如何决定哪些节点得到 id、哪些比较被写进 diff，以及哪些节点被完全跳过。
---
## 分析要回答的问题

模板是 state 的函数。当 state 改变时，页面的大部分通常保持不变。为了低成本地更新页面，`diff` 必须能快速知道哪些节点可能受到影响。编译器在构建时对每个节点只回答一次这个问题：**这个节点读取 state 的哪些字段？**

这个答案就是节点的**依赖集合**。它由一个小模块 `analyze.ts` 根据 AST 计算得出。这个集合有三种用途：

- **空**集合的节点永远不会改变。它没有 `id`，在 `diff` 里也没有代码。
- 集合非空的节点会在 `diff` 中得到一个**守卫**：只有集合中的某个字段改变了，处理该节点的代码才会运行。
- 父节点的集合包含它所有子节点的集合，所以父节点上的守卫可以一次跳过整棵子树。

从最小的情形开始。demo 打开了 AST 部分；`reads:` 这一列就是依赖集合。

::demo basic open=ast

元素和它的文本都读取 `name`。第一步改变了 `name`，结果是一个 `text` patch。第二步改变了模板不读取的字段（`n`），结果是空列表：`diff` 中提到 `name` 的第一行为假，函数立即返回。

## 表达式的自由标识符

分析的基础是一个函数，它接收一个表达式并收集它的**自由标识符**：来自表达式外部的名称，也就是来自 state（或来自外层循环）的名称。它遍历表达式树，只记录标识符：

- 字面量（`1`、`"x"`、`true`）不读取任何东西。
- 标识符（`count`）读取它的名称。
- 成员访问（`user.profile.name`）读取链条根部的标识符：`user`。名称 `profile` 和 `name` 是属性，不是 state 字段。
- 索引（`items[index]`）读取两边：`items` 和 `index`。
- 调用（`fmt(count, unit)`）读取被调用者和每个参数：`fmt`、`count` 和 `unit`。
- 一元、二元、条件和数组表达式读取它们内部的所有内容。

::demo members open=ast

看第一个段落。它显示 `user.profile.name` 和 `user.role`，它的依赖只有 `user`。第二个读取 `index` 和 `items`。第三个还读取函数 `fmt`：如果 state 里存了一个函数，替换它就算作一次变化。

> [!NOTE] 变化的单位是顶层字段
> 编译器跟踪的是 `user`，而不是 `user.profile.name`。它比较 `prev.user !== next.user`，这是对引用的一次检查。如果你替换了整个 `user` 对象，每个读取 `user` 任何部分的节点都会被检查。下一步是比较计算出的文本，会发现可见内容没有变化，于是不写 patch。所以粗粒度依赖的代价是几次比较，绝不会是错误的页面。

## 每种节点读取什么

函数 `nodeDeps` 返回一个节点的依赖集合。它的规则按节点类型而定。

| 节点 | 读取 |
| --- | --- |
| text | 它的 parts 中的标识符 |
| element | 它的属性值、class 切换的条件、事件的参数，以及它的子节点读取的一切 |
| if | 每个分支的 test 以及各分支包含的一切 |
| for | 列表表达式，加上循环体读取的内容，减去循环变量 |
| embed | 动态 view 表达式、每个 prop 的值和每个展开项 |
| outlet | 一切（见本页末尾） |

节点的结果会被记住，所以再次询问不需要任何成本。因为元素包含它的子节点，所以模板的根节点总是拥有最大的集合：整棵树的并集。

## 静态节点

集合为空的节点是**静态**的。编译器为它做三件事。

1. 在 `render` 中，它写出不带 `id` 的 vnode，因为没有 patch 会指明它（唯一的例外是像 `{null}` 这样的文本：它是表达式，所以会得到一个 id，尽管它永远不会改变）。
2. 在 `diff` 中，它什么都不写。处理节点的函数一开始就检查的恰恰是这种情形：没有依赖，无事可做。
3. 因为父节点的集合是各子节点集合的并集，所以静态的子节点不会给父节点的守卫增加任何东西。

::demo static-mix open=ast

只有最后一个段落以及包含它的 `div` 读取 `visits`。标题和暗色段落显示 `reads: —`。对比一下为这个模板生成的 `diff`：

```ts
function diff(prev, next, idSuffix = "", messagePrefix = "", env) {
  const patches = [];
  if (prev === next) return patches;
  // line 1: <div.card> (reads: visits)
  if (prev.visits !== next.visits) {
    // line 4: <p>
    // line 4: text
    const prevText = "Visits: " + toText(prev.visits);
    const nextText = "Visits: " + toText(next.visits);
    if (prevText !== nextText) patches.push({ op: "text", id: "6" + idSuffix, text: nextText });
  }
  return patches;
}
```

`h3` 和第一个 `p` 都没有出现。连注释都没有为它们写。在一个有大量静态布局和少数几处动态位置的页面里，`diff` 的工作量只取决于那些动态位置。

## 守卫

对于集合非空的节点，代码生成器会写出注释 `// line N: <tag> (reads: a, b)`，并在它下面写一个 `if`，在 `prev` 和 `next` 之间比较集合中的每个字段：

```ts
if (prev.url !== next.url || prev.active !== next.active || prev.title !== next.title) {
```

比较使用的是 `!==`，即值的同一性。对于数字或字符串，这是值的比较。对于对象或数组，这是引用的比较。这样做成本很低，这也是必须通过创建新对象来更新 state 的原因。

守卫有意设计得**粗粒度**。它表示“这个节点读取的某些东西变了”，而不是“这个属性变了”。在守卫内部，编译器会针对 `prev` 和 `next` 分别计算每个属性、每个事件 payload 和每段文本，只有两个结果不同才写 patch。两层检查共同工作：廉价的守卫跳过大多数节点，对结果的精确比较决定哪些内容真正进入 patch 列表。

::demo parts open=ast

一个元素读取五个字段：`url`、`active`、`title`、`id` 和 `label`。第一步只有 `id` 改变。守卫打开，`diff` 逐个检查各部分：`href` 相等，title 相等，class 相等。只有事件 payload 不同，所以唯一的 patch 是 `handler`。第二步中 `title` 和 `label` 都改变了，于是有两个 patch：`title` 属性和文本。注意 `href` 和 class 被检查了（守卫因 `title` 而打开），但不产生 patch。

用一棵兄弟节点的树再看一次同样的思路。每个段落都有自己的守卫，所以一个字段的改变只会触及一个段落。

::demo two-fields open=ast

第一步只有 `body` 改变。`section` 被进入，`h2` 的守卫为假，`body` 的守卫为真，`author` 的守卫为假。结果：一个 patch。第二步中 `title` 和 `author` 改变而 `body` 没变，所以你得到两个 patch，中间的段落被跳过。

## 相同的守卫只写一次

子节点读取的字段经常与它的父节点完全一样。这时子节点自己的守卫就是多余的：父节点的守卫已经证明它读取的某些东西变了。编译器能检测到这一点（子节点的集合等于父节点的集合），并且不重复这个检查。它仍然会写出该节点的注释，但不写 `if`。

::demo same-deps open=ast

这里的 `button` 通过它的属性、事件和文本读取 `label`。文本节点也读取 `label`。下面是生成的 `diff`：

```ts
// line 1: <button> (reads: label)
if (prev.label !== next.label) {
  const prevTitle = toAttr(prev.label);
  const nextTitle = toAttr(next.label);
  if (prevTitle !== nextTitle) {
    patches.push(nextTitle === null
      ? { op: "rmAttr", id: "0" + idSuffix, name: "title" }
      : { op: "attr", id: "0" + idSuffix, name: "title", value: nextTitle });
  }
  const prevClickPayload = prev.label;
  const nextClickPayload = next.label;
  if (!(prevClickPayload === nextClickPayload)) {
    patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
  }
  // line 1: text
  const prevText = "Pick " + toText(prev.label);
  const nextText = "Pick " + toText(next.label);
  if (prevText !== nextText) patches.push({ op: "text", id: "1" + idSuffix, text: nextText });
}
```

这里只有一个 `if (prev.label !== next.label)`。标有 `// line 1: text` 的文本没有自己的守卫，因为按钮的守卫就是同一个检查。patch 的顺序是属性、事件、子节点。

当子节点的集合比父节点的小时，哪怕只小一个字段，守卫也不会被去掉。在下一个例子中，`footer` 只读取 `count`，但它的父节点读取四个字段，所以 footer 保留自己的守卫。

::demo nested open=ast

`div.panel` 读取 `body`、`count`、`open` 和 `title`。class 切换 `class:open=open` 直接在 `div` 的守卫内部求值，没有自己的守卫：它属于这个元素。它下面的每个子节点都有自己的守卫。`if` 读取 `open` 和 `body`。第一步只有 `count` 改变，结果是一个 text patch。第二步只有 `body` 改变，patch 作用于打开的分支内部的文本。

生成的代码展示了元素自己的属性和它的子节点是如何安排的：

```ts
// line 1: <div.panel> (reads: open, title, body, count)
if (prev.open !== next.open || prev.title !== next.title || prev.body !== next.body || prev.count !== next.count) {
  const prevClass = joinClasses(["panel", (prev.open ? "open" : "")]);
  const nextClass = joinClasses(["panel", (next.open ? "open" : "")]);
  if (prevClass !== nextClass) {
    patches.push(nextClass === null
      ? { op: "rmAttr", id: "0" + idSuffix, name: "class" }
      : { op: "attr", id: "0" + idSuffix, name: "class", value: nextClass });
  }
  // line 2: <h2> (reads: title)
  if (prev.title !== next.title) {
    // line 2: text
    ...
  }
  // line 3: if (reads: open, body)
  ...
  // line 5: <footer> (reads: count)
  if (prev.count !== next.count) {
    // line 5: text
    ...
  }
}
```

有一个微妙之处需要注意：当只有 `count` 改变时，`div` 的守卫为真，所以两侧的 class 都会被计算。结果相等，不产生 patch。只要元素下面有任何东西改变，元素自己的属性就会被重新检查。这需要两次小小的字符串计算，换来的是一条简单的规则：节点的守卫覆盖这个节点以及它内部的一切。

## 循环变量会被去掉

在 `for` 内部，条目和索引的名称不是来自 state。它们只存在于循环内部。因此分析会把它们从循环的集合中**去掉**。剩下的就是循环需要从外部获得的东西。

::demo loop open=ast

请从下往上读 `reads:` 这一列。文本读取 `item` 和 `prefix`。`li` 读取同样的内容，因为它的 class 切换读取 `item.hot`。`for` 读取 `items`（列表）和 `prefix`，但不读取 `item`：循环变量被去掉了。上面的 `ul` 和 `for` 相同。

现在来看生成的代码。循环借助 helper `diffKeyedList` 做比较，它根据 key 决定插入、移除和移动哪些条目。对于两侧都存在的条目，它调用函数 `common(prevIndex, nextIndex)`。在这个函数里，循环变量不再是 state 的名称，而是一个局部变量，`prev` 有一个值，`next` 有一个值，`li` 的守卫比较的就是这两个值：

```ts
common(prevIndex, nextIndex) {
  const prevItem = prevItemList[prevIndex];
  const nextItem = nextItemList[nextIndex];
  const itemSuffix = idSuffix + "#" + nextItemKeys[nextIndex];
  // line 3: <li> (reads: item, prefix)
  if (prevItem !== nextItem || prev.prefix !== next.prefix) {
    ...
  }
},
```

key 表达式（`key item.id`）也属于循环。它可以使用循环变量；它从外部读取的内容仍然保留在集合中。

在 demo 中，第一步替换了列表中的一个条目：`id` 为 1 的条目得到 `hot: true`。只有该条目的 `li` 被 patch，id 是 `2#1`（节点 2，key 1）。demo 也为第二个条目构建了新对象，所以它的守卫同样会打开，但它的 class 和文本结果相等，不产生 patch。第二步改变了 `prefix`，每个条目都读取它，所以每个条目的文本都会被重新计算，而这里只有那一个条目被 patch。

索引变量的工作方式相同。

::demo loop-index open=ast

文本读取 `n` 和 `row`，而循环只读取 `rows`。索引参与 `li` 的守卫（`prevIndex !== nextIndex`）。这在带 key 的循环中很重要：条目移动时保持它的 key，但会得到新的索引。在这一步中，列表 `a, b` 变成了 `b, a`。第一个 patch 把条目 `a` 移到末尾。另外两个 patch 改变数字：`b` 现在是 `0. b`，`a` 现在是 `1. a`。

> [!WARNING] 循环变量会遮蔽同名的 state 字段
> 在循环内部，名称 `name` 指的是循环变量，而不是 state 字段 `name`。分析会把它从循环的集合中去掉，这是必须的，所以在循环内部不可能读取外层的 `name`。请选择不与你的 state 冲突的循环名称：用 `user in users`，而不是 `name in names`（当 `name` 同时也是一个字段时）。

::demo shadow open=ast

第一个段落读取 state 字段 `name`。循环只读取 `names`，里面的 span 读取循环变量 `name`，它是局部的。这两个 `name` 是不同的东西，只是恰好拼写相同。

## 条件

`if` 读取它所有分支的 test 以及各分支包含的一切。test 的变化可以改变分支；分支内部的变化只改变它的内容。代码生成器把这两种情况都写出来，并且把它们分开。

::demo branches open=ast

`if` 读取 `user` 和 `guest`。来看生成的 `diff`：

```ts
const prevBranch = prev.user ? 0 : prev.guest ? 1 : 2;
const nextBranch = next.user ? 0 : next.guest ? 1 : 2;
if (prevBranch !== nextBranch) {
  // another branch: replace what is between the markers
  if (prevBranch !== -1) patches.push({ op: "clear", from: "0s" + idSuffix, to: "0e" + idSuffix });
  if (nextBranch !== -1) {
    ...
    patches.push({ op: "insert", before: "0e" + idSuffix, nodes: branchNodes });
  }
} else {
  // the same branch: diff inside it
  if (nextBranch === 0) {
    // line 2: <p> (reads: user)
    if (prev.user !== next.user) {
      ...
    }
  }
}
```

编译器把 test 链变成一个数字，即**分支索引**，两个 state 各算一个（没有 `else` 时 `-1` 表示“没有分支”）。如果数字变了，它就替换两个标记之间的内容。如果没变，它只查看那个分支的内部，而且只有有东西可看的分支才会得到代码（这里只有分支 0）。在 demo 中，第一步是同一个分支（名字从 Ann 变成 Bob），给出一个 `text` patch。第二步改变了分支，给出一个 `clear` 和一个 `insert`。

分支中没有任何动态内容的 `if` 仍然会读取它的 test。什么都不读取的分支不会给 `if` 的集合增加任何东西。

## 子 view

embed 读取它的 props。props 是表达式，分析以与其他地方相同的方式收集。展开项（`...extra`）读取点号后面的表达式。

::demo embed open=ast

`+Badge#state` 这一行读取 `status`，所以只有当 `status` 变化时，父级才会调用 `Badge.diff`（守卫是 `if (prev.status !== next.status)`）。下面的 `p` 是静态的：它什么都不读取，也不会被拿去询问子级。反过来也成立：父级不知道子级读取什么。子级自己的 `diff` 根据它自己的分析，针对它收到的 props 来决定这一点。

## outlet 读取一切

`+outlet` 显示组件的路由所选出的子级。它显示什么取决于路由，以及模板无法命名的一部分 state。所以分析无法给它一个字段列表。它转而给它一个特殊标记，即空字符串 `""`，意思是“总是”。

```pavlus layout.pavlus
div.layout
  h1 {title}
  nav Menu
  +outlet
```

这个模板的 AST 视图把该标记打印为 `* (an outlet reads everything)`：

```text
el  div.layout                                  #0   reads: * (an outlet reads everything)
  el  h1 {title}                                  #1   reads: title
    text  {title}                                   #2   reads: title
  el  nav Menu                                    #3   reads: — (reads nothing)
    text  Menu                                      #4   reads: — (reads nothing)
  outlet  +outlet                                 #5   reads: * (an outlet reads everything)
```

这个标记会向上传递到每个父节点，因为父节点包含它子节点的集合。对于这样的节点，守卫不可能是一串比较，所以生成的代码是 `if (true) {`，注释写的是 `(reads: the route and the routed child)`。兄弟节点保留它们自己的守卫：`h1` 仍然只读取 `title`，`nav` 仍然是静态的。只有 outlet 本身和它的祖先节点拥有始终为真的守卫。这是把 outlet 放在靠近布局根部的位置、而不是放进很深且繁忙的结构里的另一个理由。

## 一个更大的页面

本页的所有内容在一个真实的布局上共同作用：带有 keyed 导航的页头、一条条件性的 flash 消息、一篇文章和一个页脚。请先打开 AST，读一读 `reads:` 这一列。然后看这两步 patch 了什么。

::demo big open=ast

这一列里有几点值得注意。

- 根节点 `main` 读取页面需要的一切：`article`、`flash`、`links`、`page` 和 `site`。它是并集。
- `nav` 读取 `links` 和 `page`。里面的 `for` 读取同样的两个，它的循环变量 `link` 已从集合中消失，而 `a` 和它的文本读取 `link`（以及用于 class 切换的 `page`）。
- 段落 `p.static` 什么都不读取。它没有 id，`diff` 里也没有提到它。
- `if flash` 只读取 `flash`。`footer` 和 `h1` 一样读取 `site`，尽管只用到了 `year` 部分：单位是字段。

第一步把 `page` 从 `/` 改成 `/about`。只有两个链接被触及，而且只有它们的 class：`/` 失去 `current`（`rmAttr`），`/about` 得到它（`attr`）。页头标题、文章和页脚不会被比较，因为它们的守卫读取的是别的字段。第二步只改变 `article`：一个针对标题的 `text` patch。这就是你能看到的分析的效果。

## 需要了解的限制

- 分析跟随的是名称，而不是值。state 中读取 state 另一部分的函数（getter、闭包）会向编译器隐藏这一读取。请把派生值保存在 state 中，或者把输入作为参数传入：`{total(items)}` 读取 `total` 和 `items`，可以正常工作。
- 单位是顶层字段，并且按引用比较。请通过替换来更新：`{ ...state, user: { ...state.user, name } }`。
- 集合很大的节点（根节点、布局、outlet）会被频繁进入。这并不慢，因为里面的检查又是守卫。但这是让动态部分保持小巧、靠近叶子的一个理由。

## 你学到了什么

- 每个节点都有一个依赖集合：它读取的顶层 state 字段，并去掉它自己的循环的循环变量。
- 什么都不读取的节点是静态的：在 `render` 中没有 id，在 `diff` 中没有代码。
- 读取了某些东西的节点会得到一个守卫，用 `!==` 比较这些字段。在守卫内部，每个属性、payload 和文本都按各自的结果比较，所以只有真正的变化才会产生 patch。
- 重复父节点守卫的守卫不会写两次。outlet 读取一切，使它上面的守卫始终为真。

下一页：[代码生成：render](page:compiler-render)。
