---
summary: Show a block only when a condition holds with if / else if / else, and repeat a block for every item of a list with for. Learn why keys matter, how the diff reacts, and how to build a filtered list.
---
## Choosing what is on the page

So far every line of a template was always there. Real pages need two more abilities: to show a block *only when* something is true, and to show a block *once for every item* of a list. pavlus has one keyword for each: `if` and `for`. They are not elements. They produce no tag of their own. They only decide which of their children exist.

Both take the lines indented below them as their body, in the same way an element does.

## if

The simplest condition is `if` followed by an [expression](page:syntax-expressions). When the value is truthy, the body is rendered; when it is not, the body is not there at all.

::demo if-simple

Look at the two steps. When `loggedIn` goes from `true` to `false`, `diff` returns one patch, `clear`, which removes everything between two markers called `0s` and `0e`. When it goes back to `true`, `diff` returns an `insert` patch with a freshly rendered `p`.

The markers are invisible comment nodes that the compiler adds around every `if` and every `for`. They let a patch say "replace what is between these two points" without knowing what is in there. They never show in the HTML of the demo, but they are in the vnodes, and you will see them in the patches of this page.

A trailing colon is accepted and means nothing: `if loggedIn:` is the same as `if loggedIn`.

> [!NOTE] Truthiness
> The condition follows the JavaScript rules: `0`, `""`, `null`, `undefined`, `false` and `NaN` are falsy. An empty array is truthy, so to test for "has items" write `if items.length`.

## else and else if

An `else if` or an `else` line continues the `if` above it. They must be at the same indentation as the `if`, directly after its body.

::demo if-else

The first step replaces the whole greeting by the sign-in message: the branch changed, so the content between the markers is replaced. The second step keeps the same branch, and only the text inside it is updated. The compiler tells these two situations apart, and never re-renders a branch that stays the same.

Branches are tried in order, and the first condition that is truthy wins. The `else` branch has no condition and has to be last.

::demo else-if open=module

Open the module and find `prevBranch` and `nextBranch`. For each of the two states, the generated code works out *the number of the branch* that is shown (here 0 to 3, or -1 if there is no `else` and nothing matches):

```ts
const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "error") ? 1 : ((prev.items)?.length === 0) ? 2 : 3;
const nextBranch = (next.status === "loading") ? 0 : (next.status === "error") ? 1 : ((next.items)?.length === 0) ? 2 : 3;
```

If the two numbers differ, the branch is replaced: a `clear` between the markers, then an `insert` of the new branch rendered from scratch. If they are the same, only the changes inside that branch are patched. The step "items 2 → 5" does exactly that: one `text` patch, nothing else.

A mistake that the parser reports for you is an `else` with nothing to continue:

```pavlus-invalid
p First
else
  p Second
```

```text
`else` without matching `if` (line 2, col 1)
```

The same error appears when a second `else` follows an `else`, or when an `else if` follows an `else`. A line between the `if` and its `else` breaks the chain too.

An `if` inside an element is just a child of it, and the element's other children stay where they are:

::demo if-inside

When `subtitle` becomes a non-empty string, there is a single `insert` patch at the place of the `if`, between the heading and the footer. The markers are why it lands at the right position.

## for

`for` repeats its body for every item of a list. The header has the form `for item in list`: a name for the current item, the word `in`, and an expression that gives the list.

::demo for-simple

Inside the body, `name` is the current item. It is a *loop variable*: it exists only inside the loop, and it hides a state field of the same name, if there is one. The body can have any number of lines and any structure.

If you also need the position, name it after a comma:

::demo for-index

`i` counts from 0. Here `{i + 1}` makes a human number. The index is a plain expression value like any other.

### Empty and missing lists

An empty list renders nothing. A list that is `null` or `undefined` is the same as an empty one, so a state that is still loading does not break the page.

::demo for-missing

The first step of the next demo adds a name to an empty list. The `ul` stays and the new `li` is inserted between the markers of the loop:

::demo for-empty

If you want to show a message instead of an empty list, put the loop in one branch of an `if`:

::demo for-if-else

When a list is not an array, the result depends on its shape: a string is read letter by letter, and an object with no `length` renders nothing. Keep real lists in the state.

> [!WARNING] Words that look like keywords
> Only `for x in list` is a loop. A line such as `for x of list` does not match, and the parser reads `for` as the tag name of an element: you get `<for>` in the page and no error. The same is true for a lone `if` with nothing after it. If a loop does not appear, check the word `in`.

## Why keys matter

A list changes over time: items are added, removed and reordered. When `diff` compares the old list and the new list, it has to decide which old item corresponds to which new item. That decision is made with a **key**.

The key is added to the header, after the list: `for task in tasks key task.id`. It is an expression evaluated for each item, and it must be unique in the list and stay the same for the same thing. An id from your data is perfect.

::demo keyed-reorder

Read each step.

