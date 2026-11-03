---
summary: Код приложения только возвращает effects, обычные данные, которые описывают, что должно произойти. Выполняют их plugins. Вы узнаете контракт plugin, как путешествуют effects и ответы, в каком порядке всё происходит, как обрабатываются ошибки и как тестировать plugin.
---
## Чистый код, грязные plugins

В приложении pavlus код, который вы пишете, никогда не касается внешнего мира. Handler не вызывает `fetch`, не читает часы, не пишет в `localStorage` и не меняет DOM. Он получает message и state и **возвращает список effects**. Effect — это обычный объект, описывающий то, что должно произойти.

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

Сделать это — работа **plugin**. Plugin — это объект с именем и функцией. Ядро их соединяет: оно отправляет каждый effect тому plugin, чьё имя равно `effect.plugin`.

```text
DOM event / HTTP reply / timer tick / WS frame
        |  plugins turn the outside world into messages
        v
  core:   app(message, state) -> effects[]        pure, deterministic
        |  effects are plain data: { plugin: "http", type: "request", ... }
        v
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

Картина — это цикл. Мир создаёт **message** (клик, ответ, тик). Чистый код превращает message в **effects**. Plugins выполняют effects, а когда что-то происходит позже, отправляют новое message. Ваш код — только средний шаг, и этот средний шаг — функция, которую можно вызвать в тесте без всякого браузера.

Даже клик — это message. Событие в шаблоне — не функция, а данные. Демо показывает vnode, который получает кнопка:

::demo event-as-data open=vnodes

`events.click` у vnode — это `{ id: "remove", payload: 3 }`. Настоящий слушатель принадлежит plugin DOM. Когда происходит клик, он отправляет в приложение message `{ id: "remove", payload: 3, event: { type: "click" } }`. Поле `event` — небольшая копия события DOM в виде обычных данных, с `value`, `checked` и `key`, где это имеет смысл.

## Контракт plugin

Это весь интерфейс plugin. Это тип из `src/core/types.ts`, а основной пакет экспортирует его как `Plugin`:

```ts
export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
```

Обязательны только два члена: `name` и `handle`.

- `name` — строка, на которую ссылается `effect.plugin`. Она должна быть уникальной в одном приложении.
- `handle(effect, ctx)` вызывается для каждого effect, адресованного этому plugin. Первый параметр — effect; обобщение `E` — тип effects, которые принимает этот plugin, обычно union по `type`.
- `init(ctx)` запускается один раз при создании приложения. Plugin, которому нужно запомнить контекст (plugin DOM хранит его, чтобы отправлять события), сохраняет его здесь.
- `onState(state, ctx)` запускается после изменения state. Plugin DOM перерисовывает в нём.
- `dispose()` запускается, когда приложение уничтожается, и убирает за собой: слушатели, таймеры, сокеты.

Второй тип — контекст, который получает каждый hook:

```ts
export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}
```

`dispatch` — единственный способ, которым plugin говорит с вашим кодом. `getState` существует, и plugin DOM нужен он для рендеринга. `dispatchEffect` предназначен для инструментов разработчика и тестов. Обычный plugin использует `dispatch` и больше ничего.

Message — это `{ id, payload?, event? }`. `id` — имя handler, который его получит.

## Effects — это данные

У effect два обязательных поля, `plugin` и `type`. Всё остальное зависит от plugin. `plugin` выбирает plugin; `type` выбирает, что делать внутри него. У plugin store есть `set`, `merge` и `remove`; у plugin http — `request` и `cancel`.

Из того, что effect — это данные, следуют три хорошие вещи.

1. **Тестам не нужны моки.** Чтобы протестировать handler, вызовите его и сравните возвращённый список с ожидаемым.
2. **Effects можно записывать, воспроизводить и показывать.** Опция `onStep` у `createApp` получает каждое message вместе с его effects; ею пользуются logger и инструменты разработчика.
3. **Ничего не происходит случайно.** Вернуть effect — не значит выполнить его. Handler, который в тесте вызван десять раз, ничего не выполняет.

### Effectors

Effect можно написать вручную, но каждый plugin поставляется со своим **effector**: небольшим объектом функций, которые строят именно такой объект, с типами. Неверное поле тогда становится ошибкой компиляции, а handler читается как предложение.

```ts
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";

