# dom

The only code that touches the DOM. It renders compiled views, applies the
patches `view.diff` produces, and owns every event listener it adds. Events
come back to the application as messages.

```ts
import {
  createDomPlugin,
  domEffector as dom,
} from "@service-laboratory/pavlus/plugins/dom";

createApp({ app, plugins: [store, createDomPlugin()], mount: "#app" });
```

`mount` renders the application's view into the target and sends `mounted`
once it is in the DOM. When the target holds a server render (the comments
`renderToString` puts around it), the markup is hydrated instead of rebuilt:
see [docs/ssr.md](../ssr.md). The effects below are for everything else.

## Effectors

```ts
dom.mount("#panel", panelView, { onMounted: "panelMounted" })
dom.unmount("#app")
dom.focus("input.filter")
dom.blur("input.filter")
```

| Effect | Fields | Meaning |
|---|---|---|
| `mount` | `target`, `view`, `onMounted?` | Render `view` into `target` (a CSS selector or an element) using the current state. |
| `unmount` | `target` | Remove what was mounted into `target`. |
| `focus` | `selector` | Focus the first matching element. |
| `blur` | `selector` | Blur the first matching element. |

`view` is a compiled template (`import view from "./page.pavlus"`), or
`viewOf(component)` for a component whose template has an `+outlet` or
embeds children: the plugin itself knows nothing about components.

### Messages sent back

| When | Message |
|---|---|
| the view is in the DOM (if `onMounted` was given) | `{ id: onMounted }` |
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

`mount` renders once. After that the plugin re-renders by itself: whenever the
state changes it runs `view.diff(previousState, state)` for every mounted view
and applies the patches. The application never sends "update" effects.

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
plugin.stats();   // { mounts: 1, nodes: 42, listeners: 7 }
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
createDomPlugin({ document })   // default: the global document
```

## In tests

Use jsdom (`// @vitest-environment jsdom`). `mountView` from
`@service-laboratory/pavlus/testing` mounts a view without the core:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });                 // state change → patches
expect(h.root.textContent).toBe("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
expect(h.dom.stats().listeners).toBe(0);
```
