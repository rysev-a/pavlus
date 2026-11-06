---
summary: Все встроенные plugins в одном месте - dom, store, http, router, time, logger и ws - со всеми их effects, полями и messages, которые они отправляют обратно, а также четыре plugins ui-kit как примеры plugins, специфичных для приложения.
---
## Семь plugins, одна таблица в конце

Вместе с фреймворком поставляются семь plugins. Нужные вы регистрируете в `createApp({ plugins })`, а остальные ничего не стоят. Эта страница описывает каждый из них: для чего он нужен, каждый effect, который он обрабатывает, с полями, короткий пример использования в handler и message, которое приходит обратно. Последний раздел — таблица всех effects для быстрого поиска.

В каждом примере используется короткий псевдоним effector, как в [Как работают плагины](page:plugins-overview):

```ts
import {
  DomPlugin,
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
  wsEffector as ws,
} from "@pavlus/frontend/plugins";
```

Каждый plugin создаётся функцией с именем `createXPlugin(options)` — исключение: dom-плагин — это класс `new DomPlugin(options)` — и каждая опция существует для того, чтобы тест мог подменить внешний мир. Опции тоже перечислены в конце страницы.

## store

**Для чего:** хранить state приложения и историю каждого его изменения. Это единственный plugin, у которого ядро спрашивает state: handler получает значение store, а когда оно меняется, об этом сообщается другим plugins.

```ts
const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
plugin.getState();
plugin.history;
```

| Effect | Поля | Значение |
| --- | --- | --- |
| `set` | `path`, `value` | Записать значение по `path`, создавая недостающие родительские объекты. Корневой путь (пустая строка) заменяет весь state. |
| `merge` | `path`, `value` | Поверхностно слить объект в объект по `path`. |
| `remove` | `path` | Удалить значение. Если это элемент массива, массив сокращается. |
| `undo` | `steps?` | Откатить последние `steps` (по умолчанию 1) записанных изменений. |
| `restoreTo` | `timestamp` | Откатить все изменения, записанные после `timestamp`. |

**Путь** (path) — это строка с точками (`"user.name"`, `"todos.0.done"`) или массив (`["todos", 0, "done"]`). Числовые сегменты индексируют массивы.

```ts
rename(msg: Message): Effect[] {
  return [
    store.set("user.name", String(msg.payload)),
    store.merge("user", { edited: true }),
    store.remove("todos.1"),
  ];
}
```

**Что приходит обратно:** ничего. Результат effect `store` — новый state, который видят следующее message и шаблоны.

State **неизменяемый**. Каждое изменение строит новые объекты вдоль пути и оставляет остальное тождественным, поэтому `diff` может пропускать нетронутые ветви одним `===`. Запись значения, которое уже такое, ничего не меняет и ничего не записывает. Никогда не изменяйте state на месте: ни store, ни `diff` этого не увидят.

Каждое изменение записывается вместе с `restoreEffect`, то есть effect, возвращающим state, который был до него. `undo` и `restoreTo` применяют их, ничего не записывая. История хранит последние 1000 изменений (`maxHistory`).

## dom

**Для чего:** это единственный код, который касается DOM. Он рендерит скомпилированные views, применяет patches, которые возвращает `diff`, и владеет каждым слушателем событий. События возвращаются как messages.

Корень вашего приложения монтируется через `createApp({ mount })`. Effects ниже предназначены для всего остального: второй view в другом месте, модальное окно, панель.

| Effect | Поля | Значение |
| --- | --- | --- |
| `mount` | `target`, `view`, `onMounted?` | Отрендерить `view` в `target` (CSS-селектор или элемент) с текущим state. |
| `unmount` | `target` | Удалить то, что было смонтировано в `target`, вместе со слушателями. |
| `focus` | `selector` | Дать фокус первому подходящему элементу. |
| `blur` | `selector` | Снять фокус с первого подходящего элемента. |

```ts
open(): Effect[] {
  return [DomPlugin.mount("#panel", panelView, { onMounted: "panelMounted" })];
}

panelMounted(): Effect[] {
  return [DomPlugin.focus("input.filter")];
}
```

`view` — это скомпилированный шаблон (`import panelView from "./panel.pavlus"`) или `viewOf(component)` для компонента, в чьём шаблоне есть `+outlet` или дочерние компоненты.

**Что приходит обратно:**

| Когда | Message |
| --- | --- |
| View попал в DOM, и был передан `onMounted` | `{ id: onMounted }` |
| Пользователь вызывает событие, привязанное в шаблоне, например `@click=save(item)` | `{ id, payload, event }` |

