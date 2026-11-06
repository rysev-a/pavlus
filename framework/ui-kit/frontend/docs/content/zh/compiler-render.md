---
summary: 编译器如何写出 render(state)。逐行阅读生成的代码，从一个段落到一整张卡片：vnode 的形状、属性、class、事件、文本、表达式、条件、循环和子 view。
---
## render 是什么

`render(state)` 是回答“对于这个 state，页面是什么样子？”这个问题的函数。它不接触 DOM。它构建并返回一组描述页面的普通对象，即 **vnode**。DOM plugin 在挂载 view 时用它们一次性构建真实的元素。服务端渲染则把同一个列表变成 HTML 文本。第一次 render 之后，由 `diff` 接手（见[编译流水线](page:compiler-pipeline)）。

`render` 是根据 AST 按固定模式生成的：每个节点一段代码，顺序与模板一致。本页从最小的模板开始展示这个模式。这里看到的每一个代码块都是编译器的真实输出，复制自一次运行。

先从一行开始。

::demo static-line open=module

打开模块，从头开始读 `render`。

```ts
function render(state, idSuffix = "", messagePrefix = "", env) {
  const nodes = [];
  // line 1: <p.note>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Hello" });
  const pAttrs = { "class": "note" };
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
  return nodes;
}
```

- 函数有四个参数。`state` 是数据。`idSuffix`、`messagePrefix` 和 `env` 在这个 view 被 embed 到另一个 view 中时使用；顶层 view 让它们保持默认值。
- `nodes` 是结果：顶层 vnode。
- 注释 `// line 1: <p.note>` 说明它下面的代码是由模板的哪一行产生的。这里显示了 tag 和 class，所以你在很长的模块里也能找到方向。
- `pChildren` 是 `p` 的子节点列表。文本最先被推入。
- `pAttrs` 是属性对象。class `note` 是静态的，所以写成字面量。
- 最后，元素被推入 `nodes`，带着每个元素 vnode 都有的五个字段。

子节点先于元素写出，因为 JavaScript 在使用数组时需要它已经存在。每个元素都是如此：**先子节点，再属性，最后是元素本身**。

## 三种 vnode

vnode 只有三种，每种在 `t` 中有一个简短的类型标记。

| `t` | 字段 | 含义 |
| --- | --- | --- |
| `el` | `tag`、`attrs`、`events`、`children`，可选的 `id` | 一个元素 |
| `text` | `text`，可选的 `id` | 一个文本节点 |
| `marker` | `id` | 一个空的注释节点，标记一个块的开始或结束 |

元素的 `attrs` 是从名称到字符串的普通对象。`events` 是从 DOM 事件名到 message 描述 `{ id, payload, prevent?, stop? }` 的普通对象。vnode 里没有函数：它是数据，所以可以被比较、被记录、通过网络发送，也可以变成 HTML 文本。

`id` 是最有意思的字段，而且它是可选的。**只有当 `diff` 能 patch 某个节点时，才会写 id。** 在 `static-line` 里完全没有 id。在本页的其余部分你会看到它何时出现：带表达式的文本、带动态属性、class 或事件 payload 的元素，以及每个标记。

## 嵌套与命名

元素中的元素会嵌套它们的代码块。每个元素声明自己的变量，变量名取自 tag。

::demo nesting open=module

```ts
// line 1: <div>
const divChildren = [];
// line 2: <h1>
const h1Children = [];
h1Children.push({ t: "text", text: "Title" });
const h1Attrs = {};
divChildren.push({
  t: "el",
  tag: "h1",
  attrs: h1Attrs,
  events: {},
  children: h1Children,
});
// line 3: <p>
const pChildren = [];
pChildren.push({ t: "text", text: "Text" });
const pAttrs = {};
divChildren.push({
  t: "el",
  tag: "p",
  attrs: pAttrs,
  events: {},
  children: pChildren,
});
const divAttrs = {};
nodes.push({
  t: "el",
  tag: "div",
  attrs: divAttrs,
  events: {},
  children: divChildren,
});
```

