---
summary: How the compiler writes render(state). Read the generated code line by line, from a single paragraph to a full card: the vnode shape, attributes, classes, events, text, expressions, conditions, loops and child views.
---
## What render is

`render(state)` is the function that answers the question "what does the page look like for this state?". It does not touch the DOM. It builds and returns a list of plain objects, the **vnodes**, that describe the page. The DOM plugin builds real elements from them once, when a view is mounted. Server rendering turns the same list into HTML text. After the first render, `diff` takes over (see [the pipeline](page:compiler-pipeline)).

`render` is generated from the AST, in a fixed pattern: one block of code per node, in the order of the template. This page shows that pattern from the smallest template up. Every code block you see here is the real output of the compiler, copied from a run.

Start with one line.

::demo static-line open=module

Open the module and read `render` from the top.

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

- The function has four parameters. `state` is the data. `idSuffix`, `messagePrefix` and `env` are used when this view is embedded in another one; a top-level view leaves them at their defaults.
- `nodes` is the result: the top-level vnodes.
- The comment `// line 1: <p.note>` says which line of the template produced the code below it. The tag and the classes are shown, so you can find your way in a long module.
- `pChildren` is the list of children of the `p`. The text is pushed first.
- `pAttrs` is the attribute object. The class `note` is static, so it is written as a literal.
- Last, the element is pushed into `nodes`, with the five fields every element vnode has.

The children are written before the element because JavaScript needs the array to exist when it is used. This is true of every element: **children first, attributes next, then the element itself**.

## The three vnodes

There are only three kinds of vnodes, and each has a short type tag in `t`.

| `t` | Fields | Meaning |
| --- | --- | --- |
| `el` | `tag`, `attrs`, `events`, `children`, optional `id` | an element |
| `text` | `text`, optional `id` | a text node |
| `marker` | `id` | an empty comment node that marks the start or the end of a block |

The `attrs` of an element is a plain object from names to strings. The `events` is a plain object from DOM event names to message descriptions `{ id, payload, prevent?, stop? }`. There are no functions in a vnode: it is data, so it can be compared, logged, sent over a network and turned into HTML text.

The `id` is the interesting field, and it is optional. **An id is written only when `diff` can patch the node.** In `static-line` there is no id at all. In the rest of this page you will see exactly when one appears: for a text with an expression, for an element with a dynamic attribute, class or event payload, and for every marker.

## Nesting and names

Elements inside elements nest their blocks. Each element declares its own variables, named after the tag.

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

The `h1` and the `p` push themselves into `divChildren`, and at the end `div` pushes itself into `nodes`. The result is the tree `div > (h1, p)`.

The names come from a small allocator (`names.ts`). It starts from the tag, `h1Children`, and adds a number only when the name is already in use in a block that is open at this point: a second `li` next to the first becomes `liChildren2`. Names that JavaScript reserves (`class`, `new`, ...), the words the generated code needs (`state`, `nodes`, `patches`, ...) and the names of the helpers and imported views are never used for variables. A tag such as `my-card` becomes `myCard`. A loop variable is named after your variable; if that name is taken, a number is added.

The indentation, the line breaks and the rule "a call that does not fit in 100 columns gets one argument per line" come from a small `Writer`. That is why the long `setAttr` call in the `classes` demo further down is broken over lines, and the short ones are not.

## Static attributes and classes

Attributes with a fixed value are written directly into the attribute object, in one literal.

::demo static-attrs open=module

```ts
const aAttrs = { "id": "go", "href": "/home", "target": "_blank", "hidden": "", "class": "btn big" };
```

Look at the order: `id` first (the `#go` of the selector is an attribute like any other, and the parser puts it first), then the attributes in the order of the source, and `class` last. The two classes `.btn.big` are merged into one string. A boolean attribute such as `hidden` has the value `""`, which is how HTML says "present". Nothing here is dynamic, so the element has no id, and the helpers are not imported at all.

## Text and interpolation

