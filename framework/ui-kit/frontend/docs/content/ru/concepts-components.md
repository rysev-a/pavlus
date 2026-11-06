---
summary: Как работает компонент. Компоненты-функции и компоненты-классы, единое дерево state и как до него доходит store.set, как шаблон читает state, поле view, props, messages mounted, enter и leave, почему экземпляр общий и правила имён handlers. В конце — полный компонент todo.
---
## Что такое компонент

Компонент в pavlus — это кусок логики, который отвечает на messages. Получив message и текущий state, он возвращает список effects. У него также может быть **view**: скомпилированный шаблон, который показывает state. Больше ничего не нужно. Нет метода render, нет класса жизненного цикла и нет hooks.

Компонент бывает двух видов. Это может быть **функция**:

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

Или **экземпляр класса, который расширяет `Component`**. Каждый метод — это handler для message с тем же именем, поэтому `switch` исчезает:

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

Обе формы делают одну и ту же работу, и `createApp({ app })` принимает любую. Разница в том, что может хранить класс. У функции нет `view`, поэтому её нельзя отрендерить через `createApp({ mount })`: ядро выбросит `mount needs an app that is a component with a view`. У неё также нет `children` и `routing`. Используйте функцию для небольшой чистой логики и для обёрток, а класс — для всего, что показывается на экране.

Класс нужно **передавать как экземпляр**. `createApp({ app: Counter })` выбрасывает ошибку с текстом `Counter is a class: pass an instance (new Counter()), not the class`. Обычный объект с методами или класс, который не расширяет `Component`, тоже отклоняется, и ошибка говорит, что нужно написать.

## Дерево state

У приложения **один state**: обычный объект, который хранит store plugin. Каждый компонент читает из него, и ни у одного нет собственной копии. Небольшое приложение держит все поля наверху. Более крупное группирует их по веткам, например `state.users` и `state.tasks`, по одной ветке на каждый дочерний компонент.

State — это дерево обычных данных. В нём могут быть строки, числа, массивы и объекты. Его должно быть легко вывести и сравнить. Единственное исключение — значение-компонент: embed `+{expr}` (см. [Сообщения и дочерние компоненты](page:concepts-messages)) может читать компонент из state, но тогда state перестаёт быть JSON.

Handler никогда не меняет state. Он возвращает effect, а store plugin строит новый объект state. Давайте посмотрим, что умеют effects store. У каждого есть `path`, записанный строкой с точками (`"user.name"`) или массивом (`["items", 3, "done"]`). Число в пути-массиве индексирует массив.

| Effect | Конструктор | Что делает store |
| --- | --- | --- |
| `set` | `store.set(path, value)` | Кладёт `value` по пути `path` и создаёт недостающие родительские объекты. |
| `merge` | `store.merge(path, object)` | Поверхностно сливает поля `object` в объект по пути `path`. |
| `remove` | `store.remove(path)` | Удаляет поле. Элемент массива вырезается. |
| `undo` | `store.undo(steps?)` | Откатывает последние `steps` изменений (по умолчанию одно). |
| `restoreTo` | `store.restoreTo(timestamp)` | Откатывает все изменения, записанные после этого момента. |

Store меняет только ветку на пути. Объекты на других ветках сохраняют свою идентичность, поэтому шаблон, который читает `state.tasks`, не видит изменения, когда выполняется set для `state.users.status`. Повторная запись того же значения ничего не меняет и не записывается. Каждое изменение хранит собственную обратную операцию, так `undo` работает без снимков.

## Как state доходит до шаблона

Шаблон не получает props или контекст. Он читает **объект state**. Идентификатор в выражении — это поле state или переменная цикла. В `p Hello, {user.name}` слово `user` — это `state.user`.

::demo state-and-template

Демо показывает обе стороны. Шаблон читает два поля, `user` и `unread`. Когда `unread` меняется с 3 на 4, скомпилированный `diff` возвращает один patch `text` для абзаца. В этом и состоит вся связь компонента с его шаблоном: **handlers пишут state, шаблон его читает.** Ни один не вызывает другого.

Это определяет, как проектировать state. Шаблон может делать мелочи с помощью выражений: сравнивать, складывать, проверять на пустоту, вызывать методы вроде `includes`. Произвольный код он запускать не может, потому что выражения — это небольшое чистое подмножество JavaScript. Всё, что требует настоящего вычисления, например число открытых задач, отсортированная копия или отформатированная дата, вычисляется в handler и сохраняется как поле. Пример todo в конце страницы делает так с `left`.

