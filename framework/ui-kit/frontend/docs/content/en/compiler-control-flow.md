---
summary: How `if`, `for` and embedded child views are compiled. You will learn what markers are, how a branch index decides between "diff inside" and "clear and insert", how keyed lists become insert, remove and move patches, and how embeds and `+outlet` pass props to child views.
---
## Structure changes need a different kind of patch

The last page showed patches that change one existing node: `text`, `attr`, `rmAttr` and `handler`. They are enough while the shape of the page stays the same. But an `if` can show a paragraph or hide it, a `for` can grow or shrink, and an embedded child view can be replaced by another. For those changes the page needs four more operations: `insert`, `clear`, `remove` and `move`. They all work on **ranges of siblings**, and the ranges are marked in the DOM with **markers**.

A marker is an empty comment node. The compiler puts one before and one after every `if`, every `for` and every dynamic embed, and one before and one after every item of a `for`. Markers have ids, so a patch can say "everything between marker `0s` and marker `0e`". A comment node has no visible output, and it needs no wrapper element, so the HTML you write stays what you wrote.

## if and else

Here is the smallest `if`.

::demo if-else open=module

The first step flips `loggedIn`, and the answer is two patches: `clear` and `insert`. The second step keeps the value, and the answer is the empty list. The `insert` patch carries the new vnodes, which the demo shows only as a count (`1 vnodes`). Here is the generated `diff`, shortened to the part that matters:

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

The key idea is the **branch index**. The compiler turns the chain `if / else if / else` into one number: `0` for the first branch, `1` for the second, and so on. It computes that number for `prev` and for `next`, with the same conditions on both sides.

- If the two numbers are equal, the same branch is shown on both sides. The compiler then diffs **inside** the branch, exactly like for any other nodes.
- If the numbers differ, the old branch is removed with a `clear` between the two markers, and the new branch is rendered from `next` and inserted before the end marker. No attempt is made to turn one branch into the other.

The second rule is a design decision. Two branches are two different templates, so comparing them node by node would be slower than replacing them and would give no better result. The first rule is what makes an `if` cheap when it does not flip.

## An if without else

When there is no `else`, the "nothing shown" case has its own number, `-1`. That is why the code has two checks: `prevBranch !== -1` for the `clear`, and `nextBranch !== -1` for the `insert`.

::demo if-alone open=module

Read the four steps as a table of what can happen to a single `if`:

- Hidden to shown: one `insert`, and no `clear`, because there is nothing to remove.
- Shown to shown, with a new value: no structure change at all. The branch index is `0` on both sides, so the compiler diffs inside the branch and a single `text` patch comes out.
- Shown to hidden: one `clear`, and no `insert`.
- Hidden to hidden: nothing. The guard passes only if `error` changed, and here it did not.

A condition is not compared as a value. `error` going from `"Oops"` to `"Again"` changes the field, but the branch index stays `0`, and that is what decides.

## Chains and what happens inside a branch

Most real templates have a chain. This one is the classic loading, failed and ready screen.

::demo if-chain

For three branches the index is computed with a chain of conditions, written as nested conditional expressions:

```ts
      const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "failed") ? 1 : 2;
      const nextBranch = (next.status === "loading") ? 0 : (next.status === "failed") ? 1 : 2;
```

The last number is the `else` branch. Without an `else` it would be `-1`. Now look at the five steps:

- `ok → loading` and `loading → failed`: the branch changes, so you get `clear` and `insert`. The `insert` of the second step carries two vnodes, the paragraph and the button.
- `failed, error changes`: the branch is the same, and only the text that reads `error` is patched.
- `loading, error changes`: the guard of the `if` passes, because it reads `error` (the second branch uses it), but the branch is still `0`, and branch `0` is static. The answer is `[]`.
- `ok, items change`: the inner `for` appends an item; you will see how in a moment.

The code for the "inside" case has one block per branch, and each block runs only when its branch is the shown one:

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

A branch that has nothing dynamic gets no block. That is why an `if` with static branches, like the first demo of this page, has no `else` part in its `diff`.

## Markers in the render