Text with holes is built with `+`. Each hole is passed through `toText`, which turns `null`, `undefined` and `false` into an empty string.

::demo interpolation open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "Hello, " + toText(state.name) + "! You have " + toText(state.count) + " new messages." });
```

The parts of the text, in order: the string `"Hello, "`, the expression `name`, the string `"! You have "`, the expression `count`, and the string `" new messages."`. The strings are written as JSON string literals; the expressions are wrapped with `toText`.

The text has an `id`, `"1" + idSuffix`. The `1` is the node id from the parser. The `idSuffix` is empty for a top-level view; it is what makes an id unique when the view is embedded or repeated in a loop. If a text node has no expression, it has no id.

When the first part is an expression, the code starts with an empty string: `"" + toText(state.name)`. This is only for uniformity: `toText` already returns a string, and the empty string keeps every interpolated text in the same `"" + ...` shape.

## Dynamic attributes

An attribute whose value has an expression is computed with `setAttr` and one of two converters.

::demo dynamic-attrs open=module

```ts
const aAttrs = {};
setAttr(aAttrs, "href", toAttr(state.url));
setAttr(aAttrs, "title", "Open " + toText(state.name));
setAttr(aAttrs, "data-id", toAttr(state.id));
setAttr(aAttrs, "hidden", toAttr(state.gone));
```

- A value that is a single expression (`href=url`) goes through `toAttr`. `null`, `undefined` and `false` mean "do not write this attribute at all". `true` means a bare attribute (an empty string). Anything else is turned into a string: `data-id=id` with `id: 0` gives `"0"`, because `0` is a value like any other.
- A value that mixes text and expressions (`title="Open {name}"`) is built like text. It is always a string, so it is always written.
- `setAttr(attrs, name, value)` writes the attribute unless the value is `null`.

In the HTML of the demo there is no `hidden`, because `gone` is `false`. The element has an `id` (`"0" + idSuffix`), because `diff` can have something to say about it. The step of the demo makes `url` null, and `diff` answers `rmAttr`: the attribute is removed.

## Class toggles

A class that depends on the state is an entry of the `class:name=condition` kind. Together with the static classes and an optional `class=` attribute, it makes one value, computed by `joinClasses`.

::demo classes open=module

```ts
setAttr(liAttrs, "class", 
  joinClasses(["item", (state.active ? "active" : ""), ((state.state === "done") ? "done" : ""), toAttr(state.extra)]),
);
```

The list has, in order: the static classes (`.item`, joined into one string), one entry per toggle (`(condition ? "name" : "")`), and the `class=` attribute if there is one. `joinClasses` drops the empty entries and joins the rest with spaces, so the HTML is `class="item active wide"`. If nothing is left, it returns `null` and `setAttr` writes nothing.

The step shows `state` changing from `open` to `done`. The new class list is `item active done wide`, and the patch is a single `attr` for the whole class value, not one for each class name. The expression of the second toggle uses braces (`class:done={state === "done"}`), because it has spaces; see [parsing](page:compiler-parser).

## Void elements

HTML has elements that never have content: `input`, `br`, `img` and a few more. The parser does not allow children under them, and the compiler does not write any. The vnode still has a `children` list, and it is empty.

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

When the vnodes are turned into HTML, `toHtml` knows the same list of void tags and writes `<br>` with no closing tag. In the DOM plugin, `document.createElement("br")` simply gets no children. Only the `input` has an id here, because its `value` attribute reads the state.

## Events

An event is not a function in the vnode. It is a message description: the id of a message, and a payload. The application receives the message when the user clicks; the template never contains logic.

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

- The message id is `messagePrefix + "save"`. A top-level view has the empty prefix, so the message is `save`. An embedded view has the instance name as prefix, so a `save` in a child `+Form#editor` is `editor.save`.
- No argument gives `payload: undefined`. One argument gives its value, and several arguments give an array.
- The modifiers `.prevent` and `.stop` become the flags `prevent: true` and `stop: true` in the description. The DOM plugin reads them when the event comes.

