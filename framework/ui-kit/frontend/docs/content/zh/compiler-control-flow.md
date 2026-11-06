---
summary: `if`、`for` 和被 embed 的子 view 如何编译。你将了解什么是标记，分支索引如何在“在内部做 diff”和“clear 再 insert”之间做出选择，带 key 的列表如何变成 insert、remove 和 move patch，以及 embed 和 `+outlet` 如何向子 view 传递 props。
---
## 结构变化需要另一种 patch

上一页展示了改变一个已有节点的 patch：`text`、`attr`、`rmAttr` 和 `handler`。只要页面的形状保持不变，它们就够用了。但 `if` 可以显示或隐藏一个段落，`for` 可以增长或缩短，被 embed 的子 view 也可以被另一个替换。对于这些变化，页面还需要另外四种操作：`insert`、`clear`、`remove` 和 `move`。它们都作用于**同级节点的范围**，而这些范围在 DOM 中用**标记**来标出。

标记是一个空的注释节点。编译器会在每个 `if`、每个 `for` 和每个动态 embed 的前后各放一个，并在 `for` 的每个条目前后各放一个。标记有 id，所以 patch 可以说“标记 `0s` 和标记 `0e` 之间的所有内容”。注释节点没有可见的输出，也不需要包装元素，所以你写的 HTML 仍然是你所写的样子。

## if 与 else

下面是最小的 `if`。

::demo if-else open=module

第一步翻转了 `loggedIn`，答案是两个 patch：`clear` 和 `insert`。第二步保持这个值，答案是空列表。`insert` patch 携带新的 vnode，demo 只以数量的形式显示它（`1 vnodes`）。下面是生成的 `diff`，缩短到最关键的部分：

```ts
  // line 1: if (reads: loggedIn)
  if (prev.loggedIn !== next.loggedIn) {
    const prevBranch = prev.loggedIn ? 0 : 1;
    const nextBranch = next.loggedIn ? 0 : 1;
    if (prevBranch !== nextBranch) {
      // another branch: replace what is between the markers
      if (prevBranch !== -1) patches.push({ op: "clear", from: "0s" + idSuffix, to: "0e" + idSuffix });
      if (nextBranch !== -1) {
        const branchNodes = [];
        if (nextBranch === 0) {
          // line 2: <p>
          ...
        } else if (nextBranch === 1) {
          // line 4: <p>
          ...
        }
        patches.push({ op: "insert", before: "0e" + idSuffix, nodes: branchNodes });
      }
```

关键概念是**分支索引**。编译器把 `if / else if / else` 链变成一个数字：第一个分支是 `0`，第二个是 `1`，依此类推。它针对 `prev` 和 `next` 分别计算这个数字，两侧使用相同的条件。

- 如果两个数字相等，两侧显示的是同一个分支。这时编译器在分支**内部**做 diff，与对其他任何节点的处理完全一样。
- 如果数字不同，旧分支通过两个标记之间的 `clear` 被移除，新分支则根据 `next` 渲染并插入到结束标记之前。不会尝试把一个分支变成另一个分支。

第二条规则是一个设计决定。两个分支是两个不同的模板，所以逐节点比较它们会比直接替换更慢，而且不会得到更好的结果。第一条规则则让 `if` 在不翻转时代价很低。

## 没有 else 的 if

当没有 `else` 时，“什么都不显示”的情形有它自己的数字，即 `-1`。这就是代码里有两处检查的原因：`prevBranch !== -1` 用于 `clear`，`nextBranch !== -1` 用于 `insert`。

::demo if-alone open=module

把这四个步骤当作一张表来读，它列出了单个 `if` 可能发生的情况：

- 从隐藏到显示：一个 `insert`，没有 `clear`，因为没有东西可移除。
- 从显示到显示，带新值：完全没有结构变化。两侧的分支索引都是 `0`，所以编译器在分支内部做 diff，得到一个 `text` patch。
- 从显示到隐藏：一个 `clear`，没有 `insert`。
- 从隐藏到隐藏：什么都没有。只有当 `error` 改变时守卫才通过，而这里它没有变。

