---
summary: Put live values into a template with {expression}. Learn where holes are allowed, the small expression language inside them, what is not supported, and exactly how values become text and attributes.
---
## A hole in the text

A template that always says the same thing is not very useful. To show a value from the state, put an **expression** in curly braces. The braces and what is inside them are called an *interpolation*, or a hole: the compiler leaves a hole in the text and fills it with the value every time the template is rendered.

The simplest case is a single name. `name` is not text, it is the field `name` of the state.

::demo hello

Look at the two steps. When `name` changes from Ann to Bob, `diff` returns one patch that replaces the text. When `name` is "changed" to the same value, `diff` returns nothing: the compiler generated a check that compares the old and the new text and only emits a patch when they differ.

Everything between `{` and `}` is parsed by pavlus itself. It is **not** JavaScript that is run with `eval`: it is a small, pure language with its own parser, and the compiler translates it into plain JavaScript. The rest of this page describes that language.

## Where holes are allowed

A hole can be in three places:

- in text: after a tag (`p Hello, {name}`) and in `|` text lines;
- in a quoted attribute value: `title="Open {user.name}"`;
- as a whole attribute value: `alt={user.name}` or `src=user.avatar`.

Class toggles (`class:late=order.late`), `@event` arguments, `if` conditions, `for` lists and component props also take an expression. They are described on their own pages.

::demo in-attributes

In the second line, `src=user.avatar` has no braces and no quotes. A bare value is an expression and ends at the first space, so it must be a single "word" (no spaces). When you need spaces inside the expression, wrap it in braces: `alt={user.name}`. Both forms mean the same.

> [!NOTE] Quotes decide what a value is
> `alt="user.name"` is the literal text `user.name`. `alt=user.name` and `alt={user.name}` read the state. `alt="{user.name}"` reads the state too, and there is a small difference described in the section on attribute values below.

## Names and member access

A bare word in an expression is a **name**. It is looked up in the state you pass to `render`, or, inside a `for` loop, it can also be the loop variable (see [conditions and loops](page:syntax-control-flow)). A dot reads a property of a value.

::demo members

Phone and zip are not in the state at all, and nothing broke. Every dot in pavlus is **null-safe**: `user.phone.number` compiles to `((state.user)?.phone)?.number`, so if any step on the way is `null` or `undefined`, the whole expression is `undefined`, and `undefined` renders as nothing. You never have to write a guard such as `user && user.phone && user.phone.number`.

The expression `?.` is accepted as well, and means the same as `.`:

```pavlus
p {user?.name} is the same as {user.name}
```

Because of this, a template never throws because the state is incomplete. That is useful while data is still loading. It also means that a typo in a field name does not fail loudly: it renders as empty text. If a value does not show up, check the spelling first.

> [!TIP] Reads are tracked by the root name
> The compiler records which names an expression reads. `user.address.city` reads `user`. When `diff` compares two states, it first asks "is `prev.user` the same object as `next.user`?" If it is, the whole node is skipped. If it is a new object, the text is recomputed and compared, and a patch is produced only if the result differs. This is why you should replace objects in the state rather than change them in place.

## Literals

An expression can contain literal values.

| Kind | Examples | Notes |
| --- | --- | --- |
| number | `0`, `42`, `3.14`, `.5`, `1e3` | always a JavaScript number |
| string | `"text"`, `'text'` | both quote styles; `\n`, `\t` and `\r` are escapes, `\x` for any other `x` is just `x` |
| boolean | `true`, `false` | |
| empty | `null`, `undefined` | words, as in JavaScript |
| array | `[1, 2, 3]`, `[a, b]` | items are expressions |

There are no object literals (`{ a: 1 }`), no regular expressions and no template strings with backticks.

Strings are useful for the fallback of an operator or for the text of a branch of a ternary, as you will see below. Braces inside a string do not end the hole: `{"}"}` is a hole that prints a closing brace.

## Index access and calls

Square brackets read an item by position or by key. The index is an expression, so it can come from the state. Like a dot, an index is null-safe.

::demo indexing

A call has the form `callee(arguments)`. The callee can be a name or a member, so you can call methods of values that are in the state. This is how you format a value in the template:

::demo calls

`{missing.toUpperCase()}` is empty, not an error: a call is null-safe too, and calling something that is `undefined` gives `undefined`. This hides mistakes, as with the dot, so use it knowingly.

The generated code for the call is `((state.tags)?.join)?.(", ")`: the method is still called on `state.tags`, so `this` is right.

A function can only be reached through the state or through a value in the state. A template has no globals: `Math.round(x)` reads a state field called `Math`. If you need a computed value, compute it in the handler that changes the state and keep the result in the state (`total`, `visibleItems`, `label`).

> [!WARNING] Optional chaining is only for properties
> `?.` is accepted only before a property name. `items?.[0]` and `callback?.()` are errors: `Expected property name`. You do not need them, because `items[0]` and `callback()` are already null-safe.

