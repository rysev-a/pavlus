# The pavlus philosophy: templates display, code computes

One sentence: **whatever can be done in code must be done in code — a
template only declares how ready data is displayed.**

A `.pavlus` template is not a programming language. It is a declarative
description of structure: which elements exist, how they nest, where data
appears, what a click means. Every computation — filtering, sorting,
formatting, joining, class assembly, inverting a flag — belongs to the
component's code, which hands the template a fully shaped view model. The
template reads it. Nothing more.

This document is the contract behind that split. The language is small on
purpose: what is not in the language cannot be abused.

## Why

- **Reading.** A template that only reads data can be understood line by
  line, by a person or by a tool. `li(statusRow)` says what is shown; the
  question *why* it looks like that has one answer, and it lives in code.
- **Testing.** Computation in code is a pure function of state: testable
  without rendering, reusable outside the template.
- **Change detection.** A hole is a path; the dependency of a hole is the
  path's root. No expression to analyze, no hidden reads, no re-evaluation
  of chains on every diff.
- **The parser stays tiny.** The expression grammar is a path or a literal.
  That is the whole grammar — which keeps the compiler fast, its errors
  exact, and the editor integrations honest.
- **One place for logic.** When behavior changes, you change code. When
  layout changes, you change the template. Never both, never a third
  dialect in between.

## What a template may do

Three things cannot be done in code, and they are exactly the template's
job:

1. **Structure.** Elements, nesting, classes, ids, static attributes.
   `<span>abc {text1} def</span>` — the static text around a hole is
   layout; the hole is one read of one value.
2. **Repetition and choice.** `for item in items key item.id` walks a list
   that code prepared (already filtered, already sorted). `if busy` /
   `else if failed` / `else` branch on boolean flags that code computed.
   A loop over `items.filter(...)` is not allowed — code filters.
3. **Interaction.** `@click=remove(item.id)` binds a DOM event to a
   message with a payload read from the state. The template declares the
   wiring; the handler does the work.

Everything else an element needs is a read: `class:is-on={item.on}` (a
boolean path decides one static class), `disabled={pending}`, the `key` of
a loop item, the props of an embedded child.

## What a template may not do

The expression grammar is:

```
Expr    := Literal | Path
Literal := number | string | true | false | null | undefined
Path    := identifier ("." identifier | "[" Literal "]")*
```

There is nothing else. Concretely, all of these are **parse errors**, each
with a message that says where the logic belongs:

| Removed                      | Do this in code instead                                 |
| ---------------------------- | ------------------------------------------------------- |
| `items.filter(x => x.on)`    | prepare the filtered list in a handler                  |
| `sort((a, b) => a.n - b.n)`  | sort before the state reaches the template              |
| `n > 1`, `a === b`           | compute a boolean flag: `hasMany`, `isSelected`         |
| `!isActive`                  | pass the inverse: `isNotActive = !isActive`             |
| `busy ? "Saving" : "Save"`   | pass the ready label: `saveLabel`                       |
| `"card " + hue`              | pass `className` — or interpolate: `class="card {hue}"` |
| `name.toUpperCase()`         | format in code, pass the formatted string               |
| `user?.name ?? "anon"`       | resolve the fallback in code                            |

The arrow function experiment was reverted: a template that computes is a
template that grows logic, one innocuous callback at a time.

## The one warning: composing in the template

Static text between holes is layout; **holes with nothing static between
them are composition, and composition is code.**

```
span abc {text1} def        // good: static text frames the data
span {fullName}             // good: one hole, one value
span {firstName} {lastName} // warning: compose in code, pass fullName
span {a}{b}                 // warning: same — nothing structural here
```

The compiler warns (not errors — the result still renders) and names the
line. The fix is always the same shape: one more field in the view model,
one less decision in the template.

## The shape of a component

The result is a rhythm every pavlus component follows:

```ts
// code: the view model — all logic, all branching, all formatting
function rowProps(user: User, selected: boolean): RowProps {
  return {
    name: user.name,
    className: selected ? "row is-selected" : "row",
    canDelete: user.role === "admin" && !user.locked,
  };
}
```

```
// template: only structure, reads and wiring
li(class={row.className})
  span {row.name}
  if row.canDelete
    button(@click=remove(user.id)) Delete
```

The handler computes on a message; the store keeps the shaped state; the
template is a pure projection of it. Data flows one way: code shapes, the
template shows.

## Consequences worth naming

- A template can never throw from logic: there are no calls, no operators,
  only reads of possibly-missing paths, which render as nothing.
- Diffing stays cheap and exact: a hole re-renders when the path's root
  changed identity, and there is nothing subtler to track.
- Editor tooling (tree-sitter, Zed) mirrors a smaller grammar: fewer
  highlight classes, fewer ways to be wrong.
- The view model is the API between designer and programmer: the fields it
  exposes are everything the template can say.