`h1` 和 `p` 把自己推入 `divChildren`，最后 `div` 把自己推入 `nodes`。结果就是树 `div > (h1, p)`。

名称来自一个小型的分配器（`names.ts`）。它从 tag 开始，例如 `h1Children`，只有当这个名称在当前打开的某个块中已被占用时才加上数字：紧挨着第一个 `li` 的第二个 `li` 会变成 `liChildren2`。JavaScript 保留的名称（`class`、`new` 等）、生成的代码需要的词（`state`、`nodes`、`patches` 等），以及 helper 和被导入的 view 的名称，都永远不会用作变量名。像 `my-card` 这样的 tag 会变成 `myCard`。循环变量以你的变量命名；如果这个名称已被占用，就加上数字。

缩进、换行，以及“一个放不进 100 列的调用，每个参数占一行”的规则，都来自一个小型的 `Writer`。这就是下面 `classes` demo 里那个很长的 `setAttr` 调用被拆成多行、而短的调用不拆的原因。

## 静态属性与 class

值固定的属性会直接写入属性对象，写在同一个字面量里。

::demo static-attrs open=module

```ts
const aAttrs = { "id": "go", "href": "/home", "target": "_blank", "hidden": "", "class": "btn big" };
```

看一下顺序：先是 `id`（选择器里的 `#go` 和其他属性一样是个属性，解析器把它放在最前面），然后是按源码顺序排列的属性，最后是 `class`。两个 class `.btn.big` 被合并成一个字符串。像 `hidden` 这样的布尔属性，值是 `""`，这就是 HTML 表示“存在”的方式。这里没有任何动态内容，所以元素没有 id，helper 也完全不会被导入。

## 文本与插值

带有 hole 的文本用 `+` 构建。每个 hole 都会经过 `toText`，它把 `null`、`undefined` 和 `false` 变成空字符串。

