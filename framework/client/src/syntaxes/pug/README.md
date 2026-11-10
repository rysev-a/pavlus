# Pug syntax (`.pug`)

```ts
import { parsePug } from "./syntaxes/pug/parse.ts";
pavlus({ syntaxes: { ".pug": parsePug } });
// or: compileToView(src, { parser: parsePug })
```

Real Pug where it maps onto the template AST; everything else is rejected with
a positioned `TemplateError`. Files: `lex.ts` (tokenizer: one statement per
logical line; attribute lists, interpolation, comments, dot blocks),
`parse.ts` (recursive descent over the indent structure, lowering to the AST).
Every expression goes through `parseExpr`, so expressions stay the pure JS
subset.

## Cheat sheet

```pug
- import Card from "./card.pavlus"        //- imports first, `- import` lines
section.todo#main(class="wide" data-n=items.length)
  h1.title Todos (#{items.length})        //- #{expr} in text and quoted attrs
  input(type="text" value=draft @input="draft" disabled)   //- bare = boolean
  p= summary                              //- buffered code, escaped
  | piped text, #{a} and \#{literal}
  p.                                      //- dot block: raw text lines
    first line #{a}
    second line
  p Hello #[b world] and #[a(href="/x") link]   //- inline tags
  ul
    each item, i in items key item.id     //- `key` is an extension
      li(class:done="item.done" @click.prevent="toggle(item.id)")
        a: span #{item.name}              //- block expansion
    else                                  //- empty list
      li none
  if a
    p A
  else if b
    p B
  else
    p C
  unless ok
    p not ok
  case kind
    when "a"
    when "b"                              //- empty when falls through
      p A or B
    when "c": p C
    default
      p other
  +Card#main(title="x #{y}" open)&attributes(rest)
  +#{View}#view(title=title)              //- dynamic component
  +outlet
```

## Side by side with the native syntax

| Pug                                  | native `.pavlus`                   |
| ------------------------------------ | ---------------------------------- |
| `- import Card from "./card.pavlus"` | `import Card from "./card.pavlus"` |
| `h1 Hi #{name}`                      | `h1 Hi {name}`                     |
| `p= name`                            | `p {name}`                         |
| `\| text`                            | `\| text`                          |
| `a(href=url title="x #{y}")`         | `a(href=url title="x {y}")`        |
| `a(@click="go(item)")`               | `a(@click=go(item))`               |
| `a(@click.prevent.stop="go")`        | `a(@click.prevent.stop=go)`        |
| `li(class:on="item.on")`             | `li(class:on=item.on)`             |
| `each x, i in xs key x.id`           | `for x, i in xs key x.id`          |
| `unless a`                           | `if !a`                            |
| `case k` / `when v`                  | `if k === v` / `else if k === v`   |
| `each ... else`                      | `if xs.length` / `for` / `else`    |
| `+Card#main(a=1)&attributes(o)`      | `+Card#main(a=1 ...o)`             |
| `+#{View}#v(a=1)`                    | `+{View}#v(a=1)`                   |
| `+outlet`                            | `+outlet`                          |
| `// comment`, `//- comment`          | `// comment`                       |

Attribute values follow Pug: `name="text #{expr}"` is a string with
interpolation, `name=expr` is a JS expression (it may contain spaces when an
operator joins it: `a=x ? "y" : "z"`, `href="/u/" + id`). Attributes are
separated by spaces, commas or newlines; several `(...)` lists may follow one
tag. `@event` and `class:name` values may be quoted (`@click="save(item)"`,
Vue style) or bare. `class` merges: `.a(class="b c")(class=dyn)` gives classes
`a b c` plus one dynamic `class` attribute; `#id` becomes an `id` attribute.

Whitespace matches the native parser: a text line after another text line
(inline text, `|`, `=`, dot-block lines) is joined with `"\n"`, trailing
whitespace is trimmed, node ids are numbered in document order (parents before
children; `each ... else` numbers its wrapping `if` first).

## Deviations from real Pug

Mapped differently:

- Output comments `// ...` are dropped like `//-` (no HTML comments in a
  render template). A nested block under a comment is dropped too. `//` inside
  a line is plain text (as in Pug).
- Text is always escaped: `!=`, `!{...}`, `attr!=` and inline HTML lines
  (`<div>`) are errors.
- `#{expr}` takes the pure expression subset, not arbitrary JS. It must close on
  its line. `\#{` is a literal `#{`. `{` and `}` in text are plain characters
  (unlike native).
- `#{...}` inside quoted attribute values works; in a quoted value `\"` and
  `\\` unescape; use the other quote kind inside `#{...}`... except that a
  `#{...}` may contain its own quotes.
- A quoted value followed by an operator (`href="/x/" + id`) is parsed as an
  expression, like JS.
- `class` attribute: array/object forms (`class=["a", {b: c}]`) are not
  specialised; the expression value is used as is.
- `- import Name from "path"` is the only `-` (unbuffered code) line, and must
  be at the top. Other `- code` is an error.
- Mixin calls are component calls: `+Card#instance(props)(more)`. Arguments are
  named props (attribute syntax), not positional; `#instance` is an extension
  (message prefix and state key); `&attributes(expr)` spreads props (Pug's
  spelling). `+#{expr}#name(...)` is Pug's interpolated mixin call, used for a
  component that comes from state. `+outlet` renders the routed child. Calls
  are leaves: no block content, `.class` is an error.
- `unless` becomes `if !(cond)`. `case/when/default` becomes an `===` if chain:
  empty `when`s fall through (joined with `||`), `- break` is not needed or
  supported, `default` must be last, and `when x: tag` expansion works.
- `each x, i in xs` iterates arrays (the second name is the index, not an object
  key). `for` is accepted as an alias. `each ... else` becomes
  `if xs.length` / `for` / `else`, so the list must have a numeric `length`.
  `else if` after `each` is an error.
- `&attributes(...)` on a plain element is an error (the AST has no element
  spread).
- Event modifiers are `.prevent` and `.stop` only; anything else is an error.
- Indentation uses spaces only; tabs are an error. Dot blocks are one text
  node per line (blank lines are dropped, indentation beyond the first line is
  kept). Text after a tag keeps no leading spaces and loses trailing ones.
- `p text` on a void element (`br`, `img`, ...) is an error; `br/` is accepted.

Not supported (clear error): `mixin` definitions, `include`, `extends`,
`block`/`append`/`prepend`, `yield`, `doctype`, `while`, filters, `- code`,
multiple plain-text `|` blocks with inline HTML, tag names with `:` namespaces,
quoted attribute names.