## Operators

These operators are supported, from the highest precedence to the lowest:

| Operators | Meaning |
| --- | --- |
| `.` `[ ]` `( )` | member, index, call |
| `!` `-` `+` (before a value) | not, negate, convert to number |
| `*` `/` `%` | multiply, divide, remainder |
| `+` `-` | add (or join strings), subtract |
| `<` `>` `<=` `>=` | compare |
| `==` `!=` `===` `!==` | equal, not equal, strictly equal, strictly not equal |
| `&&` | and: the first falsy value, or the last value |
| a double bar | or: the first truthy value, or the last value |
| `??` | nullish: the right side only when the left side is `null` or `undefined` |
| `a ? b : c` | ternary, the lowest |

The words "double bar" stand for two vertical bars, `||`. A parenthesis `( )` groups, as in arithmetic.

::demo operators

Notice these lines of the demo:

- `{qty > 1 && "many"}` is `"many"` here. If `qty` were 1, the value would be `false`, which renders as nothing: a short way to "show this text only when".
- `{qty >= 3 || "few"}` is `true` here, and `true` renders as the text `true`. The result of a comparison is a boolean, so `||` is a fallback tool for values, not for conditions. When you want text, use a ternary.
- `{label ?? "no label"}` replaces `null`.

The difference between `??` and the double bar matters for values such as `0`. The double bar replaces every falsy value, `??` only replaces `null` and `undefined`:

::demo nullish

With `count` equal to `0`, the first line falls back to `none` and the second line shows the `0`. Use `??` when zero or an empty string is a real value.

Two things differ from JavaScript, so be careful if you copy an expression from your code. First, there are no bitwise operators, no `**`, no `typeof`, `in`, `new`, no assignment (`=`, `++`) and no comma operator. Second, `??` is an ordinary operator that can be mixed with `&&` and `||` without parentheses. It binds more loosely than `||`: `a ?? b || c` means `a ?? (b || c)`.

::demo precedence

When in doubt, add parentheses. They cost nothing in the generated code, because the compiler writes its own parentheses around every operation anyway.

## The ternary: choosing a value

`condition ? a : b` picks one of two values. Ternaries nest to the right, so a chain reads like `else if`:

::demo ternary

In the second step the count goes from 2 to 9: both lines change. In the first step (1 to 2) only the first line changes, because `few` is still `few`. The compiler compares the final text of each line, not the inputs.

For a whole piece of the page that appears or disappears, use `if`, not a ternary. A ternary produces a *value*; `if` produces *nodes*.

## Arrays

An array literal makes an array. It is mostly useful to feed a method or to pick a value by index.

::demo arrays

## Truthiness

Where a condition is expected (`?:`, `&&`, `||`, `!`, `if`, `class:name=...`), pavlus uses the JavaScript rules, because the generated code is JavaScript. These values are **falsy**: `false`, `0`, `""`, `null`, `undefined` and `NaN`. Everything else is truthy.

::demo truthiness

Two of the lines surprise people who come from other languages. An empty array is truthy, so `if items` is true for an empty list; write `if items.length` to ask whether there is anything in it. And the string `"0"` is truthy.

## How values are written as text

A hole in text calls a helper named `toText`. Here is its whole definition, from the runtime:

```ts
export function toText(value: unknown): string {
  return value == null || value === false ? "" : String(value);
}
```

So `null`, `undefined` and `false` become the empty string. Everything else is converted with `String(...)`.

::demo text-values

This is deliberate. It makes `{cond && "text"}` work as "show the text when the condition holds", and it makes missing data invisible. Note three results that may surprise you:

- `0` is shown as `0`. That is usually what you want for a count.
- `true` is shown as the word `true`.
- An object has no useful text: it becomes `[object Object]`, and an array becomes its items joined by commas. If you see either of these, you are printing a whole value where you meant a field.

## How values are written as attributes

An attribute is different from text, because an attribute can be *absent*. The helper is `toAttr`:

```ts
export function toAttr(value: unknown): string | null {
  if (value == null || value === false) return null;
  return value === true ? "" : String(value);
}
```

- `null`, `undefined` and `false` mean **no attribute**. The attribute is not rendered, and when it was there before, `diff` removes it with a `rmAttr` patch.
- `true` means an attribute with an empty value, like `disabled=""`. This is how a boolean attribute is switched on.
- Everything else is the value as a string, including `0` and the empty string.

::demo attr-values

Read the output and the three steps. `checked={on}` became `checked=""`. `disabled=off` is absent because `off` is `false`. `title="{note}"` is absent while `note` is `null`, then the step adds it, and the last step removes it. `data-count=count` keeps the `0`.

A bare attribute without a value, such as `disabled` in `button(disabled)`, is not an expression at all: it is the fixed empty attribute.

### One hole, or a string with a hole

