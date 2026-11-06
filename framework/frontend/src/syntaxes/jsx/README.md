# JSX syntax (`.view.jsx`)

```ts
import { parseJsx } from "./syntaxes/jsx/parse.ts";
pavlus({ syntaxes: { ".view.jsx": parseJsx } });
```

A file is `import` lines (ES-style, default imports of capitalised names) and
ONE JSX expression, bare or as `export default (<div>...</div>)`. Fragments
`<>...</>` are allowed at the root and anywhere (they are flattened). JS
comments between imports and `{/* comments */}` in children are ignored.
Expressions in `{}` are the pure subset of `parseExpr` (no arrow functions
except in the `.map` recogniser below).

## Cheat-sheet

| Feature       | JSX                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id, classes   | `<div id="a" className="x y">` (`class` works too; `className={expr}` is a dynamic `class` attribute)                                                                        |
| attributes    | `href="/x"`, `href={url}`, boolean `<input disabled />`, `htmlFor` becomes `for`, `style` only as a string                                                                   |
| text          | `Hello {name}!` (entities decoded; lines trimmed, blank lines dropped, joined by one space, like React)                                                                      |
| literal brace | `{"{"}` and `{"}"}` (a bare `}` in text is an error)                                                                                                                         |
| class toggle  | `class:active={item.active}`                                                                                                                                                 |
| events        | `onClick={save}`, `onClick={remove(item.id)}`, `onKeyDown={...}` (event name lowercased)                                                                                     |
| modifiers     | suffixes: `onClickPrevent`, `onSubmitPrevent`, `onClickStop`, `onClickPreventStop`                                                                                           |
| if            | `{cond && <A/>}`                                                                                                                                                             |
| if / else     | `{cond ? <A/> : <B/>}`                                                                                                                                                       |
| else-if chain | `{a ? <A/> : b ? <B/> : <C/>}` (nested ternary, the last arm may be `null`)                                                                                                  |
| no else       | `{cond ? <A/> : null}`; `{cond ? null : <B/>}` shows B when `cond` is false                                                                                                  |
| for           | `{items.map((item, i) => <li key={item.id}>...</li>)}`; `item =>` is fine; `key` is removed from the element; a missing key is allowed; parentheses around the body are fine |
| embed         | `<Card title="x" count={n} flag {...rest} />`; instance name from `name="main"` (default: lowerCamel of the component)                                                       |
| dynamic embed | `<Embed view={expr} name="x" ... />` (`name` is required)                                                                                                                    |
| outlet        | `<Outlet />`                                                                                                                                                                 |
| comments      | `{/* ... */}`                                                                                                                                                                |

`key` on an element is only used by a `.map` body; elsewhere it is dropped.
`name`, `key` and (for `Embed`) `view` are not passed as props. Components
cannot have children. Void elements may be written `<br />` or `<br>`.

Whitespace follows React, not the native syntax: text directly touching an
element or expression keeps no implied space, so `a\n{b}` renders `ab`;
write `{" "}` for a space. Inline text and `{expr}` runs in one element
become one text node (the native `| a {b}` line).

## Side by side

```jsx
import Card from "./card.pavlus";

export default (
  <div id="app" className="todos">
    <h1>{title}</h1>
    <form onSubmitPrevent={add(draft)}>
      <input value={draft} disabled />
    </form>
    {items.length === 0 && <p>Nothing</p>}
    <ul>
      {items.map((item, i) => (
        <li key={item.id} class:done={item.done}>
          <button onClick={remove(item.id)}>
            {i}: {item.text}
          </button>
        </li>
      ))}
    </ul>
    {mode === "a" ? <i>A</i> : <b>B</b>}
    <Card name="main" title="x" {...rest} />
    <Embed view={Comp} name="dyn" />
    <Outlet />
  </div>
);
```

```pavlus
import Card from "./card.pavlus"
div#app.todos
  h1 {title}
  form(@submit.prevent=add(draft))
    input(value=draft disabled)
  if items.length === 0
    p Nothing
  ul
    for item, i in items key item.id
      li(class:done=item.done)
        button(@click=remove(item.id)) {i}: {item.text}
  if mode === "a"
    i A
  else
    b B
  +Card#main(title="x" ...rest)
  +{Comp}#dyn
  +outlet
```

## How it works

`parse.ts` is a recursive descent over the raw source (no regex-per-line).
JSX tags, attributes and children are parsed directly. A `{ ... }` container
is scanned once into a masked copy of the same length: strings are skipped,
comments blanked, and every nested JSX element (a `<` where an expression may
start) is parsed recursively and replaced by a placeholder. The recognisers
for `&&`, `?:` and `.map(` then look for top-level operators in the masked
text and delegate every plain expression to `parseExpr`; errors from it are
mapped back to the real line and column, also in multi-line expressions.
Node ids are assigned in one final pre-order pass, matching the native parser.