条件不是作为值来比较的。`error` 从 `"Oops"` 变成 `"Again"` 会改变这个字段，但分支索引仍是 `0`，起决定作用的是后者。

## 链，以及分支内部发生的事

大多数真实的模板都有一条链。这一个是经典的加载中、失败和就绪三种界面。

::demo if-chain

对于三个分支，索引是用一串条件计算的，写成嵌套的条件表达式：

```ts
      const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "failed") ? 1 : 2;
      const nextBranch = (next.status === "loading") ? 0 : (next.status === "failed") ? 1 : 2;
```

最后一个数字是 `else` 分支。没有 `else` 时它会是 `-1`。现在来看这五个步骤：

- `ok → loading` 和 `loading → failed`：分支改变，所以你得到 `clear` 和 `insert`。第二步的 `insert` 携带两个 vnode，即段落和按钮。
- `failed, error changes`：分支相同，只有读取 `error` 的文本被 patch。
- `loading, error changes`：`if` 的守卫通过，因为它读取 `error`（第二个分支用到了它），但分支仍然是 `0`，而分支 `0` 是静态的。答案是 `[]`。
- `ok, items change`：内部的 `for` 追加了一个条目；稍后你会看到它是怎么做的。

“内部”这种情形的代码对每个分支有一个代码块，每个代码块只在它的分支是当前显示的分支时才运行：

```ts
      } else {
        // the same branch: diff inside it
        if (nextBranch === 1) {
          // line 6: <p.status.status--error> (reads: error)
          if (prev.error !== next.error) {
            // line 6: text
            const prevText = "" + toText(prev.error);
            const nextText = "" + toText(next.error);
            if (prevText !== nextText) patches.push({ op: "text", id: "5" + idSuffix, text: nextText });
          }
        }
```

没有任何动态内容的分支不会得到代码块。这就是像本页第一个 demo 那样分支都是静态的 `if`，它的 `diff` 里没有 `else` 部分的原因。

## render 中的标记

标记是由 `render` 产生的，所以 DOM plugin 能找到这些范围。连续的两个 `if` 展示了它们是如何编号的。

::demo if-markers open=vnodes

打开 vnode。每个 `if` 都被两个标记 vnode 包围，即 `{ "t": "marker", "id": "1s" }` 和 `{ "t": "marker", "id": "1e" }`。数字是 `if` 节点在模板中的编号，`s` 和 `e` 分别表示开始和结束。第一步在 `4e` 之前插入，也就是第二个 `if` 的结束标记。第二步从 `1s` 到 `1e` 执行 clear，只有第一个 `if` 被触及。

> [!NOTE] 标记是不可见的
> 你在 demo 里看到的 HTML 没有标记，因为 `toHtml` 默认会丢掉它们。在浏览器中，它们是空的注释节点，即 `<!---->`。如果你检查页面，会在你的元素之间看到它们。

## 循环：每个条目一个范围

`for` 是一串范围。每个条目有自己的开始和结束标记，整个循环也有开始和结束标记。标记的 id 中包含条目的 **key**，所以 patch 可以恰好指明某一个条目。

```pavlus
ul.todos
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}
```

`render` 中生成这些的部分很短：

```ts
  const todoList = (state.todos) || [];
  for (let todoIndex = 0; todoIndex < todoList.length; todoIndex++) {
    const todo = todoList[todoIndex];
    const todoKey = String((todo)?.id);
    const todoSuffix = idSuffix + "#" + todoKey;
    ulChildren.push({ t: "marker", id: "1[" + todoSuffix });
    ...
    ulChildren.push({ t: "marker", id: "1]" + todoSuffix });
  }
```