class Users extends Component<UsersState> {
  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
      log.info("loading users"),
    ];
  }
}
```

Effector сам по себе ничего не делает. `store.set("status", "loading")` возвращает объект, показанный в начале этой страницы, и больше ничего. В тесте вы сравниваете результат handler с теми же вызовами effector:

```ts
expect(toHandler(users)({ id: "load" }, state)).toEqual([
  store.set("status", "loading"),
  http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
  log.info("loading users"),
]);
```

У каждого встроенного plugin есть свой effector. Обычный короткий псевдоним указан во втором столбце.

| Plugin | Effector (псевдоним) |
| --- | --- |
| store | `storeEffector` как `store` |
| dom | `domEffector` как `dom` |
| http | `httpEffector` как `http` |
| ws | `wsEffector` как `ws` |
| time | `timeEffector` как `time` |
| logger | `loggerEffector` как `log` |
| router | `routerEffector` как `router` |

Их можно импортировать из точки входа одного plugin (`@service-laboratory/pavlus/plugins/store`) или из barrel `@service-laboratory/pavlus/plugins`. Импорт barrel не запускает никакого кода, а сборщик оставляет только то, что вы используете.

## Регистрация plugins

Plugins перечисляются при создании приложения:

```ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";

createApp({
  app: dashboard,
  plugins: [createStorePlugin(initialState), createDomPlugin(), createHttpPlugin()],
  mount: "#app",
});
```

- `app` — функция или экземпляр класса, расширяющего `Component`.
- У каждого plugin есть `name`, и effect попадает к тому plugin, чьё имя равно `effect.plugin`.
- Два plugin с одинаковым именем — ошибка при запуске: `pavlus: duplicate plugin "store"`.
- Effect для plugin, которого нет в списке, — ошибка в момент выполнения: `pavlus: no plugin "nope" for effect "x"`. Это первое, что нужно проверить, когда что-то выбрасывает ошибку после добавления нового effect.
- State берётся у первого plugin, у которого есть метод `getState()`, то есть у plugin store. Без него handlers получают `undefined` вместо state.
- Для `mount` нужны plugin dom и `app` с `view`.
- `init` — это message, которое отправляется, когда все plugins готовы, после `mount`.

Регистрируется не по одному plugin на тип effect, а по одному на *семейство* effects: все effects `http` идут в один объект plugin, который хранит таблицу выполняющихся запросов.

## Messages возвращаются

Большинство plugins отвечают позже: ответ, таймер, кадр. Effect несёт **id message, которым нужно ответить**, а plugin вызывает `ctx.dispatch`, когда у него есть результат.

```ts
http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })
// later, the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

У полей ответа условные имена: `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` и `onChange`. Имена важны из-за компонентов. Дочерний компонент монтируется под префиксом message (`users`). Дочерний пишет `onSuccess: "loaded"`, а фреймворк ставит префикс перед именно этими семью полями, поэтому ответ находит дорогу назад к дочернему компоненту как `users.loaded`. Вот как выглядит effect дочернего компонента после того, как он покинул дочерний компонент:

```json
[
  { "plugin": "time", "type": "setTimeout", "id": "t", "ms": 10, "replyTo": "kid.tick" },
  { "plugin": "q", "type": "q", "onDone": "done", "onSuccess": "kid.ok" }
]
```

Посмотрите на второй effect. Поле с другим именем, здесь `onDone`, не меняется, и его message пошло бы в корень, а не к дочернему компоненту. Поэтому plugin, который хочет работать внутри компонентов, должен использовать стандартные имена.

## Кто чем владеет

- Plugin **store** владеет state приложения. После каждого message, если state изменился, ядро вызывает `onState(state)` у каждого plugin, который его определяет.
- Каждый plugin владеет своим **закрытым изменяемым state**: plugin DOM — слушателями, http — выполняющимися запросами, time — таймерами, ws — сокетами. Ваш код никогда его не видит и никогда не должен его очищать.
- Всё, у чего есть **id** (запрос http, таймер, соединение), заменяется, когда тот же id используется снова, и может быть отменено по этому id. Для debounce или «побеждает последний запрос» не нужен state в приложении: запустите тот же id снова.

## Порядок, жизненный цикл и циклы

Messages обрабатываются **строго по одному**. Для message ядро вызывает приложение, выполняет effects в том порядке, в котором они были возвращены, а затем, если state изменился, вызывает `onState` у каждого plugin. Message, которое plugin отправляет, пока обрабатывает effect, не обрабатывается сразу. Оно ждёт в очереди и запускается после завершения текущего message.

Тест делает это наглядным. Plugin `echo` отвечает сразу, и всё же ответы приходят после обоих effects:

```ts overview.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
} from "@service-laboratory/pavlus";
import {
  createStorePlugin,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";

const echo: Plugin = {
  name: "echo",
  handle(effect, ctx) {
    ctx.dispatch({ id: "echoed", payload: effect.text });
  },
};

test("effects run in order, replies wait for the next turn", () => {
  const seen: string[] = [];
  const app = createApp({
    app: (message: Message): Effect[] => {
      seen.push(message.id);
      return message.id === "start"
        ? [
            { plugin: "echo", type: "say", text: "a" },
            { plugin: "echo", type: "say", text: "b" },
          ]
        : [];
    },
    plugins: [createStorePlugin({}), echo],
  });
  app.dispatch({ id: "start" });
  expect(seen).toEqual(["start", "echoed", "echoed"]);
});
```

