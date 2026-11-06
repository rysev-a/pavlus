---
summary: How messages carry information and how they find their component. Message ids, payloads and the event field, how a prefix routes a message to a child, how a parent starts and observes its children, dynamic children, the wrappers mapMessage, mapEffects and compose, and a parent with two children from end to end.
---
## What a message is

A message is the input of your application. It is a plain object with up to three fields:

```ts
interface Message {
  id: string;
  payload?: unknown;
  event?: { type: string; value?: string; checked?: boolean; key?: string };
}
```

- **`id`** says what happened. It is also the name of the handler: the message `inc` calls the method `inc`.
- **`payload`** is the data that goes with it. You choose it in the template, or a plugin sets it, for example the reply of an HTTP request.
- **`event`** is a short summary of the browser event, added by the DOM plugin for messages that come from the page. It has the event `type`, and `value`, `checked` and `key` when the target or the event has them. It is data, not the browser event itself, so a message stays serializable and can be logged and replayed.

Messages that come from other plugins have no `event`. A timer sends `{ id: "tick" }` or the `payload` you gave it, and a finished request sends `{ id: "loaded", payload: { status: 200, data } }`.

## Messages in templates

A template does not call functions. An event attribute names a message. The compiler turns it into data, and `diff` can compare handlers by value.

::demo message-ids

Look at the `vnodes` section of the demo (open it). The click on the `li` has `id: "select"` and the payload is the user's id. The click on the button has `id: "remove"` and `"stop": true`, because the modifier `.stop` was written. The `.prevent` modifier works the same way. These are the exact objects that the DOM plugin will turn into messages.

The rule for arguments is simple. With no argument, the message has no payload. With one argument, `select(u.id)`, the argument is the payload. With several, `move(a, b)`, the payload is an array `[a, b]`. The argument is an expression evaluated on the state when the template is rendered, which is why you pass `u.id` and not the whole user: the id is small and stable.

> [!TIP] Put the identity in the payload, the new value in the event
> Use the payload for *which thing* (`remove(note.id)`) and `msg.event.value` for *what the user typed* (`@input=setDraft`). A handler then reads the state for everything else. It never needs the DOM.

## The handler for a message

In a class component, the message `id` is looked up as a method name. The handler receives the message, the state and a context with two functions, and returns an array of effects:

```ts
select(msg: Message, state: UsersState, ctx: ComponentCtx) {
  return [store.set("selectedId", msg.payload)];
}
```

The context has `send(child, id, payload?)`, which asks a child for its effects, and `setRoute(location)`, for routing. Both are pure: they only call other handlers and build data. A message without a handler returns no effects. Names that are never messages, and the default handlers, are listed in [Components and state](page:concepts-components).

## Messages for children

A screen is often made of parts. A dashboard shows a list of users and a list of tasks, and each part has its own state and logic. In pavlus each part is a **child component**, and the parent declares its children once, with a name for each.

**One name ties everything together.** The name `users` appears in three places:

| Where | What the name does |
| --- | --- |
| The template of the parent | `+Users#users(...)` embeds the child's view. `#users` is the instance name. |
| The `children` of the parent class | The key `users` routes the messages `users.*` to the child component. |
| The state | `state.users` is the slice of state that belongs to the child. |

The rule to remember is: `users` in the template, `users` in `children`, `users` in the state.

### The prefix does the routing

A message to a child has the child's name and a dot in front of its id. The parent strips it and passes the rest on:

1. The message `users.select` arrives at the parent.
2. The parent looks for an own handler named `users.select` (more about it below).
3. The id starts with `users.`, and `users` is a child, so the parent calls the child with the message `select`, and with the child's slice of state, `state.users`.
4. The child answers with effects. Its effects are then changed on the way out. A `store.set("selectedId", 2)` becomes `store.set("users.selectedId", 2)`, because the store path is placed under the child's `key`. A reply id such as `onSuccess: "loaded"` becomes `"users.loaded"`, so the answer comes back to the same child.

The fields that carry a reply id are `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` and `onChange`. A plugin that uses these names gets the routing for free.

The other direction is automatic too. The events in the child's template are sent with the prefix: the click in `Users` that says `@click=select(u.id)` arrives at the parent as `users.select`. The child's code never writes the prefix and never knows its own name. **The child does not see the parent.** It sees only its own state, plus the `props` the parent chose to give.

### The parent starts a child

A parent often has to start work in its children when it starts. `ctx.send(name, id, payload?)` returns the child's effects for a message sent to it. It does not dispatch anything. It calls the child's handler, with the right state and prefix, and gives back the effects, so you return them from your own handler:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