::demo interpolation open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "Hello, " + toText(state.name) + "! You have " + toText(state.count) + " new messages." });
```

文本的各部分依次是：字符串 `"Hello, "`、表达式 `name`、字符串 `"! You have "`、表达式 `count`，以及字符串 `" new messages."`。字符串被写成 JSON 字符串字面量；表达式被 `toText` 包起来。

这段文本有一个 `id`，即 `"1" + idSuffix`。`1` 是来自解析器的节点 id。顶层 view 的 `idSuffix` 为空；当 view 被 embed 或在循环中重复时，是它让 id 保持唯一。如果文本节点没有表达式，它就没有 id。

当第一个部分是表达式时，代码以空字符串开头：`"" + toText(state.name)`。这只是为了统一：`toText` 本来就返回字符串，空字符串让每个插值文本都保持相同的 `"" + ...` 形状。

## 动态属性

值中含有表达式的属性，用 `setAttr` 和两种转换器之一来计算。

::demo dynamic-attrs open=module

```ts
const aAttrs = {};
setAttr(aAttrs, "href", toAttr(state.url));
setAttr(aAttrs, "title", "Open " + toText(state.name));
setAttr(aAttrs, "data-id", toAttr(state.id));
setAttr(aAttrs, "hidden", toAttr(state.gone));
```

- 值是单个表达式（`href=url`）时，会经过 `toAttr`。`null`、`undefined` 和 `false` 表示“完全不写这个属性”。`true` 表示一个裸属性（空字符串）。其他任何值都会转成字符串：`id: 0` 时 `data-id=id` 得到 `"0"`，因为 `0` 和其他值一样是个值。
- 混合了文本和表达式的值（`title="Open {name}"`）按文本方式构建。它始终是字符串，所以始终会被写出。
- `setAttr(attrs, name, value)` 写入该属性，除非值是 `null`。

在 demo 的 HTML 中没有 `hidden`，因为 `gone` 是 `false`。这个元素有一个 `id`（`"0" + idSuffix`），因为 `diff` 可能会对它有话要说。demo 的这一步把 `url` 设为 null，`diff` 的回答是 `rmAttr`：这个属性被移除。

## class 切换

依赖 state 的 class 是 `class:name=condition` 这一类条目。它与静态 class 以及可选的 `class=` 属性一起，构成一个由 `joinClasses` 计算的值。

::demo classes open=module

```ts
setAttr(liAttrs, "class", 
  joinClasses(["item", (state.active ? "active" : ""), ((state.state === "done") ? "done" : ""), toAttr(state.extra)]),
);
```

列表依次包含：静态 class（`.item`，连接成一个字符串）、每个切换一个条目（`(condition ? "name" : "")`），以及 `class=` 属性（如果有的话）。`joinClasses` 丢掉空条目并用空格连接其余的，所以 HTML 是 `class="item active wide"`。如果什么都没剩下，它返回 `null`，`setAttr` 就什么也不写。

这一步展示了 `state` 从 `open` 变成 `done`。新的 class 列表是 `item active done wide`，patch 是针对整个 class 值的单个 `attr`，而不是每个 class 名称一个。第二个切换的表达式使用了花括号（`class:done={state === "done"}`），因为它含有空格；见[解析：从文本到 AST](page:compiler-parser)。

## 空元素

HTML 中有一些永远没有内容的元素：`input`、`br`、`img` 等。解析器不允许它们下面有子节点，编译器也不会写任何子节点。vnode 仍然有一个 `children` 列表，它是空的。

::demo voids open=module

```ts
// line 3: <br>
const brChildren = [];
const brAttrs = {};
formChildren.push({
  t: "el",
  tag: "br",
  attrs: brAttrs,
  events: {},
  children: brChildren,
});
```

当 vnode 被转成 HTML 时，`toHtml` 知道同样的空 tag 列表，会写出不带结束 tag 的 `<br>`。在 DOM plugin 中，`document.createElement("br")` 就是不会得到任何子节点。这里只有 `input` 有 id，因为它的 `value` 属性读取了 state。

## 事件

事件在 vnode 里不是函数。它是一个 message 描述：一个 message 的 id，加上一个 payload。用户点击时应用会收到这个 message；模板里从不包含逻辑。

::demo events open=module

```ts
const buttonEvents = {
  "click": { id: messagePrefix + "save", payload: undefined },
};
...
const buttonEvents2 = {
  "click": { id: messagePrefix + "remove", payload: state.id },
};
...
const buttonEvents3 = {
  "click": { id: messagePrefix + "move", payload: [state.id, 1] },
};
...
const aEvents = {
  "click": { id: messagePrefix + "open", payload: undefined, prevent: true, stop: true },
};
```

- message 的 id 是 `messagePrefix + "save"`。顶层 view 的前缀为空，所以 message 是 `save`。被 embed 的 view 以实例名作为前缀，所以子级 `+Form#editor` 中的 `save` 就是 `editor.save`。
- 没有参数时是 `payload: undefined`。一个参数时是它的值，多个参数时是数组。
- 修饰符 `.prevent` 和 `.stop` 在描述中变成标志 `prevent: true` 和 `stop: true`。事件到来时，DOM plugin 会读取它们。

看看哪些按钮有 `id`。第一个 `@click=save` 没有：它的描述永远不会变。第二个和第三个读取 `state.id`，所以它们有 id（`"3"` 和 `"5"`），`diff` 可以重新绑定它们的 payload。在这一步中，`id` 从 4 变成 5：两个 `handler` patch，每个按钮一个，带着新的 payload。监听器本身不会被触碰。

## 表达式

所有表达式都由一个函数翻译，该函数对表达式 AST 中的每种节点各有一个分支。翻译遵循两条规则。**每个复合表达式都包在圆括号里**，所以求值顺序永远不依赖于打印出来的文本的优先级。并且**每个成员访问都是空值安全的**。