The markers are produced by `render`, so the DOM plugin can find the ranges. Two `if`s in a row show how they are numbered.

::demo if-markers open=vnodes

Open the vnodes. Every `if` is surrounded by two marker vnodes, `{ "t": "marker", "id": "1s" }` and `{ "t": "marker", "id": "1e" }`. The number is the number of the `if` node in the template, and `s` and `e` mean start and end. The first step inserts before `4e`, the end marker of the second `if`. The second step clears from `1s` to `1e`, and only the first `if` is touched.

> [!NOTE] Markers are invisible
> The HTML you see in a demo has no markers, because `toHtml` drops them unless asked. In the browser they are empty comment nodes, `<!---->`. If you inspect the page, you will see them between your elements.

## Loops: one range per item

A `for` is a list of ranges. Each item has its own start and end marker, and the whole loop has a start and end marker too. The ids of the markers contain the **key** of the item, so a patch can name exactly one item.

```pavlus
ul.todos
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}
```

The part of `render` that makes this is short:

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

The key is converted to a string. The **suffix** of the item is the suffix of the outer template, plus `#` and the key. Every node inside the item gets its id from this suffix, so the second `li` of a list has the id `2#2` (node 2, key 2) and not the id of the first. This is also how a loop inside a loop stays unambiguous: the inner suffix extends the outer one.

An item's end marker has an id like `1]#2`. The `[` and `]` in the ids are only there to tell the markers of an item apart from `s` and `e`, the markers of the whole list.

## Lists without a key

If you write no `key`, the key of an item is its index. This is the simplest form, and it is a good choice when a list only ever grows and shrinks at the end.

::demo for-unkeyed

- Appending an item inserts one range before the end marker of the list.
- Removing the last item removes its range.
- Removing the **first** item does not remove the first range. The keys are `0, 1, 2` and then `0, 1`, so the range with key `2` goes away, and the texts of keys `0` and `1` are patched to the new values. The result looks the same, but the work is different: two `text` patches and a `remove`.
- Reversing three items patches two texts. The one in the middle stayed the same, so it costs nothing.

> [!WARNING] Without a key, the DOM follows the position
> With an index as key, the DOM nodes stay at their position and get new content. That is fine for text. But if an item has something that only the DOM knows (the focus, the caret, text typed into an input that the state does not store), that thing stays at the position, not with the item. Give the loop a key whenever items can be removed from the middle or reordered.

## Lists with a key

With `key todo.id`, an item is the same item while its key is the same, wherever it stands in the list. Now the compiler can say what happened: an item was added, was removed, was moved, or has changed.

::demo for-keyed

Every kind of change gives its own kind of patch:

- `append D`, `insert D in the middle`: `insert`, with `before` set to the start marker of the item that must follow (or the end marker of the list).
- `remove A`, `remove B`: `remove`, from the start marker to the end marker of the item, both included. The `remove` patch removes the markers too. This is different from `clear`, which keeps the markers.
- `swap A and B`: a single `move`.
- `B done`: no structure change. Only the attribute of the item that changed is patched, with the id of that item.
- `all replaced`: two `remove` and two `insert`. Note the order. The inserts are made from the end of the list towards its start.
- `nothing changed`: the demo passes a new array with the same three objects. The guard of the loop passes, because the arrays are two objects, but every item is the same object on both sides, so `common` finds nothing to patch.

## How the lists are reconciled

The generated code does not decide what to insert, move or remove. It calls a helper from the runtime, `diffKeyedList`, and gives it four small functions, one for each case. This is the call, from the generated module:

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

The helper works in three passes:

1. **Remove.** Every key of `prev` that is not in `next` is removed. The keys that stay are written down in the order they have in the DOM.
2. **Insert and move, from the end.** The helper walks `next` from the last item to the first. For each item it knows the item that must follow it, so it knows the marker to insert or move before. A new key gives `insert`. An old key that is not already in front of its follower gives `move`. Walking from the end is what guarantees that the marker a patch refers to exists when the patch is applied.
3. **Common.** For every key present on both sides, `common(prevIndex, nextIndex)` diffs the content of the item. The code inside `common` is the normal diff of the loop body, with `prevTodo` and `nextTodo` as the item on the two sides.

