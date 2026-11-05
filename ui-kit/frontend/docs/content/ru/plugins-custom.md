---
summary: Напишите plugin шаг за шагом: от plugin для заголовка в три строки до plugin хранилища, который отвечает message, и plugin viewport, который за собой убирает. Вы узнаете правила, как тестировать plugin с поддельным контекстом и когда его писать не нужно.
---
## Самый маленький plugin

Plugin — это объект с `name` и функцией `handle`. Больше фреймворку ничего не нужно. Вот plugin, который задаёт заголовок вкладки браузера:

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export const titlePlugin: Plugin = {
  name: "title",
  handle(effect) {
    document.title = String(effect.text);
  },
};
```

Вы регистрируете его вместе с остальными:

```ts
createApp({
  app: shell,
  plugins: [createStorePlugin(initialState), new DomPlugin(), titlePlugin],
  mount: "#app",
});
```

А handler просит заголовок, возвращая для него effect:

```ts
count(msg: Message): Effect[] {
  return [{ plugin: "title", type: "set", text: `${msg.payload} left` }];
}
```

Это весь путь. Handler остаётся чистым: он возвращает данные. Ядро находит plugin, чей `name` равен `"title"`, и вызывает `handle(effect, ctx)`. Единственная строка с `document.title` — единственная нечистая строка во всём приложении, и она лежит там, где её легко найти.

Это работает, но пока не очень хорошо. `effect.text` имеет тип `unknown`, поэтому понадобилось `String(...)`. Опечатка в handler (`txt` вместо `text`) не вызывает ошибки компиляции. А `document` — глобальная переменная, которую тесту приходится подделывать. Следующие шаги исправляют эти три проблемы.

## Типизируйте effect и поставьте effector

Дайте plugin тип его effects. Effect — это union объектов с `plugin` и `type`; `Plugin<E>` принимает этот union. Затем effector: небольшой объект функций, которые строят effects. Наконец, примите внешний мир, здесь документ, как параметр со значением по умолчанию.

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type TitleEffect = { plugin: "title"; type: "set"; text: string };

export const titleEffector = {
  set: (text: string): TitleEffect => ({ plugin: "title", type: "set", text }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect> {
  return {
    name: "title",
    handle(effect) {
      doc.title = effect.text;
    },
  };
}
```

Прочитайте это сверху.

- `TitleEffect` — форма данных. `plugin: "title"` и `type: "set"` — литеральные типы, поэтому effect нельзя перепутать с effect другого plugin. Если позже вы добавите второй effect, сделайте тип union: `type TitleEffect = SetTitle | ResetTitle`, и `handle` сможет переключаться по `effect.type`.
- `titleEffector.set(text)` возвращает именно тот объект из первой версии, но с типами. Теперь handler читается как `title.set(...)`, а неверное поле — ошибка компиляции.
- `createTitlePlugin(doc)` — фабрика. По умолчанию это глобальный `document`, разрешаемый в момент вызова фабрики, поэтому на сервере, где нет `document`, вы просто не создаёте этот plugin. Тест передаёт документ jsdom или любой объект с полем `title`.
- Возвращаемый тип — `Plugin<TitleEffect>`. Внутри `handle` `effect.text` имеет тип `string`.

Теперь handler выглядит так же, как у встроенных:

```ts
import { titleEffector as title } from "./title.ts";

count(msg: Message): Effect[] {
  return [title.set(`${msg.payload} left`)];
}
```

> [!NOTE] Два способа типизировать effect
> Plugins ui-kit пишут `interface RandomEffect extends Effect`, что допускает любое дополнительное поле. Plugins фреймворка используют union точных типов объектов, что строже: несуществующее поле — ошибка. Оба вида присваиваются к `Effect`, поэтому оба можно вернуть из handler. Для plugin с несколькими effects используйте строгую форму.

## Plugin, который отвечает

Plugin title никогда не отвечает. Большинство plugins отвечают: работа занимает время или может завершиться ошибкой. Правило то же, что и у встроенных. Effect называет messages для ответа, а plugin вызывает `ctx.dispatch`.

Напишем plugin для `localStorage`. У него два effects: `load` читает ключ и отвечает значением, `save` записывает его. Значение хранится как JSON.