Look at which buttons have an `id`. The first one, `@click=save`, has none: its description never changes. The second and the third read `state.id`, so they have ids (`"3"` and `"5"`), and `diff` can rebind their payloads. In the step, `id` changes from 4 to 5: two `handler` patches, one for each button, with the new payload. The listeners are not touched.

## Expressions

All expressions are translated by one function with one case for each kind of node in the expression AST. The translation follows two rules. **Every compound expression is wrapped in parentheses**, so the order of evaluation never depends on the precedence of the printed text. And **every member access is null-safe**.

| In the template | In the generated code |
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
| `null`, `1`, `"x"` | `null`, `1`, `"x"` |

Inside a loop, the loop variables are local variables and are written without `state.`.

::demo operators open=module

```ts
pChildren4.push({ t: "text", id: "7" + idSuffix, text: "" + toText((((state.x > 0) && (state.y < 10)) || state.z)) });
pChildren6.push({ t: "text", id: "11" + idSuffix, text: "" + toText(((state.count === 1) ? "item" : "items")) });
```

The operators are copied as they are: `===` stays `===`, `??` stays `??`. The template language chooses a safe subset of JavaScript and then uses it as it is.

The next demo shows what null-safety does. The state has `user: null`, an empty `rows` and a `format` function. Nothing throws.

::demo access open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "" + toText(((state.user)?.address)?.city) });
pChildren2.push({ t: "text", id: "3" + idSuffix, text: "" + toText(((state.rows)?.[state.i])?.title) });
pChildren3.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.format)?.(state.price)) });
```

In plain JavaScript, `state.user.address.city` would throw an error when `user` is `null`. Here, each `?.` stops the chain at the first missing piece and gives `undefined`, and `toText` turns that into an empty string. The HTML has empty paragraphs for the first two, `$3` for the call, and nothing for the literal `null`. A template cannot crash because the data has not arrived yet. This is why a template can be written without `if user` guards in front of every read.

> [!NOTE] Calls are optional too
> `format(price)` is translated to `(state.format)?.(state.price)`. If `format` is missing, the result is `undefined`, again without an error. The function receives the values as arguments; it should be pure, because `diff` calls it for both `prev` and `next`.

## Conditions

An `if` is rendered as an ordinary JavaScript `if` chain, with a marker on each side.

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

Only the branch that is true is built. The two markers are always there: `0s` is the start (the node id `0`, and the letter `s`), `0e` is the end. They are empty comment nodes in the DOM. When the branch changes, `diff` removes everything between the two markers and inserts the new branch before the end marker. Without markers, there would be no place to say "here is where the block lives" when the block is empty.

Each branch is a block of its own, so the allocator reuses the names (`pChildren` appears in both) without a number. They never meet.

## Loops

A `for` is a JavaScript `for` loop with a marker before and after the whole list, and a marker before and after each item.

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

- `(state.tags) || []` makes a missing list an empty list.
- The key is `String(...)` of the key expression. Here it is `key tag`, so the key is the tag itself. Without a `key`, the key is the index, written as `String(i)`.
- Every item has its own suffix, `idSuffix + "#" + key`. All ids inside the item end with it: the text is `"3" + tagSuffix`, for example `3#a`. The same text node in two items has two different ids. The key makes that stable: if an item moves, its ids go with it.
- The start and end marker of an item are `"1["` and `"1]"` followed by the suffix. The markers let `diff` move or remove a whole item as one range of siblings.

The index and the item have the names you gave in the template. If you leave out the index, the allocator invents `tagIndex`, which you can see in the `card` demo below.

## Child views

An embed becomes a call of the child's `render`, and the result is spread into the children of the parent.

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