key 会被转成字符串。条目的**后缀**是外层模板的后缀加上 `#` 和 key。条目内部的每个节点都用这个后缀生成自己的 id，所以列表中的第二个 `li` 的 id 是 `2#2`（节点 2，key 2），而不是第一个的 id。循环中套循环时也靠这一点保持清晰：内层后缀扩展外层后缀。

条目的结束标记的 id 形如 `1]#2`。id 中的 `[` 和 `]` 只是为了把条目的标记与整个列表的标记 `s` 和 `e` 区分开来。

## 没有 key 的列表

如果你不写 `key`，条目的 key 就是它的索引。这是最简单的形式，当列表只会在末尾增长和缩短时，这是个好选择。

::demo for-unkeyed

- 追加一个条目，会在列表的结束标记之前插入一个范围。
- 移除最后一个条目，会移除它的范围。
- 移除**第一个**条目，并不会移除第一个范围。key 先是 `0, 1, 2`，然后是 `0, 1`，所以 key 为 `2` 的范围消失了，key 为 `0` 和 `1` 的文本被 patch 成新的值。结果看起来相同，但工作量不同：两个 `text` patch 和一个 `remove`。
- 反转三个条目会 patch 两段文本。中间那个没有变，所以不花任何成本。

> [!WARNING] 没有 key 时，DOM 跟随位置
> 以索引作为 key 时，DOM 节点留在原来的位置并得到新的内容。对文本来说这没问题。但如果条目有只有 DOM 才知道的东西（焦点、光标、输入到 state 没有保存的 input 里的文字），那个东西会留在位置上，而不是跟着条目走。只要条目可能从中间被移除或被重新排序，就给循环加上 key。

## 带 key 的列表

使用 `key todo.id` 时，只要 key 相同，不管条目在列表中处于什么位置，它都是同一个条目。现在编译器可以说出发生了什么：条目被添加、被移除、被移动，或者发生了变化。

::demo for-keyed

每种变化都会产生它自己种类的 patch：

- `append D`、`insert D in the middle`：`insert`，其中 `before` 设为必须跟在后面的条目的开始标记（或列表的结束标记）。
- `remove A`、`remove B`：`remove`，从条目的开始标记到结束标记，两端都包含。`remove` patch 连标记也一并移除。这与保留标记的 `clear` 不同。
- `swap A and B`：单个 `move`。
- `B done`：没有结构变化。只有发生变化的条目的属性被 patch，使用该条目的 id。
- `all replaced`：两个 `remove` 和两个 `insert`。注意顺序。insert 是从列表末尾向开头进行的。
- `nothing changed`：demo 传入一个新数组，其中是相同的三个对象。循环的守卫通过，因为这两个数组是两个对象，但每个条目在两侧都是同一个对象，所以 `common` 没有找到需要 patch 的东西。

## 列表如何被对账

生成的代码并不决定要插入、移动或移除什么。它调用运行时的 helper `diffKeyedList`，并给它四个小函数，每种情形一个。下面是这个调用，来自生成的模块：

```ts
    diffKeyedList(prevTodoKeys, nextTodoKeys, todoStartId, "1e" + idSuffix, {
      remove(key) { patches.push({ op: "remove", from: todoStartId(key), to: todoEndId(key) }); },
      insert(index, beforeId) {
        ...
        patches.push({ op: "insert", before: beforeId, nodes: todoNodes });
      },
      move(key, beforeId) { patches.push({ op: "move", from: todoStartId(key), to: todoEndId(key), before: beforeId }); },
      common(prevIndex, nextIndex) {
        ...
      },
    });
```

这个 helper 分三遍工作：

1. **移除。** `prev` 中不在 `next` 里的每个 key 都被移除。保留下来的 key 按它们在 DOM 中的顺序记下来。
2. **从末尾开始插入和移动。** helper 从最后一个条目到第一个条目遍历 `next`。对于每个条目，它知道必须跟在它后面的条目，所以知道要在哪个标记之前插入或移动。新的 key 产生 `insert`。尚未位于其后继之前的旧 key 产生 `move`。从末尾开始遍历，保证 patch 引用的标记在应用该 patch 时已经存在。
3. **公共部分。** 对于两侧都存在的每个 key，`common(prevIndex, nextIndex)` 对条目的内容做 diff。`common` 内部的代码就是循环体的常规 diff，其中 `prevTodo` 和 `nextTodo` 是两侧的条目。

