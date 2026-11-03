---
summary: Construye una aplicación pequeña y completa en cinco pasos ejecutables - una lista de tareas con añadir, marcar, eliminar y un filtro, guardada por tu propio plugin, con una segunda página tras una route - y mira cada archivo, con tests.
---
## Qué construimos

Una lista de tareas. Escribes un título y pulsas Enter, marcas una tarea, la eliminas y filtras la lista por Todas, Activas y Hechas. La lista se guarda en `localStorage`, así que sigue ahí después de recargar. Una segunda página, About, tiene su propia dirección, y la barra superior enlaza las dos.

La guía tiene cinco pasos. Cada paso termina con una aplicación que se ejecuta: puedes iniciarla con `npm run dev` y probarla con clics. Cada paso añade una idea.

| Paso | Qué se añade | Idea |
| --- | --- | --- |
| 0 | El proyecto | Un proyecto Vite con el plugin de pavlus |
| 1 | Una lista a partir del state | Templates, state, un componente |
| 2 | Añadir, marcar, eliminar | Los eventos son messages, los handlers devuelven effects |
| 3 | Un filtro | State derivado, calculado en el handler |
| 4 | Guardar | Tu propio plugin, respuestas como messages |
| 5 | Una segunda página | Routing, `enter`, un shell |

Los archivos al final:

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

## Paso 0: el proyecto

Necesitas una carpeta, un `package.json`, una configuración de Vite con el plugin de pavlus y un `index.html` con un elemento donde montar. En este repositorio `@service-laboratory/pavlus` es el paquete del workspace `framework`, por eso su versión es `*`.

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

La configuración de Vite tiene dos líneas que importan. El plugin `pavlus()` compila cada archivo `*.pavlus` en un módulo con `render` y `diff`. El ajuste `environment: "jsdom"` es para los tests, que necesitan un DOM.

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

El archivo `src/env.d.ts` le dice a TypeScript dos cosas: qué devuelve `import view from "./page.pavlus"` y los tipos del propio Vite. Sin él obtienes `Cannot find module './todos.pavlus'`.

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

## Paso 1: una lista a partir del state

La primera versión muestra dos tareas del state. Tiene un template, un componente que posee el template y un `main.ts` que inicia la aplicación.

El template es un encabezado y una lista. `for todo in items key todo.id` repite la línea de debajo para cada elemento; `key` dice qué campo identifica a un elemento, de modo que añadir o eliminar uno toca solo ese elemento. `class:done=todo.done` pone la clase `done` cuando el campo es verdadero.

::demo list

