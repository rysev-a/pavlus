---
summary: Полный поток данных приложения на pavlus, от события до изменённого DOM. Что даёт чистый код, как выглядят effects в виде данных, что plugins могут и чего не могут делать, в каком порядке выполняются messages и как проверить handler обычными assert.
---
## Один цикл

Каждое приложение на pavlus — это один и тот же цикл. Что-то происходит, создаётся message, ваш чистый код превращает message в effects, plugins выполняют effects, а новый state показывается на экране. Вот весь путь с названием части, которая выполняет каждый шаг.

```text
 DOM event / HTTP reply / timer tick / socket frame / location change
        |
        |  a plugin turns it into a message
        v
 { id, payload, event }                           message: plain data
        |
        |  core: createApp puts it in the queue
        v
 handler(message, state)  ->  Effect[]            your code: pure
        |
        |  core: each effect goes to plugins[effect.plugin]
        v
 store.handle(set ...)    http.handle(request)    plugins: all side effects
        |                       |
        |                       |  later: ctx.dispatch(reply message)
        v                       +-------------------> back to the queue
 store: state replaced by a new object
        |
        |  core: state !== previous state  ->  onState(next) on every plugin
        v
 dom.onState:  view.diff(prev, next)  ->  Patch[]
        |
        v
 the dom plugin changes the real DOM
```

Всё, что находится в левой части этой схемы, — это данные или чистая функция. Всё, что касается внешнего мира, — plugin. Ядро, `createApp`, — тонкий цикл между ними. Его исходный код занимает около ста строк и не зависит от DOM.

Почему такая форма? Она отделяет часть программы, которая часто меняется и которую трудно сделать правильно (что должно произойти, когда пользователь делает X), от части, которая меняется редко и может быть написана один раз (как повесить listener, как вызвать `fetch`). Первая часть превращается в обычные функции над обычными данными, поэтому её легко читать, тестировать и переиспользовать.

## Что даёт «чистота»

**Чистая** функция зависит только от своих аргументов и ничего не меняет вне себя. У ваших handlers сигнатура `(message, state, ctx) => Effect[]`. Раз они чистые:

- **Их можно тестировать без браузера.** На входе два обычных значения, на выходе список обычных значений. Вы сравниваете их через `assert`. Полный пример есть в конце этой страницы.
- **Их можно запускать на сервере.** Без DOM те же компоненты рендерятся в строку. Страница [Серверный рендеринг](page:concepts-ssr) использует это.
- **Сессию можно воспроизвести.** Запишите messages, подайте их в новое приложение, и вы получите тот же state. В ядре даже есть hook, `onStep(message, effects)`, который вызывается для каждого обработанного message.
- **Можно посмотреть, что произошло.** Effect — это объект, который можно вывести, записать в лог и сравнить. Callback так не умеет.

Pavlus **не** проверяет чистоту. Документация называет это ответственностью автора. Handler, который вызывает `Math.random()` или читает `Date.now()`, будет работать, но приложение станет трудно тестировать. Практическое правило — попросить об этом plugin. Случайное число или время — это effect, ответ на который приходит в виде message.

## Effects — это обычные данные

Effect — это объект как минимум с двумя полями: `plugin`, именем plugin, который его обрабатывает, и `type`, то есть что делать. Остальные поля — дело самого plugin. Вот настоящие, из встроенных plugins. Вы пишете их через *effector* каждого plugin, небольшой объект-конструктор, но результат — ровно тот объект, что показан.

```ts
{ plugin: "store", type: "set", path: "count", value: 1 }
{ plugin: "store", type: "merge", path: "user", value: { name: "Ann" } }
{ plugin: "http", type: "request", id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }
{ plugin: "time", type: "setTimeout", id: "search", ms: 300, replyTo: "searchFire", payload: "ann" }
{ plugin: "router", type: "navigate", url: "/users" }
{ plugin: "logger", type: "log", level: "info", message: "user removed", data: { id: 3 } }
{ plugin: "dom", type: "focus", selector: "#name" }
```

Стоит заметить две вещи. Во-первых, effects, которым нужен ответ, указывают, **каким message ответить**: `onSuccess: "loaded"`, `replyTo: "searchFire"`. Ответ приходит позже в виде message, `{ id: "loaded", payload: ... }`, и проходит через тот же цикл. Ваш код никогда не ждёт. Во-вторых, effect с `id` (`http`, `time`, `ws`) заменяет уже работающий effect с тем же id. Так без всякого state в вашем коде пишутся «побеждает последний запрос» и debounce.

