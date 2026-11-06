---
summary: How the compiler works out which part of the state each node reads, and how that one answer decides which nodes get an id, which comparisons are written in diff and which nodes are skipped completely.
---
## The question the analysis answers

A template is a function of the state. When the state changes, most of the page usually stays the same. To update the page cheaply, `diff` must know quickly which nodes can be affected. The compiler answers this once, at build time, for every node: **which fields of the state does this node read?**

This answer is the **dependency set** of the node. It is computed by one small module, `analyze.ts`, from the AST. The set is used in three ways:

- A node with an **empty** set can never change. It gets no `id` and no code in `diff`.
- A node with a non-empty set gets a **guard** in `diff`: the code that handles the node runs only if one of the fields in the set changed.
- The set of a parent contains the sets of all its children, so a guard on a parent can skip a whole subtree at once.

Start with the smallest case. The demo opens the AST section; the `reads:` column is the dependency set.

::demo basic open=ast

The element and its text both read `name`. Step one changes `name`, and the answer is one `text` patch. Step two changes a field that the template does not read (`n`), and the answer is an empty list: the first line of `diff` that mentions `name` is false, and the function returns at once.

## Free identifiers of an expression

The base of the analysis is a function that takes an expression and collects its **free identifiers**: the names that come from outside the expression, that is, from the state (or from an enclosing loop). It walks the expression tree and records only the identifiers:

- A literal (`1`, `"x"`, `true`) reads nothing.
- An identifier (`count`) reads its name.
- A member access (`user.profile.name`) reads the identifier at the root of the chain: `user`. The names `profile` and `name` are properties, not state fields.
- An index (`items[index]`) reads both sides: `items` and `index`.
- A call (`fmt(count, unit)`) reads the callee and every argument: `fmt`, `count` and `unit`.
- Unary, binary, conditional and array expressions read everything inside them.

::demo members open=ast

Look at the first paragraph. It shows `user.profile.name` and `user.role`, and its dependency is only `user`. The second reads `index` and `items`. The third reads the function `fmt` too: if a function is stored in the state, replacing it counts as a change.

> [!NOTE] The unit of change is a top-level field
> The compiler tracks `user`, not `user.profile.name`. It compares `prev.user !== next.user`, a single check on the reference. If you replace the whole `user` object, every node that reads any part of `user` is looked at. The next step, comparing the computed text, then finds that nothing visible changed, and no patch is written. So the cost of a coarse dependency is a few comparisons, never a wrong page.

## What each kind of node reads

The function `nodeDeps` returns the dependency set of a node. Its rules follow the node types.

| Node | Reads |
| --- | --- |
| text | the identifiers in its parts |
| element | its attribute values, the conditions of its class toggles, the arguments of its events, and everything its children read |
| if | the test of each branch and everything the branches contain |
| for | the list expression, plus what the body reads, minus the loop variables |
| embed | the dynamic view expression, every prop value and every spread |
| outlet | everything (see the end of this page) |

The result for a node is remembered, so asking again costs nothing. Because an element includes its children, the root of the template always has the biggest set: the union of the whole tree.

## Static nodes

A node whose set is empty is **static**. The compiler does three things for it.

1. In `render` it writes the vnode without an `id`, since no patch will ever name it (the one exception is a text such as `{null}`: it is an expression, so it gets an id, although it can never change).
2. In `diff` it writes nothing. The function that handles a node begins with a check for exactly this case: no dependencies, nothing to do.
3. Because its parent's set is the union of its children's, a static child adds nothing to the parent's guard.

::demo static-mix open=ast

Only the last paragraph, and the `div` that contains it, read `visits`. The title and the muted paragraph show `reads: —`. Compare with the generated `diff` for this template:

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

The `h3` and the first `p` do not appear. Not even a comment is written for them. In a page with a large static layout and a few dynamic spots, the work of `diff` depends on the dynamic spots only.

## The guard

For a node with a non-empty set, the code generator writes the comment `// line N: <tag> (reads: a, b)` and, under it, an `if` that compares each field of the set between `prev` and `next`:

```ts
if (prev.url !== next.url || prev.active !== next.active || prev.title !== next.title) {
```

The comparison is `!==`, the identity of the value. For a number or a string that is a comparison of values. For an object or an array it is a comparison of references. This is cheap, and it is the reason the state has to be updated by creating new objects.

The guard is **coarse** on purpose. It says "something this node reads has changed", not "this attribute changed". Inside the guard, the compiler computes each attribute, each event payload and each text for both `prev` and `next`, and writes a patch only if the two results differ. Two levels of checks work together: the cheap guard skips most nodes, and the exact comparison of results decides what really goes into the patch list.

