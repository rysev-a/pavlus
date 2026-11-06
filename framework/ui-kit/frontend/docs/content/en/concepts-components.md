---
summary: How a component works. Function and class components, the one state tree and how store.set reaches it, how the template reads the state, the view field, props, the mounted, enter and leave messages, why the instance is shared, and the rules for handler names. Ends with a complete todo component.
---
## What a component is

A component in pavlus is a piece of logic that answers messages. Given a message and the current state, it returns a list of effects. It may also have a **view**: the compiled template that shows the state. Nothing else is needed. There is no render method, no lifecycle class and no hooks.

A component takes one of two forms. It can be **a function**:

```ts
import { type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";

interface CounterState {
  count: number;
}

export const counter = (msg: Message, state: CounterState) => {
  switch (msg.id) {
    case "inc":
      return [store.set("count", state.count + 1)];
    case "dec":
      return [store.set("count", state.count - 1)];
    default:
      return [];
  }
};
```

Or it can be **an instance of a class that extends `Component`**. Each method is the handler of the message with the same name, so the `switch` disappears:

```ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./counter.pavlus";

interface CounterState {
  count: number;
}

class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }

  dec(_msg: Message, state: CounterState) {
    return [store.set("count", state.count - 1)];
  }
}

export const counter = new Counter();
```

Both forms do the same work, and `createApp({ app })` accepts either. The difference is what the class form can hold. A function has no `view`, so it can not be rendered with `createApp({ mount })`: the core throws `mount needs an app that is a component with a view`. It also has no `children` and no `routing`. Use a function for small pure logic and for wrappers, and a class for everything that is shown on the screen.

A class must be **passed as an instance**. `createApp({ app: Counter })` throws an error that says `Counter is a class: pass an instance (new Counter()), not the class`. A plain object with methods, or a class that does not extend `Component`, is refused too, and the error says what to write.

## The state tree

The application has **one state**: a plain object, held by the store plugin. Every component reads from it and none of them owns a private copy. A small application keeps all fields at the top. A larger one groups them in branches, such as `state.users` and `state.tasks`, one branch for each child component.

The state is a tree of plain data. It can hold strings, numbers, arrays and objects. It should be easy to print and to compare. The one exception is a component value: a `+{expr}` embed (see [Messages and child components](page:concepts-messages)) may read a component from the state, but then the state is no longer JSON.

A handler never changes the state. It returns an effect, and the store plugin builds a new state object. Let us look at what the store effects can do. Each one has a `path`, written as a string with dots (`"user.name"`) or as an array (`["items", 3, "done"]`). A number in an array path indexes an array.

| Effect | Builder | What the store does |
| --- | --- | --- |
| `set` | `store.set(path, value)` | Puts `value` at `path` and creates missing parents. |
| `merge` | `store.merge(path, object)` | Shallow-merges the fields of `object` into the object at `path`. |
| `remove` | `store.remove(path)` | Deletes the field. An array element is spliced out. |
| `undo` | `store.undo(steps?)` | Reverts the last `steps` changes (default one). |
| `restoreTo` | `store.restoreTo(timestamp)` | Reverts every change recorded after the time. |

The store changes only the branch on the path. The objects on other branches keep their identity, so a template that reads `state.tasks` sees no change when `state.users.status` is set. Writing the same value again changes nothing and is not recorded. Each change stores its own inverse, which is how `undo` works without snapshots.

## How the state reaches the template

A template does not receive props or a context. It reads **the state object**. An identifier in an expression is a field of the state, or a loop variable. In `p Hello, {user.name}` the word `user` is `state.user`.

::demo state-and-template

The demo shows both sides. The template reads two fields, `user` and `unread`. When `unread` goes from 3 to 4, the compiled `diff` returns one `text` patch for the paragraph. This is the whole relationship between a component and its template: **the handlers write the state, the template reads it.** Neither calls the other.

This shapes how you design state. The template can do small things with expressions: compare, add, test for emptiness, call methods like `includes`. It can not run arbitrary code, because expressions are a small pure subset of JavaScript. Anything that needs a real computation, such as a count of open tasks, a sorted copy or a formatted date, is worked out in the handler and stored as a field. The todo example at the end of the page does this with `left`.

## The view