| 在模板中 | 在生成的代码中 |
| --- | --- |
| `count` | `state.count` |
| `user.name` | `(state.user)?.name` |
| `rows[i].title` | `((state.rows)?.[state.i])?.title` |
| `format(price)` | `(state.format)?.(state.price)` |
| `!done` | `(!(state.done))` |
| `-n` | `(-(state.n))` |
| `a + b * 2` | `(state.a + (state.b * 2))` |
| `ok ? "yes" : "no"` | `(state.ok ? "yes" : "no")` |
| `name ?? "anonymous"` | `(state.name ?? "anonymous")` |
| `["a", n]` | `["a", state.n]` |
| `null`、`1`、`"x"` | `null`、`1`、`"x"` |

在循环内部，循环变量是局部变量，写出时不带 `state.`。

::demo operators open=module

```ts
pChildren4.push({ t: "text", id: "7" + idSuffix, text: "" + toText((((state.x > 0) && (state.y < 10)) || state.z)) });
pChildren6.push({ t: "text", id: "11" + idSuffix, text: "" + toText(((state.count === 1) ? "item" : "items")) });
```

运算符原样复制：`===` 仍是 `===`，`??` 仍是 `??`。模板语言选择了 JavaScript 的一个安全子集，然后原样使用它。

下一个 demo 展示空值安全的作用。state 里有 `user: null`、一个空的 `rows` 和一个 `format` 函数。什么都不会抛出错误。

::demo access open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "" + toText(((state.user)?.address)?.city) });
pChildren2.push({ t: "text", id: "3" + idSuffix, text: "" + toText(((state.rows)?.[state.i])?.title) });
pChildren3.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.format)?.(state.price)) });
```

在纯 JavaScript 中，当 `user` 是 `null` 时，`state.user.address.city` 会抛出错误。在这里，每个 `?.` 在遇到第一个缺失的部分时就终止链条并给出 `undefined`，`toText` 再把它变成空字符串。前两个的 HTML 是空段落，函数调用得到 `$3`，字面量 `null` 则什么都没有。模板不会因为数据还没到达而崩溃。这就是模板可以不必在每次读取前面都写 `if user` 守卫的原因。

> [!NOTE] 调用也是可选的
> `format(price)` 被翻译成 `(state.format)?.(state.price)`。如果 `format` 不存在，结果是 `undefined`，同样不会出错。函数以这些值作为参数；它应该是纯函数，因为 `diff` 会分别对 `prev` 和 `next` 调用它。

## 条件

`if` 被渲染成普通的 JavaScript `if` 链，两侧各有一个标记。

::demo if-else open=module

```ts
// line 1: if
nodes.push({ t: "marker", id: "0s" + idSuffix });
if (state.loading) {
  // line 2: <p>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Loading" });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
} else {
  // line 4: <p>
  const pChildren = [];
  pChildren.push({ t: "text", id: "4" + idSuffix, text: "Loaded " + toText(state.count) });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
}
nodes.push({ t: "marker", id: "0e" + idSuffix });
```

只有为真的那个分支会被构建。两个标记始终存在：`0s` 是开始（节点 id `0` 加字母 `s`），`0e` 是结束。它们在 DOM 中是空的注释节点。分支改变时，`diff` 会移除两个标记之间的所有内容，并在结束标记前插入新的分支。如果没有标记，当这个块为空时，就没有地方可以表明“这个块在这里”。

每个分支都是独立的块，所以分配器会重用名称（`pChildren` 在两个分支里都出现）而不加数字。它们永远不会相遇。

## 循环

`for` 是一个 JavaScript `for` 循环，整个列表的前后各有一个标记，每个条目的前后也各有一个标记。

::demo for-loop open=module

```ts
// line 2: for tag, i
ulChildren.push({ t: "marker", id: "1s" + idSuffix });
const tagList = (state.tags) || [];
for (let i = 0; i < tagList.length; i++) {
  const tag = tagList[i];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "1[" + tagSuffix });
  // line 3: <li>
  const liChildren = [];
  liChildren.push({ t: "text", id: "3" + tagSuffix, text: "" + toText(i) + ": " + toText(tag) });
  ...
  ulChildren.push({ t: "marker", id: "1]" + tagSuffix });
}
ulChildren.push({ t: "marker", id: "1e" + idSuffix });
```

- `(state.tags) || []` 把缺失的列表变成空列表。
- key 是 key 表达式的 `String(...)`。这里是 `key tag`，所以 key 就是 tag 本身。没有 `key` 时，key 是索引，写成 `String(i)`。
- 每个条目都有自己的后缀，`idSuffix + "#" + key`。条目内部的所有 id 都以它结尾：例如文本是 `"3" + tagSuffix`，即 `3#a`。同一个文本节点在两个条目中有两个不同的 id。key 让这一点保持稳定：如果条目移动，它的 id 也跟着走。
- 条目的开始和结束标记是 `"1["` 和 `"1]"` 加上后缀。标记让 `diff` 可以把整个条目作为一段相邻的节点来移动或移除。