::demo parts open=ast

One element reads five fields: `url`, `active`, `title`, `id` and `label`. In step one only `id` changes. The guard opens, and `diff` checks each part: the `href` is equal, the title is equal, the class is equal. Only the event payload differs, so the single patch is `handler`. In step two both `title` and `label` change, and there are two patches: the `title` attribute and the text. Note that the `href` and the class are looked at (the guard opened because of `title`) but give no patch.

Another look at the same idea with a tree of siblings. Each paragraph has its own guard, so a change to one field touches one paragraph.

::demo two-fields open=ast

In step one only `body` changes. The `section` is entered, the `h2` guard is false, the `body` guard is true, the `author` guard is false. Result: one patch. In step two `title` and `author` change and `body` does not, so you get two patches and the middle paragraph is skipped.

## The same guard twice is written once

Often a child reads exactly the fields its parent reads. Then the child's own guard is redundant: the parent's guard already proves that something it reads has changed. The compiler detects this (the child's set is equal to the parent's) and does not repeat the check. It still writes the comment of the node, but not the `if`.

::demo same-deps open=ast

Here the `button` reads `label` through its attribute, its event and its text. The text node reads `label` as well. This is the generated `diff`:

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

There is one `if (prev.label !== next.label)`. The text, marked `// line 1: text`, has no guard of its own, because the guard of the button is the same check. The patches come in the order attributes, event, children.

A guard is not removed when the child's set is smaller than the parent's, even by one field. In the next example, the `footer` reads only `count`, but its parent reads four fields, so the footer keeps its own guard.

::demo nested open=ast

The `div.panel` reads `body`, `count`, `open` and `title`. The class toggle `class:open=open` is evaluated inside the guard of the `div`, directly, with no guard of its own: it belongs to the element. Each child below it has a guard of its own. The `if` reads `open` and `body`. In the first step only `count` changes, and the result is one text patch. In the second only `body` changes, and the patch goes to the text inside the open branch.

The generated code shows how the element's own attributes and its children are arranged:

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

A subtle thing to notice: when only `count` changes, the guard of the `div` is true, so the class is computed for both sides. It comes out equal, and no patch is made. The attributes of an element are re-checked whenever anything below it changes. That costs two small string computations, in exchange for a simple rule: the guard of a node covers the node and everything inside.

## Loop variables are removed

Inside a `for`, the names of the item and the index do not come from the state. They exist only inside the loop. The analysis therefore **removes** them from the set of the loop. What is left is what the loop needs from the outside.

::demo loop open=ast

Read the `reads:` column from the bottom up. The text reads `item` and `prefix`. The `li` reads the same, since its class toggle reads `item.hot`. The `for` reads `items` (the list) and `prefix`, but not `item`: the loop variable is removed. The `ul` above is the same as the `for`.

Now the generated code. The loop is compared with the help of the helper `diffKeyedList`, which decides what to insert, remove and move by the keys. For items that exist on both sides, it calls the function `common(prevIndex, nextIndex)`. In it, the loop variable is no longer a name of the state, but a local variable that has one value for `prev` and one for `next`, and the guard of the `li` compares those:

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

The key expression (`key item.id`) belongs to the loop too. It may use the loop variable; whatever it reads from outside stays in the set.

In the demo, step one replaces a single item in the list: the item with `id` 1 gets `hot: true`. Only that item's `li` is patched, with the id `2#1` (node 2, key 1). The demo builds a new object for the second item too, so its guard opens as well, but its class and text come out equal and it gives no patch. Step two changes `prefix`, which every item reads, so the text of every item is recomputed, and here the one item is patched.

The index variable works in the same way.

::demo loop-index open=ast

The text reads `n` and `row`, and the loop reads only `rows`. The index takes part in the guard of the `li` (`prevIndex !== nextIndex`). It matters in a keyed loop: an item keeps its key when it moves, but gets a new index. In the step, the list `a, b` becomes `b, a`. The first patch moves the item `a` to the end. The other two patches change the numbers: `b` is now `0. b` and `a` is now `1. a`.

> [!WARNING] A loop variable hides a state field of the same name
> Inside the loop, the name `name` means the loop variable and not the state field `name`. The analysis removes it from the loop's set, as it must, so a read of the outer `name` inside the loop is not possible. Choose loop names that do not clash with your state: `user in users`, not `name in names` when `name` is also a field.

::demo shadow open=ast

The first paragraph reads the state field `name`. The loop reads `names` only, and the span inside reads the loop variable `name`, which is local. The two `name`s are different things that happen to have the same spelling.