The field `view` holds the template of the component, which is the default export of a `.pavlus` file:

```ts
import view from "./todos.pavlus";

class Todos extends Component<TodoState> {
  view = view;
}
```

A view is `{ render, diff, meta }`: two pure functions, generated by the compiler. `createApp({ app, mount })` renders `app.view` into the element `mount`, and the DOM plugin keeps it up to date. A child component's view is placed in a parent's template with an embed (`+Child#name`). A component without a view is fine: it is logic only, for example a child that a parent talks to but does not show.

`viewOf(component)` returns the view closed over its component. That is what lets `+outlet` and the embedded children find the component's `routing` and `children`. You rarely call it yourself, because `mount` and the test helper `mountView` do it for you.

## Props

A parent can give a child **read-only inputs** through `props`. It is a function from the parent's state to an object, and the object is merged into the child's state:

```ts
children: Children<DashboardState> = {
  users: {
    component: users,
    key: "users",
    props: (state) => ({ filter: state.filter }),
  },
};
```

The child sees `{ ...state.users, filter }`. In its handlers and in its template, `filter` is just a field. Two rules matter. The props are merged **after** the child's own slice, so a prop wins over a field with the same name. And a prop is an input only: the child must not write it. A `store.set("filter", ...)` in the child would write `users.filter` in the parent's state, which is a different place. The page [Messages and child components](page:concepts-messages) shows the whole wiring.

## Lifecycle: mounted, enter and leave

Pavlus has no lifecycle methods. There are **messages**, like every other event, that the framework sends at three moments. A component handles them with methods of the same name, and returns effects.

| Message | When it is sent | Who gets it |
| --- | --- | --- |
| `mounted` | Once, after the application is in the DOM. It is the first message of an app created with `mount`. | The root component. For a view mounted by the `dom.mount` effect you choose the message with its `onMounted` option. |
| `enter` | A routed child became active, or a leaf page's own route changed (for example `/items/5` to `/items/7`). The payload is the child's route. | The routed child, as `enter`. |
| `leave` | A routed child stops being active. The payload is the route it had. | The routed child, as `leave`. |

`mounted` is where an application starts its work: load data, start timers, listen to the router. A parent that embeds children starts them with `ctx.send`:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

`enter` and `leave` belong to routing. A page loads its data when it is entered and stops its timers when it is left:

```ts
class Tasks extends Component<TasksState> {
  enter() {
    return [store.set("status", "loading")];
  }

  leave() {
    return [store.set("status", "idle")];
  }
}
```

If a component with `routing` has no `mounted` of its own, the default one returns `router.listen("routeChanged")`, and the default `routeChanged` calls `ctx.setRoute`, which stores the route and returns the `leave` and `enter` effects for every routed child the change affects. Deepest children leave first, and new ones enter from the top down. See [Routing](page:concepts-routing).

> [!NOTE] There are no template hooks yet
> A template can not send a message when its nodes appear or disappear. The design notes list this as not built. For now a parent starts a child explicitly with `ctx.send`, and a routed page uses `enter`.

## One instance, shared by every message

A component is created once, `export const todos = new Todos()`, and then handles every message of the application. The core even caches one handler function for each instance. So the instance must hold **no mutable state**. If a handler did `this.count++`, the number would survive between messages, a test could not predict it, and on a server it would be shared by all requests. The state belongs in the store, passed in as the argument.

```ts
class Bad extends Component<{ n: number }> {
  calls = 0;

  inc(_msg: Message, state: { n: number }) {
    this.calls++;
    return [store.set("n", state.n + this.calls)];
  }
}
```

Compare this with the version where everything that changes is in the state. The handler computes the new value from its arguments only.

```ts
class Good extends Component<{ n: number }> {
  inc(_msg: Message, state: { n: number }) {
    return [store.set("n", state.n + 1)];
  }
}
```

Immutable setup is fine. `this` in a handler is the component, so constructor configuration works: `new UsersList(20)` can store a page size. A subclass may override a handler and call `super`. Pavlus does not forbid mutable fields. It is the author's responsibility, as is all purity.

## Handler naming rules

The core looks up a handler by the message id: the method with that name on the instance. These rules decide what counts.

