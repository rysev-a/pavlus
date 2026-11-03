---
summary: Соберите работающий счётчик, а затем небольшой список заметок с полем ввода, начав с пустой папки. Потом проследите один клик через фреймворк, message за message, и посмотрите, какие patches он порождает.
---
## Что вы построите

Вы построите две небольшие программы. Первая — счётчик: абзац и кнопка. Вторая — список заметок с текстовым полем. Вместе они используют все части приложения на pavlus: шаблон, класс компонента с handlers, store для state и DOM plugin, который показывает результат и слушает события.

В конце вы проследите один клик через фреймворк, по одному message, и увидите, что именно он меняет на странице.

Вам нужны Node.js и менеджер пакетов. Код написан на TypeScript, но дальше достаточно базовых знаний о типах.

## Настройка проекта

Проект на pavlus — это обычный проект на [Vite](https://vite.dev) с одним дополнительным plugin. Этот plugin компилирует каждый файл `.pavlus` в JavaScript при импорте. Начните с `package.json`. Фреймворк — это пакет `@service-laboratory/pavlus`.

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

Конфигурация Vite добавляет plugin pavlus. У него есть одна необязательная настройка, `runtime`: она меняет то, откуда скомпилированные шаблоны импортируют свои небольшие вспомогательные функции. Сейчас она вам не нужна.

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default { plugins: [pavlus()] };
```

Страница — это пустой элемент, который заполнит приложение, и один скрипт.

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

TypeScript должен знать, что возвращает `import view from "./counter.pavlus"`. Это делает один файл объявлений. Фреймворк поставляет его сам.

```ts env.d.ts
/// <reference types="@service-laboratory/pavlus/env" />
```

## Первый шаблон

Создайте `counter.pavlus`. Шаблон — это дерево элементов с отступами. `{count}` — выражение, которое читает поле `count` из state. `@click=inc` означает, что клик по кнопке отправляет message с id `inc`.

```pavlus counter.pavlus
div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me
```

Обратите внимание на то, чего здесь нет. Нет функции, которая запускается по клику. Шаблон лишь называет message. Что произойдёт для этого message, решается в другом месте, в коде, который можно протестировать отдельно.

## Компонент

Создайте `counter.ts`. Компонент — это класс, который расширяет `Component`. Его поле `view` — это шаблон. Каждый другой метод — **handler** для message с тем же именем, поэтому метод `inc` обрабатывает message `inc`.

Handler получает message и текущий state. Он возвращает список effects. Этот возвращает один effect, построенный помощником store plugin `store.set`: «записать в поле `count` старое значение плюс один».

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

> [!TIP] Аннотируйте параметры
> TypeScript не выводит типы параметров методов класса. Напишите `msg: Message` и свой тип state сами. Первый параметр часто не используется, поэтому назовите его `_msg`.

## Запуск приложения

Создайте `main.ts`. `createApp` связывает компонент с его plugins. Сейчас вам нужны два plugins. Plugin **store** хранит state и стартует с объектом, который вы ему передали. Plugin **DOM** рендерит views и превращает события браузера в messages. Опция `mount` указывает элемент, в который нужно рендерить.

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

Запустите `npx vite`, откройте адрес, который он выведет, и нажмите кнопку. Число растёт. Вот тот же шаблон в виде живого демо, с двумя patches, которые `diff` компилятора возвращает для первых двух кликов:

::demo counter

Каждый клик порождает ровно один patch вида `text`. Он называет узел по его id и задаёт новый текст. Больше ничего на странице не затрагивается, потому что больше ничто не читает `count`.

> [!NOTE] Откуда берётся state
> Первый state — это объект, который вы передаёте в `createStorePlugin`. Каждое поле, которое читает шаблон, должно быть в нём, иначе шаблон прочитает `undefined`. Store хранит обычный объект, а handlers никогда его не меняют. Они возвращают effects `set`, и store создаёт новый объект.

## Проследите один клик

А теперь обещанная экскурсия. Вот всё, что происходит, по порядку, от клика до изменённого текста. Каждая строка — настоящий шаг `createApp`.

1. **Старт.** `createApp` инициализирует plugins, рендерит view в `#app` и отправляет message `{ id: "mounted" }`. У счётчика нет handler `mounted`, поэтому он не возвращает effects.
2. **Клик.** DOM plugin повесил на кнопку один listener. Он читает message, который шаблон задал для этой кнопки, `{ id: "inc" }`, добавляет краткое описание события браузера и отправляет `{ id: "inc", event: { type: "click", value: "" } }`. `value` — это свойство value кнопки, пустая строка.
3. **Очередь.** Ядро помещает message в свою очередь. Messages обрабатываются по одному.
4. **Handler.** Ядро вызывает ваш код с message и текущим state `{ count: 0 }`. Метод `inc` возвращает `[{ plugin: "store", type: "set", path: "count", value: 1 }]`.
5. **Effect.** Ядро передаёт этот effect plugin, названному в нём, то есть `store`. Store строит новый state `{ count: 1 }`.
6. **State изменился.** Ядро снова читает state. Это другой объект, поэтому каждый plugin получает `onState(next)`.
7. **Diff.** DOM plugin вызывает `diff(prev, next)` из view. Результат — один patch, `{ op: "text", id: "2", text: "Clicked 1 times" }`, и plugin записывает этот текст в узел с id `2`.

Вся цепочка посередине — обычные данные: message, список effects, список patches. Любое из них можно вывести.

## Список с полем ввода

Вторая программа использует больше возможностей языка. В ней есть текстовое поле, форма, которая добавляет заметку, и список с кнопкой удаления каждой заметки. Ей также нужно больше state: вводимый текст, заметки и счётчик, который выдаёт каждой заметке id.

::demo notes-list

Сохраните этот шаблон как `notes.pavlus` (демо показывает его исходник). Читайте его сверху. `input(value=draft ... @input=setDraft)` показывает поле `draft` и отправляет `setDraft` при каждом нажатии клавиши. `form(@submit.prevent=add)` отправляет `add` при отправке формы, а `.prevent` не даёт браузеру перезагрузить страницу. Цикл `for note in notes key note.id` повторяет `li`, а `key` позволяет `diff` понять, какая заметка какая, когда список меняется. `@click=remove(note.id)` отправляет message `remove` с id заметки в качестве **payload**.

Компонент следует за шаблоном, по одному handler на каждый message:

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

На три вещи стоит взглянуть внимательнее:

- `setDraft` читает `msg.event?.value`. DOM plugin прикрепляет `event` к каждому message, пришедшему со страницы, а для поля ввода `value` — это текст, который в нём сейчас находится.
- `add` возвращает три effects. Они применяются в этом порядке. Когда текст пуст, возвращается пустой список, что означает «ничего не должно происходить».
- `remove` читает id из `msg.payload`. Шаблон написал `remove(note.id)`, и один аргумент становится payload.

`main.ts` такой же, как раньше, с `app: notes` и начальным state `{ draft: "", notes: [], nextId: 1 }`.

## Что делают одно нажатие клавиши и одна отправка формы

Когда программа с заметками запущена, те же семь шагов повторяются для каждого message, но patches богаче. Три шага демо выше показывают их.

- **Ввод.** Message — `{ id: "setDraft", event: { type: "input", value: "Call Ann" } }`. Handler возвращает один `set` для `draft`. Единственный patch — patch `attr` для `value` поля ввода. Список и счётчик не затрагиваются.
- **Отправка.** Message — `{ id: "add", event: { type: "submit" } }`. Три effects `set` выполняются по порядку, а затем plugins один раз получают уведомление о новом state. Patches: `value` поля ввода возвращается к пустой строке, один `insert` добавляет новую заметку, а patch `text` обновляет счётчик.
- **Удаление.** Message — `{ id: "remove", payload: 1, event: { type: "click", value: "" } }`. Один patch `remove` убирает заметку, и счётчик меняется.

Patches порождает `diff`, исходя только из state. Компонент никогда не говорит «вставь узел». Он говорит, каким должен быть state, а скомпилированный шаблон сам вычисляет изменения DOM.

> [!WARNING] Никогда не меняйте state на месте
> Не пишите `state.notes.push(note)` в handler. Store даёт вам текущий state для чтения. `diff` решает, что что-то изменилось, сравнивая через `===`, поэтому изменённый на месте массив выглядит неизменным, и экран не обновится. Всегда возвращайте новый массив, как это делает `add` с `[...state.notes, ...]`.

## Что вы узнали

- Проект на pavlus — это проект на Vite с plugin `pavlus()`, файлом `index.html`, файлом `env.d.ts`, шаблоном, классом компонента и вызовом `createApp`.
- Шаблон называет messages (`@click=inc`). Класс компонента обрабатывает их одним методом на message и возвращает effects вроде `store.set(path, value)`.
- `createApp` принимает компонент и plugins. Store хранит state, DOM plugin показывает view и сообщает о событиях в виде messages с полем `event`.
- Один клик — это: message, handler, effects, store, новый state, `diff`, patches, DOM. Средние звенья — обычные данные, которые можно вывести.
- Handlers не должны мутировать state. Они возвращают новые значения.

Дальше: [Элементы, текст и атрибуты](page:syntax-elements).
