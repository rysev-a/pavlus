# Block HTML (`.phtml`)

```ts
import { parseBlocks } from "pavlus/syntaxes";
pavlus({ syntaxes: { ".phtml": parseBlocks } });
```

Plain HTML, plus a handful of Svelte-style logic blocks written **outside** the
tag grammar. This is the recommended alternative syntax.

## Why this one

1. **Every tool already understands it.** The markup is real HTML: editors
   highlight and fold it, Prettier and `html-validate` format and lint it, the
   browser devtools and designers' tools read it, and anyone can paste a
   snippet from MDN or a design handoff straight in. The only non-HTML tokens
   are `{...}` and they are never inside a tag name or between `<` and `>` in
   a way that breaks tokenization.
2. **Control flow never costs an element.** Angular needs `<ng-container>`,
   JSX needs fragments and `.map()` plus `&&` ternaries, Vue-style templates
   need `<template v-if>`. Here `{#if}` and `{#each}` are siblings of the
   markup they guard, so the DOM you write is the DOM you get, and a guarded
   `<li>` really is a direct child of the `<ul>`.
3. **Control flow is not squeezed into attributes.** `*ngIf="a; else b"` and
   `v-for="(x, i) in xs"` are strings in a string. Block tags are visible,
   indent naturally, and have room for `{:else if}`, `{:else}` and the empty
   state of a list (`{#each}...{:else}`).
4. **Expressions stay in braces, and only there.** `{expr}` in text,
   `name="a {b} c"` or `name={expr}` in attributes: the same single escape
   hatch everywhere, the same pure JS subset the compiler already checks.
5. **Familiar to the largest number of people.** The block syntax is the one
   Svelte popularized, so there are existing habits, highlighters and
   documentation for it, and nothing about it needs to be learned twice.
6. **Honest about its limits.** There is no `<script>`/`<style>` (a template is
   markup, logic lives in TypeScript, styles in CSS), no optional end tags and
   no raw text elements. A formatter can therefore never change what a template
   means, and the parser can report precise `line:col` errors.

The cost relative to indentation syntaxes is verbosity: closing tags and
`{/if}`. In exchange the file is robust to re-indentation and to any
formatter.

## Cheat-sheet

| Feature          | Syntax                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Element, classes | `<div id="a" class="b c">`; void elements `<br>`, `<img ...>`; `<x />` ok                                |
| Text             | `{expr}`; escape braces with `\{` and `\}`; entities `&amp; &lt; &gt; &quot; &#39; &nbsp; &#NNN; &#xHH;` |
| Attributes       | `name="a {b} c"`, `name={expr}`, `name=unquoted`, bare `disabled`                                        |
| Class toggle     | `class:active={expr}` (`class:active` means `class:active={active}`)                                     |
| Events           | `on:click={save}`, `on:click={remove(item, i)}`                                                          |
| Modifiers        | `on:submit\|preventDefault\|stopPropagation={save}` (`\|prevent`, `\|stop`)                              |
| If               | `{#if a}...{:else if b}...{:else}...{/if}`                                                               |
| Each             | `{#each xs as x, i (x.id)}...{:else}...{/each}`; the key is optional                                     |
| Import           | `{#import Card from "./card.pavlus"}` at the top                                                         |
| Component        | `<Card title="x" count={n} {...rest} name="main" />`                                                     |
| Dynamic          | `<Dynamic this={expr} name="x" label={l} />`                                                             |
| Outlet           | `<Outlet />`                                                                                             |
| Comments         | `<!-- dropped -->`                                                                                       |

Details:

- Components are capitalized tags and are leaves (`<Card />` or
  `<Card></Card>`). `name="main"` is the instance name (message prefix and state
  key); it is consumed, not passed as a prop, and defaults to the lowerCamel of
  the component (`Card` becomes `card`). `{...spread}` is only valid on
  components. `<Dynamic>` takes the view from `this={expr}` and requires `name`.
- The `{:else}` of an `{#each}` is sugar for an `{#if}` after the loop on
  `!list.length`, so it costs one extra node, exactly as the native `if` does.
- Whitespace follows the native parser, not the browser: every non-blank line
  of text is one text node, trimmed; blank and indent-only text is dropped; a
  text line directly after another text line (also across a comment) is joined
  with `"\n"`, which HTML renders as a space.
- `<script>`, `<style>`, doctype and CDATA are rejected with a clear error.
  Elements need explicit end tags (void elements excepted).

## Side by side

One real template, a slice of
`ui-kit/src/templates/phone-retail-crm/phone-retail-crm.pavlus` (the
list-view confirmation, the settings counts and the reset buttons). The native
and Block HTML versions are checked against each other in `parse.test.ts`
("phone-retail-crm snippet"); the Pug, Angular and JSX forms are illustrative.

### Native (`.pavlus`)

```
import Table from "../../blocks/crud-table/view.pavlus"

main.k-ashell__content
  if view === "list"
    if confirm.open
      div.ui-alert.pcrm__alert.pcrm__confirm
        span.ui-alert-icon
          span.k-icon.k-icon-alert
        div.ui-alert-body
          p.ui-alert-title Are you sure?
          div.ui-alert-description {confirm.text}
          div.pcrm__confirmbar
            button.ui-button.ui-button-destructive.ui-button-sm(type="button" @click=confirmYes) Delete
            button.ui-button.ui-button-outline.ui-button-sm(type="button" @click=confirmNo) Cancel
    +Table#table(...grid)
  else if view === "settings"
    div.pcrm__counts
      for item in settings.counts key item.id
        div.pcrm__count
          span.pcrm__countlabel {item.label}
          strong {item.count}
    if settings.askReset
      span.pcrm__ask All your changes will be lost. Reset everything?
      button.ui-button.ui-button-destructive(type="button" @click=settingsReset) Yes, reset all data
    else
      button.ui-button.ui-button-outline.pcrm__danger(type="button" @click=settingsAskReset)
        span.k-icon.k-ai-refresh
        | Reset all data
```

