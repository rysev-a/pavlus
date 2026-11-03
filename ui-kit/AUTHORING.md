# Authoring guide: blocks and templates

For anyone (or any agent) adding to the kit. Read one existing example first:
`frontend/blocks/auth/` (a block with state), `frontend/blocks/hero/` (a part
to embed), `frontend/templates/links-hub/` (a template).

## What goes where

| Folder | What | Page |
| --- | --- | --- |
| `frontend/pages/<slug>/` | one shadcn component (listed in `registry.ts`) | `/<slug>` |
| `frontend/blocks/<slug>/` | a block: a form, a player, or a part a template is built from | `/blocks/<slug>` |
| `frontend/templates/<slug>/` | a whole site or app, built **from blocks** | `/templates/<slug>` |

A block or template folder holds:

- `meta.ts`: `export const meta: Meta = { title, group, description, order?, look? }`.
  This is the only place it is registered: no list to edit. Groups are in
  `registry.ts` (`BLOCK_GROUPS`, `TEMPLATE_GROUPS`); a new group name is fine.
- `<slug>.pavlus`: the page. A block page is a column of `section.k-demo`
  frames (`h2.k-demo__title` + `div.k-preview`). A **template's root element has
  the class `k-template`** (the tests look for it).
- `<slug>.ts` (only with state): `export const initial` (the state) and
  `export const page = new X()` (a `Component` whose `view` is the template).
- `view.pavlus` (a part): the reusable template, with its props as state. Other
  blocks and templates embed it; the block's own page demos it.
- `<slug>.css` (optional): picked up automatically. Prefix every class with
  `k-<slug>` (or a short unique prefix) so folders never clash. Use the tokens
  (`var(--primary)`, `var(--border)`, `var(--radius-lg)`, ...) and never a literal
  colour: the look of a template, light/dark and the Theming page all depend on it.
  Use `calc(24px * var(--k-block, 1))` for the padding and gaps of a block.

## The rule for templates

A template is made from the kit's elements: the `.ui-*` classes (the shadcn
components), the blocks, and the parts. **If a template needs something the kit
does not have, first add it as a block (a part with a page in `blocks/`), then
use it.** A template has no private widgets: its folder has the page, its
state, `meta.ts` and a little CSS for the layout of the page itself.

A template sets its own **look** in `meta.ts` (`look: { mode, palette, font,
style, ui, text, block }`; see `theming.ts` for the ids: 30 palettes, 10 fonts,
6 styles, 5 sizes per scale). The look is applied while its page is open, so
choose it to fit the site (a bakery is warm and rounded, a server dashboard is
`cs` style with a mono font, a bank is `official`).

## pavlus templates in 2 minutes

Read `framework/README.md` (the template table) for the language. What matters
most, and the traps:

- Indentation-based. `tag.class#id(attr=expr other="text {expr}" flag) text`.
  A line of text is `| text`. `{expr}` interpolates; `\{` is a literal brace.
- Expressions are a small pure subset of JS. **No bracket access** (`a[b]`), no
  arrow functions, no template literals. Compute what you need in the handler
  and keep it in the state (a `title`, a `total`, a list already filtered).
- `for item in list key item.id` and `if` / `else if` / `else`. A boolean attribute
  is a flag (`disabled`) or `disabled={cond}`; `null` removes an attribute, a
  boolean `true` renders an empty value, so for `[data-x="true"]` selectors use
  `data-x={cond ? "true" : null}`.
- Events are data: `@click=add(item.id)` is the message `add` with the payload.
  With several arguments the payload is an array. The DOM plugin adds
  `msg.event` (`value`, `checked`, `key`): read `msg.event?.value` for `@input`,
  `msg.event?.checked` for `@change` on a checkbox. Modifiers: `.prevent`, `.stop`.
- Inputs: `value=state.field`, `checked={state.flag}`. The browser keeps what the
  user typed; the state only seeds it.
- **No SVG elements** (the DOM plugin creates elements without a namespace).
  Icons are `span.k-icon.k-icon-<name>` (CSS masks, see `kit.css`); drawings are
  built from boxes, gradients, `clip-path` and emoji.
- Embedding: `import X from "../hero/view.pavlus"` at the top, then
  `+X#name(title="Hi" list=items ...stateObject)` (static) or `+{expr}#name(...)`
  (the view is a value). Props are attributes: strings in quotes, state paths bare.
  The embedded template's events are sent as `name.<message>` to the parent.
- Embedding a block that has its own state and logic: declare it as a child in the
  parent component and spread its state:

  ```ts
  children: Children<State> = { cart: { component: cartBlock, key: "cart" } };
  ```
  ```
  +Cart#cart(...cart)
  ```
  and initial state `{ cart: cartInitial, ... }`. Messages `cart.add` reach the
  child as `add`; the parent can observe them with a method named `"cart.add"`.
- Pure handlers: `(msg, state) => Effect[]`, built with the effectors
  (`store.set("path.to.field", value)`, `time.setTimeout(id, ms, replyMessage)`,
  `time.setInterval`, `time.cancel`). No `Date.now()`, `Math.random()`, `fetch`,
  DOM. Time comes from the time plugin; a counter goes in the state. Methods named
  `_x` are never messages; use them for helpers. `leave` (the router) is the place
  to cancel a timer the page started.
- The router gives a page `enter` and `leave` messages (`enter` is when its route
  becomes active).

## Checks before you finish

```sh
npm run typecheck --workspace ui-kit
npm test --workspace ui-kit        # visits every page, so yours must render
npx prettier --write "ui-kit/**/*.ts"
```

Then open it in a browser (`npm run dev --workspace ui-kit`) and click through
your page: jsdom does not draw anything. Check the light and the dark mode, and a
narrow window (390px). Put what you learned about the traps above in your report.

Tests for logic go in `frontend/tests/<slug>.test.ts` (pure functions: import
them from your `<slug>.ts`).