```ts storage.ts
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

На что стоит обратить внимание:

- **Имена ответов.** У `load` есть `onSuccess` и `onError`, стандартные имена. Дочерний компонент получает свой префикс message перед этими полями, поэтому ответ находит дорогу назад к дочернему. Поле с именем `onDone` не получило бы префикса, и ответ ушёл бы в корень. Используйте `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` или `onChange`.
- **Сбой — это message.** `try`/`catch` превращает исключение (заблокированное хранилище, значение, не являющееся JSON) в message `onError` с причиной. Что делать, решает приложение. В ядро ничего не выбрасывается. Для `save` поле `onError` необязательно: если никто не просил, ошибка отбрасывается.
- **Мир — это опция.** `storage` по умолчанию равен глобальному `localStorage`, читаемому в момент обработки effect, а тест передаёт обычный объект с `getItem` и `setItem`.
- **Ответ может быть синхронным.** `ctx.dispatch` внутри `handle` безопасен. Ядро ставит message в очередь и обрабатывает его после текущего, поэтому handler, который запросил `load`, уже закончил.
- **Отсутствие ключа — не ошибка.** `getItem` возвращает `null`, и ответ — `null`. Что это значит, решает handler.

Код, который это использует, — два handlers: один спрашивает, другой получает:

```ts
load(): Effect[] {
  return [storage.load("todos", "loaded", "loadFailed")];
}

loaded(msg: Message): Effect[] {
  const items = Array.isArray(msg.payload) ? msg.payload : [];
  return [store.set("items", items)];
}
```

Это обычный цикл. `load` возвращает effect `storage`; plugin читает ключ и отправляет `{ id: "loaded", payload: [...] }`; на следующем ходе `loaded` сохраняет значение. Ни promise, ни callback, ни state вне store.

## Тестирование plugin с поддельным контекстом

Plugin принимает контекст, а контекст — это три функции. Тест может построить его в четыре строки:

```ts storage.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import { createStoragePlugin, storageEffector as storage } from "./storage.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("storage loads, saves and reports errors", () => {
  const data: Record<string, string> = { a: '{"n":1}', bad: "{oops" };
  const plugin = createStoragePlugin({
    storage: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value),
    },
  });
  const { ctx, sent } = fakeContext();
  plugin.handle(storage.load("a", "ok", "failed"), ctx);
  plugin.handle(storage.load("missing", "ok", "failed"), ctx);
  plugin.handle(storage.load("bad", "ok", "failed"), ctx);
  plugin.handle(storage.save("b", [1, 2]), ctx);
  expect(sent).toEqual([
    { id: "ok", payload: { n: 1 } },
    { id: "ok", payload: null },
    { id: "failed", payload: expect.stringContaining("SyntaxError") },
  ]);
  expect(data.b).toBe("[1,2]");
});
```

Тест передаёт поддельный `storage` из обычного объекта, вызывает `handle` с effects, построенными effector, и сравнивает отправленное со списком. Он проверяет три важных случая: значение существует, ключ отсутствует и значение не является JSON. Нет ни приложения, ни хранилища браузера, ни библиотеки для моков.

Полезны ещё два вида тестов, и оба умещаются в несколько строк:

```ts title.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type PluginContext,
} from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { createTitlePlugin, titleEffector as title } from "./title.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the title plugin sets document.title", () => {
  const { ctx } = fakeContext();
  createTitlePlugin(document).handle(title.set("3 left"), ctx);
  expect(document.title).toBe("3 left");
});

test("a handler asks for a title, the app performs it", () => {
  const app = createApp({
    app: (message: Message): Effect[] =>
      message.id === "count" ? [title.set(`${message.payload} left`)] : [],
    plugins: [createStorePlugin({}), createTitlePlugin(document)],
  });
  app.dispatch({ id: "count", payload: 2 });
  expect(document.title).toBe("2 left");
});
```

Второй тест запускает настоящее ядро с настоящим plugin title: handler возвращает effect, и заголовок документа меняется. Используйте его для plugin, который применяется в приложении. Поддельный контекст используйте для самого plugin.

## Plugin, который убирает за собой

`title` и `storage` ничего не удерживают. Plugin, который регистрирует слушатель, таймер или сокет, чем-то владеет и должен это вернуть. Ядро вызывает `dispose()`, когда приложение уничтожается, в порядке, обратном регистрации.

Вот plugin, который сообщает размер окна. Effect `listen` запускает слушатель `resize`, `stop` его убирает.

```ts viewport.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type ViewportEffect =
  | { plugin: "viewport"; type: "listen"; onChange: string }
  | { plugin: "viewport"; type: "stop" };