The effects have already been rewritten for the child: a `set` of `status` is a `set` of `users.status`, and the HTTP reply id is `users.loaded`. If the name is not a child, `send` throws `no child "name" to send "id" to`.

### The parent observes a child

Before a message is passed to a child, the parent's **own** handler for the same id runs. So a parent can observe what happens in its children, by a method with the full, quoted id:

```ts
"users.select"(msg: Message, state: DashboardState) {
  const user = state.users.items.find((u) => u.id === msg.payload);
  return [store.set("selectedName", user ? user.name : "")];
}
```

Both handlers run for one message. The parent's effects come first in the list, and the child's follow. When the message reaches neither (no own handler and no child), the component falls back to the defaults, such as turning `navigate` into a router effect.

The observation is one-way. The child never knows that the parent looked. If the parent has to *change* the child, it does so through the child's state in the store, or by sending a message with `send`.

## A child chosen by the state

Sometimes the child is not fixed. A page shows a list or a table, and the visitor can switch. A child can be a **value in the state**. In the template, a dynamic embed `+{expr}#name(...)` renders whatever component the expression gives. In the class, `select` picks the same component for the messages, instead of `component`:

```ts
children: Children<PageState> = {
  users: { select: (state) => state.usersComponent, key: "users" },
};
```

```pavlus
div.page
  +{usersComponent}#users(...users filter=filter)
```

When the value in `state.usersComponent` changes, the old DOM is removed and the new template is rendered from scratch. When it stays the same, only the child's `diff` runs. If `select` returns `null` or `undefined`, there is no child at that moment: its messages are ignored, and `ctx.send` to it returns no effects.

Note that the child's state is the slice `state.users`, and it survives a swap. The message that swaps the component should also reset the slice. Also, a component in the state is not JSON, so a serialized history will not show it. Never `store.set` a path *inside* a component value, because the store would copy a class instance as a plain object and lose its prototype.

## Wrappers: mapMessage, mapEffects, compose

Components are functions in the end, `(message, state) => Effect[]`, so you can wrap them. The wrappers return plain functions, which are components too. They are exported from the main package.

```ts
import {
  compose,
  mapEffects,
  mapMessage,
  namespace,
  toHandler,
  withLogging,
} from "@pavlus/frontend";

const counter = toHandler(new Counter());

const renamed = mapMessage(counter, (msg) =>
  msg.id === "bump" ? { ...msg, id: "inc" } : msg.id === "drop" ? null : msg,
);

const quiet = mapEffects(counter, (effects) =>
  effects.filter((effect) => effect.plugin !== "logger"),
);

const twice = compose(counter, counter);

const nested = namespace("c", counter, { key: "k" });

const logged = withLogging(counter, "counter");
```

- `mapMessage(inner, f)` changes the input. `f` gets the message and the state and returns a message, or `null` to drop it. Here `bump` is handled as `inc`, and `drop` is ignored.
- `mapEffects(inner, f)` changes the output. `f` gets the effects, the message and the state, and returns the effects to use. Use it to filter, add or rewrite effects.
- `compose(a, b, ...)` runs all of them on the same message and concatenates their effects. `twice` above returns the `set` effect two times.
- `namespace(prefix, child, { key, props })` is the primitive behind `children`. Only ids that start with `c.` pass, the child sees the rest, and its `store` paths and reply ids are rewritten. If `inc` does `store.set("n", state.n + 1)`, then for `{ id: "c.inc" }` and the state `{ k: { n: 5 } }` the result is `store.set("k.n", 6)`.
- `withLogging(inner, label)` puts a `logger` effect with level `debug` before the effects. For `inc` with one effect it reads `[counter] inc -> 1 effect(s)`, and the data holds the payload and the list of the effects as `plugin.type`.

Because these are functions of functions, they combine with each other and with classes: `compose` accepts a class instance and a function in the same call.

## A parent with two children, end to end

Now the whole picture. A dashboard has a filter input, a list of users and a list of tasks. The users list reads the filter as a prop. The parent loads both lists when it starts, and notes when the users arrive and which user is selected.

The user list is a template and a component. The template reads the fields of the child's state, and the `filter` prop:

```pavlus users.pavlus
ul.users
  for u in items key u.id
    if !filter || u.name.includes(filter)
      li(class:selected={u.id === selectedId} @click=select(u.id)) {u.name}
```