У hooks тоже фиксированный порядок. Тест ниже записывает каждый вызов. `init` вызывается в порядке массива, прежде всего остального; effect store применяется раньше effect для `x`; `onState` идёт после всех effects message, по одному разу на plugin; а `dispose` выполняется в **обратном** порядке, поэтому plugin, зависящий от более раннего, останавливается первым.

```ts
test("the hooks run in a fixed order", () => {
  const calls: string[] = [];
  const spy = (name: string): Plugin => ({
    name,
    init: () => void calls.push(`${name}.init`),
    handle: (effect) => void calls.push(`${name}.handle:${effect.type}`),
    onState: (state) =>
      void calls.push(`${name}.onState:${JSON.stringify(state)}`),
    dispose: () => void calls.push(`${name}.dispose`),
  });
  const app = createApp({
    app: () => [store.set("n", 1), { plugin: "x", type: "hello" }],
    plugins: [createStorePlugin({ n: 0 }), spy("x"), spy("y")],
  });
  app.dispatch({ id: "go" });
  app.dispose();
  expect(calls).toEqual([
    "x.init",
    "y.init",
    "x.handle:hello",
    'x.onState:{"n":1}',
    'y.onState:{"n":1}',
    "y.dispose",
    "x.dispose",
  ]);
});
```

Цикл messages (handler, который в ответ на message вызывает то же самое message) останавливается после `maxMessagesPerTick` messages за один ход, по умолчанию 10 000:

```text
pavlus: more than 50 messages in one tick (message loop?)
```

(Число в сообщении — установленный лимит. Здесь он был равен 50 и задан опцией `maxMessagesPerTick` у `createApp`.)

## Ошибки

Бывает два вида сбоев, и обрабатываются они по-разному.

**Ожидаемые сбои — это messages.** Запрос, который не удался, закрывшийся сокет, не найденный файл: это не исключения. Plugin отправляет message об ошибке (`onError`), а ваш код решает, что показать. Запрос, который был отменён или заменён, не отправляет ничего.

**Баги выбрасывают исключение.** Если `handle` выбрасывает исключение, оно выходит из `app.dispatch`. Остальные effects этого message пропускаются, а уже применённые изменения state остаются. Само приложение не сломано: следующий `dispatch` работает.

Два случая легко упустить:

- Ошибка внутри callback promise или callback таймера plugin никогда не доходит до ядра, потому что ядра уже нет в стеке. Plugin должен сам ловить свои асинхронные ошибки и превращать их в message об ошибке. Все встроенные plugins так и делают.
- Handler, который не возвращает массив, — ошибка компонента, с именем message: `pavlus: handler "add" must return an array of effects`.

## Тестирование plugin

Каждый встроенный plugin принимает внешний мир как опцию. Plugin http принимает `fetch`, plugin time — часы, plugin ws — фабрику сокетов, logger — приёмник, router — `window`, plugin dom — `document`. Тест передаёт подделку, и библиотека для моков не нужна.

Plugin можно тестировать без приложения. Создайте поддельный контекст, который записывает messages, вызовите `handle` и проверьте, что было отправлено:

```ts
test("a plugin is tested with a fake context", () => {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  echo.handle({ plugin: "echo", type: "say", text: "hi" }, ctx);
  expect(sent).toEqual([{ id: "echoed", payload: "hi" }]);
});
```

Третий уровень — тест всего приложения с настоящими plugins и поддельными внешними мирами. [Руководство](page:guide-todo-app) делает это для списка дел.

> [!TIP] Лучше тестируйте handler
> Большая часть вашей логики лежит в handlers, а handler — чистая функция. Тестируйте его вызовом `toHandler(component)(message, state)`. Тест plugin нужен только тогда, когда вы пишете plugin, и тогда он проверяет, что plugin делает с одним effect.

## Что вы узнали

- Handler возвращает effects, обычные объекты `{ plugin, type, ... }`. Effectors строят их с типами. Plugin — это `{ name, handle }` плюс необязательные `init`, `onState` и `dispose`.
- Plugins отвечают через `ctx.dispatch`. Effect называет messages-ответы через `replyTo`, `onSuccess`, `onError` и другие стандартные поля, а дочерний компонент получает префикс обратно.
- Messages выполняются по одному, effects по порядку, а message от plugin ждёт следующего хода. Plugins уничтожаются в обратном порядке.
- Ожидаемые сбои — это messages, баги выбрасывают исключения. Для теста plugin нужен только поддельный контекст.

Дальше: [Встроенные плагины](page:plugins-reference).