- A message whose id has no method gets an empty list of effects, not an error. A typo in a template is silent, so check the names.
- A handler must return an array. Otherwise the core throws `handler "x" must return an array of effects`, with the handler's name.
- **Names that are never messages:** `view`, `children`, `routing`, `dispatch`, every name that starts with `_`, every `#private` member, and everything an object has by default (`toString`, `constructor`, `hasOwnProperty`...). A message with the id `view` or `_left` never calls anything.
- Use `_name` for helper methods you call from handlers. `this._left(items)` works, and a message `_left` can never reach it.
- A handler may be a class field with a function value. `load: Handler<S> = (msg, state, ctx) => [...]` is found like a method, and gives TypeScript the parameter types.
- A message id with a dot needs a quoted method name: `"users.remove"(msg) { ... }`. This is how a parent observes its children, which the next page shows.

Two messages have a default when nobody handles them. A message whose last part is `navigate` (such as `navigate` or `header.navigate`) with a string payload becomes `router.navigate(url)`. And in a component with `routing`, `mounted` and `routeChanged` do the router wiring. A handler with the same name replaces the default.

## A complete example: a todo component

The last example puts the parts together: a view with a form, a filter and a list; a state with a draft, items and a counter of open tasks; and handlers that keep the derived field `left` correct.

::demo todo

The template reads `draft`, `filter`, `items` and `left`. The checkbox sends `toggle` with the item id, the button sends `remove`, and the filter buttons send `setFilter` with a string. In the demo the first step toggles item 1: the class of the `li`, the `checked` property of the checkbox and the text of the counter change. The second step changes the filter, so the class of the two filter buttons changes and the finished item is cleared from the list.

Here is the component. Notice that there is one place, `_left`, that knows how to count, and that every handler that changes `items` also returns its result.

```ts todos.ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todos.pavlus";

export interface Item {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  draft: string;
  filter: "all" | "open";
  items: Item[];
  nextId: number;
  left: number;
}

export class Todos extends Component<TodoState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.payload)];
  }

  add(_msg: Message, state: TodoState) {
    const text = state.draft.trim();
    if (text === "") return [];
    const items = [...state.items, { id: state.nextId, text, done: false }];
    return [
      store.set("items", items),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
      this._left(items),
    ];
  }

  toggle(msg: Message, state: TodoState) {
    const items = state.items.map((item) =>
      item.id === msg.payload ? { ...item, done: !item.done } : item,
    );
    return [store.set("items", items), this._left(items)];
  }

  remove(msg: Message, state: TodoState) {
    const items = state.items.filter((item) => item.id !== msg.payload);
    return [store.set("items", items), this._left(items)];
  }

  _left(items: Item[]) {
    return store.set("left", items.filter((item) => !item.done).length);
  }
}

export const todos = new Todos();
```

Because the component is pure, its test is short and needs no browser:

```ts todos.test.ts
import assert from "node:assert/strict";
import { toHandler } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { todos, type TodoState } from "./todos.ts";

const handle = toHandler(todos);
const state: TodoState = {
  draft: "Write docs",
  filter: "all",
  items: [],
  nextId: 1,
  left: 0,
};

assert.deepEqual(handle({ id: "add" }, state), [
  store.set("items", [{ id: 1, text: "Write docs", done: false }]),
  store.set("nextId", 2),
  store.set("draft", ""),
  store.set("left", 1),
]);

assert.deepEqual(handle({ id: "add" }, { ...state, draft: "  " }), []);
assert.deepEqual(handle({ id: "_left" }, state), []);
```

The last line shows the naming rule at work: the helper `_left` can not be reached by a message.

## What you learned

- A component is a function or an instance of a class extending `Component`. In a class, each method handles the message with its name. Pass the instance, not the class.
- The state is one tree in the store. Handlers return `store.set`, `merge` or `remove` effects with paths, and the template reads the state by name.
- `view` is the compiled template, `props` are read-only inputs from a parent, and `mounted`, `enter` and `leave` are ordinary messages sent at the right moment.
- The instance is shared by every message, so keep it free of mutable state. Compute derived values in handlers and store them.
- Names that are never messages: `view`, `children`, `routing`, `dispatch`, `_private` and `#private`, and what every object has.

Next: [Messages and child components](page:concepts-messages).