Для событий `id` — это id message из шаблона (с префиксом встроенных дочерних компонентов), `payload` — аргумент handler, а `event` — простой снимок: `{ type, value?, checked?, key? }`. `value` и `checked` берутся из цели события, `key` — из событий клавиатуры. `@submit.prevent` и `.stop` вызывают `preventDefault()` и `stopPropagation()` до отправки message.

`onMounted` не входит в семь полей ответа, к которым дочерний компонент добавляет префикс, поэтому message приходит с тем именем, которое вы написали.

Plugin делает ещё две вещи. Всякий раз, когда state меняется, он запускает `view.diff(previous, state)` для каждого смонтированного view и применяет patches; effect обновления отправлять не нужно. А когда в target лежит серверный рендер, `mount` гидрирует разметку, а не строит её (см. [Серверный рендеринг](page:concepts-ssr)).

У узла **один** слушатель на тип события на всю его жизнь. Когда message handler меняется, plugin лишь подменяет сохранённое message. Поля формы записываются как свойства (`value`, `checked`, `selected`), а также как атрибуты, потому что после того, как пользователь что-то набрал, то, что показывается, меняет только свойство.

## http

**Для чего:** запросы. У каждого запроса есть **id**, и по id его же и отменяют: запуск запроса с id выполняющегося отменяет старый. «Побеждает последний запрос» не требует state в приложении.

| Effect | Поля | Значение |
| --- | --- | --- |
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | Отправить запрос. |
| `cancel` | `id` | Отменить выполняющийся запрос `id`. |

`method` равен `GET`, если не указано иное. Строка `body` отправляется как есть; всё остальное отправляется как JSON, и добавляется `content-type: application/json`, если вы не задали свой. `responseType` — `"json"` (по умолчанию) или `"text"`. Тело, которое не является корректным JSON, даёт `data: null`.

```ts
search(msg: Message): Effect[] {
  return [
    http.request({
      id: "search",
      url: `/api/users?q=${msg.payload}`,
      onSuccess: "found",
      onError: "searchFailed",
    }),
  ];
}

save(msg: Message): Effect[] {
  return [
    http.request({
      id: "save",
      method: "POST",
      url: "/api/users",
      body: { name: msg.payload },
      onSuccess: "saved",
      onError: "saveFailed",
    }),
  ];
}
```

**Что приходит обратно:**

| Когда | Message |
| --- | --- |
| Ответ 2xx | `{ id: onSuccess, payload: { status, data } }` |
| Любой другой статус | `{ id: onError, payload: { status, error: statusText, data } }` |
| Сбой сети | `{ id: onError, payload: { error: message } }` |
| Отменён или заменён | ничего |

Вот настоящие payloads для поддельного `fetch`, который отвечает 200, 404 и сбоем сети:

```json
[
  { "id": "ok", "payload": { "status": 200, "data": [1] } },
  { "id": "err", "payload": { "status": 404, "error": "Not Found", "data": { "m": 1 } } },
  { "id": "err", "payload": { "error": "offline" } }
]
```

> [!WARNING] Отменённый запрос молчит
> Отменённый запрос никогда не создаёт message, даже об ошибке, а ответ заменённого запроса, который всё же приходит, игнорируется. Если вы показываете индикатор загрузки, не ждите `onError`, чтобы скрыть его после `cancel`: скройте его сами в handler, который отменяет.

У plugin есть `pending()`, id запросов в полёте, и `settled()`, promise, который выполняется, когда в полёте ничего нет (используется для серверного рендеринга).

## router

**Для чего:** URL и история. Приложение узнаёт адрес в виде messages и меняет его effects; `window.location` оно никогда не читает.

| Effect | Поля | Значение |
| --- | --- | --- |
| `listen` | `onChange` | Начать сообщать об адресе. Сразу отвечает текущим адресом. |
| `navigate` | `url`, `replace?`, `absolute?` | Перейти на `url`. Из дочернего компонента с маршрутом url отсчитывается от base этого компонента, если не задан `absolute`. |
| `back` | none | `history.back()` |
| `forward` | none | `history.forward()` |

```ts
init(): Effect[] {
  return [router.listen("route.changed")];
}

login(): Effect[] {
  return [router.navigate("/login", { replace: true })];
}
```

**Что приходит обратно:** `{ id: onChange, payload: { path, search, hash } }`. Для `https://example.com/users?page=2#top` payload такой:

```json
{ "path": "/users", "search": "?page=2", "hash": "#top" }
```

Оно отправляется при обработке `listen`, после каждого `navigate` (plugin сам отправляет `popstate`, потому что `pushState` не вызывает события) и когда пользователь идёт назад или вперёд. Повторный вызов `listen` заменяет слушатель. `navigate` сообщает об адресе только при активном `listen`.