## View

Поле `view` содержит шаблон компонента — экспорт по умолчанию файла `.pavlus`:

```ts
import view from "./todos.pavlus";

class Todos extends Component<TodoState> {
  view = view;
}
```

View — это `{ render, diff, meta }`: две чистые функции, сгенерированные компилятором. `createApp({ app, mount })` рендерит `app.view` в элемент `mount`, а DOM plugin поддерживает его актуальным. View дочернего компонента помещается в шаблон родителя через embed (`+Child#name`). Компонент без view допустим: это только логика, например дочерний компонент, с которым родитель общается, но который не показывает.

`viewOf(component)` возвращает view, замкнутый на свой компонент. Благодаря этому `+outlet` и встроенные дочерние компоненты находят `routing` и `children` компонента. Вы редко вызываете его сами, потому что `mount` и тестовый помощник `mountView` делают это за вас.

## Props

Родитель может передать дочернему компоненту **входные данные только для чтения** через `props`. Это функция от state родителя к объекту, и этот объект сливается в state дочернего компонента:

```ts
children: Children<DashboardState> = {
  users: {
    component: users,
    key: "users",
    props: (state) => ({ filter: state.filter }),
  },
};
```

Дочерний компонент видит `{ ...state.users, filter }`. В его handlers и в его шаблоне `filter` — просто поле. Важны два правила. Props сливаются **после** собственного среза дочернего компонента, поэтому prop побеждает поле с тем же именем. И prop — только входные данные: дочерний компонент не должен его записывать. `store.set("filter", ...)` в дочернем компоненте запишет `users.filter` в state родителя, а это другое место. Страница [Сообщения и дочерние компоненты](page:concepts-messages) показывает всю схему подключения.

## Жизненный цикл: mounted, enter и leave

В pavlus нет методов жизненного цикла. Есть **messages**, как и любые другие события, которые фреймворк отправляет в трёх случаях. Компонент обрабатывает их методами с теми же именами и возвращает effects.

| Message | Когда отправляется | Кто получает |
| --- | --- | --- |
| `mounted` | Один раз, после того как приложение оказалось в DOM. Это первый message приложения, созданного с `mount`. | Корневой компонент. Для view, смонтированного effect `dom.mount`, message выбирается его опцией `onMounted`. |
| `enter` | Дочерний компонент маршрута стал активным или изменился собственный маршрут страницы-листа (например, с `/items/5` на `/items/7`). Payload — маршрут дочернего компонента. | Дочерний компонент маршрута, как `enter`. |
| `leave` | Дочерний компонент маршрута перестаёт быть активным. Payload — маршрут, который у него был. | Дочерний компонент маршрута, как `leave`. |

`mounted` — это место, где приложение начинает свою работу: загружает данные, запускает таймеры, слушает router. Родитель, который встраивает дочерние компоненты, запускает их через `ctx.send`:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

`enter` и `leave` относятся к маршрутизации. Страница загружает данные, когда в неё входят, и останавливает таймеры, когда из неё выходят:

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

Если у компонента с `routing` нет собственного `mounted`, то `mounted` по умолчанию возвращает `router.listen("routeChanged")`, а `routeChanged` по умолчанию вызывает `ctx.setRoute`, который сохраняет маршрут и возвращает effects `leave` и `enter` для каждого дочернего компонента маршрута, которого касается изменение. Самые глубокие дочерние компоненты выходят первыми, а новые входят сверху вниз. См. [Маршрутизация](page:concepts-routing).

> [!NOTE] Hooks в шаблонах пока нет
> Шаблон не может отправить message, когда его узлы появляются или исчезают. В заметках о дизайне это значится как не реализованное. Пока родитель запускает дочерний компонент явно через `ctx.send`, а страница маршрута использует `enter`.

## Один экземпляр на все messages

Компонент создаётся один раз, `export const todos = new Todos()`, и затем обрабатывает каждый message приложения. Ядро даже кэширует одну функцию-handler для каждого экземпляра. Поэтому в экземпляре **не должно быть изменяемого state**. Если бы handler делал `this.count++`, число сохранялось бы между messages, тест не мог бы его предсказать, а на сервере оно было бы общим для всех запросов. State принадлежит store и приходит как аргумент.