## Conditions

An `if` reads the tests of all its branches and everything the branches contain. A change of the tests can change the branch; a change inside the branch changes only its content. The code generator writes both cases and separates them.

::demo branches open=ast

The `if` reads `user` and `guest`. Look at the generated `diff`:

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

The compiler turns the chain of tests into a number, the **branch index**, for both states (`-1` means "no branch" when there is no `else`). If the number changed, it replaces the content between the two markers. If it did not, it looks inside that branch only, and only the branches that have anything to look at get code (here, only branch 0). In the demo, step one is the same branch (the name changed from Ann to Bob) and gives a `text` patch. Step two changes the branch, and gives a `clear` and an `insert`.

An `if` where nothing in the branches is dynamic still reads its tests. A branch that reads nothing contributes nothing to the set of the `if`.

## Child views

An embed reads its props. The props are expressions, and the analysis collects the same way as anywhere else. A spread (`...extra`) reads the expression after the dots.

::demo embed open=ast

The `+Badge#state` line reads `status`, so the parent only calls `Badge.diff` when `status` changes (the guard is `if (prev.status !== next.status)`). The `p` below is static: it reads nothing, and the child is not asked about it. The reverse also holds: the parent knows nothing about what the child reads. The child's own `diff` decides that from its own analysis, on the props it gets.

## An outlet reads everything

An `+outlet` shows the child that the component's route selects. What it shows depends on the route and on a state slice that the template cannot name. So the analysis cannot give it a list of fields. Instead it gives it a special marker, the empty string `""`, which means "always".

```pavlus layout.pavlus
div.layout
  h1 {title}
  nav Menu
  +outlet
```

The AST view of this template prints the marker as `* (an outlet reads everything)`:

```text
el  div.layout                                  #0   reads: * (an outlet reads everything)
  el  h1 {title}                                  #1   reads: title
    text  {title}                                   #2   reads: title
  el  nav Menu                                    #3   reads: — (reads nothing)
    text  Menu                                      #4   reads: — (reads nothing)
  outlet  +outlet                                 #5   reads: * (an outlet reads everything)
```

The marker moves up to every parent, since a parent includes the sets of its children. For such a node, the guard cannot be a list of comparisons, so the generated code is `if (true) {` and the comment says `(reads: the route and the routed child)`. Siblings keep their own guards: the `h1` still reads only `title`, and the `nav` is still static. Only the outlet itself and its ancestors have the always-on guard. This is another reason to put the outlet close to the root of a layout, and not inside deep, busy structure.

## A bigger page

Everything on this page works together on a realistic layout: a header with a keyed navigation, a conditional flash message, an article and a footer. Open the AST and read the `reads:` column first. Then watch what the two steps patch.

::demo big open=ast

Some things to notice in the column.

- The root `main` reads everything the page needs: `article`, `flash`, `links`, `page` and `site`. It is the union.
- The `nav` reads `links` and `page`. The `for` inside reads the same two, and its loop variable `link` is gone from the set, while `a` and its text read `link` (and `page`, for the class toggle).
- The paragraph `p.static` reads nothing. It has no id, and `diff` does not mention it.
- The `if flash` reads only `flash`. The `footer` reads `site`, like the `h1`, although only the `year` part is used: the unit is the field.

Step one changes `page` from `/` to `/about`. Only the two links are touched, and only their class: `/` loses `current` (`rmAttr`) and `/about` gets it (`attr`). The header title, the article and the footer are not compared, because their guards read other fields. Step two changes only `article`: one `text` patch, for the heading. This is the effect of the analysis you can see.

## Limits to know

- The analysis follows names, not values. A function in the state that reads another part of the state (a getter, a closure) hides that read from the compiler. Keep derived values in the state, or pass the inputs as arguments: `{total(items)}` reads `total` and `items` and works.
- The unit is the top-level field and it is compared by reference. Update by replacing: `{ ...state, user: { ...state.user, name } }`.
- A node whose set is large (the root, a layout, an outlet) is entered often. That is not slow, as the checks inside are guards again. But it is a reason to keep the dynamic parts small and near the leaves.

## What you learned

- Every node has a dependency set: the top-level state fields it reads, with the loop variables of its own loops removed.
- A node that reads nothing is static: no id in `render`, no code in `diff`.
- A node that reads something gets a guard that compares those fields with `!==`. Inside the guard, each attribute, payload and text is compared on its own result, so only real changes make patches.
- A guard that repeats the guard of its parent is not written twice. An outlet reads everything and makes the guards above it always true.

Next: [Code generation: render](page:compiler-render).
