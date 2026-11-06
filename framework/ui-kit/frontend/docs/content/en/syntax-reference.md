---
summary: A compact cheat sheet of the whole pavlus template language in tables, the real compiler error messages, the common pitfalls, and three larger examples (a form, a filtered table, a tabbed panel).
---
## How to use this page

This page is a reference. It repeats, in short, what the four pages before it explain step by step: [elements](page:syntax-elements), [expressions](page:syntax-expressions), [events](page:syntax-events), [conditions and loops](page:syntax-control-flow) and [components](page:syntax-components). Read those first if a row below is not clear. Come back here when you need to check a spelling.

A template is a text file. It compiles to a module with two pure functions: `render(state)` returns the virtual nodes, and `diff(prev, next)` returns the list of patches between two states. Everything below describes what you can write in the file.

## Lines

Each non-empty line is one thing. Indentation (spaces only) nests a line inside the line above it.

| You write | It is | Notes |
| --- | --- | --- |
| `tag.class#id(attrs) text` | an element | any part may be left out except the first one of tag, class or id |
| `.card`, `#app` | a `div` | the tag defaults to `div` |
| a line that starts with a pipe, then text | a text line | one text node; holes allowed |
| `{expr} more text` | a text line | a line that starts with `{` is text too |
| `// note` | a comment | dropped; a trailing `// note` after a space is dropped too |
| `if expr` | start of a condition | a colon at the end is optional |
| `else if expr`, `else` | next branches | must follow an `if` at the same indentation |
| `for item in list` | a loop | `for item, i in list key expr` adds the index and a key |
| `import Name from "path"` | imports a child | only at the top, name starts with a capital letter |
| `+Name#id(props)` | embeds an imported child | `#id` is optional |
| `+{expr}#id(props)` | embeds a view that is a value | `#id` is required |
| `+outlet` | the routed child | takes nothing after it |