`insert` 函数只根据 `next` 一侧渲染新条目。`common` 函数则是再次使用上一页的守卫的地方，以条目作为依赖的根。

这个方法很简单，但不是最少的。把一个条目移到很远的地方可能需要多次 move，因为它经过的每个条目都要与它的后继做检查。

::demo for-moves

- 把第一个条目移到末尾，需要一次 `move`。
- 把最后一个条目移到最前面，需要三次：helper 依次移动 `c`、`b`、`a`，而不是只移动 `d`。
- 反转四个条目需要三次 move。

这是有意的取舍。这个算法小而可预测，而且在实践中，大多数列表变化都是追加、移除和偶尔的交换。最短编辑脚本需要最长递增子序列，为了一种罕见的情形要多写不少代码。如果你经常对很长的列表重新排序，这就是需要在生成的代码里查看的地方。

## 索引变量

循环可以给索引命名：`for item, i in items`。索引是循环体依赖集合的一部分，因为它在条目移动时可能改变。

::demo for-index open=module

移除第一个条目会移除它的范围，然后剩下的两个条目被 patch：它们的编号从 `2.` 和 `3.` 变成了 `1.` 和 `2.`。条目本身没有变化，但 `common` 会以新的索引为它调用，守卫 `prevIndex !== nextIndex || prevItem !== nextItem` 让它通过。

## 空列表与缺失的列表

列表表达式的求值方式是 `(items) || []`。`items` 缺失、为 `null` 或 `undefined` 的 state，与空列表相同。这是一个特性，但要注意它对其他条件意味着什么。

::demo for-empty

- `[] → [x, y]`：两个 `insert` patch，先是 `y`，因为 helper 从末尾开始遍历，再加上对 “Nothing here” 段落的一个 `clear`。
- `[x, y] → []`：两个 `remove` 和一个段落的 `insert`。
- `[] → undefined`：循环在两侧看到的都是空列表。条件 `items.length === 0` 是 `(items)?.length === 0`，即 `undefined === 0`，为假，所以段落被清除。如果你希望缺失的列表也显示这个段落，请把条件写成 `!items || items.length === 0`。

> [!DANGER] key 必须唯一
> 两个条目有相同的 key，会让 `diffKeyedList` 抛出错误，信息里会指出这个 key：`pavlus: duplicate key 1`。缺失的 key 会让所有条目的 key 都是 `undefined`，错误是 `pavlus: duplicate key undefined`。这个错误来自 `diff`。`render` 不检查 key，所以页面可能 render 一次成功，却在第一次更新时失败。请使用在列表中唯一、并且对同一个条目不会改变的值，例如来自服务器的 id。

## 循环中的循环

循环可以嵌套，每一层都会扩展后缀。一个分组的内层列表位于标记之间，标记的 id 中带有该分组的 key。

::demo for-nested

insert 的目标是 `6e#g2`，即 key 为 `g2` 的分组的成员列表的结束标记。第一个分组没有被触及：它在 `prev` 和 `next` 中是同一个对象，所以它的守卫立即失败。第二个分组是一个新对象，它共享其他字段，这就是你更新不可变 state 的方式。

## embed：模板中的子 view

**embed** 把另一个编译后的模板放进当前模板。静态 embed 指明一个被导入的模板、`#` 后面的实例名，以及圆括号中的 props。

```pavlus
import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role hot=admin)
```

被导入的模板是一个普通模板。在本页中它是：

```pavlus
span.badge(class:hot=hot) {label}
```

子级不读取父级的 state。它接收一个对象，`label=role` 的意思是这个对象有一个字段 `label`，它的值是父级的 `role`。

