---
summary: Baue eine komplette kleine Anwendung in fünf lauffähigen Schritten - eine Todo-Liste mit Hinzufügen, Abhaken, Entfernen und einem Filter, gespeichert von deinem eigenen Plugin, mit einer zweiten Seite hinter einer Route - und sieh jede Datei, mit Tests.
---
## Was wir bauen

Eine Todo-Liste. Du tippst einen Titel und drückst Enter, hakst ein Todo ab, entfernst es und filterst die Liste nach Alle, Aktiv und Erledigt. Die Liste liegt in `localStorage`, ist also nach einem Neuladen noch da. Eine zweite Seite, About, liegt hinter einer eigenen Adresse, und die obere Leiste verlinkt die beiden.

Die Anleitung hat fünf Schritte. Jeder Schritt endet mit einer Anwendung, die läuft: Du kannst sie mit `npm run dev` starten und durchklicken. Jeder Schritt fügt eine Idee hinzu.

| Schritt | Was hinzukommt | Idee |
| --- | --- | --- |
| 0 | Das Projekt | Ein Vite-Projekt mit dem pavlus-Plugin |
| 1 | Eine Liste aus dem State | Templates, State, eine Komponente |
| 2 | Hinzufügen, abhaken, entfernen | Events sind Messages, handler geben Effekte zurück |
| 3 | Ein Filter | Abgeleiteter State, im handler berechnet |
| 4 | Speichern | Dein eigenes Plugin, Antworten als Messages |
| 5 | Eine zweite Seite | Routing, `enter`, eine Shell |

Die Dateien am Ende:

```text
todo/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    env.d.ts
    main.ts          creates the app and its plugins
    app.ts           the shell: the routing table
    app.pavlus       the shell's template: a top bar and an outlet
    todos.ts         the todo page: state, handlers
    todos.pavlus     the todo page's template
    about.pavlus     a page that is only a template
    not-found.pavlus another one
    storage.ts       the plugin that talks to localStorage
    todos.test.ts    tests of the handlers
    app.test.ts      a test of the whole app
```

## Schritt 0: das Projekt

Du brauchst einen Ordner, eine `package.json`, eine Vite-Konfiguration mit dem pavlus-Plugin und eine `index.html` mit einem Element zum Mounten. In diesem Repository ist `@service-laboratory/pavlus` das Workspace-Paket `framework`, darum ist seine Version `*`.

```json package.json
{
  "name": "todo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "jsdom": "^30.1.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

Die Vite-Konfiguration hat zwei Zeilen, auf die es ankommt. Das Plugin `pavlus()` kompiliert jede `*.pavlus`-Datei zu einem Modul mit `render` und `diff`. Die Einstellung `environment: "jsdom"` ist für die Tests, die ein DOM brauchen.

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default {
  plugins: [pavlus()],
  test: { environment: "jsdom" },
};
```

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Todo</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Die Datei `src/env.d.ts` sagt TypeScript zwei Dinge: was `import view from "./page.pavlus"` zurückgibt und welche Typen Vite selbst hat. Ohne sie bekommst du `Cannot find module './todos.pavlus'`.

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@service-laboratory/pavlus/env" />
```

```json tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src","ov"]
}
```

## Schritt 1: eine Liste aus dem State

Die erste Version zeigt zwei Todos aus dem State. Sie hat ein Template, eine Komponente, der das Template gehört, und eine `main.ts`, die die Anwendung startet.

Das Template ist eine Überschrift und eine Liste. `for todo in items key todo.id` wiederholt die Zeile darunter für jedes Element; `key` sagt, welches Feld ein Element identifiziert, damit das Hinzufügen oder Entfernen eines Elements nur dieses Element berührt. `class:done=todo.done` setzt die Klasse `done`, wenn das Feld true ist.

::demo list

Die Demo ist das echte Template mit dem echten State. Im ersten Schritt siehst du ein insert: Ein neues Element wird vor dem End-Marker der Liste eingefügt, und sonst wird nichts auf der Seite berührt. Im zweiten Schritt hat sich die Klasse eines Elements geändert, und das ist ein einziger Attribut-Patch.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}
```

Eine Komponente ist eine Klasse, die `Component` erweitert. Sie benennt ihr Template mit `view`. Sie hat noch keine handler.

```ts src/todos.ts
import { Component } from "@service-laboratory/pavlus";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export interface TodosState {
  items: Todo[];
}

export const initialTodos: TodosState = {
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
};

export class Todos extends Component<TodosState> {
  view = view;
}

export const todos = new Todos();
```