索引和条目使用你在模板里给它们起的名字。如果你省略了索引，分配器会自己造一个 `tagIndex`，你可以在下面的 `card` demo 里看到。

## 子 view

embed 会变成对子级 `render` 的调用，结果被展开到父级的子节点中。

::demo embed open=module

```ts
// line 4: +Badge#one
divChildren.push(...Badge.render(
  { "label": "Hi " + toText(state.name), "count": state.n },
  idSuffix + "/1",
  messagePrefix + "one.",
  childEnv(env, "one", state),
));
```

四个参数依次是：子级的 `state`（即 props，一个对象）、id 后缀、message 前缀和环境。props 对象保持单表达式 prop 的类型（如果 `n` 是数字，`count: state.n` 就是数字），而对于含有文本和 hole 的 prop（`label="Hi {name}"`）则构建一个字符串。后缀被扩展为 `/1`，即该 embed 的节点 id，这样子级的 id 就不会与父级的相遇。前缀被扩展为 `one.`，即实例名。最后一个参数是实例背后的组件，由 helper `childEnv` 找到；子级主要在 `+outlet` 时需要它。

没有值的 prop（`strong`）是 `true`。展开项（`...extra`）在 props 对象里变成 `...(state.extra)`。

**动态 embed** `+{expr}#name` 是一个来自 state 的 view。它在运行时检查，所以和条件一样带有标记：

```ts
// line 2: +{...}#view
sectionChildren.push({ t: "marker", id: "1s" + idSuffix });
const viewView = asView(state.page);
if (viewView) {
  sectionChildren.push(...viewView.render(
    { "title": state.title },
    idSuffix + "/1",
    messagePrefix + "view.",
    state.page,
  ));
}
sectionChildren.push({ t: "marker", id: "1e" + idSuffix });
```

`asView` 接受一个 view，或者带有 `view` 的组件对象，或者表示“没有”的 `null`。其余部分是同样的调用，包在一个 `if` 里。

`+outlet` 的渲染方式类似，带有标记，并在运行时查找路由选出的子级：

```ts
// line 3: +outlet
divChildren.push({ t: "marker", id: "3s" + idSuffix });
const outlet = resolveOutlet(env, state);
if (outlet) {
  divChildren.push(...outlet.view.render(
    outlet.state,
    idSuffix + "/3",
    messagePrefix + outlet.name + ".",
    outlet.component,
  ));
}
divChildren.push({ t: "marker", id: "3e" + idSuffix });
```

`resolveOutlet` 查看组件（即 `env`）的 `routing` 表和 `state.route`，并返回匹配的页面：它的 view、它的 state、它的名称和它的组件。如果没有匹配，两个标记之间就不渲染任何东西。

## 一张完整的卡片

现在来看一个几乎用到了所有东西的模板：根节点上的 class 切换、带两个动态属性的图片、一个标题、一个空值安全的默认值、一个带点击事件的带 key 的列表，以及一个带按钮和备选内容的条件。

::demo card open=module

分段阅读生成的 `render`。先是根节点，在函数的末尾：