::demo embed-static open=module

embed 不是特殊的 patch。编译器写的是对子级自己的 `diff` 的调用，传入 `prev` 的 props 和 `next` 的 props，并把得到的 patch 放进同一个列表：

```ts
    // line 5: +Badge#badge (reads: role, admin)
    if (prev.role !== next.role || prev.admin !== next.admin) {
      patches.push(...Badge.diff(
        { "label": prev.role, "hot": prev.admin },
        { "label": next.role, "hot": next.admin },
        idSuffix + "/3",
        messagePrefix + "badge.",
        childEnv(env, "badge", next),
      ));
    }
```

两个 state 之后的三个参数说明了子级是谁：

- **后缀** `idSuffix + "/3"` 让子级的 id 保持唯一。`3` 是 embed 节点在父级中的编号。在 demo 中，子级的文本的 id 是 `1/3`：子级的节点 1，位于父级的 embed 3 之内。
- **前缀** `messagePrefix + "badge."` 被放在子级发送的每个 message id 前面。子级中的一次点击会发送 `badge.something`，所以父组件可以把 message 路由到正确的子级。
- **环境** `childEnv(env, "badge", next)` 找到该实例背后的组件（如果有的话）。拥有自己的 `+outlet` 的子级需要它。

守卫只列出被读取的 props，也只列出它们。如果父级的 `name` 改变了，甚至不会调用 badge。如果某个 prop 的写法里没有 state，例如 `label="Fixed"`，它就是静态的。什么都不读取的 embed 会被完全跳过。

embed 经常用在循环里。下面是带 key 的循环中的一个 embed：

::demo embed-in-loop open=module

patch 中的 id 是 `0#2/4` 和 `1#2/4`。每个都是子级的一个节点编号（`0` 或 `1`），后面跟着它的后缀 `#2/4`：key 为 `2` 的条目，然后是 embed，即父级的节点 `4`。后缀的作用就在这里。两个 badge 可以有相同的模板，却永远不会共用 id。

展开 prop `+Row#row(...item selected=flag)` 会把 `item` 的所有字段复制到 props 中，然后添加 `selected`。props 按顺序写入，所以后面的优先。

## 动态 embed

有时在写模板时还不知道子级是什么。**动态 embed** `+{expr}#name(props)` 从 state 中取得 view：表达式的值是一个编译后的模板，或者一个带有 `view` 的组件对象。实例名是必需的，因为编译器无法猜测它。

```pavlus
section.panel
  h2 {title}
  +{panel}#panel(items=items)
```

因为子级在两侧可能是不同的模板，编译器必须处理三种情形。helper `asView` 返回某个值背后的 view，对于 `null` 和 `undefined` 则返回 `null`。

::demo embed-dynamic open=module

在 demo 中，state 保存着真正编译后的 view（打印为 `<view list.pavlus>`）。代码有三条路径：

```ts
      const prevPanelView = asView(prev.panel);
      const nextPanelView = asView(next.panel);
      if (prevPanelView !== nextPanelView) {
        // another view means another template: replace, never diff across
        if (prevPanelView) patches.push({ op: "clear", from: "3s" + idSuffix, to: "3e" + idSuffix });
        if (nextPanelView) {
          patches.push({ op: "insert", before: "3e" + idSuffix, nodes: nextPanelView.render(
            ...
          ) });
        }
      } else if (nextPanelView) {
        patches.push(...nextPanelView.diff(
          ...
        ));
      }
```

- 两侧是同一个 view：调用该 view 自己的 `diff`。在第一步中，列表 view 追加了一个条目，返回一个 `insert`。
- 另一个 view：旧内容在标记之间被清除，新 view 根据 `next` 的 props 渲染并插入。在列表和表格之间做 diff 是没有意义的。
- view 出现或消失（`null`）：只有 `insert`，或者只有 `clear`。