`main.ts` erzeugt die Anwendung. Das **store**-Plugin hält den State und startet mit `initialTodos`; das **dom**-Plugin rendert. `mount: "#app"` rendert die view der Komponente in das Element.

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [createStorePlugin(initialTodos), createDomPlugin()],
  mount: "#app",
});
```

Starte `npm run dev`. Du siehst die Überschrift und zwei Todos; das zweite hat die Klasse `done`, ein Stylesheet könnte es also durchstreichen.

## Schritt 2: hinzufügen, abhaken, entfernen

Jetzt reagiert die Anwendung. Füge dem Template ein Formular, eine Checkbox und einen Button hinzu. Sieh dir die Events an.

::demo form

`@input=typing` ist kein Funktionsaufruf. Es ist die Message `typing`, und das DOM-Plugin fügt den Text des Eingabefelds als `msg.event.value` hinzu. `@change=toggle(todo.id)` ist die Message `toggle` mit dem payload `todo.id`. `@submit.prevent=add` hindert den Browser daran, die Seite neu zu laden, und sendet `add`. Der erste Schritt der Demo zeigt den Entwurf im Eingabefeld: Das Template liest `value=draft`, und das diff ist ein einziger Attribut-Patch.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  form.todos__add(@submit.prevent=add)
    input(type="text" placeholder="What needs to be done?" value=draft @input=typing)
    button(type="submit") Add
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done)
        input(type="checkbox" checked={todo.done} @change=toggle(todo.id))
        span {todo.title}
        button(type="button" @click=remove(todo.id)) Remove
```

Jede Message ist eine Methode der Komponente mit demselben Namen. Eine Methode nimmt die Message und den State und gibt **Effekte** zurück. Sie ändert nichts: `store.set("draft", "")` ist ein Objekt, das das Store-Plugin bittet, es zu tun.

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export interface TodosState {
  items: Todo[];
  draft: string;
  nextId: number;
}

export const initialTodos: TodosState = {
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
  draft: "",
  nextId: 3,
};