La demo es el template real con el state real. En el primer paso ves una inserción: un elemento nuevo insertado antes del marker final de la lista, y nada más de la página se toca. En el segundo paso cambió la clase de un elemento, y es un solo patch de atributo.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}
```

Un componente es una clase que extiende `Component`. Nombra su template con `view`. Todavía no tiene handlers.

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

`main.ts` crea la aplicación. El plugin **store** guarda el state y empieza desde `initialTodos`; el plugin **dom** renderiza. `mount: "#app"` renderiza la view del componente en el elemento.

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

Ejecuta `npm run dev`. Ves el encabezado y dos tareas; la segunda tiene la clase `done`, así que una hoja de estilos podría tacharla.

## Paso 2: añadir, marcar, eliminar

Ahora la aplicación reacciona. Añade un formulario, un checkbox y un botón al template. Mira los eventos.

::demo form

`@input=typing` no es una llamada a una función. Es el message `typing`, y el plugin dom añade el texto del input como `msg.event.value`. `@change=toggle(todo.id)` es el message `toggle` con el payload `todo.id`. `@submit.prevent=add` evita que el navegador recargue la página y envía `add`. El primer paso de la demo muestra el borrador en el input: el template lee `value=draft`, y el diff es un solo patch de atributo.

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

Cada message es un método del componente con el mismo nombre. Un método recibe el message y el state y devuelve **effects**. No cambia nada: `store.set("draft", "")` es un objeto que le pide al plugin store que lo haga.

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

Cuatro detalles de este archivo son a propósito.

- **Sin mutación.** `add` no hace `push` en `state.items`; construye un array nuevo con un spread. El `diff` compilado compara con `===`, y un array mutado es el mismo array.
- **Sin reloj y sin aleatoriedad.** El id de la tarea nueva viene de `nextId`, un contador en el state. `Date.now()` o `Math.random()` en un handler lo harían impuro, y el test de abajo ya no podría decir qué devuelve.
- **Solo cruzan datos.** El handler lee `state`, el state antes del message, y `msg`. No lee el DOM.
- **Un borrador vacío devuelve `[]`.** Devolver ningún effect es una respuesta válida. También es la respuesta para un message que nadie maneja, por eso un error tipográfico en el nombre de un evento es silencioso. La [página de solución de problemas](page:guide-troubleshooting) muestra cómo detectarlo.

Los handlers son puros, así que el test no necesita navegador. Llama al componente como una función y aplica los effects de `store` a una copia del state. Este helper (`send`) es pequeño, y hace que los tests sean independientes de la lista exacta de effects, así que siguen siendo válidos cuando los pasos posteriores la cambian.

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

Ejecuta `npm test`.

## Paso 3: un filtro

El filtro muestra Todas, Activas o Hechas. Un template no puede filtrar una lista: no tiene funciones flecha ni llamadas con callbacks. Eso no es una carencia, es un diseño. Un valor que depende de otros valores se **calcula una vez, en el handler, y se guarda**. El template solo lo muestra.

Añadimos tres campos al state: `filter`, `visible` (la lista que se muestra) y `left` (el número de tareas activas). Una función `show(items, filter)` devuelve los cuatro effects `store.set` que los mantienen coherentes, y cada handler que cambia la lista la llama.

::demo filters

Al elegir Hechas se quita el primer elemento del DOM (un patch `remove`, un rango entre los markers del elemento), se mueve la clase `active` de un botón a otro y no se hace nada para el contador, porque `left` no cambió. El `diff` generado comparó `prev.left` y `next.left` y se saltó el texto.

El template lee `visible` en lugar de `items`, y tiene el contador y los botones:

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

El state, la función `show` y el state inicial:

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

Y los handlers que cambiaron. `add`, `toggle` y `remove` terminan con `show(...)`, y `setFilter` es nuevo:

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

Añade un test más a `todos.test.ts`:

```ts src/todos.test.ts
test("the filter decides what is visible and how many are left", () => {
  const next = send(initialTodos, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});
```

> [!TIP] Mantén el state derivado en una sola función
> Si `visible` se actualizara en tres sitios, tarde o temprano se olvidaría uno. Un único `show` hace que la lista y todo lo que depende de ella cambien juntos, en un solo message, así que la página nunca muestra un state a medio actualizar.

## Paso 4: guardar, con tu propio plugin

Una página que lo olvida todo al recargar no es útil. Guardar necesita `localStorage`, que un handler no puede tocar. La herramienta para el mundo exterior es un **plugin**. El framework no tiene ninguno para el almacenamiento, así que escribimos uno. Es corto, y la página [Escribir tu propio plugin](page:plugins-custom) explica cada línea.

El plugin tiene dos effects, `load` y `save`. `load` responde con un message, `save` no:

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

El componente lo usa en tres lugares. Cuando la aplicación arranca, el message `mounted` (enviado por `createApp({ mount })`) pide la lista guardada. Cuando la lista cambia, el handler añade un effect `storage.save`. Y dos handlers pequeños reciben las respuestas.

El state inicial ahora está vacío, porque la lista real viene del almacenamiento. Este es el archivo completo en su forma para este paso, con `mounted`:

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

Mira `loaded`. Recibe `null` cuando no hay nada guardado, y lo trata como una lista vacía. También calcula `nextId` a partir de los ids guardados, así que una tarea nueva nunca reutiliza un id. Y mira el flujo de un clic en un checkbox:

1. El plugin dom envía `toggle` con el payload `3`.
2. `toggle` devuelve los cuatro effects `store.set` de `show(...)` y un effect `storage.save`.
3. El plugin store cambia el state; el plugin dom aplica patches a la página; el plugin storage escribe el JSON.

Como el state inicial ahora está vacío, los tests de los handlers necesitan un state de ejemplo propio. Este es el `todos.test.ts` completo para este paso. Añade un test para iniciar la aplicación y otro para `loaded`:

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

`main.ts` registra los dos plugins nuevos. El logger imprime las advertencias que devuelven `loadFailed` y `saveFailed`:

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

Para probar el guardado sin un almacenamiento real, dale al plugin un objeto con `getItem` y `setItem`. El test monta la aplicación real con el plugin dom real en jsdom, así que también comprueba el template:

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

## Paso 5: una segunda página

El último paso añade una dirección para cada página. Necesitamos un **shell**: un componente cuyo template tiene una barra superior y un lugar para la página actual, y cuya tabla `routing` dice qué página está en qué ruta. La lista de tareas se convierte en una página del shell, y no cambia en absoluto, salvo una palabra.

El template del shell es una barra de links y un outlet:

::demo nav

```pavlus src/app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
    a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About
  main.app__main
    +outlet
```

Cada link es un link real con un `href` real, y un handler de clic que cancela la navegación del navegador y envía `navigate`. Nadie maneja `navigate`, así que el framework hace lo predeterminado: convierte el message en el effect `router.navigate("/about")`. La clase `active` sigue a `route.path`; la demo muestra que pasar de `/` a `/about` son dos patches de clase.

Dos páginas son solo templates:

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

El componente shell es la tabla de routing:

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

Hay tres cosas en este archivo.

- La página de tareas está en `/` con `key: "todos"`. Esa key significa que la página ve `state.todos`, y su `store.set("items", ...)` aterriza en `todos.items`. Por eso la página no tuvo que cambiar: nunca supo dónde vive su state. El state de la aplicación ahora es `{ route, todos }`.
- `name: "todos"` es el prefijo de message. Los eventos de la página llegan al shell como `todos.add`, `todos.toggle`, y las respuestas de sus effects vuelven con el mismo prefijo, así que `loaded` llega a la página como `loaded`.
- `/about` y `"*"` son páginas que son solo view. Los handlers `routeChanged` y `mounted` predeterminados del shell hacen toda la conexión del router.

La página cambia en una palabra. Una página con routing no es la raíz de la aplicación, así que no recibe `mounted`. Recibe `enter` cuando su route pasa a estar activa, y ese es también el momento correcto para cargar la lista de nuevo cuando el visitante vuelve desde About:

```ts src/todos.ts
  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }
```

`main.ts` añade el plugin router y parte del nuevo state:

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

En los tests de los handlers cambia un test, porque la página ahora recibe `enter` en lugar de `mounted`:

```ts src/todos.test.ts
test("entering the page asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "enter" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});
```

Un test nuevo maneja toda la aplicación, incluido el router, y el link de About:

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

El primer test despacha `todos.setFilter` a la raíz: el prefijo `todos.` lo envía a la página. El segundo muestra la página a la que se entra al arrancar: la lista guardada está ahí sin ningún clic. El tercero hace clic en el link.

Y la versión final del componente de tareas, tal como queda al final de la guía:

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

> [!NOTE] Despliegue
> `vite build` genera un sitio estático. Cada ruta de una aplicación de una sola página debe responder con `index.html`: los servidores de desarrollo y de preview de Vite lo hacen, y un host estático necesita una regla o una copia `404.html`. Si el sitio no está en la raíz de su dominio, hay que decírselo al router. [Enrutamiento](page:concepts-routing) muestra ambos.

## Hacia dónde seguir

- **Cambia el almacenamiento.** Reemplaza `createStoragePlugin()` por un plugin que envíe la lista a un servidor, o escribe los handlers contra `http.request` y deja `storage` para un borrador. Nada más en la aplicación cambia, porque los handlers solo conocen el effect.
- **Edita un título.** Añade un campo `editing` a una tarea, un doble clic que lo establece y un input que reemplaza al span. Es un `if` más en el template y dos handlers.
- **Renderiza en el servidor.** La página de tareas no necesita datos del servidor, pero la página About y el shell de la lista podrían renderizarse de antemano. [Renderizado en servidor](page:concepts-ssr) explica cómo.

## Lo que aprendiste

- Una aplicación es un store, un plugin dom y un componente; cada funcionalidad es un message, un handler que devuelve effects y una pieza de state.
- Todo lo que un template no puede calcular se calcula en el handler y se guarda. Los handlers no mutan, no leen el reloj y no tocan el DOM.
- Tu propio plugin es un objeto corto con un nombre y una función `handle`, y sus respuestas vuelven como messages.
- Un shell con una tabla `routing` da una dirección a cada página; una página sigue funcionando cuando se mueve, porque `key` y el prefijo de message ocultan dónde vive.

Siguiente: [Solución de problemas y FAQ](page:guide-troubleshooting).