如果这个值既不是 view，也不是带有 view 的组件，`asView` 会抛出 `pavlus: +{...} needs a view or a component with a view`。与静态 embed 不同，动态 embed 带有标记，因为它的内容可能出现也可能消失。

## 路由页面：+outlet

`+outlet` 是一个动态 embed，它的 view 来自路由。组件声明一张 `routing` 表，outlet 显示与 `state.route` 匹配的子级。这张表本身见[路由](page:concepts-routing)。模板只有一行：

```pavlus
main
  +outlet
```

它的 `diff` 与动态 embed 有相同的三条路径，只有两处不同：

```ts
  // line 4: <main> (reads: the route and the routed child)
  if (true) {
    // line 5: +outlet
    const prevOutlet = resolveOutlet(env, prev);
    const nextOutlet = resolveOutlet(env, next);
    if (prevOutlet?.view !== nextOutlet?.view || prevOutlet?.name !== nextOutlet?.name) {
      // another page: replace what is between the markers
      if (prevOutlet) patches.push({ op: "clear", from: "4s" + idSuffix, to: "4e" + idSuffix });
      if (nextOutlet) {
        patches.push({ op: "insert", before: "4e" + idSuffix, nodes: nextOutlet.view.render(
          ...
        ) });
      }
    } else if (nextOutlet) {
      ...
    }
  }
```

第一，守卫是 `if (true)`。outlet 显示什么取决于路由和被路由的子级的 state，而模板无法指明这些字段。所以编译器把这个节点标记为“任何东西变化时它都可能变化”，outlet 的每个父节点在每次更新时都会被检查。第二，当 view **或实例名**改变时，页面会被替换：两个路由可以使用同一个模板，却仍然是两个不同的页面。

你无法在本页的 demo 中运行 outlet，因为它需要一个拥有路由表的组件。一个带有 `+outlet` 的模板在没有组件的情况下运行，会以这个错误停止：

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

## 综合示例

这块看板有一个标题、一条 `if / else if / else` 链、一个带索引的带 key 循环、一个 class 切换、一个带参数的事件、循环里的一个静态 embed，以及它后面的一个动态 embed。`footer` 是保存在 state 里的一个 view。

::demo everything

走一遍这些步骤，并说出产生每个 patch 的代码：

- `loading true → false`：分支从 `0` 变成 `2`。一个 `clear` 和一个 `insert` 用一个 patch 构建出整个列表和它的所有条目。
- `card 1 done, card 2 moves up`：一个 `move`，因为列表顺序变了，然后是条目中的变化：编号（索引变了）、现在已完成的卡片的 `class`，以及 badge，这是一个得到新 `hot` prop 的子 view。卡片的标题没有变，所以没有被 patch。
- `last card removed`：一个 `remove`，加上页脚文本 `1 cards`。页脚是一个动态 embed，两侧是同一个 view，所以它自己的 `diff` 会以新的数量被调用。
- `all cards removed`：分支从 `2` 变成 `1`，所以整个列表被清除，并插入 “No cards” 段落。条目不需要 `remove`：`clear` 会移除标记之间的所有内容。页脚文本变成 `0 cards`。

## 你学到了什么

- `if` 链编译成分支索引（什么都不显示时是 `-1`）。索引相同意味着在分支内部做 diff；索引不同意味着在标记之间 `clear`，并 `insert` 新分支。
- 标记是围绕每个 `if`、`for` 条目、循环和动态 embed 的空注释节点。结构性 patch（`insert`、`clear`、`remove`、`move`）作用于它们之间的范围。
- `for` 变成带四个回调的 `diffKeyedList`。key 必须唯一且稳定；没有 key 时，索引就是 key，DOM 跟随位置。
- 静态 embed 是对子级 `diff` 的一次调用，传入两侧的 props、更长的 id 后缀和一个 message 前缀。当 view 改变时，动态 embed 或 outlet 会替换内容。

下一页：[API、Vite 插件与错误](page:compiler-tooling)。