В handlers вы используете effectors, потому что они типизированы и хорошо читаются:

```ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";

interface SearchState {
  query: string;
  status: "idle" | "loading";
  results: string[];
}

export class Search extends Component<SearchState> {
  type(msg: Message) {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      time.setTimeout("search", 300, "fire", query),
    ];
  }

  fire(msg: Message) {
    return [
      store.set("status", "loading"),
      http.request({
        id: "search",
        url: `/api/search?q=${msg.payload}`,
        onSuccess: "found",
        onError: "failed",
      }),
    ];
  }

  found(msg: Message) {
    const reply = msg.payload as { data: string[] };
    return [store.set("status", "idle"), store.set("results", reply.data)];
  }

  failed() {
    return [store.set("status", "idle"), store.set("results", [])];
  }
}
```

Это полноценный поиск с debounce. Каждое нажатие клавиши перезапускает таймер с тем же id, поэтому отправляется только последний запрос. Если новый запрос отправлен, пока старый выполняется, тот же id отменяет старый запрос. В компоненте нет ни таймеров, ни `AbortController`, ни изменяемых полей.

## От state к patches

Последние шаги цикла принадлежат компилятору. Когда store заменил state, DOM plugin вызывает функцию `diff(prev, next)` смонтированного view. Она возвращает **patches**: тоже обычные данные, одну из восьми операций (`text`, `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`). DOM plugin — единственный код, который превращает patches в вызовы DOM.

::demo state-to-patches

Посмотрите на два шага демо. В первом меняется только `status`, поэтому единственный patch — вставка абзаца «Loading...». Список не затрагивается. Во втором меняются `status` и `items`: абзац очищается и вставляются два элемента списка. Узел, который читает только неизменившиеся поля, не порождает вообще ничего. Компилятор вычисляет, какие поля читает каждый узел, поэтому `diff` может пропустить поддерево одной проверкой `===`.

> [!WARNING] Неизменяемость — часть контракта
> Ядро решает, что state изменился, сравнивая идентичность объектов (`next !== state`), а `diff` сравнивает поля таким же образом. Store plugin заменяет объекты state и разделяет ветки, которые не изменились, поэтому обе проверки дёшевы и корректны. Если бы вы изменили state на месте, ни один plugin не получил бы уведомления и не был бы создан ни один patch.

## Порядок событий

Ядро обрабатывает messages строго по одному. Все эти правила находятся в `createApp`, и на них можно полагаться.

1. **Очередь.** `dispatch(message)` помещает message в очередь. Если цикл уже работает, вызов сразу возвращается, а message обрабатывается позже в том же запуске, после того как закончится текущий message.
2. **Effects по порядку.** Для одного message effects передаются своим plugins в том порядке, в каком их вернул ваш handler.
3. **Ответы встают в очередь.** Plugin может вызвать `ctx.dispatch` во время обработки effect, даже сразу. Ответ ждёт в очереди за текущим message. Handler никогда не видит ответ на свой effect в рамках того же message.
4. **Одно уведомление на message.** После выполнения всех effects message ядро один раз читает state. Если это другой объект, чем до message, каждый plugin с `onState` вызывается один раз с итоговым state. Три effects `set` вызывают один render, а не три.
5. **Предохранитель.** Если за один запуск обработано больше `maxMessagesPerTick` messages (по умолчанию 10 000), очередь очищается и выбрасывается ошибка. Это значит, что messages порождают друг друга по кругу.
6. **Ошибки.** Исключение в handler или в `plugin.handle` выходит наружу из `dispatch`. Effect для незарегистрированного plugin выбрасывает `pavlus: no plugin "x" for effect "y"`. Два plugins с одинаковым именем выбрасывают ошибку при запуске приложения.
7. **Завершение.** `dispose()` вызывает dispose у plugins в порядке, обратном регистрации, а последующие messages игнорируются.

State, который получают handlers, берётся у первого plugin с методом `getState()`, то есть у store. Вы можете сами передать `getState` в options, например в тесте.

## Что plugins могут и чего не могут

Plugin — это объект: `{ name, init?, handle(effect, ctx), onState?, dispose? }`. Ядро даёт ему контекст с тремя функциями: `dispatch(message)`, `getState()` и `dispatchEffect(effect)`.

Plugin **может**:

- владеть изменяемыми данными: listeners, выполняющимися запросами, таймерами, сокетами, кэшем. Код приложения никогда их не видит и никогда не очищает.
- вызывать любой внешний API: DOM, `fetch`, `setTimeout`, `localStorage`, `console`.
- превращать внешние события в messages через `ctx.dispatch` в любой момент.
- читать state через `ctx.getState()` и реагировать на изменения в `onState`.
- выполнять очистку в `dispose`.

