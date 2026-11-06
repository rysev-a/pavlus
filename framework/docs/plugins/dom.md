# dom

The only code that touches the DOM. It renders compiled views, applies the
patches it is given, and owns every event listener it adds. Events come back
to the application as messages. It never diffs and never reads the state:
what to change is decided above it — by the component that owns the view.

The plugin is a class: an instance is the executor (mounted into
`createApp`), and its **static methods build the effects**.

```ts
import { DomPlugin } from "@pavlus/frontend/plugins/dom";

createApp({ app, plugins: [store, new DomPlugin()], mount: "#app" });
```

`mount` renders the application's view into the target and sends `mounted`
once it is in the DOM. When the target holds a server render (the comments
`renderToString` puts around it), the markup is hydrated instead of rebuilt:
see [docs/ssr.md](../ssr.md). The effects below are for everything else.

## Effects

The static methods of `DomPlugin` build them:

```ts
DomPlugin.mount("#panel", panelView, { onMounted: "panelMounted" });
DomPlugin.update(patches, "#panel"); // apply what the component's diff computed
DomPlugin.update(patches); // without a target: the application's only mount
DomPlugin.unmount("#app");
DomPlugin.focus("input.filter");
DomPlugin.blur("input.filter");
```

| Effect    | Fields                         | Meaning                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mount`   | `target`, `view`, `onMounted?` | Render `view` into `target` (a CSS selector or an element) using the current state.                                                                                                                                                                                                                            |
| `update`  | `patches`, `target?`           | Apply the patches as-is: which nodes get which text, attributes and listeners, what is inserted and removed — all computed by a component's view diff. Without a `target` the patches belong to the application's only mount (there must be exactly one; this is what a component that paints itself returns). |
| `unmount` | `target`                       | Remove what was mounted into `target`.                                                                                                                                                                                                                                                                         |
| `focus`   | `target`                       | Focus the first matching element.                                                                                                                                                                                                                                                                              |
| `blur`    | `target`                       | Blur the first matching element.                                                                                                                                                                                                                                                                               |

The same names on an instance are the executor API (`plugin.update(target,
patches)`); `handle` maps an effect to them.

`view` is a compiled template (`import view from "./page.pavlus"`), or
`viewOf(component)` for a component whose template has an `+outlet` or
embeds children: the plugin itself knows nothing about components.

### Messages sent back

| When                                                                 | Message                  |
| -------------------------------------------------------------------- | ------------------------ |
| the view is in the DOM (if `onMounted` was given)                    | `{ id: onMounted }`      |
| the user triggers an event bound in a template (`@click=save(item)`) | `{ id, payload, event }` |

For events, `id` is the message id from the template (with the instance prefix
of embedded children, `users.select`), `payload` the handler's argument(s), and
`event` a plain-data snapshot of the DOM event:

```ts
event: { type: "input", value?: string, checked?: boolean, key?: string }
```

`value` and `checked` come from the event's target (any element that has them:
inputs, but also a button's `value`, which is `""` unless set), `key` from
keyboard events. `@submit.prevent` and `.stop` call `preventDefault()` /
`stopPropagation()` before the message is sent.

## Keeping the view in sync

A mount is **not** tied to the state: it renders once, and the plugin never
diffs or reads the state. Components paint themselves: a store write that
changed anything answers with `{ prev, next }` — exactly what a view `diff`
takes — and the component's handler (usually named `paint`) returns the
patches as an `update` effect:

```ts
paint(msg: Message): Effect[] {
  const { prev, next } = msg.payload as { prev: S; next: S };
  return [DomPlugin.update(view.diff(prev, next))];
}
```

A root that wants "repaint everything on any write" wraps itself in
`paintOnWrite(app)`: the helper makes every store write answer `paint`.

### A child that paints itself

A child embedded with `+Child#name(props)` knows nothing of its surroundings:
it diffs its own slice (the answer arrives already sliced — the boundary
knows the child's key) and returns patches with node ids relative to itself
and no target. Every boundary the effect bubbles through scopes it: the node
ids get the embed's `"/nid"` segment in front, the event messages the
`"name."` prefix — the same lens that slices the state on the way down. By
the root the patches address the one mount; nested children compose, each
boundary adding only its own segment.

What a child cannot paint is appearing and disappearing: closing a form
writes its slice to `null`, which the child's template cannot render. Those
writes answer something else (`done`, `closed`), and the parent — whose
diff mounts and unmounts the embed (`if edit` in its template) — paints the
change itself.

Mounting into a target that already has a view unmounts the old one first.
The view is placed between two comment nodes (`<!--pavlus-->` ...
`<!--/pavlus-->`), so other content in the same container is left alone.

## Listeners

A node gets **one** listener per event type, for its whole life. When the
message a handler sends changes (the payload now points at another user), the
plugin only swaps the stored message; it does not remove and add listeners. When
nodes are removed (an `if` turns false, a list item disappears, `unmount`) all
listeners below them are removed. `stats()` shows the totals:

```ts
plugin.stats(); // { mounts: 1, nodes: 42, listeners: 7 }
```

After `unmount` it is back to `{ mounts: 0, nodes: 0, listeners: 0 }`, which
is what the leak tests assert.

## Form fields

`value`, `checked` and `selected` are written as **properties** as well as
attributes. The attribute only seeds a field; once the user has typed, only the
property changes what is shown, so a plain attribute patch would silently do
nothing.

## Options

```ts
new DomPlugin({ document }); // default: the global document
```

## In tests

Use jsdom (`// @vitest-environment jsdom`). `mountView` from
`@pavlus/frontend/testing` mounts a view without the core:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 }); // the harness diffs and calls plugin.update
expect(h.root.textContent).toBe("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
expect(h.dom.stats().listeners).toBe(0);
```