Plugin не разбирает URL глубже этих трёх частей. Сопоставление маршрутов — дело таблицы `routing`, см. [Маршрутизация](page:concepts-routing). Под базовым путём передайте в `createRouterPlugin({ window })` окно, которое скрывает base.

## time

**Для чего:** часы, таймауты и интервалы. Код приложения не может вызывать `Date.now()` или `setTimeout`, потому что это сделало бы его нечистым. Он просит об этом plugin, а ответ приходит в виде message. У каждого таймера есть **id**, и по нему его можно перезапустить или отменить.

| Effect | Поля | Значение |
| --- | --- | --- |
| `now` | `replyTo` | Ответить текущим временем. |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | Один раз отправить `replyTo` через `ms`. |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | Отправлять `replyTo` каждые `ms`. |
| `cancel` | `id` | Остановить таймер `id`. |
| `cancelAll` | none | Остановить все таймеры. |

```ts
typing(msg: Message): Effect[] {
  return [
    store.set("query", msg.event?.value ?? ""),
    time.setTimeout("search", 300, "searchFire", msg.event?.value),
  ];
}

searchFire(msg: Message): Effect[] {
  return [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })];
}
```

Запуск таймера с id, который уже выполняется, **отменяет выполняющийся**. Пример — debounce без state: пока посетитель продолжает печатать, каждая клавиша заменяет таймер, и `searchFire` приходит через 300 мс после последней клавиши.

**Что приходит обратно:**

| Effect | Message |
| --- | --- |
| `now` | `{ id: replyTo, payload: <ms since the epoch> }` |
| `setTimeout` | `{ id: replyTo, payload }` один раз; затем таймер забывается |
| `setInterval` | `{ id: replyTo, payload }` на каждом тике |

Чтобы поставить на документ отметку времени, запросите время и закончите работу, когда придёт ответ: `save` возвращает `time.now("save.stamped")`, а `"save.stamped"` сохраняет `msg.payload`. Тогда один и тот же журнал messages всегда даёт одни и те же effects.

## logger

**Для чего:** консоль. Код приложения чистый, поэтому даже логирование — это effect.

| Effect | Поля | Значение |
| --- | --- | --- |
| `log` | `message`, `level?`, `data?` | Записать запись. `level` — `debug`, `info`, `warn` или `error`, по умолчанию `info`. |

```ts
removed(msg: Message): Effect[] {
  return [log.info("user removed", { id: msg.payload }), log.warn("slow response", 2400)];
}
```

У effector есть `log.debug`, `log.info`, `log.warn`, `log.error` и `log.log(level, message, data)`. Записи уходят в соответствующий метод `console`, а `data` передаётся вторым аргументом, если есть.

**Что приходит обратно:** ничего.

`withLogging(component, label)` из основного пакета оборачивает компонент и добавляет одну запись `debug` для каждого обработанного им message, с payload, а также plugins и типами effects, которые он вернул. Он добавляет effect, поэтому plugin logger должен быть зарегистрирован.

```ts
createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
```

## ws

**Для чего:** соединения WebSocket по **id**. Сокеты хранит plugin; приложение видит messages.

| Effect | Поля | Значение |
| --- | --- | --- |
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | Открыть соединение `id`. |
| `send` | `id`, `data` | Отправить по соединению `id`. Объект отправляется как JSON, строка как есть. |
| `close` | `id`, `code?`, `reason?` | Закрыть соединение `id`. |

```ts
join(): Effect[] {
  return [
    ws.connect({ id: "chat", url: "wss://example.com/chat", onOpen: "opened", onMessage: "received", onClose: "closed", onError: "failed" }),
  ];
}

opened(): Effect[] {
  return [ws.send("chat", { text: "hi" })];
}
```

**Что приходит обратно:**

| Когда | Message |
| --- | --- |
| Соединение открывается | `{ id: onOpen }` |
| Приходит фрейм | `{ id: onMessage, payload }`. Текстовый фрейм, являющийся корректным JSON, разбирается. |
| Соединение закрывается | `{ id: onClose, payload: { code, reason } }`; id забывается |
| Ошибка | `{ id: onError }` |

Подключение с id открытого соединения сначала закрывает старое, без message `onClose`. `send` по id, у которого нет соединения, **выбрасывает исключение** (`pavlus/ws: no connection "chat"`). Отправляйте только после `onOpen` и храните в state флаг `connected`, если нужно это знать.

## Все effects на одной странице

Все 24 effects семи plugins:

| Plugin | Effect | Поля | Message в ответ |
| --- | --- | --- | --- |
| store | `set` | `path`, `value` | нет |
| store | `merge` | `path`, `value` | нет |
| store | `remove` | `path` | нет |
| store | `undo` | `steps?` | нет |
| store | `restoreTo` | `timestamp` | нет |
| dom | `mount` | `target`, `view`, `onMounted?` | `onMounted` |
| dom | `unmount` | `target` | нет |
| dom | `focus` | `selector` | нет |
| dom | `blur` | `selector` | нет |
| http | `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | `onSuccess` или `onError` |
| http | `cancel` | `id` | нет |
| router | `listen` | `onChange` | `onChange` |
| router | `navigate` | `url`, `replace?`, `absolute?` | `onChange` слушателя |
| router | `back` | none | `onChange` слушателя |
| router | `forward` | none | `onChange` слушателя |
| time | `now` | `replyTo` | `replyTo` |
| time | `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` один раз |
| time | `setInterval` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` многократно |
| time | `cancel` | `id` | нет |
| time | `cancelAll` | none | нет |
| logger | `log` | `message`, `level?`, `data?` | нет |
| ws | `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | четыре callback |
| ws | `send` | `id`, `data` | нет |
| ws | `close` | `id`, `code?`, `reason?` | `onClose` |

И опция каждого plugin, которую подменяет тест:

| Plugin | Опция | Что передать |
| --- | --- | --- |
| store | `now`, `maxHistory` | Счётчик для меток времени. |
| dom | `document` | Документ jsdom. |
| http | `fetch` | Поддельный `fetch`; ему нужны только `ok`, `status`, `statusText` и `json()` или `text()`. |
| router | `window` | Окно jsdom или обёртка, скрывающая базовый путь. |
| time | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | Поддельные часы, либо используйте `vi.useFakeTimers()`. |
| logger | `sink` | Объект с `debug`, `info`, `warn` и `error`, который собирает вызовы. |
| ws | `create` | Функция, возвращающая поддельный сокет. |

## Собственные plugins ui-kit

В фреймворке нет plugin для `localStorage`, для случайных чисел или для элемента `<html>`, потому что приложению они нужны лишь иногда. У ui-kit, сайта, который вы читаете, есть четыре собственных plugin. Они показывают, как выглядит plugin, специфичный для приложения. Все четыре зарегистрированы в его `main.ts`:

```ts main.ts
export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    new DomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});
```

| Plugin | Effect | Поля | Что приходит обратно |
| --- | --- | --- | --- |
| theme | `apply` | `look`, `vars`, `persist` | нет |
| random | `int` | `max`, `replyTo` | `{ id: replyTo, payload: n }`, целое число от 0 до `max`, не включая `max` |
| source | `load` | `path`, `onSuccess`, `onError` | `{ id: onSuccess, payload: { path, text } }` или `{ id: onError, payload: path }` |
| docs | `load` | `slug`, `lang`, `onSuccess`, `onError` | `onSuccess` с готовой страницей или `onError` со slug |
| docs | `run` | `template`, `state`, `onSuccess` | `onSuccess` со скомпилированным и запущенным демо |
| docs | `remember` | `lang` | нет |

- **theme** — единственный код, который касается `<html>` ради внешнего вида сайта: класс `dark` или `light`, переменные CSS, атрибут `data-style` и выбор, сохранённый в `localStorage`. Приложение вычисляет переменные чистой функцией и возвращает `themeEffector.apply(look)`.
- **random** существует потому, что handler не может вызвать `Math.random()`. Следующая страница, [Свой плагин](page:plugins-custom), разбирает его строка за строкой.
- **source** загружает исходный код страницы для вкладки Source. Файлы собираются как ленивые raw-чанки через `import.meta.glob` с `query: "?raw"`, а plugin загружает один из них при открытии вкладки. Приложение спрашивает и получает текст обратно как message, а затем чистой функцией режет его на подсвеченные строки.
- **docs** — то, благодаря чему работает эта документация. `load` получает Markdown страницы и демо этой страницы, загружает компилятор по требованию, компилирует демо и отвечает готовой страницей; `run` делает то же самое для песочницы; `remember` сохраняет язык.

Каждый из них следует той же форме, что и встроенный plugin: тип для effect, effector, функция `createXPlugin` с внешним миром в параметре и ответ через `ctx.dispatch`.

## Что вы узнали

- Семь plugins покрывают DOM, state, сеть, URL, время, консоль и сокеты. У каждого effect фиксированные поля, и большинство ответов называет сам effect.
- Вещи с `id` (запросы http, таймеры, соединения) заменяются, когда id используется снова, и могут быть отменены. Это даёт debounce и «побеждает последний» без state.
- State меняет только `store`. Все остальные plugins отвечают messages, и ожидаемые сбои — тоже messages.
- Plugin, специфичный для приложения, — это небольшой объект той же формы: тип effect, effector и `handle`.

Дальше: [Свой плагин](page:plugins-custom).
