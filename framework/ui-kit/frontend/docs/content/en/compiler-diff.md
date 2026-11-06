---
summary: How the compiler writes `diff(prev, next)`, the function that turns two states into a short list of DOM patches. You will learn the guards, the eight patch operations and the exact code generated for text, attributes, classes and event handlers.
---
## What diff is for

A pavlus template is compiled into two pure functions. `render(state)` returns the whole template for one state, as plain objects called **vnodes**. `diff(prev, next)` takes two states, the old one and the new one, and returns a list of **patches**: small plain objects such as "set the text of node 4 to `Bob`". The DOM plugin is the only code that applies them.

The idea is simple: when the state changes, nobody rebuilds the page. The compiler already knows which part of the state each part of the template reads, so `diff` only looks at the parts that can have changed.

The simplest possible case is a template that reads nothing.

::demo static open=module

Look at the generated `diff`. It has two lines: `if (prev === next) return patches;` and `return patches;`. The compiler saw that the template reads no state, so there is nothing to compare. Whatever the two states are, the answer is the empty list.

## The shape of every diff

Now a template that reads two fields of the state.

::demo text open=module

The first step changes `count`, and `diff` returns one patch. The second step changes both fields, and still one patch: the text of the paragraph is one node, so one patch replaces it. The third step changes nothing, and the list is empty. Here is the generated function:

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

Read it line by line, because every diff has the same shape:

1. `const patches = [];` is the answer that will be returned.
2. `if (prev === next) return patches;` is the cheapest exit. Often the state object did not change at all, and the call ends here.
3. The comment `// line 1: <p> (reads: name, count)` says which template line the block comes from and which parts of the state it depends on.
4. The **guard** `if (prev.name !== next.name || prev.count !== next.count)` is the dependency check. If none of the fields the paragraph reads has changed, the whole block is skipped.
5. Inside the guard, the text is computed twice, once from `prev` and once from `next`, with the same expression. Only if the two strings differ does a patch exist.

Two things in that code are worth a moment. First, the guard compares with `!==`, which is a reference comparison and costs almost nothing. The text comparison inside is a string comparison and happens only when the guard passes. Second, the text is compared after it is built. If `count` changes from `2` to `"2"` the guard passes, but both texts are `You have 2 items.`, so no patch is produced.

## Why diff compares states, not trees

Many frameworks build a new tree of nodes for every update and then compare the new tree with the old one. pavlus does not. `diff` receives the two **states** and never builds a tree on the update path.

- The compiler knows, at build time, which node reads which field. A tree comparison has to discover that again at run time, node by node.
- A field that no template reads is free. In the next demo the state has a `theme` field, but the template reads only `name`.

::demo other-field open=module

The guard is `prev.name !== next.name`. A change of `theme` never enters the block, so the answer is `[]` without comparing a single string.

- `render` is not called on an update. Only when a new piece appears (a branch of an `if`, a new item of a `for`) is that piece rendered, and only that piece.
- The result is plain data. You can call `diff` in a test, print the patches, or send them over a wire. Nothing needs a browser.

## Where the guards come from

The compiler computes, for every node, the set of **free names** it reads: the root fields of the state, and the variables of enclosing loops. This is the *dependency set*. You can see it in the AST section of every demo (*reads: name*) and in the `(reads: ...)` comment of the generated code.

A dependency is always the **root** of an expression. `{user.name}` depends on `user`, not on `user.name`, and `{items[page]}` depends on `items` and `page`.

::demo member open=module

In the step, `user` is a new object with the same `name`. The guard `prev.user !== next.user` passes, the text is built again, the strings are equal, and the result is `[]`. The guard is cheap and coarse; the string comparison inside is exact.

> [!WARNING] State must be immutable
> `diff` trusts `!==`. If you change `state.user.name` in place, `prev.user` and `next.user` are the same object, the guard fails, and no patch is produced. Always give a changed value a new identity: build a new object or a new array. The store plugin does this for you.

## The patch operations

A patch is an object with an `op` field. There are eight kinds. The first four change one existing node, the last four change the structure.