export const viewportEffector = {
  listen: (onChange: string): ViewportEffect => ({
    plugin: "viewport",
    type: "listen",
    onChange,
  }),
  stop: (): ViewportEffect => ({ plugin: "viewport", type: "stop" }),
};

export function createViewportPlugin(
  win: Window = window,
): Plugin<ViewportEffect> {
  let stop: (() => void) | undefined;
  const size = () => ({ width: win.innerWidth, height: win.innerHeight });

  return {
    name: "viewport",
    handle(effect, ctx) {
      stop?.();
      stop = undefined;
      if (effect.type === "stop") return;
      const report = () =>
        ctx.dispatch({ id: effect.onChange, payload: size() });
      win.addEventListener("resize", report);
      stop = () => win.removeEventListener("resize", report);
      report();
    },
    dispose() {
      stop?.();
    },
  };
}
```

Из этого стоит вынести три момента.

1. Plugin хранит способ отменить собственную работу, `stop`, в переменной фабрики. Эта переменная — закрытый state plugin. Код приложения её никогда не видит.
2. Каждый `handle` сначала вызывает `stop?.()`. Повторное прослушивание **заменяет** предыдущий слушатель, как у plugin router. Без этого два effects `listen` давали бы два отчёта на одно изменение размера.
3. `dispose` убирает слушатель. Без него тест, который создаёт и уничтожает десять приложений, теряет десять слушателей.

Тест управляет им с настоящим окном jsdom:

```ts viewport.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import {
  createViewportPlugin,
  viewportEffector as viewport,
} from "./viewport.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the viewport plugin reports the size, and stops when disposed", () => {
  const { ctx, sent } = fakeContext();
  const plugin = createViewportPlugin(window);
  plugin.handle(viewport.listen("resized"), ctx);
  expect(sent).toEqual([
    { id: "resized", payload: { width: 1024, height: 768 } },
  ]);

  Object.assign(window, { innerWidth: 500 });
  window.dispatchEvent(new Event("resize"));
  expect(sent.at(-1)).toEqual({
    id: "resized",
    payload: { width: 500, height: 768 },
  });

  plugin.dispose?.();
  window.dispatchEvent(new Event("resize"));
  expect(sent).toHaveLength(2);
});
```

Используйте тот же приём для всего, у чего есть идентичность. Plugin, оборачивающий библиотеку диаграмм, хранил бы таблицу от id к диаграмме, заменял бы диаграмму, когда тот же id рисуется снова, и уничтожал бы их все в `dispose`.

## Разбор настоящего plugin: random

В ui-kit есть plugin, достаточно короткий, чтобы прочитать его целиком. Handler не может вызвать `Math.random()`, потому что одно и то же message давало бы разные effects. Поэтому он просит число у plugin и получает его обратно как message:

```ts random.ts
import type { Effect, Plugin } from "@service-laboratory/pavlus";

/**
 * The application is pure: it cannot call `Math.random()`. It asks this plugin
 * for a number and gets it back as a message, like an HTTP answer.
 */
export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  /** The answer is an integer from 0 up to, not including, `max`. */
  max: number;
  /** The id of the message that carries the answer as its payload. */
  replyTo: string;
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({
    plugin: "random",
    type: "int",
    max,
    replyTo,
  }),
};

export function createRandomPlugin(
  random: () => number = Math.random,
): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({
        id: effect.replyTo,
        payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)),
      });
    },
  };
}
```

- `RandomEffect` расширяет `Effect`, поэтому дополнительные поля разрешены. `max` — сколько значений нужно, `replyTo` — message, которое несёт ответ.
- `randomEffector.int(max, replyTo)` — единственный способ, которым приложение строит effect.
- `createRandomPlugin(random)` принимает источник случайности как параметр, по умолчанию `Math.random`. Это точка для тестирования: передайте `() => 0` или `() => 0.999999`, и ответ известен.
- `handle` делает одно дело и отвечает через `ctx.dispatch`. `Math.min` удерживает ответ ниже `max`, даже если собственный источник вернёт ровно 1.

Его использует кнопка случайного выбора на странице Theming. Один handler спрашивает, а другой получает ответ:

```ts
"theming.random"(): Effect[] {
  return [randomEffector.int(allThemes().length, "randomPicked")];
}