```ts
const articleAttrs = {};
setAttr(articleAttrs, "class", joinClasses(["card", (state.featured ? "featured" : "")]));
nodes.push({
  t: "el",
  id: "0" + idSuffix,
  tag: "article",
  attrs: articleAttrs,
  events: {},
  children: articleChildren,
});
```

class 切换 `featured` 是动态的，所以 `article` 有 id `"0"`。静态 class `card` 是列表的第一个条目。图片是第一个子节点：

```ts
const imgAttrs = { "class": "card-img" };
setAttr(imgAttrs, "src", toAttr(state.image));
setAttr(imgAttrs, "alt", toAttr(state.title));
```

静态 class 在字面量中，两个动态属性紧随其后。`h3` 除了它的文本之外是静态的，所以元素没有 id，但它的文本有：`"3" + idSuffix`。摘要使用了空值安全的默认值：

```ts
pChildren.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.summary ?? "No summary")) });
```

当 `summary: null` 时，这就是 `No summary`。然后是列表。这个列表在模板中没有给索引命名，所以分配器选了 `tagIndex`：

```ts
const tagList = (state.tags) || [];
for (let tagIndex = 0; tagIndex < tagList.length; tagIndex++) {
  const tag = tagList[tagIndex];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "7[" + tagSuffix });
  // line 7: <li.tag>
  const liChildren = [];
  liChildren.push({ t: "text", id: "9" + tagSuffix, text: "" + toText(tag) });
  const liAttrs = { "class": "tag" };
  const liEvents = {
    "click": { id: messagePrefix + "filter", payload: tag },
  };
  ulChildren.push({
    t: "el",
    id: "8" + tagSuffix,
    tag: "li",
    attrs: liAttrs,
    events: liEvents,
    children: liChildren,
  });
  ulChildren.push({ t: "marker", id: "7]" + tagSuffix });
}
```

每个 `li` 都有一个包含其 key 的 id（`8` 加上后缀 `#hot`），因为 `filter(tag)` 的 payload 是可能变化的数据。最后一部分是条件，其中有一个按钮，它的事件带两个参数，并且有动态的 `disabled`：

```ts
const buttonAttrs = { "class": "buy" };
setAttr(buttonAttrs, "disabled", toAttr(state.soldOut));
const buttonEvents = {
  "click": { id: messagePrefix + "buy", payload: [state.id, state.price] },
};
```

在 demo 的 state 中 `soldOut` 是 `false`，所以不会写 `disabled`，4 的 `price` 以 `[9, 4]` 的形式在 payload 里。这一步改变了价格。结果有两个 patch：按钮的 message 得到 payload `[9, 5]`，文本变成 `Buy for 5`。卡片中的所有其他节点都没有被提到。`diff` 如何恰好找到这两个，是[下一页](page:compiler-diff)的主题。

## 检验你的理解

你可以在几分钟内学会阅读生成的代码，这是值得的。当页面看起来不符合预期时，第一步是展开一个形状相同的小 demo 的模块。问自己三个问题：

1. 我期望的元素或文本有 `id` 吗？如果没有，就没有任何 patch 能到达它。
2. 我写的表达式是否按我想的方式被翻译了？注意看圆括号和 `?.`。
3. 属性是用 `toAttr`（单个表达式）计算的，还是用 `+`（含 hole 的文本）计算的？前者会丢掉 `false` 和 `null`，后者则始终写出一个字符串。

## 你学到了什么

- `render` 按固定模式生成：先子节点，再属性，然后元素被推入；vnode 是三种普通数据：`el`、`text` 和 `marker`。
- `id` 只存在于 `diff` 能 patch 的节点以及所有标记上。id 是解析器的节点 id，后面跟着列表条目或子 view 的后缀。
- 属性使用 `setAttr`，配合 `toAttr`（一个表达式）或文本拼接（含 hole 的文本）；class 使用 `joinClasses`；事件变成带 payload 的 message 描述。
- 表达式被完全加上圆括号并且空值安全。`if`、`for` 和 embed 被包在标记里，这样 `diff` 就知道它们从哪里开始、到哪里结束。

下一页：[diff 函数](page:compiler-diff)。