### Block HTML (`.phtml`)

```html
{#import Table from "../../blocks/crud-table/view.pavlus"}

<main class="k-ashell__content">
  {#if view === "list"} {#if confirm.open}
  <div class="ui-alert pcrm__alert pcrm__confirm">
    <span class="ui-alert-icon">
      <span class="k-icon k-icon-alert"></span>
    </span>
    <div class="ui-alert-body">
      <p class="ui-alert-title">Are you sure?</p>
      <div class="ui-alert-description">{confirm.text}</div>
      <div class="pcrm__confirmbar">
        <button
          class="ui-button ui-button-destructive ui-button-sm"
          type="button"
          on:click="{confirmYes}"
        >
          Delete
        </button>
        <button
          class="ui-button ui-button-outline ui-button-sm"
          type="button"
          on:click="{confirmNo}"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
  {/if}
  <table name="table" {...grid} />
  {:else if view === "settings"}
  <div class="pcrm__counts">
    {#each settings.counts as item (item.id)}
    <div class="pcrm__count">
      <span class="pcrm__countlabel">{item.label}</span>
      <strong>{item.count}</strong>
    </div>
    {/each}
  </div>
  {#if settings.askReset}
  <span class="pcrm__ask"
    >All your changes will be lost. Reset everything?</span
  >
  <button
    class="ui-button ui-button-destructive"
    type="button"
    on:click="{settingsReset}"
  >
    Yes, reset all data
  </button>
  {:else}
  <button
    class="ui-button ui-button-outline pcrm__danger"
    type="button"
    on:click="{settingsAskReset}"
  >
    <span class="k-icon k-ai-refresh"></span>
    Reset all data
  </button>
  {/if} {/if}
</main>
```

### Pug (illustrative)

```pug
main.k-ashell__content
  if view === "list"
    if confirm.open
      div.ui-alert.pcrm__alert.pcrm__confirm
        div.ui-alert-body
          p.ui-alert-title Are you sure?
          div.pcrm__confirmbar
            button.ui-button.ui-button-destructive(type="button", @click="confirmYes") Delete
    +Table#table(...grid)
  else if view === "settings"
    div.pcrm__counts
      each item in settings.counts
        div.pcrm__count
          span.pcrm__countlabel= item.label
          strong= item.count
    if settings.askReset
      button.ui-button(type="button", @click="settingsReset") Yes, reset all data
    else
      button.ui-button(type="button", @click="settingsAskReset")
        span.k-icon.k-ai-refresh
        | Reset all data
```

Whitespace-significant: a formatter that re-indents can change the tree, and
there is no key, empty state or import in the standard grammar.

### Angular (illustrative)

```html
<main class="k-ashell__content">
  <ng-container *ngIf="view === 'list'; else notList">
    <div class="ui-alert pcrm__confirm" *ngIf="confirm.open">
      <p class="ui-alert-title">Are you sure?</p>
      <button class="ui-button" type="button" (click)="confirmYes()">
        Delete
      </button>
    </div>
    <app-table [rows]="grid.rows"></app-table>
  </ng-container>
  <ng-template #notList>
    <div class="pcrm__counts">
      <div
        class="pcrm__count"
        *ngFor="let item of settings.counts; trackBy: byId"
      >
        <span class="pcrm__countlabel">{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </div>
    </div>
    <button *ngIf="settings.askReset; else ask" (click)="settingsReset()">
      Yes, reset all data
    </button>
    <ng-template #ask>
      <button (click)="settingsAskReset()">
        <span class="k-icon k-ai-refresh"></span> Reset all data
      </button>
    </ng-template>
  </ng-template>
</main>
```

Control flow lives in attribute strings and needs wrapper nodes and named
templates for `else`.

### JSX (illustrative)

```jsx
<main className="k-ashell__content">
  {view === "list" ? (
    <>
      {confirm.open && (
        <div className="ui-alert pcrm__confirm">
          <p className="ui-alert-title">Are you sure?</p>
          <button className="ui-button" type="button" onClick={confirmYes}>
            Delete
          </button>
        </div>
      )}
      <Table name="table" {...grid} />
    </>
  ) : view === "settings" ? (
    <>
      <div className="pcrm__counts">
        {settings.counts.map((item) => (
          <div className="pcrm__count" key={item.id}>
            <span className="pcrm__countlabel">{item.label}</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
      {settings.askReset ? (
        <button onClick={settingsReset}>Yes, reset all data</button>
      ) : (
        <button onClick={settingsAskReset}>
          <span className="k-icon k-ai-refresh" /> Reset all data
        </button>
      )}
    </>
  ) : null}
</main>
```

Nested ternaries, fragments and `.map()` for what are statements in the other
forms; `className`/`htmlFor` instead of HTML attribute names; and arbitrary
JavaScript, which pavlus templates deliberately do not allow.