| Operation | Fields | Meaning |
| --- | --- | --- |
| `text` | `id`, `text` | Set the text content of the node `id`. |
| `attr` | `id`, `name`, `value` | Set the attribute `name` of the element `id`. |
| `rmAttr` | `id`, `name` | Remove the attribute `name` of the element `id`. |
| `handler` | `id`, `event`, `msg` | Replace the message that the event `event` of the element `id` sends. |
| `insert` | `before`, `nodes` | Create the vnodes `nodes` and insert them before the existing node `before`. |
| `clear` | `from`, `to` | Remove everything strictly between the markers `from` and `to`. |
| `remove` | `from`, `to` | Remove the sibling range `from` to `to`, both included. |
| `move` | `from`, `to`, `before` | Move the sibling range `from` to `to` so that it stands before the node `before`. |

This page is about the first four. The other four are the subject of [the next page](page:compiler-control-flow), because they belong to `if`, `for` and embeds.

Every `id` is a string. A node can be patched only if it has an id, so the compiler gives an id to a node **only when a patch can target it**: a text node that has `{expressions}`, an element that has a dynamic attribute, a class toggle or an event with arguments. A static node has no id at all. The DOM plugin keeps a map from id to DOM node, filled while it builds the nodes, and applies a patch by looking the id up. If an id is unknown, it throws `pavlus/dom: unknown node id`.

An id is the number of the node in the template (the parser counts the nodes in reading order) followed by the **suffix** of the instance. A top level template has the suffix `""`, so its ids look like `"1"`. The suffix is longer inside a `for` item or an embedded child, which is how the same template can appear many times on a page without two nodes sharing an id.

## Text patches

You have seen the `text` patch. When a template has several text nodes, each has its own id and its own guard, so a change touches only the node that reads it.

::demo guards open=module

The `div` reads `title` and `author`, so its guard is the union of its children's. Inside it, `h2` and `p` each have a guard of their own. The static line `Static line` reads nothing and has no code in `diff` at all. The fourth step passes a `title` that is the string `"1"` and then the number `1`: the guard passes, the text is `"1"` on both sides, and no patch comes out.

Here is the part of the generated code that shows the nesting:

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

The outer guard is only a shortcut: when neither field changed, one check replaces two. A child whose dependencies are the same as its parent's does not get a guard of its own, because the parent's check already covers it. You can see that in the next demo, where an element and its text both read the field `text`.

::demo redundant open=module

The `title` attribute and the text are both inside one guard, `if (prev.text !== next.text)`. The comment `// line 1: text` has no `if` of its own.

## Attribute patches

An attribute whose value is an expression, or a string with `{holes}`, can change. For each such attribute the compiler writes the same four lines: compute the value on both sides, compare, and push `attr` or `rmAttr`.

::demo attributes open=module

The three steps change `url`, `name`, and both. Here is the code for the two attributes:

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

The runtime helper `toAttr` turns a state value into an attribute value. `null`, `undefined` and `false` become `null`, which means "no attribute". `true` becomes the empty string, which is how HTML writes a boolean attribute. Everything else becomes its string. A string with holes, like `"Open {name}"`, is always a string, so for it the `null` branch can never run; the compiler writes the same code for every attribute because that keeps the generator simple.

The next demo shows the three outcomes: the attribute is removed, set to an empty value, and set to a text.

::demo attribute-removed open=module

- `locked` goes from `true` to `false`: `toAttr(false)` is `null`, so the patch is `rmAttr`.
- `locked` goes from `false` to `true`: the value is the empty string, so the patch is `attr` with `value: ""`, and the button is disabled again.
- `hint` goes from `null` to a text, and back: `attr`, then `rmAttr`.
- `hint` goes from a text to the empty string `""`. That is not `null`, so the attribute stays with an empty value. Only `null`, `undefined` and `false` remove an attribute.

## Class patches

A class is an attribute like any other, with one difference: a template can build it from three sources, the static classes (`li.item`), the toggles (`class:active=cond`) and a `class` attribute. When one of them is dynamic the compiler joins all of them with the helper `joinClasses`, and compares the whole result.

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

So a toggle does not add or remove one class name. It replaces the whole `class` attribute with the new full string, `item` or `item active done`. That is simple and safe: the DOM never holds a class list that the template does not know about. The price is that a class you add by hand with JavaScript is overwritten on the next change. In pavlus, the template owns the attribute.

`joinClasses` returns `null` when no class is left, for example when a template has only toggles and all of them are off.

::demo class-removed

When `on` becomes `false` the list of classes is empty, the helper returns `null`, and the patch is `rmAttr` for `class`.

