---
summary: Постройте полное небольшое приложение в пять запускаемых шагов - список дел с добавлением, отметкой, удалением и фильтром, сохраняемый вашим собственным plugin, со второй страницей за маршрутом - и посмотрите каждый файл вместе с тестами.
---
## Что мы строим

Список дел. Вы набираете название и нажимаете Enter, отмечаете дело, удаляете его и фильтруете список по All, Active и Done. Список хранится в `localStorage`, поэтому после перезагрузки он на месте. Вторая страница, About, лежит по собственному адресу, а верхняя панель связывает эти две страницы.

В руководстве пять шагов. Каждый шаг заканчивается приложением, которое работает: вы можете запустить его командой `npm run dev` и пощёлкать по нему. Каждый шаг добавляет одну идею.

| Шаг | Что добавляется | Идея |
| --- | --- | --- |
| 0 | Проект | Проект Vite с plugin pavlus |
| 1 | Список из state | Шаблоны, state, компонент |
| 2 | Добавить, отметить, удалить | События — это messages, handlers возвращают effects |
| 3 | Фильтр | Производный state, вычисляемый в handler |
| 4 | Сохранение | Ваш собственный plugin, ответы в виде messages |
| 5 | Вторая страница | Маршрутизация, `enter`, оболочка |

Файлы в итоге:

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

## Шаг 0: проект

Вам нужны папка, `package.json`, конфигурация Vite с plugin pavlus и `index.html` с элементом, в который будет монтироваться приложение. В этом репозитории `@pavlus/frontend` — пакет рабочего пространства `framework`, поэтому его версия равна `*`.

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
    "@pavlus/frontend": "*"
  },
  "devDependencies": {
    "jsdom": "^30.1.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

В конфигурации Vite важны две строки. Plugin `pavlus()` компилирует каждый файл `*.pavlus` в модуль с `render` и `diff`. Настройка `environment: "jsdom"` нужна для тестов, которым требуется DOM.

```ts vite.config.ts
import { pavlus } from "@pavlus/frontend/vite";

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

Файл `src/env.d.ts` сообщает TypeScript две вещи: что возвращает `import view from "./page.pavlus"`, и типы самого Vite. Без него вы получите `Cannot find module './todos.pavlus'`.

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@pavlus/frontend/env" />
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

## Шаг 1: список из state

Первая версия показывает два дела из state. В ней есть шаблон, компонент, которому он принадлежит, и `main.ts`, запускающий приложение.

Шаблон — это заголовок и список. `for todo in items key todo.id` повторяет строку под ним для каждого элемента; `key` говорит, какое поле идентифицирует элемент, чтобы добавление или удаление одного затрагивало только этот элемент. `class:done=todo.done` ставит класс `done`, когда поле истинно.

::demo list

Демо — это настоящий шаблон с настоящим state. На первом шаге вы видите вставку: новый элемент вставлен перед конечным маркером списка, и больше ничего на странице не затронуто. На втором шаге изменился класс одного элемента, и это один patch атрибута.

```pavlus src/todos.pavlus
section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}
```

Компонент — это класс, расширяющий `Component`. Он называет свой шаблон через `view`. Handlers у него пока нет.

```ts src/todos.ts
import { Component } from "@pavlus/frontend";
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

`main.ts` создаёт приложение. Plugin **store** хранит state и стартует с `initialTodos`; plugin **dom** рендерит. `mount: "#app"` рендерит view компонента в этот элемент.

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [createStorePlugin(initialTodos), new DomPlugin()],
  mount: "#app",
});
```

Запустите `npm run dev`. Вы увидите заголовок и два дела; у второго есть класс `done`, поэтому таблица стилей могла бы его зачеркнуть.

## Шаг 2: добавить, отметить, удалить

Теперь приложение реагирует. Добавьте в шаблон форму, чекбокс и кнопку. Посмотрите на события.

::demo form

`@input=typing` — не вызов функции. Это message `typing`, и plugin DOM добавляет текст поля как `msg.event.value`. `@change=toggle(todo.id)` — это message `toggle` с payload `todo.id`. `@submit.prevent=add` не даёт браузеру перезагрузить страницу и отправляет `add`. Первый шаг демо показывает черновик в поле ввода: шаблон читает `value=draft`, а diff — это один patch атрибута.

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

Каждое message — это метод компонента с тем же именем. Метод принимает message и state и возвращает **effects**. Он ничего не меняет: `store.set("draft", "")` — это объект, который просит plugin store это сделать.

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
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

Четыре детали этого файла сделаны намеренно.

- **Никаких мутаций.** `add` не делает `push` в `state.items`; он строит новый массив через spread. Скомпилированный `diff` сравнивает через `===`, а изменённый массив — это тот же массив.
- **Ни часов, ни random.** Id нового дела берётся из `nextId`, счётчика в state. `Date.now()` или `Math.random()` в handler сделали бы его нечистым, и тест ниже уже не смог бы сказать, что он возвращает.
- **Пересекают границу только данные.** Handler читает `state`, то есть state до message, и `msg`. DOM он не читает.
- **Пустой черновик возвращает `[]`.** Не вернуть ни одного effect — допустимый ответ. Это также ответ на message, которое никто не обрабатывает, поэтому опечатка в имени события проходит молча. [Страница решения проблем](page:guide-troubleshooting) показывает, как её поймать.

Handlers чистые, поэтому для теста браузер не нужен. Он вызывает компонент как функцию и применяет effects `store` к копии state. Этот помощник (`send`) мал, и он делает тесты независимыми от точного списка effects, поэтому они остаются верными, когда последующие шаги его изменят.

```ts src/todos.test.ts
import { type Message, toHandler } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
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