randomPicked(msg: Message, state: AppState): Effect[] {
  const pick = allThemes()[msg.payload as number];
  return pick
    ? this._choose(withTheme(state.look, pick.palette, pick.mode))
    : [];
}
```

а тест ui-kit проверяет это с фиксированным источником случайности:

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
const plugin = createRandomPlugin(() => 0.999999);
plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
createRandomPlugin(() => 0).handle(
  randomEffector.int(100, "randomPicked"),
  ctx,
);
expect(sent).toEqual([
  { id: "randomPicked", payload: 99 },
  { id: "randomPicked", payload: 0 },
]);
```

Заметьте, что тесту нужен только `dispatch`, поэтому поддельный контекст — это `{ dispatch }`. Остальные три plugins ui-kit (theme, source, docs) описаны в [справочнике по plugins](page:plugins-reference).

## Правила

1. **У plugin одно имя и одно семейство effects.** Называйте его по миру, с которым он говорит (`storage`, `viewport`, `title`), а не по функции, которая его использует.
2. **Не решайте, а делайте.** Plugin выполняет один effect. Он не читает state приложения, чтобы выбрать, что делать. Всё, что ему нужно, попадает в effect. `ctx.getState()` существует, потому что plugin DOM должен рендерить, но plugin, который ветвится по state, вынес логику приложения из чистого ядра, где её нельзя проверить обычной функцией.
3. **Отвечайте через `ctx.dispatch` с id message из effect.** Не возвращайте значение из `handle`, не храните callback, который приложение должно вызвать, и не называйте message внутри plugin. Кому достанется ответ, решает effect.
4. **Используйте стандартные имена ответов**, чтобы дочерние компоненты получали свой префикс.
5. **Ожидаемые сбои — это messages.** Ловите их и отправляйте `onError`. Баг (effect неверной формы) пусть выбрасывает исключение. Помните, что ядро не видит ошибку внутри promise или callback таймера: ловите её сами.
6. **Принимайте мир как опцию.** `fetch`, `storage`, `window`, `document`, часы, источник случайности. По умолчанию берите глобальный объект, разрешаемый в момент обработки effect или вызова фабрики.
7. **Владейте своими ресурсами и освобождайте их.** Храните слушатели, таймеры и сокеты в фабрике, делайте операции заменяемыми по id и убирайте в `dispose`.
8. **Поставляйте effector.** Для библиотеки экспортируйте интерфейс для effector и константу с этой аннотацией, потому что JSR требует явный тип у каждой экспортируемой константы, а интерфейс — хорошее место для комментариев документации.

> [!WARNING] Не изменяйте state из plugin
> У plugin нет способа изменить state, и искать его не стоит. State меняет только plugin `store`, в ответ на effect `store.set`, который вернул ваш handler. Если у plugin есть результат, которым нужно поделиться, он отправляет message, а handler превращает его в `store.set`.

## Когда plugin писать не нужно

Plugin нужен для внешнего мира. Если работа — это вычисление, plugin не то место, и проще обойтись функцией. Используйте эту таблицу, прежде чем начинать:

| Что вы хотите | Что использовать |
| --- | --- |
| Форматировать дату, отсортировать список, вычислить итог | Чистая функция, которую вызывает handler |
| Хранить значение, производное от state (отфильтрованный список) | Вычислить в handler, сохранить через `store.set` |
| Вызвать API | Plugin `http` |
| Ждать, повторять, debounce | Plugin `time` |
| Дать фокус полю ввода | `dom.focus` |
| Изменить URL | Plugin `router` |
| Показать или скрыть что-то, переключить класс | Условие в шаблоне, управляемое state |
| Бизнес-правила, валидация | Handler |
| Прочитать API браузера, хранилище, устройство, стороннюю библиотеку с побочными эффектами | Plugin |

Если вы ловите себя на том, что кладёте внутрь `handle` `if` про данные приложения, этот код относится к handler.

## Что вы узнали

- Plugin — это `{ name, handle }`. Типизируйте его effects как union, стройте их через effector и принимайте внешний мир как опцию.
- Чтобы ответить, effect называет messages-ответы стандартными полями, а plugin вызывает `ctx.dispatch`. Сбои — это messages.
- Plugin, владеющий ресурсом, хранит способ его отмены и освобождает в `dispose`. Тестируйте с поддельным контекстом из трёх функций.
- Не принимайте решений в plugin, не трогайте state и не пишите plugin для того, что может сделать функция.

Дальше: [Руководство: полное приложение](page:guide-todo-app).
