# Angular-like HTML syntax (`.ng.html`)

Real HTML plus the Angular template syntax. `parseAngular` is a tokenizer
(`lexer.ts`: tags, attributes, comments, text, `@blocks`) followed by a tree
builder (`parse.ts`). Expressions are the pure JS subset of `template/expr.ts`.

```ts
pavlus({ syntaxes: { ".ng.html": parseAngular } });
```

## Cheat-sheet

| Feature              | Syntax                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Element, id, classes | `<div id="x" class="a b">` (a static `class` becomes the class list)                                                     |
| Interpolation        | `{{ expr }}` in text and quoted attribute values (`href="/u/{{ id }}"`)                                                  |
| Property / attribute | `[title]="expr"`, `[attr.data-id]="expr"`, `[class]="expr"`; with a boolean value it behaves like native `disabled=expr` |
| Bare boolean         | `<input disabled>`                                                                                                       |
| Class toggle         | `[class.active]="expr"`                                                                                                  |
| Event                | `(click)="save(item)"`, `(click)="menu.close"`; modifiers `(submit.prevent)`, `(click.stop)`, `(click.prevent.stop)`     |
| If                   | `@if (a) { } @else if (b) { } @else { }`                                                                                 |
| For                  | `@for (item of items; track item.id; let i = $index) { } @empty { }`                                                     |
| Legacy if            | `<li *ngIf="expr">` (condition only, no `else`/`as`)                                                                     |
| Legacy for           | `*ngFor="let item of items; trackBy: item.id; let i = index"` (also `index as i`)                                        |
| No element           | `<ng-container>`, `<ng-container *ngIf>`, `<ng-container *ngFor>`                                                        |
| Component            | `<app-card title="x" [count]="n" [props]="more" #side />`                                                                |
| Dynamic component    | `<ng-component [is]="view" #main title="x" />`                                                                           |
| Outlet               | `<router-outlet />`                                                                                                      |
| Comments             | `<!-- ... -->`                                                                                                           |

### Imports

Components are imported with a comment at the top of the file, before any
markup:

```html
<!-- import Card from "./card.pavlus" -->
<!-- import Panel from './panel.pavlus' as app-panel -->
```

The tag that selects the component is the local name by default
(`<Card />`), or the `as` name (`<app-panel />`). Tags are case-sensitive.
A capitalised tag that was not imported is an error; any other unknown tag is
a plain element (so web components such as `<x-foo>` work). Components cannot
have children; `<Card />` and `<Card></Card>` are the same.

On components, attributes are props (`name="a {{ b }}"`, `[name]="expr"`,
bare `name`; names must be identifiers). `#name` is the instance name (message
prefix and state key); the default is the lower-cased local name, and
`<ng-component>` requires it. `*ngIf` / `*ngFor` work on components too.

## Rules

- Text: each run of text between tags is trimmed per line, blank lines drop,
  lines are joined with `"\n"`. Text next to an element therefore loses its
  edge whitespace (`Hello <b>x</b>` renders `Hello` `x`), like native lines.
  Adjacent text nodes (split by a comment) are joined with `"\n"`.
- Entities `&amp; &lt; &gt; &quot; &#39; &nbsp;` (and numeric ones, and a few
  more) are decoded in text and attribute values, after trimming, and the
  result is never scanned again. Write literal braces as `&#123;` / `&#125;`.
  A `}` in text closes a block, so an unmatched one is an error.
- `@` starts a block only for `@if @else @for @empty` when not glued to a word
  (`me@for.com` is text). `@switch`, `@defer`, `@let` are errors.
- Binding expressions (`[x]`, `(x)`, `*ng...`) are not entity-decoded; use
  single quotes inside double-quoted attributes.
- `$event` arguments are dropped: messages never carry the DOM event, so
  `(submit)="save($event)"` is `save`.
- `@empty` becomes a sibling `if !items.length` after the loop.
- `$index` is available in `@for` bodies without `let` (nearest loop wins);
  `track $index` means "no key". `$first/$last/$count/$even/$odd` are not
  supported. `trackBy:` takes an expression (the key), not a function name.
- `<ng-template>`, `<ng-content>`, pipes (`|`), two-way `[(x)]`, `[style.x]`,
  template refs other than `#instance`, and optional end tags (`<li>` without
  `</li>`) are not supported. `<br>`, `<img>` ... are void; `<x />` closes any
  tag. `<script>`/`<style>` content is raw text, `<textarea>`/`<title>` take
  no markup.
- Errors are `TemplateError(message, line, col)` pointing into the HTML
  (expression errors point at the offending character, across lines).

## Side by side

```html
<!-- import Card from "./card.pavlus" -->
<ul class="menu">
  @for (item of items; track item.id; let i = $index) {
  <li [class.active]="item.active" (click.prevent)="open(item.id)">
    {{ i }}: {{ item.title }}
  </li>
  } @empty {
  <li>Nothing here</li>
  }
</ul>
@if (user) {
<Card [name]="user.name" #profile />
} @else {
<a href="/login" disabled>Log in</a>
}
```

```
import Card from "./card.pavlus"
ul.menu
  for item, i in items key item.id
    li(class:active=item.active @click.prevent=open(item.id))
      | {i}: {item.title}
  if !items.length
    li Nothing here
if user
  +Card#profile(name=user.name)
else
  a(href="/login" disabled) Log in
```
