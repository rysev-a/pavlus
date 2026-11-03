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

## Pitfalls found while building the first 20 templates

CSS (all block and template stylesheets are loaded on every page, in no fixed order):

- **Class names are global.** Prefix every class with something unique to the
  block (`k-lfilter`, `k-sstrip`). `tests/css-prefixes.test.ts` fails when two
  blocks define the same bare class; it was added after `stat-cards` and
  `stats-strip` both defined `.k-stats`. A template may restyle an embedded
  block, but only under its own parent selector (`.dr .k-hero__title`).
- **Specificity beats order.** `.k-icon` sets `--k-icon: none`, so a custom icon
  is `.k-icon.k-foo-icon { --k-icon: url(...) }` (two classes), never a bare
  `.k-foo-icon`. The same goes for overriding a `.ui-*` rule, `.ui-card` (a column
  flex), `.ui-avatar` sizes, `.k-preview` (a flex row) and `.ui-button-outline`
  (it has a dark-mode variant): qualify with a parent class.
- A bare `span` with `width: 40%` is `display: inline` and ignores the width: use
  a `div`, or set `display: block`.
- Grid and flex children need `min-width: 0` or they overflow a 390px screen.
  `.k-wide` (templates) has no side padding: give the template its own.
- A sticky bar inside a template sits below the app header: `top: 76px`, and give
  its sections `scroll-margin-top`. Hash links (`#pricing`) work with the router.
- The size scales (`scaleSizes` in `vite.config.mjs`) rewrite `font-size` and any
  `width` / `height` / `min-*` of exactly 24, 28, 32, 36 or 40px in the kit's CSS
  files. That is meant for controls; keep other boxes off those exact numbers
  or accept that they scale with "Controls".
- Embedding the page of a block (`auth.pavlus`) brings its demo frame along: hide
  `.k-demo__title` and the border of `.k-preview` from your template's CSS.

Templates and state:

- **Events of an embedded part reach the parent as `<id>.<message>`**, one prefix
  per embedding level (`grid.card.add`). Handle them with a quoted method name:
  `"grid.card.add"(msg) { ... }`. A block that embeds another block loses that
  routing, so templates embed blocks directly and a block does not embed a block.
- A stateful part has its own `view.pavlus`; its demo page declares it in
  `children` and its initial state is `{ key: partInitial }`. A template does the
  same. `props: (s) => ({...})` in `children` gives the child read-only inputs.
- A handler sees the state **before** the message. A parent that observes
  `"cart.add"` must recompute from the payload, not read what the child is about to
  write. `ctx.send("child", "msg", payload)` returns effects: spread them.
- **No bracket access, no filtering in templates.** Keep the changing state in a
  `core` object and recompute every derived list in one pure `derive(core)`; a
  `_commit(state, patch)` helper then emits `store.set` for the patch and for each
  derived field. Do not give a derived list the name of a data list.
- Roots: wrap a part in one element (a root-level `if` or several roots are not
  safe). `@click.stop` with no message needs a no-op id. A `for` variable named
  like a tag (`option`) is confusing; a handler named like a state field
  (`volume`) works but is confusing too.
- Dynamic classes: `class:name=cond` next to the static `.name`, or
  `class="a {expr}"`; variants as `data-x=expr`.
- Inputs: the DOM plugin writes `value`, `checked` and `selected` as properties
  when the state changes, so a handler can reformat what was typed (the caret then
  jumps to the end) and a state-driven clear works. `@focus` and `@blur` work.
  `option(selected={x === y})` with `@change` for selects; for radios read
  `msg.event.value`.
- Time: no `Date.now()`. Ask `time.now("clock")` and handle the reply, or keep a
  fixed "today" in the state. Reply ids of a child are prefixed back to the child.
  To focus an element an `if` has just rendered: `time.setTimeout(id, 0, "msg")`
  then `dom.focus("#id")` in `msg`.
- A `.pavlus` typo (a stray quote after an event) does not always fail the build
  loudly: open the page.