The `insert` function renders the new item from the `next` side only. The `common` function is where the guards of the previous page are used again, with the item as the root of the dependency.

The method is simple, and it is not the minimum. Moving one item far away can cost several moves, because every item it passes is checked against its follower.

::demo for-moves

- Moving the first item to the end costs one `move`.
- Moving the last item to the front costs three: the helper moves `c`, then `b`, then `a`, instead of moving only `d`.
- A reverse of four items costs three moves.

This is a deliberate trade. The algorithm is small and predictable, and in practice most list changes are appends, removals and the occasional swap. A shortest edit script would need a longest increasing subsequence, which is more code for a case that is rare. If you reorder very long lists often, this is the place to look in the generated code.

## The index variable

A loop can name the index: `for item, i in items`. The index is part of the dependency set of the loop body, because it can change when an item moves.

::demo for-index open=module

Removing the first item removes its range, and then the two remaining items are patched: their numbers went from `2.` and `3.` to `1.` and `2.`. The item itself did not change, but `common` is called for it with a new index, and the guard `prevIndex !== nextIndex || prevItem !== nextItem` lets it through.

## Empty lists and missing lists

The list expression is evaluated as `(items) || []`. A state where `items` is missing, `null` or `undefined` is the same as an empty list. That is a feature, but note what it means for other conditions.

::demo for-empty

- `[] → [x, y]`: two `insert` patches, for `y` first because the helper walks from the end, and a `clear` for the "Nothing here" paragraph.
- `[x, y] → []`: two `remove` and one `insert` of the paragraph.
- `[] → undefined`: the loop sees an empty list on both sides. The condition `items.length === 0` is `(items)?.length === 0`, which is `undefined === 0`, which is false, so the paragraph is cleared. If you want the paragraph also for a missing list, write the condition as `!items || items.length === 0`.

> [!DANGER] Keys must be unique
> Two items with the same key make `diffKeyedList` throw, and the message names the key: `pavlus: duplicate key 1`. A key that is missing gives the key `undefined` for all items, and the error is `pavlus: duplicate key undefined`. The error comes from `diff`. `render` does not check the keys, so a page can render once and fail on the first update. Use a value that is unique in the list and does not change for the same item, such as an id from the server.

## Loops in loops

Loops nest, and every level extends the suffix. The inner list of a group lives between markers with the group's key in their ids.

::demo for-nested

The insert is addressed to `6e#g2`, the end marker of the member list of the group with key `g2`. The first group is not touched: it is the same object in `prev` and `next`, so its guard fails at once. The second group is a new object that shares its other fields, which is how you update immutable state.

## Embeds: a child view in your template

An **embed** puts another compiled template into this one. A static embed names an imported template, an instance name after `#`, and props in parentheses.

```pavlus
import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role hot=admin)
```

The imported template is an ordinary template. For this page it is:

```pavlus
span.badge(class:hot=hot) {label}
```

The child does not read the state of its parent. It receives an object, and `label=role` means that the object has a field `label` whose value is the parent's `role`.

::demo embed-static open=module

An embed is not a special patch. The compiler writes a call to the child's own `diff`, with the props of `prev` and the props of `next`, and puts the patches in the same list:

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

Three arguments after the states say who the child is:

- **The suffix** `idSuffix + "/3"` makes the ids of the child unique. `3` is the number of the embed node in the parent. In the demo the child's text has the id `1/3`: node 1 of the child, inside embed 3 of the parent.
- **The prefix** `messagePrefix + "badge."` is put in front of every message id that the child sends. A click in the child sends `badge.something`, so the parent component can route the message to the right child.
- **The environment** `childEnv(env, "badge", next)` finds the component behind the instance, if there is one. A child that has its own `+outlet` needs it.

The guard lists the props that are read, and only those. If the parent's `name` changes, the badge is not even called. If a prop is written with no state in it, like `label="Fixed"`, it is static. An embed that reads nothing is skipped entirely.

Embeds are often used inside a loop. Here is one inside a keyed loop:

::demo embed-in-loop open=module

The ids in the patches are `0#2/4` and `1#2/4`. Each is the number of a node of the child (`0` or `1`) followed by its suffix `#2/4`: the item with key `2`, then the embed, which is node `4` of the parent. This is what the suffix is for. Two badges can have the same template and never share an id.

A spread prop, `+Row#row(...item selected=flag)`, copies all fields of `item` into the props and then adds `selected`. Props are written in order, so a later one wins.

## Dynamic embeds

Sometimes the child is not known when the template is written. A **dynamic embed**, `+{expr}#name(props)`, takes the view from the state: the value of the expression is a compiled template, or a component object that has a `view`. The instance name is required, because the compiler cannot guess it.

```pavlus
section.panel
  h2 {title}
  +{panel}#panel(items=items)
```

Because the child can be a different template on each side, the compiler has to handle three cases. The helper `asView` returns the view behind a value, or `null` for `null` and `undefined`.

::demo embed-dynamic open=module

In the demo the state holds real compiled views (printed as `<view list.pavlus>`). The code has three paths:

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

- The same view on both sides: the view's own `diff` is called. In the first step the list view appends one item and returns an `insert`.
- Another view: the old content is cleared between the markers, and the new view is rendered from the `next` props and inserted. A diff between a list and a table would make no sense.
- A view that appears or disappears (`null`): only the `insert`, or only the `clear`.

If the value is not a view and not a component with a view, `asView` throws `pavlus: +{...} needs a view or a component with a view`. Unlike a static embed, a dynamic one has markers, because its content can come and go.

## The routed page: +outlet

`+outlet` is a dynamic embed whose view comes from the router. A component declares a `routing` table, and the outlet shows the child that matches `state.route`. See [routing](page:concepts-routing) for the table itself. The template is one line:

```pavlus
main
  +outlet
```

Its `diff` has the same three paths as a dynamic embed, with two differences:

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

First, the guard is `if (true)`. What the outlet shows depends on the route and on the state of the routed child, and the template cannot name those fields. So the compiler marks the node as "may change whenever anything does", and every parent of an outlet is checked on every update. Second, the page is replaced when the view **or the instance name** changes: two routes can use the same template and still be two different pages.

You cannot run an outlet in a demo on this page, because it needs a component that owns the routing table. A template with `+outlet` that runs without one stops with this error:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

## Putting it all together

This board has a heading, an `if / else if / else` chain, a keyed loop with an index, a class toggle, an event with an argument, a static embed inside the loop, and a dynamic embed after it. The `footer` is a view stored in the state.

::demo everything

Walk through the steps and name the code that produced each patch:

- `loading true → false`: the branch changes from `0` to `2`. One `clear` and one `insert` build the list, with all its items, in one patch.
- `card 1 done, card 2 moves up`: a `move`, because the list order changed, and then the changes in the items: the numbers (the index changed), the `class` of the card that is now done, and the badge, a child view that gets the new `hot` prop. The title of the card did not change, so it is not patched.
- `last card removed`: a `remove` and the footer text, `1 cards`. The footer is a dynamic embed with the same view on both sides, so its own `diff` is called with the new count.
- `all cards removed`: the branch changes from `2` to `1`, so the whole list is cleared and the "No cards" paragraph is inserted. No `remove` is needed for the items: the `clear` removes everything between the markers. The footer text changes to `0 cards`.

## What you learned

- `if` chains compile to a branch index (`-1` when nothing is shown). The same index means a diff inside the branch; another index means `clear` between the markers and `insert` of the new branch.
- Markers are empty comment nodes around every `if`, `for` item, loop and dynamic embed. Structure patches (`insert`, `clear`, `remove`, `move`) work on ranges between them.
- A `for` becomes `diffKeyedList` with four callbacks. Keys must be unique and stable; without a key the index is the key, and the DOM follows the position.
- A static embed is a call to the child's `diff` with the props of both sides, a longer id suffix and a message prefix. A dynamic embed or an outlet replaces the content when the view changes.

Next: [API, Vite plugin and errors](page:compiler-tooling).