Запустите `npm test`.

## Шаг 3: фильтр

Фильтр показывает All, Active или Done. Короткий список шаблон может отфильтровать и сам (`if` внутри `for` или `items.filter(x => x.done)` в выражении), но это не дизайн этого приложения. Значение, зависящее от других значений, **вычисляется один раз, в handler, и сохраняется**. Шаблон его только показывает.

Мы добавляем в state три поля: `filter`, `visible` (список для показа) и `left` (число активных дел). Функция `show(items, filter)` возвращает четыре effects `store.set`, которые поддерживают их согласованность, и её вызывает каждый handler, меняющий список.

::demo filters

Выбор Done убирает первый элемент из DOM (один patch `remove`, диапазон между маркерами элемента), переносит класс `active` с одной кнопки на другую и ничего не делает для счётчика, потому что `left` не изменился. Сгенерированный `diff` сравнил `prev.left` и `next.left` и пропустил текст.

Шаблон читает `visible` вместо `items` и содержит счётчик и кнопки:

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

State, функция `show` и начальный state:

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

И handlers, которые изменились. `add`, `toggle` и `remove` заканчиваются на `show(...)`, а `setFilter` — новый:

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

Добавьте в `todos.test.ts` ещё один тест:

```ts src/todos.test.ts
test("the filter decides what is visible and how many are left", () => {
  const next = send(initialTodos, { id: "setFilter", payload: "done" });
  expect(next.visible.map((t) => t.title)).toEqual(["Write the docs"]);
  expect(next.left).toBe(1);
});
```

> [!TIP] Держите производный state в одной функции
> Если бы `visible` обновлялся в трёх местах, одно из них рано или поздно забыли бы. Единственная `show` заставляет список и всё, что от него зависит, меняться вместе, в одном message, поэтому страница никогда не показывает наполовину обновлённый state.

## Шаг 4: сохранение с собственным plugin

Страница, которая всё забывает при перезагрузке, бесполезна. Для сохранения нужен `localStorage`, которого handler касаться не может. Инструмент для внешнего мира — **plugin**. Для хранилища во фреймворке его нет, поэтому мы пишем свой. Он короткий, а страница [Свой плагин](page:plugins-custom) объясняет каждую строку.

У plugin два effects, `load` и `save`. `load` отвечает message, `save` — нет:

```ts src/storage.ts
import type { Plugin } from "@pavlus/frontend";

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

Компонент использует его в трёх местах. Когда приложение запускается, message `mounted` (его отправляет `createApp({ mount })`) просит сохранённый список. Когда список меняется, handler добавляет effect `storage.save`. А два небольших handlers получают ответы.

Начальный state теперь пуст, потому что настоящий список приходит из хранилища. Вот весь файл в том виде, какой он на этом шаге, с `mounted`:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
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

Посмотрите на `loaded`. Он получает `null`, когда ничего не сохранено, и считает это пустым списком. Он также вычисляет `nextId` из сохранённых id, так что новое дело никогда не использует чужой id. И посмотрите на поток одного клика по чекбоксу:

1. Plugin DOM отправляет `toggle` с payload `3`.
2. `toggle` возвращает четыре effects `store.set` из `show(...)` и effect `storage.save`.
3. Plugin store меняет state; plugin DOM обновляет страницу; plugin storage записывает JSON.

Поскольку начальный state теперь пуст, тестам handlers нужен собственный образец state. Это весь `todos.test.ts` для этого шага. Он добавляет тест для запуска приложения и тест для `loaded`:

```ts src/todos.test.ts
import { type Message, toHandler } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
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

`main.ts` регистрирует два новых plugins. Logger печатает предупреждения, которые возвращают `loadFailed` и `saveFailed`:

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createLoggerPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { createStoragePlugin } from "./storage.ts";
import { initialTodos, todos } from "./todos.ts";