## Event handler patches

In pavlus an event handler is not a function. `@click=pick(id)` is **data**: the message `{ id: "pick", payload: id }`. That has a consequence for `diff`: handlers can be compared by value, and a handler that did not change costs nothing.

A handler can change only if it has arguments. `@click=save` is the same message in every state, so the compiler treats it as static and never mentions it in `diff`.

::demo static-handler

With an argument, the payload is part of the state, and the compiler compares the payloads.

::demo handler open=module

```ts
    const prevClickPayload = prev.id;
    const nextClickPayload = next.id;
    if (!(prevClickPayload === nextClickPayload)) {
      patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
    }
```

The `handler` patch carries the whole new message. The DOM plugin does not add a new listener: it has one listener per element and event, and that listener always reads the latest message. So a `handler` patch only replaces a value in a map, and a click that happens after the patch sends the new payload.

With several arguments the payload is an array, so the compiler uses the helper `sameValues`, which treats two arrays with the same elements as equal. A new array with the same elements is not a change. The modifiers `.prevent` and `.stop` become `prevent: true` and `stop: true` in the message.

::demo handler-many open=module

The first step changes only `kind`, and the second step changes only `title`. See how each change maps to exactly one kind of patch: `kind` is in the handler payload, `title` is in the text, and `url` is in an attribute. The third step changes `url` and `id` and produces two patches, one `attr` and one `handler`.

The prefix `messagePrefix` is empty for a top level template. For a template embedded as a child, it is the instance name plus a dot, which is how a message from a child finds its way to the right handler. Embeds are explained on [the next page](page:compiler-control-flow).

## How the DOM plugin applies patches

When the state of the application changes, the DOM plugin calls `view.diff(oldState, newState)` for every mounted view and applies the list in order. For the four operations of this page, the work is one lookup and one DOM call:

- `text` sets `textContent` of the node.
- `attr` calls `setAttribute`. For `value`, `checked` and `selected` it also sets the live property, because for form fields the attribute only gives the initial value.
- `rmAttr` calls `removeAttribute`.
- `handler` replaces the message that the element's listener sends.

Patches are applied in the order `diff` returned them. That order matters for the structural patches in the next page, and it is stable: the code of `diff` follows the order of the template.

## A bigger example

This product card has a class built from two toggles, text with several fields, a button with a dynamic attribute, a title, and a handler, and an `if` that shows a badge. Open the generated module and find the guards: one for the card, and one for each child.

::demo product open=module

Read the steps one by one and find the guard that let each one through:

- `stock 3 → 2`: the card, the button and `<p.stock>` read `stock`, so their guards pass. The class and the `disabled` attribute are computed again, but their values are equal, so only one `text` patch comes out.
- `stock 1 → 0`: the class gains `out`, the button gets `disabled`, and the text changes. Three patches, in template order.
- `price 20 → 15, onSale false → true`: the class gains `sale`, the price text changes, and the `if` inserts the badge. The `insert` patch is explained on the next page.
- `another product`: the name, the price, the `title` of the button and its handler change at once. The ids `2`, `4` and `8` are node numbers in reading order.
- `currency only`: the guard of the card passes, the guard of `<p.price>` passes, and everything else is skipped by its own guard.

The whole function is a list of independent blocks. The cost of a call is the number of guards that pass times the size of what is inside, and not the size of the template.

> [!TIP] Read the generated code
> When a patch you expect is missing, open the generated module (the folded section of every demo, or the file in your browser's DevTools) and find the block for that template line. The comment shows what the block reads, and the guard shows which fields it compares. Most surprises are a field that is not part of the dependency set, or a value that was changed in place.

## What you learned

- `diff(prev, next)` compares two states with generated guards (`!==` on the root fields a node reads) and returns plain patches; it never builds or compares trees.
- A node can change only if it reads state, so static nodes cost nothing and get no id. Children with the same dependencies as their parent share the parent's guard.
- `text`, `attr`, `rmAttr` and `handler` change one node by id. A class toggle replaces the whole `class` attribute, and `null`, `undefined` and `false` remove an attribute.
- Handlers are data, so a handler with arguments is compared by value, and `@click=save` without arguments is never patched.
- The state must be immutable: a change that keeps the same object is invisible to the guards.

Next: [Compiling if, for and embeds](page:compiler-control-flow).