```ts users.ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import view from "./users.pavlus";

export interface User {
  id: number;
  name: string;
}

export interface UsersState {
  status: "idle" | "loading" | "failed";
  items: User[];
  selectedId: number;
  filter?: string;
}

export class Users extends Component<UsersState> {
  view = view;

  load() {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: User[] };
    return [store.set("items", reply.data), store.set("status", "idle")];
  }

  failed() {
    return [store.set("status", "failed")];
  }

  select(msg: Message) {
    return [store.set("selectedId", msg.payload)];
  }
}

export const users = new Users();
```

The tasks list is the same idea, with a checkbox:

```pavlus tasks.pavlus
ul.tasks
  for t in items key t.id
    li(class:done=t.done)
      input(type="checkbox" checked=t.done @change=toggle(t.id))
      span {t.title}
```

```ts tasks.ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import view from "./tasks.pavlus";

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export interface TasksState {
  items: Task[];
}

export class Tasks extends Component<TasksState> {
  view = view;

  load() {
    return [
      http.request({
        id: "tasks",
        url: "/api/tasks",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: Task[] };
    return [store.set("items", reply.data)];
  }

  toggle(msg: Message, state: TasksState) {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [store.set("items", items)];
  }
}

export const tasks = new Tasks();
```

The parent declares both children, in `children`, and embeds both in its template. The demo below uses exactly these child templates. Its three steps change one slice at a time. Look at the ids of the patches: `3/2#2` means node 3 of the child template, inside the embed with the id 2 of the parent, for the list item with the key 2. Each child has its own ids, so the patches never clash.

::demo dashboard

The parent template (the one in the demo) is saved as `dashboard.pavlus`. It follows the rule of the name: `#users` and `#tasks` are the keys of `children` and the fields of the state. Spread `...users` passes the child's slice, and `filter=filter` adds the input. The events of the input belong to the parent and have no prefix, while the events inside the children come out as `users.select` and `tasks.toggle`.

```ts dashboard.ts
import {
  Component,
  type Children,
  type ComponentCtx,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { tasks, type TasksState } from "./tasks.ts";
import { users, type UsersState } from "./users.ts";
import view from "./dashboard.pavlus";

export interface DashboardState {
  filter: string;
  users: UsersState;
  tasks: TasksState;
  selectedName: string;
  usersLoaded: number;
}

export class Dashboard extends Component<DashboardState> {
  view = view;

  children: Children<DashboardState> = {
    users: {
      component: users,
      key: "users",
      props: (state) => ({ filter: state.filter }),
    },
    tasks: { component: tasks, key: "tasks" },
  };

  mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
    return [...send("users", "load"), ...send("tasks", "load")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.event?.value ?? "")];
  }

  "users.select"(msg: Message, state: DashboardState) {
    const user = state.users.items.find((u) => u.id === msg.payload);
    return [store.set("selectedName", user ? user.name : "")];
  }

  "users.loaded"(_msg: Message, state: DashboardState) {
    return [store.set("usersLoaded", state.usersLoaded + 1)];
  }
}

export const dashboard = new Dashboard();
```

With a fake HTTP plugin that answers at once, the run, message by message, is:

```text
mounted       -> store.set, http.request, http.request
users.loaded  -> store.set, store.set, store.set
tasks.loaded  -> store.set
```

The message `mounted` is handled by the parent. It returns the `set` of `users.status` and the two requests, already prefixed for their children. Then the two replies arrive as `users.loaded` and `tasks.loaded`, each one in its own turn. For `users.loaded` the parent's own handler runs first, one `set` for `usersLoaded`, and the child's `loaded` follows with two more. All three `set` effects are in the same step. Neither child knows about the other.

> [!WARNING] Keep the three names equal
> If the key in `children` is `users` but the template says `#user`, the click arrives as `user.select`, no child has that name, and the message does nothing. There is no error, because a message nobody handles is not an error. When a child seems dead, compare the three names first.

## What you learned

- A message is `{ id, payload?, event? }`. The template creates id and payload, the DOM plugin adds `event`, and one argument is the payload while several make an array.
- The same name ties the template embed (`#users`), the `children` key and the state slice. The prefix `users.` routes a message to the child, which sees it without the prefix.
- The child's effects are rewritten on the way out: store paths get the `key`, reply ids get the prefix. The child never sees its parent.
- A parent starts a child with `ctx.send` and observes it with a quoted handler such as `"users.select"`, which runs before the child. A child chosen with `select` that returns `null` is ignored.
- `mapMessage`, `mapEffects`, `compose`, `namespace` and `withLogging` wrap components, and return functions.

Next: [Routing](page:concepts-routing).