createApp({
  app: todos,
  plugins: [
    createStorePlugin(initialTodos),
    new DomPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

Чтобы протестировать сохранение без настоящего хранилища, дайте plugin объект с `getItem` и `setItem`. Тест монтирует настоящее приложение с настоящим plugin DOM в jsdom, поэтому он заодно проверяет и шаблон:

```ts src/persistence.test.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
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
      new DomPlugin(),
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

## Шаг 5: вторая страница

Последний шаг добавляет адрес для каждой страницы. Нам нужна **оболочка** (shell): компонент, в шаблоне которого есть верхняя панель и место для текущей страницы и чья таблица `routing` говорит, какая страница находится по какому пути. Список дел становится одной страницей оболочки и совсем не меняется, кроме одного слова.

Шаблон оболочки — это панель ссылок и outlet:

::demo nav

```pavlus src/app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
    a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About
  main.app__main
    +outlet
```

Каждая ссылка — настоящая ссылка с настоящим `href` и обработчиком клика, который отменяет навигацию браузера и отправляет `navigate`. Message `navigate` никто не обрабатывает, поэтому фреймворк делает действие по умолчанию: превращает message в effect `router.navigate("/about")`. Класс `active` следует за `route.path`; демо показывает, что переход с `/` на `/about` — это два patches класса.

Две страницы — только шаблоны:

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

Компонент оболочки — это таблица маршрутов:

```ts src/app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@pavlus/frontend";
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

В этом файле три вещи.

- Страница дел находится на `/` с `key: "todos"`. Этот key означает, что страница видит `state.todos`, а её `store.set("items", ...)` попадает в `todos.items`. Поэтому страницу не пришлось менять: она никогда не знала, где живёт её state. State приложения теперь — `{ route, todos }`.
- `name: "todos"` — это префикс message. События страницы приходят в оболочку как `todos.add`, `todos.toggle`, а ответы её effects возвращаются с тем же префиксом, поэтому `loaded` приходит на страницу как `loaded`.
- `/about` и `"*"` — страницы только с view. Handlers `routeChanged` и `mounted` оболочки по умолчанию делают всё подключение router.

Страница меняется на одно слово. Страница с маршрутом — не корень приложения, поэтому `mounted` она не получает. Она получает `enter`, когда её route становится активным, и это же подходящий момент, чтобы снова загрузить список, когда посетитель возвращается со страницы About:

```ts src/todos.ts
  enter(): Effect[] {
    return [storage.load("todos", "loaded", "loadFailed")];
  }
```

`main.ts` добавляет plugin router и стартует с нового state:

```ts src/main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { app, type AppState, initialState } from "./app.ts";
import { createStoragePlugin } from "./storage.ts";

createApp<AppState>({
  app,
  plugins: [
    createStorePlugin(initialState),
    new DomPlugin(),
    createRouterPlugin(),
    createLoggerPlugin(),
    createStoragePlugin(),
  ],
  mount: "#app",
});
```

В тестах handlers меняется один тест, потому что страница теперь получает `enter` вместо `mounted`:

```ts src/todos.test.ts
test("entering the page asks the storage plugin for the saved list", () => {
  expect(toHandler(todos)({ id: "enter" }, sample)).toEqual([
    storage.load("todos", "loaded", "loadFailed"),
  ]);
});
```

Новый тест управляет всем приложением, включая router, и ссылкой About:

```ts src/app.test.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
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
      new DomPlugin(),
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

Первый тест отправляет `todos.setFilter` в корень: префикс `todos.` направляет его на страницу. Второй показывает, что страница при старте входит в route: сохранённый список уже на месте без единого клика. Третий кликает по ссылке.

И итоговая версия компонента дел в том виде, в каком она остаётся в конце руководства:

```ts src/todos.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
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

> [!NOTE] Развёртывание
> `vite build` делает статический сайт. На каждый путь одностраничного приложения должен отвечать `index.html`: встроенные dev- и preview-серверы Vite так и делают, а статическому хосту нужно правило или копия `404.html`. Если сайт находится не в корне своего домена, роутеру нужно об этом сказать. [Маршрутизация](page:concepts-routing) показывает и то и другое.

## Куда идти дальше

- **Смените хранилище.** Замените `createStoragePlugin()` на plugin, который отправляет список на сервер, или напишите handlers на основе `http.request` и оставьте `storage` для черновика. Больше ничего в приложении не изменится, потому что handlers знают только effect.
- **Редактирование названия.** Добавьте делу поле `editing`, двойной клик, который его устанавливает, и поле ввода, заменяющее span. Это ещё один `if` в шаблоне и два handlers.
- **Рендеринг на сервере.** Странице дел серверные данные не нужны, но страницу About и оболочку со списком можно было бы отрендерить заранее. [Серверный рендеринг](page:concepts-ssr) объясняет, как это сделать.

## Что вы узнали

- Приложение — это store, plugin DOM и компонент; каждая возможность — это message, handler, возвращающий effects, и часть state.
- Всё, что шаблон вычислить не может, вычисляется в handler и сохраняется. Handlers не мутируют, не читают часы и не касаются DOM.
- Ваш собственный plugin — это короткий объект с именем и функцией `handle`, а его ответы возвращаются как messages.
- Оболочка с таблицей `routing` даёт каждой странице адрес; страница продолжает работать при переезде, потому что `key` и префикс message скрывают, где она живёт.

Дальше: [Решение проблем и FAQ](page:guide-troubleshooting).
