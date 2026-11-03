---
summary: Build a running counter and then a small notes list with an input, from an empty folder. Then follow one click through the framework, message by message, and see the patches it produces.
---
## What you will build

You will build two small programs. The first is a counter: a paragraph and a button. The second is a list of notes with a text input. Together they use every part of a pavlus application: a template, a component class with handlers, a store for the state, and a DOM plugin that shows the result and listens for events.

At the end you will follow a single click through the framework, one message at a time, and see exactly what it changes in the page.

You need Node.js and a package manager. The code is TypeScript, but nothing below needs more than basic types.

## Set up the project

A pavlus project is a normal [Vite](https://vite.dev) project with one extra plugin. The plugin compiles every `.pavlus` file into JavaScript when you import it. Start with a `package.json`. The framework is the package `@service-laboratory/pavlus`.

```json package.json
{
  "name": "counter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "^8.3.5"
  }
}
```

The Vite configuration adds the pavlus plugin. It has one optional setting, `runtime`, which changes where compiled templates import their small helper functions from. You do not need it now.

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default { plugins: [pavlus()] };
```

The page is an empty element that the application will fill, and one script.

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

TypeScript needs to know what `import view from "./counter.pavlus"` returns. One declaration file does that. The framework ships it.

```ts env.d.ts
/// <reference types="@service-laboratory/pavlus/env" />
```

## The first template

Create `counter.pavlus`. A template is an indented tree of elements. `{count}` is an expression that reads the field `count` of the state. `@click=inc` says that a click on the button sends the message with the id `inc`.

```pavlus counter.pavlus
div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me
```

Notice what is not here. There is no function that runs on click. The template only names a message. What happens for that message is decided somewhere else, in code you can test by itself.

## The component

Create `counter.ts`. A component is a class that extends `Component`. Its field `view` is the template. Every other method is the **handler** of the message with the same name, so the method `inc` handles the message `inc`.

A handler receives the message and the current state. It returns a list of effects. This one returns a single effect, built by the store plugin's helper `store.set`: "set the field `count` to the old value plus one".

```ts counter.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./counter.pavlus";

export interface CounterState {
  count: number;
}

export class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }
}

export const counter = new Counter();
```

> [!TIP] Annotate the parameters
> TypeScript does not infer the types of the parameters of class methods. Write `msg: Message` and your state type yourself. The first parameter is often unused, so name it `_msg`.

## Start the application

Create `main.ts`. `createApp` connects the component to its plugins. You need two plugins now. The **store** plugin holds the state and starts with the object you give it. The **DOM** plugin renders views and turns browser events into messages. The option `mount` names the element to render into.

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { counter, type CounterState } from "./counter.ts";

createApp<CounterState>({
  app: counter,
  plugins: [createStorePlugin<CounterState>({ count: 0 }), createDomPlugin()],
  mount: "#app",
});
```

Run `npx vite`, open the address it prints, and click the button. The number goes up. Here is the same template as a live demo, with the two patches the compiler's `diff` returns for the first two clicks:

::demo counter

Each click produces exactly one patch, of the kind `text`. It names the node by its id and gives the new text. Nothing else in the page is touched, because nothing else reads `count`.

> [!NOTE] Where the state comes from
> The first state is the object you pass to `createStorePlugin`. Every field that a template reads must be in it, or the template will read `undefined`. The store holds a plain object, and the handlers never change it. They return `set` effects and the store makes a new object.

## Follow one click

Now the promised tour. Here is everything that happens, in order, from the click to the changed text. Each line is a real step of `createApp`.

1. **Start.** `createApp` initializes the plugins, renders the view into `#app` and dispatches the message `{ id: "mounted" }`. The counter has no `mounted` handler, so it returns no effects.
2. **The click.** The DOM plugin put one listener on the button. It reads the message the template gave this button, `{ id: "inc" }`, adds a summary of the browser event, and dispatches `{ id: "inc", event: { type: "click", value: "" } }`. The `value` is the value property of the button, an empty string.
3. **The queue.** The core puts the message in its queue. Messages are processed one at a time.
4. **The handler.** The core calls your code with the message and the current state `{ count: 0 }`. The method `inc` returns `[{ plugin: "store", type: "set", path: "count", value: 1 }]`.
5. **The effect.** The core hands that effect to the plugin named in it, `store`. The store builds a new state `{ count: 1 }`.
6. **The state changed.** The core reads the state again. It is a different object, so every plugin gets `onState(next)`.
7. **The diff.** The DOM plugin calls `diff(prev, next)` of the view. The result is one patch, `{ op: "text", id: "2", text: "Clicked 1 times" }`, and the plugin sets that text on the node with the id `2`.