Void elements (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`) cannot have child lines.

Text is joined: two text lines in a row, or an element's inline text followed by a text line, are separated by a newline, which HTML shows as a space.

::demo comments

## Attributes

Attributes are in parentheses after the tag, separated by spaces or commas. Names may contain letters, digits, `_`, `-`, `:`, `.` and `@`.

| You write | Meaning |
| --- | --- |
| `disabled` | a boolean attribute, present with an empty value |
| `type="button"` | a fixed string |
| `title="Open {name}"` | a string with holes; each hole uses the text rules |
| `href=url`, `value=user.name` | an expression, one word without spaces |
| `title={a + " " + b}` | an expression with spaces, in braces |
| `title="{note}"` | the same as `title={note}`: one hole only |
| `class:on=cond` | adds the class `on` when `cond` is truthy |
| `class="a b"` | classes, joined with the ones of `.a` and `class:` |
| `@click=save` | event binding, message `save` |
| `@click.prevent.stop=save(item.id)` | the same, with modifiers and a payload |
| `\{` and `\}` | a literal brace in text or in a quoted value |

A `class:name` or `@event` value must be an expression: `class:on` with no value is an error.

## Values in text and in attributes

The same value renders differently in text and in an attribute.

| Value | In text `{v}` | In an attribute `a=v` |
| --- | --- | --- |
| `null`, `undefined` | nothing | no attribute |
| `false` | nothing | no attribute |
| `true` | the word `true` | the attribute with an empty value |
| `0` | `0` | `a="0"` |
| the empty string | nothing | `a=""` |
| a number or a string | its text | its text |
| an array | items joined by commas | the same |
| an object | `[object Object]` | the same |

In a string with several parts, such as `title="Note: {v}"`, each hole follows the text column, and the attribute is always present.

## Expressions

Everything inside `{ }`, and every unquoted attribute value, is parsed as an expression.

| Group | Supported |
| --- | --- |
| literals | numbers (`1`, `.5`, `1e3`), strings (`"a"`, `'a'`), `true`, `false`, `null`, `undefined`, arrays `[a, b]` |
| names | a field of the state, or a loop variable |
| member | `a.b`, `a?.b` (both null-safe) |
| index | `a[expr]` (null-safe) |
| call | `f(x, y)`, `a.b(x)` (null-safe) |
| unary | `!a`, `-a`, `+a` |
| arithmetic | `*` `/` `%` then `+` `-` |
| comparison | `<` `>` `<=` `>=` then `==` `!=` `===` `!==` |
| logic | `&&`, then the double bar, then `??` |
| ternary | `a ? b : c`, nests to the right |
| grouping | `( )` |

Not supported: object literals, arrow functions, template strings, regular expressions, assignment, `++`, `typeof`, `in`, `new`, `**`, bitwise operators, the comma operator, `?.[ ]` and `?.( )`. Names are looked up in the state only: there are no globals.

Truthiness is the one of JavaScript: `false`, `0`, `""`, `null`, `undefined` and `NaN` are falsy; an empty array and an empty object are truthy.

## Events

| Part | Meaning |
| --- | --- |
| `@click` | the DOM event name (any event the element can fire) |
| `=save` | the message id; dots are allowed: `users.open` |
| `(a, b)` | arguments; none means no payload, one is the payload, several make an array |
| `.prevent` | `preventDefault()` before the message is sent |
| `.stop` | `stopPropagation()` before the message is sent |

The message that reaches the application is `{ id, payload, event }`, where `event` is `{ type, value?, checked?, key? }`. Messages sent by an embedded child have the instance name in front of the id (`row.toggle`). An unknown modifier is ignored, and when the same event is bound twice the last binding wins.

## Components

| You write | Meaning |
| --- | --- |
| `import Card from "./card.pavlus"` | makes `Card` available |
| `+Card` | embeds it, instance name `card` |
| `+Card#intro(title="Hi")` | explicit instance name, a fixed prop |
| `+Card(title=post.title count=3 active)` | expression props keep their type; a bare name is `true` |
| `+Card(...post)` | spreads the fields of an object; later props win |
| `+{view}#slot(...)` | a view or a component from the state; `null` renders nothing |
| `+outlet` | the page chosen by the `routing` table of the component |

The child sees only its props as its state. The instance name prefixes its messages, prefixes its node ids and, in the logic, is the key in `children`.

## What `diff` can return

Patches are plain data. These are all of them.

| `op` | Fields | Produced when |
| --- | --- | --- |
| `text` | `id`, `text` | the text of a node changed |
| `attr` | `id`, `name`, `value` | an attribute got a new value |
| `rmAttr` | `id`, `name` | an attribute became `null` or `false` |
| `handler` | `id`, `event`, `msg` | the message of a binding changed |
| `insert` | `before`, `nodes` | a branch, an item or a child appeared |
| `clear` | `from`, `to` | everything between two markers is removed |
| `remove` | `from`, `to` | a keyed item is removed with its markers |
| `move` | `from`, `to`, `before` | a keyed item changed place |

## The errors the compiler reports

Every message ends with the line and column. When the compiler is given a file name, as the Vite plugin does, the message starts with it: `page.pavlus: Empty expression (line 1, col 4)`. These are real messages, each from a template that triggers it.

```text
Tabs are not allowed, use spaces (line 1, col 1)
Inconsistent indentation (line 3, col 1)
This line cannot have children (line 2, col 1)
Cannot parse line "%x" (line 1, col 1)
Unexpected "!" (line 1, col 2)
Unclosed ( (line 1, col 2)
Unterminated string (line 1, col 5)
Unexpected "=" in attributes (line 1, col 5)
Unexpected "?" in attributes (line 1, col 7)
Unexpected "/" (line 1, col 5)
Unclosed { (line 1, col 1)
Empty expression (line 1, col 4)
Expected ":" (line 1, col 9)
Expected property name (line 1, col 7)
Unexpected "b" (line 1, col 6)
Unexpected character "=" (line 1, col 6)
"@click" needs an expression value (line 1, col 8)
"class:on" needs an expression value (line 1, col 4)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
`...spread` is only allowed in component props (+Name(...)) (line 1, col 3)
```

The component messages:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 1, col 2)
Unexpected "x" after component (line 2, col 8)
Instance name must be an identifier (line 2, col 6)
"data-x" is not a valid prop name (line 2, col 7)
A dynamic component needs an instance name: +{expr}#name(...) (line 1, col 7)
`+outlet` takes nothing after it (line 1, col 8)
Expected a component name or {expression} after + (line 1, col 2)
```

Two errors are not found by the compiler but at run time: `pavlus: duplicate key 1` (two items of a loop have the same key, thrown by `diff`), and `pavlus: +{...} needs a view or a component with a view`.

One note on the column of `Unclosed {`: it is counted from the start of the text of the line, not from the start of the line, so it can be smaller than you expect. The line number is right.

## Common pitfalls

These are the mistakes that people make most often. The first ones give no error at all, which is why they are the most expensive.

- **Quotes decide the meaning.** `class="x"` is the text `x`; `class=x` reads the state field `x`. `target=_blank` reads a field called `_blank`, finds nothing and drops the attribute. Write `target="_blank"`.
- **Text needs a pipe.** A line that is only words is an element: `Hello world` is `<Hello>world</Hello>`. Text on its own line starts with `|`.
- **A loop needs the word `in`.** `for x of xs` is read as an element called `for`. You get `<for>` in the page and no error.
- **Zero is shown.** `{count && "items"}` renders `0` when `count` is `0`, because `0` is a value, not nothing. Use `{count > 0 && "items"}` or a ternary.
- **An empty array is truthy.** `if items` is true for `[]`. Write `if items.length`.
- **A bare value ends at a space.** `title=a + b` and `class:on=a === b` fail with `Unexpected "=" in attributes` or `Unexpected "?" in attributes`. Wrap the expression: `title={a + b}`.
- **A bare value is an expression.** `href=/docs` fails with `Unexpected "/"`. Quote paths: `href="/docs"`.
- **A double quote inside a double-quoted value** keeps its backslash. Use single quotes around the value.
- **Optional chaining.** `a?.[0]` and `f?.()` are errors. Index and call are already null-safe.
- **Typos are silent.** A wrong field name renders as empty text, and a message with no handler does nothing.
- **Keys.** Without `key`, the position is the key, and a reordered list is rewritten. Duplicate keys throw in `diff`, not in the first `render`.
- **Several arguments change the payload.** `@click=pick(id)` sends the value; `@click=pick(id, kind)` sends an array. The handler must match.
- **Handlers are not called by the template.** `@click=save(item)` does not call anything: it builds the message `save` with the payload.
- **Imports first.** `import` lines at the top, and `+Name` needs a matching import. For a view that comes from the state, use `+{name}#id`.
- **Void elements have no children.** `input`, `br`, `img` and the others cannot have indented lines.

::demo bare-words

::demo loop-typo

::demo unquoted-target

The three demos above show the silent ones: a text line that became `<Hello>`, a loop that became `<for>`, and a link whose `target` is missing in the first line.

## Putting it together: a form

A sign-up form that uses events with modifiers, `class:` toggles, conditions for the errors, boolean attributes, and a ternary for the button text.

::demo form

The state holds everything the page needs: the values, a map of `errors`, and the flags `busy` and `done`. The handlers of your component change it, and the template only describes each situation.

- **Validation errors appear.** The name input gets the class `invalid` (`attr`), and the two error messages are inserted at the place of their `if`. The email field, which has no error, is not touched.
- **The name is typed.** The input value, the class and the error of that field are updated. The error of the terms stays.
- **Submit.** Three patches on one button: `disabled` and `class` appear and the text changes. `disabled={busy}` is `false` before and `true` after, so the attribute is added and removed; `toAttr(true)` is an empty value.
- **Done.** The button is restored, and the `success` message is inserted.

The `@submit.prevent=submit` on the form keeps the browser from reloading the page. The handler of `submit` reads the values from the state, because every input copied its value there with `@input`.

## Putting it together: a table with filters

A table of users with filter buttons, a search box and per-row actions. The list that the table shows is `visible`, computed by the component from the full data, the filter and the query. A template can not filter and count by itself, so the handler does it and the template shows the result.

::demo table

- **Filter: paused.** The filter buttons are in a keyed loop, and the class `active` moves from one to another. The rows of the other two users are removed, and the footer text is updated.
- **Filter: nobody.** The last row is removed, and the `if` for the empty row inserts "No users match".
- **Bob is resumed.** The row keeps its place. Its `paused` class is removed, the label of its button changes, and a `handler` patch gives the button the new payload `[2, "active"]`. Two arguments: an array.
- **Order reversed.** Keyed rows are moved, not rewritten.

## Putting it together: a tabbed panel

A tab bar built from data, and a body that shows one of three panels. The tab bar is a keyed loop with `class:active`, and the panel is an `if` / `else if` / `else`.

::demo tabs

- Switching a tab changes two buttons (a class and `aria-selected` each, written as the text `"true"` or `"false"` because ARIA needs the words, not an empty attribute) and **replaces** the body: the branch changed, so `clear` and `insert`.
- When a new event arrives while the activity tab is open, the branch is the same. Only the list changes: one `insert` for the new item, because the loop is keyed by the text of the event.

This is the whole language. Everything else, such as what the DOM plugin does with the patches, how the store changes the state and how pages are routed, lives in the components and the plugins.

## What you learned

- A template is lines: elements, text lines, `if` / `for`, imports and embeds. Attributes carry classes, events and props.
- Values follow fixed rules: `null`, `undefined` and `false` are nothing; `true` is an empty attribute; `0` and `""` are values.
- Compiler errors are short and carry a line and a column; the dangerous mistakes are the ones that are valid but mean something else.
- Large pages are built from the same few pieces: a state with ready-to-show values, conditions, keyed loops and events with payloads.

Next: [the compiler pipeline](page:compiler-pipeline).