Plugin **не должен**:

- сам менять state приложения. State меняет только store plugin, и только из-за effect `set`, `merge`, `remove`, `undo` или `restoreTo`.
- хранить бизнес-правила. Он делает одну вещь для одного семейства effects. «Что происходит после ответа» относится к handler.
- выбрасывать ошибку при ожидаемом сбое. Неудавшийся запрос или закрытый сокет сообщается как message (`onError`), чтобы handlers могли с ним справиться.

Эти правила фреймворк тоже не контролирует. [Страницы о plugins](page:plugins-overview) показывают, что делает каждый встроенный plugin и как написать свой.

## Тестирование handler обычными assert

Раз компонент — чистая функция, модульному тесту не нужна никакая подготовка. `toHandler` превращает компонент в обычную функцию `(message, state) => Effect[]`. Вызовите её и сравните. Этот тест использует только стандартную библиотеку:

```ts search.test.ts
import assert from "node:assert/strict";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { toHandler } from "@pavlus/frontend";
import { Search } from "./search.ts";

const search = toHandler(new Search());
const state = { query: "ann", status: "idle" as const, results: [] };

assert.deepEqual(search({ id: "fire", payload: "ann" }, state), [
  store.set("status", "loading"),
  http.request({
    id: "search",
    url: "/api/search?q=ann",
    onSuccess: "found",
    onError: "failed",
  }),
]);

assert.deepEqual(search({ id: "nobody-handles-this" }, state), []);
```

Message без handler возвращает пустой список, а не ошибку. Вы сравниваете с собственным результатом effectors, поэтому тест сломается, если effect plugin изменит форму, и вам никогда не придётся писать объект вручную.

Чтобы протестировать несколько шагов вместе, запустите настоящее ядро только со store plugin. Plugin `dom` не нужен, потому что вам нужно проверить только state. Опция `onStep` собирает то, что произошло.

```ts flow.test.ts
import assert from "node:assert/strict";
import { createApp, type Plugin } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { Search } from "./search.ts";

const fakeHttp: Plugin = {
  name: "http",
  handle(effect, ctx) {
    ctx.dispatch({
      id: effect.onSuccess as string,
      payload: { status: 200, data: ["Ann Lee", "Anna Fox"] },
    });
  },
};
const fakeTime: Plugin = {
  name: "time",
  handle(effect, ctx) {
    ctx.dispatch({ id: effect.replyTo as string, payload: effect.payload });
  },
};

const store = createStorePlugin({ query: "", status: "idle", results: [] });
const steps: string[] = [];
const app = createApp({
  app: new Search(),
  plugins: [store, fakeHttp, fakeTime],
  onStep: (message) => steps.push(message.id),
});

app.dispatch({ id: "type", event: { type: "input", value: "ann" } });

assert.deepEqual(steps, ["type", "fire", "found"]);
assert.deepEqual(store.getState().results, ["Ann Lee", "Anna Fox"]);
assert.equal(store.getState().status, "idle");
```

Каждый из двух фальшивых plugins занимает четыре строки. Они отвечают сразу, и тест видит всю цепочку: `type`, затем `fire` от таймера, затем `found` от запроса. Ни часов, ни сети, ни браузера.

Когда вам всё же нужно проверить шаблон в DOM, в `@pavlus/frontend/testing` есть `mountView(viewOrComponent, initialState)`. Он монтирует view в новый контейнер без ядра и возвращает контейнер, `messages`, отправленные страницей, и `set(next)` для изменения state. Клик по кнопке даёт вам message для сравнения, а `set` показывает изменённый DOM.

## Что вы узнали

- Цикл такой: событие, message, handler, effects, plugins, store, новый state, `diff`, patches, DOM. Messages, effects и patches — всё это обычные данные.
- Чистые handlers можно тестировать через `assert`, запускать на сервере и воспроизводить. Чистота — это договорённость, которую фреймворк не контролирует.
- Messages выполняются по одному. Effects выполняются в возвращённом порядке, ответы ждут в очереди, а plugins узнают о state один раз на message.
- Plugins владеют всеми побочными действиями и изменяемыми данными для них. Они отвечают messages, а state меняет только store.
- Handler можно протестировать напрямую через `toHandler`, а весь поток — через `createApp`, store и небольшие фальшивые plugins.

Дальше: [Компоненты и состояние](page:concepts-components).