The whole chain is plain data in the middle: a message, a list of effects, a list of patches. You can print any of them.

## A list with an input

The second program needs more of the language. It has a text input, a form that adds a note, and a list with a button to remove each note. It also needs more state: the text being typed, the notes, and a counter that gives each note an id.

::demo notes-list

Save this template as `notes.pavlus` (the demo shows its source). Read it from the top. `input(value=draft ... @input=setDraft)` shows the field `draft` and sends `setDraft` on every keystroke. `form(@submit.prevent=add)` sends `add` when the form is submitted, and `.prevent` stops the browser from reloading the page. The loop `for note in notes key note.id` repeats the `li`, and the `key` lets `diff` tell which note is which when the list changes. `@click=remove(note.id)` sends the message `remove` with the note's id as the **payload**.

The component follows the template, one handler per message:

```ts notes.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./notes.pavlus";

export interface Note {
  id: number;
  text: string;
}

export interface NotesState {
  draft: string;
  notes: Note[];
  nextId: number;
}

export class Notes extends Component<NotesState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: NotesState) {
    const text = state.draft.trim();
    if (text === "") return [];
    return [
      store.set("notes", [...state.notes, { id: state.nextId, text }]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  remove(msg: Message, state: NotesState) {
    return [
      store.set(
        "notes",
        state.notes.filter((note) => note.id !== msg.payload),
      ),
    ];
  }
}

export const notes = new Notes();
```

Three things are worth a closer look:

- `setDraft` reads `msg.event?.value`. The DOM plugin attaches `event` to every message that comes from the page, and for an input `value` is the text it holds now.
- `add` returns three effects. They are applied in this order. When the text is empty it returns an empty list, which means "nothing should happen".
- `remove` reads the id from `msg.payload`. The template wrote `remove(note.id)`, and one argument becomes the payload.

The `main.ts` is the same as before, with `app: notes` and the initial state `{ draft: "", notes: [], nextId: 1 }`.

## What one keystroke and one submit do

With the notes program running, the same seven steps repeat for each message, but the patches are richer. The three steps of the demo above show them.

- **Typing.** The message is `{ id: "setDraft", event: { type: "input", value: "Call Ann" } }`. The handler returns one `set` for `draft`. The only patch is an `attr` patch for the `value` of the input. The list and the count are not touched.
- **Submit.** The message is `{ id: "add", event: { type: "submit" } }`. Three `set` effects run, in order, and then the plugins are told about the new state once. The patches: `value` of the input goes back to an empty string, one `insert` adds the new note, and a `text` patch updates the count.
- **Remove.** The message is `{ id: "remove", payload: 1, event: { type: "click", value: "" } }`. One `remove` patch takes the note out, and the count changes.

The patches are produced by `diff` from the state alone. The component never says "insert a node". It says what the state should be, and the compiled template works out the DOM changes.

> [!WARNING] Never change the state in place
> Do not write `state.notes.push(note)` in a handler. The store gives you the current state to read. `diff` decides that something changed by comparing with `===`, so a mutated array looks unchanged and the screen would not update. Always return a new array, as `add` does with `[...state.notes, ...]`.

## What you learned

- A pavlus project is a Vite project with the `pavlus()` plugin, an `index.html`, an `env.d.ts`, a template, a component class and a `createApp` call.
- A template names messages (`@click=inc`). A component class handles them with one method per message, and returns effects such as `store.set(path, value)`.
- `createApp` takes a component and plugins. The store holds the state, the DOM plugin shows the view and reports events as messages with an `event` field.
- One click is: message, handler, effects, store, new state, `diff`, patches, DOM. The middle parts are plain data you can print.
- Handlers must never mutate the state. They return new values.

Next: [Elements, text and attributes](page:syntax-elements).