If the quoted value is **only** one hole, `title="{note}"`, the compiler treats it exactly like `title={note}` and uses `toAttr`. If the value has other text around the hole, `title="Note: {note}"`, the whole value is a string made by joining pieces, and each hole inside it uses `toText`. A string is never absent.

::demo attr-strings

The first line has no `title` while `note` is `null`. The second line has `title="Note: "`. Choose the first form when "no value" should remove the attribute, and the second when you want a prefix.

To show or hide an attribute with a condition, use a ternary that returns `null`:

::demo ternary-attr

Here `data-state` is absent because `busy` is false, and `aria-pressed` has the text `"true"` or `"false"`. This is also the right way to write an attribute that a CSS rule such as `[data-state="busy"]` reads: a boolean `true` would be an empty value and would not match.

## How an interpolated string is compiled

Take a template with three holes and open the module the compiler generates for it:

::demo compiled open=module

In `render` the text is built by joining the pieces with `+`: the literal pieces are JavaScript strings, each hole is wrapped in `toText(...)`. This is the line the compiler wrote for the template above:

```ts
text: "" + toText((state.user)?.name) + " wrote " + toText(state.count) + " " + toText(((state.count === 1) ? "post" : "posts"))
```

Because this string starts with a hole, the compiler puts `""` first, so that the result is always a string, even if the first hole is a number. A string that starts with literal text, such as `Hello, {name}!`, starts with that text instead.

`diff` builds the same expression twice, once for `prev` and once for `next`, and compares the two strings. This is why the patch is a single `text` operation with the full new text, and why an unchanged text produces nothing. The comment `(reads: user, count)` in the generated code is the list of names the node reads. The `if (prev.user !== next.user || prev.count !== next.count)` line below it is the guard that skips the work when none of them changed.

Every operator is wrapped in parentheses in the output, every member access in `?.`, every call in `?.( )`. Nothing is evaluated at compile time, and nothing in your expression can reach outside the state: the compiled function only sees `state`, the helpers, and the values it builds itself.

## Escaping braces

A literal `{` in text starts a hole. To write a brace, put a backslash before it. A `}` that does not close a hole can be written as it is.

::demo escapes

`\{` and `\}` are the only escapes in text. Inside a quoted attribute value they work too. Quotes are different: inside `"..."` you cannot write a double quote (the backslash stays in the value), so use single quotes around the value, `title='He said "hi"'`, or put the string in a hole.

## What is not supported

The language is small on purpose. The compiler is easier to reason about, every dependency of a node can be listed at compile time, and a template cannot run arbitrary code. Here is what you will try first, and the real error you get.

```pavlus-invalid
p {items.map(x => x.name)}
```

An arrow function: `Unexpected character "=" (line 1, col 16)`.

```pavlus-invalid
p {`Hello ${name}`}
```

A template string: `Unexpected character "`" (line 1, col 4)`. Use `"Hello {name}"` in an attribute, or text with holes, instead.

```pavlus-invalid
p {count = 1}
```

Assignment: `Unexpected character "=" (line 1, col 10)`. The template never changes the state. Events do that, by sending messages to your code.

```pavlus-invalid
p {typeof user}
```

Operators from JavaScript that are not in the table: `Unexpected "user" (line 1, col 11)`. The word `typeof` is read as a name, and then `user` has no operator before it.

```pavlus-invalid
p {a, b}
```

The comma operator: `Unexpected "," (line 1, col 5)`. Commas only separate call arguments and array items.

```pavlus-invalid
p {}
```

A hole with nothing inside: `Empty expression (line 1, col 4)`.

```pavlus-invalid
p {name
```

A hole that is never closed: `Unclosed { (line 1, col 1)`.

The common answer to all of these is the same: do the work where state changes, in a handler, and keep a ready-to-show value in the state. A template then only reads values and chooses between them.

## Putting it together

This order summary uses member access, a method call, a ternary, a comparison, `??`, `class:` and a hole in an attribute.

::demo all-in-one

In the step, the customer is removed. Two things change, and nothing else: the `title` attribute (a string with a hole, so it is recomputed as `Placed by someone`) and the text of the paragraph. The heading and the line count read `order`, which did not change identity in the step, so their checks are skipped by the first comparison.

Both `order.customer?.name ?? 'someone'` and `order.customer.name ?? 'someone'` would work. The `?.` is only a reminder for the reader.

## What you learned

- `{expr}` can be in text, in a quoted attribute value, or be a whole attribute value (`alt={x}` or `alt=x`).
- The language has literals, names, `.` and `[ ]` (both null-safe), calls, unary and binary operators, `?:` and arrays. Nothing is assigned, and there are no arrow functions or template strings.
- `null`, `undefined` and `false` are empty text and a missing attribute; `true` is an empty attribute; `0` and `""` are values.
- The compiler turns a string with holes into `"literal" + toText(expr) + ...` and compares the result of `prev` and `next` to decide on a patch.

Next: [events and messages](page:syntax-events).