export class Todos extends Component<TodosState> {
  view = view;

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    return [
      store.set("items", [
        ...state.items,
        { id: state.nextId, title, done: false },
      ]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    return [
      store.set(
        "items",
        state.items.map((t) =>
          t.id === msg.payload ? { ...t, done: !t.done } : t,
        ),
      ),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    return [
      store.set(
        "items",
        state.items.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}

export const todos = new Todos();
```

Vier Details dieser Datei sind Absicht.

- **Keine Mutation.** `add` macht kein `push` in `state.items`; es baut mit einem Spread ein neues Array. Das kompilierte `diff` vergleicht mit `===`, und ein mutiertes Array ist dasselbe Array.
- **Keine Uhr und kein Zufall.** Die id des neuen Todos kommt aus `nextId`, einem Zähler im State. `Date.now()` oder `Math.random()` in einem handler würde ihn unrein machen, und der Test unten könnte nicht mehr sagen, was er zurückgibt.
- **Nur Daten kreuzen.** Der handler liest `state`, den State vor der Message, und `msg`. Er liest nicht das DOM.
- **Ein leerer Entwurf gibt `[]` zurück.** Keine Effekte zurückzugeben ist eine gültige Antwort. Es ist auch die Antwort auf eine Message, die niemand behandelt, weshalb ein Tippfehler in einem Event-Namen still bleibt. Die [Seite zur Fehlersuche](page:guide-troubleshooting) zeigt, wie du ihn findest.

handler sind rein, der Test braucht also keinen Browser. Er ruft die Komponente als Funktion auf und wendet die `store`-Effekte auf eine Kopie des States an. Dieser Helfer (`send`) ist klein, und er macht die Tests unabhängig von der genauen Liste der Effekte, sodass sie gültig bleiben, wenn spätere Schritte sie ändern.

```ts src/todos.test.ts
import { type Message, toHandler } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { initialTodos, todos, type TodosState } from "./todos.ts";

/** Runs one message and returns the state after its store effects. */
function send(state: TodosState, message: Message): TodosState {
  const store = createStorePlugin(state);
  const ctx = {
    dispatch() {},
    getState: () => store.getState(),
    dispatchEffect() {},
  };
  for (const effect of toHandler(todos)(message, state)) {
    if (effect.plugin === "store") store.handle(effect as never, ctx);
  }
  return store.getState();
}

test("add turns the draft into a todo and clears the draft", () => {
  const next = send({ ...initialTodos, draft: " Pay rent " }, { id: "add" });
  expect(next.items.at(-1)).toEqual({ id: 3, title: "Pay rent", done: false });
  expect(next.draft).toBe("");
  expect(next.nextId).toBe(4);
});

test("an empty draft adds nothing", () => {
  const next = send({ ...initialTodos, draft: "  " }, { id: "add" });
  expect(next.items).toEqual(initialTodos.items);
});

test("toggle flips one todo and remove drops it", () => {
  const toggled = send(initialTodos, { id: "toggle", payload: 1 });
  expect(toggled.items.map((t) => t.done)).toEqual([true, true]);
  const removed = send(initialTodos, { id: "remove", payload: 1 });
  expect(removed.items.map((t) => t.title)).toEqual(["Write the docs"]);
});
```

Starte `npm test`.

## Schritt 3: ein Filter

Der Filter zeigt Alle, Aktive oder Erledigte. Ein Template kann eine Liste nicht filtern: Es hat keine Pfeilfunktionen und keine Aufrufe mit Callbacks. Das ist keine Lücke, sondern Absicht. Ein Wert, der von anderen Werten abhängt, wird **einmal im handler berechnet und gespeichert**. Das Template zeigt ihn dann nur an.

Wir fügen dem State drei Felder hinzu: `filter`, `visible` (die Liste, die gezeigt wird) und `left` (die Anzahl der aktiven Todos). Eine Funktion `show(items, filter)` gibt die vier `store.set`-Effekte zurück, die sie konsistent halten, und jeder handler, der die Liste ändert, ruft sie auf.

::demo filters

Die Wahl von Done entfernt das erste Element aus dem DOM (ein `remove`-Patch, ein Bereich zwischen den Markern des Elements), verschiebt die Klasse `active` von einem Button zum anderen und tut für den Zähler nichts, weil sich `left` nicht geändert hat. Das erzeugte `diff` hat `prev.left` und `next.left` verglichen und den Text übersprungen.

Das Template liest `visible` statt `items` und hat den Zähler und die Buttons:

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  form.todos__add(@submit.prevent=add)
    input(type="text" placeholder="What needs to be done?" value=draft @input=typing)
    button(type="submit") Add
  ul.todos__list
    for todo in visible key todo.id
      li(class:done=todo.done)
        input(type="checkbox" checked={todo.done} @change=toggle(todo.id))
        span {todo.title}
        button(type="button" @click=remove(todo.id)) Remove
  p.todos__left {left} left
  div.todos__filters
    button(type="button" class:active={filter === "all"} @click=setFilter("all")) All
    button(type="button" class:active={filter === "active"} @click=setFilter("active")) Active
    button(type="button" class:active={filter === "done"} @click=setFilter("done")) Done
```

Der State, die Funktion `show` und der Anfangs-State:

```ts src/todos.ts
export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

const items: Todo[] = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write the docs", done: true },
];

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export const initialTodos: TodosState = {
  items,
  filter: "all",
  draft: "",
  nextId: 3,
  visible: items,
  left: 1,
};
```

Und die handler, die sich geändert haben. `add`, `toggle` und `remove` enden mit `show(...)`, und `setFilter` ist neu:

```ts src/todos.ts
  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return show(items, state.filter);
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return show(items, state.filter);
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }
```

Füge `todos.test.ts` einen weiteren Test hinzu:

```ts src/todos.test.ts
test("the filter decides what is visible and how many are left", () => {
  const next = send(initialTodos, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});
```

> [!TIP] Halte abgeleiteten State in einer Funktion
> Würde `visible` an drei Stellen aktualisiert, würde früher oder später eine vergessen. Ein einziges `show` sorgt dafür, dass sich die Liste und alles, was von ihr abhängt, zusammen ändern, in einer Message, sodass die Seite nie einen halb aktualisierten State zeigt.

## Schritt 4: speichern, mit deinem eigenen Plugin

Eine Seite, die beim Neuladen alles vergisst, ist nicht nützlich. Speichern braucht `localStorage`, das ein handler nicht berühren darf. Das Werkzeug für die Außenwelt ist ein **Plugin**. Das Framework hat keins für Storage, also schreiben wir eines. Es ist kurz, und die Seite [Eigene Plugins schreiben](page:plugins-custom) erklärt jede Zeile.

Das Plugin hat zwei Effekte, `load` und `save`. `load` antwortet mit einer Message, `save` nicht:

```ts src/storage.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type StorageEffect =
  | {
      plugin: "storage";
      type: "load";
      key: string;
      onSuccess: string;
      onError: string;
    }
  | {
      plugin: "storage";
      type: "save";
      key: string;
      value: unknown;
      onError?: string;
    };

export const storageEffector = {
  load: (key: string, onSuccess: string, onError: string): StorageEffect => ({
    plugin: "storage",
    type: "load",
    key,
    onSuccess,
    onError,
  }),
  save: (key: string, value: unknown, onError?: string): StorageEffect => ({
    plugin: "storage",
    type: "save",
    key,
    value,
    ...(onError !== undefined && { onError }),
  }),
};

export interface StorageOptions {
  /** Defaults to `localStorage`; replace it in tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export function createStoragePlugin(
  opts: StorageOptions = {},
): Plugin<StorageEffect> {
  return {
    name: "storage",
    handle(effect, ctx) {
      const storage = opts.storage ?? localStorage;
      try {
        if (effect.type === "load") {
          const text = storage.getItem(effect.key);
          ctx.dispatch({
            id: effect.onSuccess,
            payload: text === null ? null : JSON.parse(text),
          });
        } else {
          storage.setItem(effect.key, JSON.stringify(effect.value));
        }
      } catch (error) {
        if (effect.onError) {
          ctx.dispatch({ id: effect.onError, payload: String(error) });
        }
      }
    },
  };
}
```

Die Komponente nutzt es an drei Stellen. Wenn die Anwendung startet, fragt die Message `mounted` (gesendet von `createApp({ mount })`) nach der gespeicherten Liste. Wenn sich die Liste ändert, fügt der handler einen Effekt `storage.save` hinzu. Und zwei kleine handler empfangen die Antworten.

Der Anfangs-State ist jetzt leer, weil die echte Liste aus dem Storage kommt. Hier ist die ganze Datei in ihrer Form für diesen Schritt, mit `mounted`:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { storageEffector as storage } from "./storage.ts";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

export const initialTodos: TodosState = {
  items: [],
  filter: "all",
  draft: "",
  nextId: 1,
  visible: [],
  left: 0,
};

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export class Todos extends Component<TodosState> {
  view = view;

  mounted(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }

  loaded(msg: Message, state: TodosState): Effect[] {
    const items = Array.isArray(msg.payload) ? (msg.payload as Todo[]) : [];
    const nextId = items.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    return [store.set("nextId", nextId), ...show(items, state.filter)];
  }

  loadFailed(msg: Message): Effect[] {
    return [log.warn("could not load the todos", msg.payload)];
  }

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }

  saveFailed(msg: Message): Effect[] {
    return [log.warn("could not save the todos", msg.payload)];
  }
}

export const todos = new Todos();
```

Sieh dir `loaded` an. Es erhält `null`, wenn nichts gespeichert ist, und behandelt das als leere Liste. Es berechnet außerdem `nextId` aus den gespeicherten ids, sodass ein neues Todo nie eine id wiederverwendet. Und sieh dir den Ablauf eines Klicks auf eine Checkbox an:

1. Das DOM-Plugin sendet `toggle` mit dem payload `3`.
2. `toggle` gibt die vier `store.set`-Effekte von `show(...)` und einen Effekt `storage.save` zurück.
3. Das Store-Plugin ändert den State; das DOM-Plugin patcht die Seite; das Storage-Plugin schreibt das JSON.

Weil der Anfangs-State jetzt leer ist, brauchen die handler-Tests einen eigenen Beispiel-State. Das ist die ganze `todos.test.ts` für diesen Schritt. Sie fügt einen Test für den Start der App und einen für `loaded` hinzu:

```ts src/todos.test.ts
import { type Message, toHandler } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { storageEffector as storage } from "./storage.ts";
import { initialTodos, todos, type TodosState } from "./todos.ts";

/** Runs one message and returns the state after its store effects. */
function send(state: TodosState, message: Message): TodosState {
  const store = createStorePlugin(state);
  const ctx = {
    dispatch() {},
    getState: () => store.getState(),
    dispatchEffect() {},
  };
  for (const effect of toHandler(todos)(message, state)) {
    if (effect.plugin === "store") store.handle(effect as never, ctx);
  }
  return store.getState();
}

const sample: TodosState = {
  ...initialTodos,
  items: [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Write the docs", done: true },
  ],
  nextId: 3,
};

test("add turns the draft into a todo and clears the draft", () => {
  const next = send({ ...sample, draft: " Pay rent " }, { id: "add" });
  expect(next.items.at(-1)).toEqual({ id: 3, title: "Pay rent", done: false });
  expect(next.draft).toBe("");
  expect(next.nextId).toBe(4);
});

test("an empty draft adds nothing", () => {
  const next = send({ ...sample, draft: "  " }, { id: "add" });
  expect(next.items).toEqual(sample.items);
});

test("toggle flips one todo and remove drops it", () => {
  const toggled = send(sample, { id: "toggle", payload: 1 });
  expect(toggled.items.map((t) => t.done)).toEqual([true, true]);
  const removed = send(sample, { id: "remove", payload: 1 });
  expect(removed.items.map((t) => t.title)).toEqual(["Write the docs"]);
});

test("the filter decides what is visible and how many are left", () => {
  const next = send(sample, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});

test("starting the app asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "mounted" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});

test("loaded puts the saved list into the state", () => {
  const saved = [{ id: 7, title: "Saved", done: false }];
  const next = send(sample, { id: "loaded", payload: saved });
  expect(next.items).toEqual(saved);
  expect(next.nextId).toBe(8);
});
```

`main.ts` registriert die zwei neuen Plugins. Der Logger gibt die Warnungen aus, die `loadFailed` und `saveFailed` zurückgeben:

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createLoggerPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [
    createStorePlugin(initialTodos),
    createDomPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

Um das Speichern ohne echten Storage zu testen, gib dem Plugin ein Objekt mit `getItem` und `setItem`. Der Test mountet die echte Anwendung mit dem echten DOM-Plugin in jsdom, prüft also auch das Template:

```ts src/persistence.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

function start(saved: Record<string, string>) {
  document.body.innerHTML = '<div id="app"></div>';
  const storage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (saved[key] = value),
  };
  return createApp({
    app: todos,
    plugins: [
      createStorePlugin(initialTodos),
      createDomPlugin(),
      createStoragePlugin({ storage }),
    ],
    mount: "#app",
  });
}
const titles = () =>
  [...document.querySelectorAll("li span")].map((s) => s.textContent);

test("the saved list is loaded when the app starts", () => {
  const app = start({
    todos: JSON.stringify([{ id: 4, title: "Saved", done: false }]),
  });
  expect(titles()).toEqual(["Saved"]);
  app.dispose();
});

test("a change is saved", () => {
  const saved: Record<string, string> = {};
  const app = start(saved);
  const input = document.querySelector("input[type=text]") as HTMLInputElement;
  input.value = "Pay rent";
  input.dispatchEvent(new Event("input"));
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  expect(titles()).toEqual(["Pay rent"]);
  expect(JSON.parse(saved.todos)).toEqual([
    { id: 1, title: "Pay rent", done: false },
  ]);
  app.dispose();
});
```

## Schritt 5: eine zweite Seite

Der letzte Schritt gibt jeder Seite eine Adresse. Wir brauchen eine **Shell**: eine Komponente, deren Template eine obere Leiste und einen Platz für die aktuelle Seite hat und deren `routing`-Tabelle sagt, welche Seite unter welchem Pfad liegt. Die Todo-Liste wird eine Seite der Shell und ändert sich überhaupt nicht, bis auf ein Wort.

Das Template der Shell ist eine Link-Leiste und ein outlet:

::demo nav

```pavlus src/app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
    a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About
  main.app__main
    +outlet
```

Jeder Link ist ein echter Link mit einem echten `href` und einem Klick-handler, der die Navigation des Browsers abbricht und `navigate` sendet. Niemand behandelt `navigate`, also tut das Framework den Standard: Es macht aus der Message den Effekt `router.navigate("/about")`. Die Klasse `active` folgt `route.path`; die Demo zeigt, dass der Wechsel von `/` zu `/about` zwei Klassen-Patches sind.

Zwei Seiten sind nur Templates:

```pavlus src/about.pavlus
section.about
  h1 About
  p A todo list written with pavlus. The list is kept in localStorage.
  a(href="/" @click.prevent=navigate("/")) Back to the list
```

```pavlus src/not-found.pavlus
section.not-found
  h1 Not found
  a(href="/" @click.prevent=navigate("/")) Go to the list
```

Die Shell-Komponente ist die Routing-Tabelle:

```ts src/app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import aboutView from "./about.pavlus";
import view from "./app.pavlus";
import notFoundView from "./not-found.pavlus";
import { initialTodos, todos, type TodosState } from "./todos.ts";

export interface AppState {
  route: Route | null;
  todos: TodosState;
}

export const initialState: AppState = { route: null, todos: initialTodos };

export class AppShell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = {
    "/": { component: todos, key: "todos", name: "todos" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}

export const app = new AppShell();
```

In dieser Datei stecken drei Dinge.

- Die Todo-Seite liegt bei `/` mit `key: "todos"`. Dieser key bedeutet, dass die Seite `state.todos` sieht und ihr `store.set("items", ...)` bei `todos.items` landet. Deshalb musste sich die Seite nicht ändern: Sie wusste nie, wo ihr State liegt. Der State der Anwendung ist jetzt `{ route, todos }`.
- `name: "todos"` ist das Message-Präfix. Die Events der Seite erreichen die Shell als `todos.add`, `todos.toggle`, und die Antworten ihrer Effekte kommen mit demselben Präfix zurück, sodass `loaded` bei der Seite als `loaded` ankommt.
- `/about` und `"*"` sind Seiten nur mit view. Die Standard-handler `routeChanged` und `mounted` der Shell erledigen die ganze Router-Verdrahtung.

Die Seite ändert sich um ein Wort. Eine geroutete Seite ist nicht die Wurzel der Anwendung, sie bekommt also kein `mounted`. Sie bekommt `enter`, wenn ihre Route aktiv wird, und das ist auch der richtige Zeitpunkt, die Liste erneut zu laden, wenn der Besucher von About zurückkommt:

```ts src/todos.ts
  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }
```

`main.ts` fügt das Router-Plugin hinzu und startet mit dem neuen State:

```ts src/main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app, type AppState, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

createApp<AppState>({
  app,
  plugins: [
    createStorePlugin(initialState),
    createDomPlugin(),
    createRouterPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

In den Tests der handler ändert sich ein Test, weil die Seite jetzt `enter` statt `mounted` bekommt:

```ts src/todos.test.ts
test("entering the page asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "enter" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});
```

Ein neuer Test steuert die ganze Anwendung, einschließlich des Routers und des About-Links:

```ts src/app.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { app, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

function start(saved: Record<string, string> = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", "/");
  const storage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (saved[key] = value),
  };
  const running = createApp({
    app,
    plugins: [
      createStorePlugin(initialState),
      createDomPlugin(),
      createRouterPlugin(),
      createStoragePlugin({ storage }),
    ],
    mount: "#app",
  });
  return { running, saved };
}

const titles = () =>
  [...document.querySelectorAll(".todos__list span")].map((s) => s.textContent);

test("add a todo, tick it, filter, and it is saved", () => {
  const { running, saved } = start();
  const input = document.querySelector("input[type=text]") as HTMLInputElement;
  input.value = "Buy milk";
  input.dispatchEvent(new Event("input"));
  (document.querySelector("form") as HTMLFormElement).dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
  expect(titles()).toEqual(["Buy milk"]);
  expect(JSON.parse(saved.todos)).toEqual([
    { id: 1, title: "Buy milk", done: false },
  ]);
  (
    document.querySelector("li input[type=checkbox]") as HTMLInputElement
  ).click();
  expect(document.querySelector(".todos__left")!.textContent).toBe("0 left");
  running.dispatch({ id: "todos.setFilter", payload: "active" });
  expect(titles()).toEqual([]);
  running.dispose();
});

test("the saved list is loaded when the page is entered", () => {
  const { running } = start({
    todos: JSON.stringify([{ id: 7, title: "Saved", done: false }]),
  });
  expect(titles()).toEqual(["Saved"]);
  running.dispose();
});

test("the About link changes the page", () => {
  const { running } = start();
  (document.querySelectorAll(".app__nav a")[1] as HTMLElement).click();
  expect(location.pathname).toBe("/about");
  expect(document.querySelector("h1")!.textContent).toBe("About");
  expect(document.querySelectorAll(".app__nav a.active")).toHaveLength(1);
  running.dispose();
});
```

Der erste Test dispatcht `todos.setFilter` an die Wurzel: Das Präfix `todos.` schickt es an die Seite. Der zweite zeigt die Seite, die beim Start betreten wird: Die gespeicherte Liste ist ohne jeden Klick da. Der dritte klickt den Link.

Und die endgültige Version der Todo-Komponente, wie sie am Ende der Anleitung steht:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { storageEffector as storage } from "./storage.ts";
import view from "./todos.pavlus";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export type Filter = "all" | "active" | "done";

export interface TodosState {
  items: Todo[];
  filter: Filter;
  draft: string;
  nextId: number;
  visible: Todo[];
  left: number;
}

export const initialTodos: TodosState = {
  items: [],
  filter: "all",
  draft: "",
  nextId: 1,
  visible: [],
  left: 0,
};

/** The effects that set the list and everything derived from it. */
export function show(items: Todo[], filter: Filter): Effect[] {
  const visible = items.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return [
    store.set("items", items),
    store.set("filter", filter),
    store.set("visible", visible),
    store.set("left", items.filter((t) => !t.done).length),
  ];
}

export class Todos extends Component<TodosState> {
  view = view;

  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }

  loaded(msg: Message, state: TodosState): Effect[] {
    const items = Array.isArray(msg.payload) ? (msg.payload as Todo[]) : [];
    const nextId = items.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    return [store.set("nextId", nextId), ...show(items, state.filter)];
  }

  loadFailed(msg: Message): Effect[] {
    return [log.warn("could not load the todos", msg.payload)];
  }

  typing(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: TodosState): Effect[] {
    const title = state.draft.trim();
    if (!title) return [];
    const items = [...state.items, { id: state.nextId, title, done: false }];
    return [
      store.set("draft", ""),
      store.set("nextId", state.nextId + 1),
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  toggle(msg: Message, state: TodosState): Effect[] {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  remove(msg: Message, state: TodosState): Effect[] {
    const items = state.items.filter((t) => t.id !== msg.payload);
    return [
      ...show(items, state.filter),
      storage.save("todos", items, "saveFailed"),
    ];
  }

  setFilter(msg: Message, state: TodosState): Effect[] {
    return show(state.items, msg.payload as Filter);
  }

  saveFailed(msg: Message): Effect[] {
    return [log.warn("could not save the todos", msg.payload)];
  }
}

export const todos = new Todos();
```

> [!NOTE] Deployment
> `vite build` erzeugt eine statische Site. Jeder Pfad einer Single-Page-Anwendung muss mit `index.html` antworten: Die Dev- und Preview-Server von Vite tun das, und ein statischer Host braucht eine Regel oder eine Kopie als `404.html`. Liegt die Site nicht an der Wurzel ihrer Domain, muss man das dem Router sagen. [Routing](page:concepts-routing) zeigt beides.

## Wie es weitergeht

- **Ändere den Storage.** Ersetze `createStoragePlugin()` durch ein Plugin, das die Liste an einen Server sendet, oder schreibe die handler gegen `http.request` und behalte `storage` für einen Entwurf. Sonst ändert sich nichts in der Anwendung, weil handler nur den Effekt kennen.
- **Bearbeite einen Titel.** Füge einem Todo ein Feld `editing` hinzu, einen Doppelklick, der es setzt, und ein Eingabefeld, das das span ersetzt. Das ist ein weiteres `if` im Template und zwei handler.
- **Rendere auf dem Server.** Die Todo-Seite braucht keine Server-Daten, aber die About-Seite und die Shell der Liste könnten vorab gerendert werden. [Server-Side-Rendering](page:concepts-ssr) erklärt, wie.

## Was du gelernt hast

- Eine Anwendung besteht aus einem Store, einem DOM-Plugin und einer Komponente; jedes Feature ist eine Message, ein handler, der Effekte zurückgibt, und ein Stück State.
- Alles, was ein Template nicht berechnen kann, wird im handler berechnet und gespeichert. handler mutieren nicht, lesen nicht die Uhr und berühren nicht das DOM.
- Dein eigenes Plugin ist ein kurzes Objekt mit einem Namen und einer Funktion `handle`, und seine Antworten kommen als Messages zurück.
- Eine Shell mit einer `routing`-Tabelle gibt jeder Seite eine Adresse; eine Seite funktioniert weiter, wenn sie umzieht, weil `key` und das Message-Präfix verbergen, wo sie liegt.

Weiter: [Fehlersuche und FAQ](page:guide-troubleshooting).