```ts
class Bad extends Component<{ n: number }> {
  calls = 0;

  inc(_msg: Message, state: { n: number }) {
    this.calls++;
    return [store.set("n", state.n + this.calls)];
  }
}
```

Сравните это с версией, где всё, что меняется, находится в state. Handler вычисляет новое значение только из своих аргументов.

```ts
class Good extends Component<{ n: number }> {
  inc(_msg: Message, state: { n: number }) {
    return [store.set("n", state.n + 1)];
  }
}
```

Неизменяемая настройка допустима. `this` в handler — это компонент, поэтому конфигурация в конструкторе работает: `new UsersList(20)` может хранить размер страницы. Подкласс может переопределить handler и вызвать `super`. Pavlus не запрещает изменяемые поля. Это ответственность автора, как и вся чистота.

## Правила имён handlers

Ядро ищет handler по id message: метод с таким именем на экземпляре. Эти правила определяют, что считается подходящим.

- Message, для id которого нет метода, получает пустой список effects, а не ошибку. Опечатка в шаблоне остаётся незамеченной, поэтому проверяйте имена.
- Handler должен возвращать массив. Иначе ядро выбросит `handler "x" must return an array of effects` с именем handler.
- **Имена, которые никогда не бывают messages:** `view`, `children`, `routing`, `dispatch`, каждое имя, начинающееся с `_`, каждый член `#private` и всё, что есть у любого объекта по умолчанию (`toString`, `constructor`, `hasOwnProperty`...). Message с id `view` или `_left` никогда ничего не вызывает.
- Используйте `_name` для вспомогательных методов, которые вы вызываете из handlers. `this._left(items)` работает, а message `_left` до него никогда не дотянется.
- Handler может быть полем класса со значением-функцией. `load: Handler<S> = (msg, state, ctx) => [...]` находится так же, как метод, и даёт TypeScript типы параметров.
- Id message с точкой требует имени метода в кавычках: `"users.remove"(msg) { ... }`. Так родитель наблюдает за своими дочерними компонентами, что показывает следующая страница.

У двух messages есть значение по умолчанию, если их никто не обрабатывает. Message, последняя часть которого — `navigate` (например, `navigate` или `header.navigate`), со строковым payload превращается в `router.navigate(url)`. А в компоненте с `routing` `mounted` и `routeChanged` выполняют подключение router. Handler с тем же именем заменяет значение по умолчанию.

## Полный пример: компонент todo

Последний пример собирает части вместе: view с формой, фильтром и списком; state с черновиком, элементами и счётчиком открытых задач; и handlers, которые поддерживают производное поле `left` в верном состоянии.

::demo todo

Шаблон читает `draft`, `filter`, `items` и `left`. Чекбокс отправляет `toggle` с id элемента, кнопка отправляет `remove`, а кнопки фильтра отправляют `setFilter` со строкой. В демо первый шаг переключает элемент 1: меняются класс `li`, свойство `checked` чекбокса и текст счётчика. Второй шаг меняет фильтр, поэтому меняется класс двух кнопок фильтра, а завершённый элемент убирается из списка.

Вот компонент. Обратите внимание, что есть одно место, `_left`, которое умеет считать, и что каждый handler, меняющий `items`, возвращает и его результат.

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

Поскольку компонент чистый, его тест короткий и не требует браузера:

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

Последняя строка показывает правило имён в действии: до вспомогательного метода `_left` message дотянуться не может.

## Что вы узнали

- Компонент — это функция или экземпляр класса, расширяющего `Component`. В классе каждый метод обрабатывает message со своим именем. Передавайте экземпляр, а не класс.
- State — одно дерево в store. Handlers возвращают effects `store.set`, `merge` или `remove` с путями, а шаблон читает state по имени.
- `view` — скомпилированный шаблон, `props` — входные данные только для чтения от родителя, а `mounted`, `enter` и `leave` — обычные messages, отправляемые в нужный момент.
- Экземпляр общий для всех messages, поэтому не держите в нём изменяемый state. Производные значения вычисляйте в handlers и сохраняйте.
- Имена, которые никогда не бывают messages: `view`, `children`, `routing`, `dispatch`, `_private` и `#private`, а также то, что есть у любого объекта.

Дальше: [Сообщения и дочерние компоненты](page:concepts-messages).