The four arguments, in order, are the child's `state` (the props, as an object), the id suffix, the message prefix and the environment. The props object keeps the type of a single-expression prop (`count: state.n` is a number if `n` is a number), and builds a string for a prop with text and holes (`label="Hi {name}"`). The suffix is extended with `/1`, the node id of the embed, so the child's ids cannot meet the parent's. The prefix is extended with `one.`, the instance name. The last argument is the component behind the instance, found by the helper `childEnv`; the child needs it mostly for an `+outlet`.

A prop with no value (`strong`) is `true`. A spread entry (`...extra`) becomes `...(state.extra)` inside the props object.

A **dynamic embed**, `+{expr}#name`, is a view that comes from the state. It is checked at run time, so it gets markers, like a condition:

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

`asView` accepts a view, or a component object that has a `view`, or `null` for "nothing". The rest is the same call, wrapped in an `if`.

An `+outlet` is rendered in a similar way, with markers and a runtime lookup of the routed child:

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

`resolveOutlet` looks at the `routing` table of the component (the `env`) and at `state.route`, and returns the matching page: its view, its state, its name and its component. If there is no match, nothing is rendered between the markers.

## A complete card

Now a template that uses nearly everything: a class toggle on the root, an image with two dynamic attributes, a heading, a null-safe default, a keyed list with a click event, and a condition with a button and an alternative.

::demo card open=module

Read the generated `render` in pieces. The root first, at the end of the function:

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

The class toggle `featured` is dynamic, so the `article` has the id `"0"`. The static class `card` is the first entry of the list. The image is the first child:

```ts
const imgAttrs = { "class": "card-img" };
setAttr(imgAttrs, "src", toAttr(state.image));
setAttr(imgAttrs, "alt", toAttr(state.title));
```

The static class is in the literal, and the two dynamic attributes follow. The `h3` is static except for its text, so the element has no id but its text has: `"3" + idSuffix`. The summary uses the null-safe default:

```ts
pChildren.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.summary ?? "No summary")) });
```

With `summary: null`, this is `No summary`. Then the list. In this one the index is not named in the template, so the allocator picked `tagIndex`:

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

Each `li` has an id that includes its key (`8` and the suffix `#hot`), because the payload of `filter(tag)` is data that can change. The last piece is the condition, with a button that has an event with two arguments and a dynamic `disabled`:

```ts
const buttonAttrs = { "class": "buy" };
setAttr(buttonAttrs, "disabled", toAttr(state.soldOut));
const buttonEvents = {
  "click": { id: messagePrefix + "buy", payload: [state.id, state.price] },
};
```

In the demo state `soldOut` is `false`, so `disabled` is not written, and the `price` of 4 is in the payload as `[9, 4]`. The step changes the price. The result has two patches: the message of the button gets the payload `[9, 5]`, and the text becomes `Buy for 5`. All the other nodes in the card are not mentioned. How `diff` finds exactly these two is the subject of [the next page](page:compiler-diff).

## Checking your understanding

You can learn to read the generated code in a few minutes, and it is worth it. When a page does not look as you expect, the first step is to unfold the module of a small demo that has the same shape. Ask three questions:

1. Does the element or text I expect have an `id`? If not, no patch can ever reach it.
2. Is the expression I wrote translated as I thought? Look for the parentheses and the `?.`.
3. Is the attribute computed with `toAttr` (single expression) or with `+` (text with holes)? The first drops `false` and `null`, and the second always writes a string.

## What you learned

- `render` is generated in a fixed pattern: children first, then the attributes, then the element is pushed; a vnode is plain data of three kinds, `el`, `text` and `marker`.
- An `id` exists only on nodes that `diff` can patch, and on all markers. Ids are the node id of the parser, followed by the suffix of the list item or the child view.
- Attributes use `setAttr` with `toAttr` (one expression) or text concatenation (text with holes), classes use `joinClasses`, events become message descriptions with a payload.
- Expressions are fully parenthesized and null-safe. `if`, `for` and embeds are wrapped in markers so that `diff` knows where they start and end.

Next: [The diff function](page:compiler-diff).