1. The last item moves to the front. `diff` returns two `move` patches: it moves existing DOM nodes. It does not create, delete or re-text anything, so anything that lives on those nodes (a focused input, a text selection, a running animation) is kept. The algorithm is simple, not minimal: to bring the last item to the front it moves the two others after it, and the result is the same order.
2. The first item is removed: one `remove` patch for that item only.
3. A new item at the end: one `insert` patch.
4. The title of item 2 changes: one `text` patch. The id of the text node is `3#2`: the template id, a `#`, and the key.

Now the same list **without** a key:

::demo unkeyed-reorder

Without `key`, the key of each item is its **position**. Item 0 stays item 0 whatever it contains. So when the last item moves to the front, `diff` sees three items whose text changed, and it rewrites three texts (`3#0`, `3#1`, `3#2`). When the first item is removed, it removes the *last* element and rewrites the rest, because the elements have been identified by position.

For a list of plain text this gives a right result, only with more work. For a list with state in the DOM, such as inputs or a playing video, it gives the wrong result: the typed text stays in the first input, but the data of the first item now belongs to the second.

> [!TIP] Rule of thumb
> If items can be added, removed or reordered, or if they hold any state, give the loop a key from your data. Use the index only for a list that never changes.

Keys are compared as text (`String(key)`), so `1` and `"1"` are the same key. They must be unique: if two items give the same key, `diff` throws `pavlus: duplicate key 1`. The first `render` of such a list does not check, but the first `diff` does, so the error shows up when the list changes.

The key can be any expression, for example a join of two fields:

::demo key-expression

## Loops inside loops

Loops nest. Each one has its own variable, and the inner body sees the variables of both.

::demo nested

The outer loop is keyed by the group name, the inner one by the item itself. `group.name` is used inside the inner body. In the step, a new item appears in one group and `diff` produces one `insert` patch for it. The ids of the markers, such as `4e#Veg`, carry the key of the outer item, so the two groups never mix.

## Toggling classes inside a loop

The `class:name=condition` attribute from [elements](page:syntax-elements) works the same inside a loop, with the loop variable.

::demo class-toggle

An unquoted attribute value ends at the first space. `task.id === currentId` has spaces, so it must be wrapped in braces: `class:current={task.id === currentId}`. Without them the parser stops at the first space and reports `Unexpected "=" in attributes`.

Look at the two steps. When `currentId` moves from 2 to 3, the class of one item is removed and the class of another is added. In the second step the `class` value of item 2 becomes `done current`: all the toggles of an element are collected into one `class` attribute, and one patch writes the whole value.

## Filtering with if inside for

A short list can be filtered right in the expression (`items.filter(x => x.done)`); `if` as the only child of a `for` is another way: each item is shown only when its condition holds. This is a good way to filter a list that is short, without building a new array.

::demo filtered open=ast

Read the template from the top. The search input sends `setQuery` on each key. The `for` is keyed by `task.id`. Inside it, the `if` hides the tasks that do not match the query (`!query` makes an empty query match everything). After the list, a second `if` shows the count, or a message when nothing matches.

In the first step the user types `es`. `diff` returns:

- an `attr` patch for the input value;
- two `clear` patches that empty the `if` of items 1 and 3, which no longer match: the items stay in the list, but their content is gone;
- one `text` patch for the counter.

In the second step, nothing matches. The last remaining item is cleared, and the counter branch changes from the `else` to the "No task matches" message.

The counter, `shown`, is an ordinary state field, computed by the handler of `setQuery` in your component. A template cannot count the matching items, because it can only evaluate expressions and has no loops that return values. This is the usual division: the handler computes, the template shows.

When the list is long, filter in the handler instead and pass the template only what is visible. Then the loop has only the items that are shown, and a changed filter is a set of `insert` and `remove` patches:

::demo filtered-visible

Both approaches give correct pages. The first keeps all the work in the template, the second keeps the DOM small.

## Putting it together

This inbox has a loading state, an error state, a list, a per-item condition and an empty message. It uses everything from this page.

::demo inbox

Go through the steps:

1. **Loading to ready.** The branch changes from the first to the third, so the `p` is cleared and the `ul` is inserted. It is rendered once, with both mails.
2. **Mail 2 is read.** Two patches only: the `unread` class is removed from the item (`rmAttr`), and the `Mark as read` button, which sits in an `if`, is cleared. Nothing else is touched.
3. **A new mail arrives on top.** One `insert` patch, placed before the item with key 1.
4. **All mails are deleted.** Two `remove` patches and the "Nothing here" message is inserted.
5. **An error.** The third branch is replaced by the second: the list is cleared and the message with its retry button is inserted.

The template says what the page looks like for each state. The compiler works out the smallest set of changes between any two states, and these are the patches you saw.

## What you learned

- `if`, `else if` and `else` show one branch. A different branch means `clear` and `insert`; the same branch means only the changes inside it.
- `for item, i in list key expr` repeats a body. An empty or missing list renders nothing.
- A key identifies an item between two states. With a key, `diff` moves, inserts and removes whole items; without it, the position is the key and the contents are rewritten.
- `if` inside `for` filters, a counter or a derived list belongs in the state, and a value with spaces in an attribute needs braces.

Next: [components, imports and outlets](page:syntax-components).
