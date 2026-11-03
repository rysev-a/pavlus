---
summary: Те же чистые шаблоны, что работают в браузере, могут работать на сервере и выдавать HTML. Вы узнаете, что предлагает модуль ssr, как загрузить данные до рендеринга, как браузер подхватывает разметку и что не поддерживается.
---
## Зачем рендерить на сервере

Обычная страница pavlus начинается пустой. Браузер скачивает небольшой HTML-файл, затем JavaScript, а потом код строит страницу. Пока это не закончилось, посетитель ничего не видит, и программа, которая читает только HTML (поисковая система, превью ссылки), тоже ничего не видит.

**Серверный рендеринг** (SSR) меняет первый шаг. Сервер запускает ваше приложение, получает HTML страницы и отправляет его вместе с JavaScript. Посетитель видит страницу сразу. Затем JavaScript запускается в браузере и **гидрирует** (hydrate) разметку: навешивает слушатели событий на уже существующие элементы. Ничего не перестраивается.

В pavlus это работает без второй кодовой базы, потому что приложение состоит из чистых функций. Шаблон компилируется в `render(state)`, который возвращает обычные данные, и `render` всё равно, где он запущен. Handler возвращает effects, тоже обычные данные. Внешнего мира касаются только plugins, а на сервере вы просто даёте приложению другие plugins.

```text
server                                   browser
createApp({ app, plugins })  --state-->  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) -> the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) --html-->    (listeners and ids on the markup)
```

## Самый маленький пример

Одна функция, без которой не обойтись, — `renderToString`. Она принимает view и state и возвращает строку.

::demo hello

Демо показывает HTML, который `render` создал для этого state. На сервере вы бы вызвали:

```ts
import { compileToView } from "@service-laboratory/pavlus/compiler";
import { renderToString } from "@service-laboratory/pavlus/ssr";

const view = compileToView("p Hello, {name}");
renderToString(view, { name: "Ann" });
```

и получили бы такую строку, то есть HTML демо между двумя комментариями:

```text
<!--pavlus--><p>Hello, Ann</p><!--/pavlus-->
```

(Ваше приложение импортирует view через `import view from "./hello.pavlus"`. `compileToView` — способ получить тот же view в скрипте или в тесте, без Vite.)

Два комментария `<!--pavlus-->` и `<!--/pavlus-->` — это **маркеры** серверного рендера. Plugin DOM ищет их при монтировании. Если они есть, он гидрирует разметку между ними; если нет, строит страницу как обычно.

## Что предлагает модуль ssr

В модуле `@service-laboratory/pavlus/ssr` три функции. Ещё две связанные функции приходят из основного пакета.

| Функция | Что делает |
| --- | --- |
| `renderToString(view, state)` | HTML view для этого state между двумя комментариями-маркерами. |
| `serializeState(state, components)` | State в виде JSON. Значения-компоненты в state заменяются своими именами. |
| `reviveState(json, components)` | State обратно из JSON, с возвращёнными на место экземплярами компонентов. |
| `viewOf(component)` | Из основного пакета. View компонента, замкнутый на компонент, поэтому `+outlet` и дочерние компоненты работают. |
| `toHtml(vnodes)` | Из основного пакета. Простой HTML из vnodes, без каких-либо маркеров. |

`renderToString` — это `toHtml` с флагом: он дополнительно пишет *маркеры блоков* шаблона. Посмотрите, что компилятор кладёт в список:

::demo list open=vnodes

В vnodes вы видите узлы `marker` вокруг блока `for`. Это невидимые комментарии в DOM, и по ним runtime находит, где блок начинается и заканчивается. Серверный рендер должен их содержать, иначе браузер не сможет потом обновлять список. С флагом тот же state даёт:

```text
<!--pavlus--><ul><!--1s--><!--1[#1--><li class="done">a</li><!--1]#1--><!--1[#2--><li>b</li><!--1]#2--><!--1e--></ul><!--/pavlus-->
```

Если вам нужен только простой HTML, для письма или статической страницы, которая никогда не гидрируется, используйте `toHtml(view.render(state))`. В нём нет маркеров, и он меньше.

### Экранирование

Текст и значения атрибутов экранируются за вас. Тот же шаблон с враждебным именем:

::demo escape

HTML в демо показывает текст как текст, а не как тег. В строке символы `<`, `>` и `&` в тексте и кавычки в атрибутах записаны как сущности (`&lt;script&gt;`). Ваш state не может добавить на страницу тег.

## Загрузка данных до рендера

Страница редко показывает только статический state. Обычно страница загружает данные при входе через запрос `http`. Сервер должен дождаться этих данных, прежде чем рендерить. Вот план:

1. Создайте приложение **без `mount`**. DOM нет.
2. Дайте ему store, plugin `http` и plugins, которые принимают effects браузерных plugins и ничего не делают.
3. Отправьте message, которое отправил бы router, с запрошенным адресом.
4. Дождитесь, пока не останется ни одного запроса в полёте.
5. Прочитайте state и отрендерите.

Почему отправлять вручную? В браузере plugin router читает `window.location` и отправляет `routeChanged`. На сервере окна нет, но адрес известен: это URL запроса. Компонент с таблицей `routing` обрабатывает `routeChanged` по умолчанию (`setRoute`), поэтому страницы, в которые происходит `enter`, начинают загружать свои данные точно так же, как в браузере.

У plugin `http` есть опция `fetch`. На сервере вы передаёте `fetch`, который отвечает в том же процессе, без сокета. А `http.settled()` — это promise, который выполняется, когда в полёте больше ничего нет, **включая запросы, запущенные ответами**. Если страница загружает список, а затем загружает подробности каждого элемента, `settled` дождётся всех.

Для effects plugins, которые на сервере не имеют смысла, нужна заглушка. Если приложение возвращает `router.navigate(...)`, а plugin `router` не зарегистрирован, ядро выбрасывает `no plugin "router" for effect "navigate"`. Заглушка — это plugin из одной строки:

```ts
const inert = (name: string): Plugin => ({ name, handle() {} });
```

## Полный пример

Мы построим небольшой сайт с двумя постами. Главная страница — view, страница поста — компонент, который загружает пост при входе. Файлы те же, что и для браузерного приложения, плюс `server.ts`.

Шаблон оболочки и страницы:

```pavlus app.pavlus
div.app
  nav
    a(href="/" @click.prevent=navigate("/")) Home
    a(href="/posts/1" @click.prevent=navigate("/posts/1")) First post
    a(href="/posts/2" @click.prevent=navigate("/posts/2")) Second post
  main
    +outlet
```

```pavlus home.pavlus
section
  h1 Home
  p Pick a post.
```

```pavlus not-found.pavlus
section
  h1 Page not found
  a(href="/" @click.prevent=navigate("/")) Back to the home page
```

```pavlus post.pavlus
article.post
  if status === "loading"
    p Loading...
  else if status === "failed"
    p.error Could not load the post.
  else
    h1 {post.title}
    p {post.body}
    button(type="button" @click=like) Like ({likes})
```

Страница поста запрашивает свои данные в `enter`, используя `id` из route. Ответы приходят как messages `loaded` и `failed`:

```ts post.ts
import {
  Component,
  type Effect,
  type Message,
  type Route,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./post.pavlus";

export interface PostState {
  status: "idle" | "loading" | "ready" | "failed";
  post: { id: number; title: string; body: string } | null;
  likes: number;
}

export const initialPost: PostState = { status: "idle", post: null, likes: 0 };

export class Post extends Component<PostState> {
  view = view;

  enter(msg: Message): Effect[] {
    const { params } = msg.payload as Route;
    return [
      store.set("status", "loading"),
      http.request({
        id: "post",
        url: `/api/posts/${params.id}`,
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message): Effect[] {
    const { data } = msg.payload as { data: PostState["post"] };
    return [store.set("post", data), store.set("status", "ready")];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  like(_msg: Message, state: PostState): Effect[] {
    return [store.set("likes", state.likes + 1)];
  }
}

export const post = new Post();
```

```ts app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import view from "./app.pavlus";
import homeView from "./home.pavlus";
import notFoundView from "./not-found.pavlus";
import { initialPost, post, type PostState } from "./post.ts";

export interface AppState {
  route: Route | null;
  post: PostState;
}

export const initialState: AppState = { route: null, post: initialPost };

export class Shell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/posts/:id": { component: post, key: "post" },
    "*": { view: notFoundView },
  };
}

export const shell = new Shell();

/** Component instances that are values in the state: none in this app. */
export const components = {};
```

`components` — это список экземпляров компонентов, которые являются *значениями* в state (шаблон может встроить `+{expr}`, и тогда state содержит компонент). В этом приложении таких нет. Мы вернёмся к этому ниже.

Теперь сервер. Новый store, новый plugin `http` и новое приложение создаются **для каждого запроса**. Компоненты (`shell`, `post`) общие, потому что они не хранят state; state общим не является:

```ts server.ts
import {
  createApp,
  matchRoute,
  type Plugin,
  viewOf,
} from "@service-laboratory/pavlus";
import {
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { renderToString, serializeState } from "@service-laboratory/pavlus/ssr";
import { components, initialState, shell } from "./app.ts";

const POSTS = [
  { id: 1, title: "Hello", body: "The first post." },
  { id: 2, title: "Second", body: "Another one." },
];

/** A fetch that answers the API without a socket. */
const inProcess: typeof fetch = async (input) => {
  const match = /^\/api\/posts\/(\d+)$/.exec(String(input));
  const post = POSTS.find((p) => p.id === Number(match?.[1]));
  return new Response(JSON.stringify(post ?? { error: "not found" }), {
    status: post ? 200 : 404,
    headers: { "content-type": "application/json" },
  });
};

/** A plugin that accepts its effects and does nothing. */
const inert = (name: string): Plugin => ({ name, handle() {} });

export async function renderPage(url: URL) {
  const store = createStorePlugin(initialState);
  const http = createHttpPlugin({ fetch: inProcess });
  const app = createApp({
    app: shell,
    plugins: [store, http, inert("dom"), inert("router")],
  });
  app.dispatch({
    id: "routeChanged",
    payload: { path: url.pathname, search: url.search, hash: "" },
  });
  await http.settled();
  app.dispose();
  const state = store.getState();
  const match = state.route && matchRoute(shell.routing, state.route);
  return {
    status: match && match.pattern !== "*" ? 200 : 404,
    html: renderToString(viewOf(shell)!, state),
    state: serializeState(state, components),
  };
}

/** The page: the template with the markup and the state put in. */
export function renderDocument(
  template: string,
  page: { html: string; state: string },
): string {
  const state = JSON.stringify(page.state).replace(/</g, "\\u003c");
  return template
    .replace(
      "</head>",
      () => `<script>window.__STATE__ = ${state};</script></head>`,
    )
    .replace('<div id="app"></div>', () => `<div id="app">${page.html}</div>`);
}
```

Прочитайте `renderPage` не торопясь. Она возвращает три вещи: `status`, `html` и `state` в виде JSON. Статус берётся из `matchRoute`, той же функции, которую использует outlet: если лучшее совпадение — запись `"*"` или совпадения нет, сервер отвечает 404. Фреймворк не делает этого за вас, потому что HTTP-ответ — дело вашего сервера.

`renderDocument` вставляет части в `index.html`. Разметка попадает в элемент монтирования **вместе с комментариями-маркерами, которые написал `renderToString`**. State попадает в скрипт перед собственным скриптом приложения. Две детали:

- JSON сначала превращается в строку JavaScript (`JSON.stringify` от строки), а `<` записывается как `<`. Текст вроде `</script>` в вашем state не может закрыть элемент script.
- `replace` вызывается с функцией, а не со строкой. В строке замены `$&` и `$'` имеют значение, поэтому пост, содержащий их, был бы испорчен.

Наконец, браузер. Он восстанавливает state, если он есть, и монтируется как обычно:

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { reviveState } from "@service-laboratory/pavlus/ssr";
import { type AppState, components, initialState, shell } from "./app.ts";

const json = (globalThis as { __STATE__?: string }).__STATE__;

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(
      json ? reviveState<AppState>(json, components) : initialState,
    ),
    createDomPlugin(),
    createRouterPlugin(),
    createHttpPlugin(),
  ],
  mount: "#app",
});
```

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Posts</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Когда целевой `#app` уже содержит серверный рендер, `mount` **гидрирует** его. Когда у страницы нет state (обычная сборка без сервера), `json` не определён, и store стартует с `initialState`; приложение работает как обычное клиентское.

Тест запускает сервер, помещает результат в jsdom, запускает клиентский код и проверяет три обещания SSR: содержимое на месте, узлы не перестроены, а пост не загружается второй раз.

```ts ssr.test.ts
import { expect, test, vi } from "vitest";
import { renderDocument, renderPage } from "./server.ts";

const template = `<!doctype html><html><head><title>Posts</title></head><body><div id="app"></div></body></html>`;

test("the server loads the post and renders it", async () => {
  const page = await renderPage(new URL("http://example.com/posts/2"));
  expect(page.status).toBe(200);
  expect(page.html).toContain("<h1>Second</h1>");
  expect(JSON.parse(page.state).post.status).toBe("ready");
  expect(renderDocument(template, page)).toContain(
    '<div id="app"><!--pavlus-->',
  );
});

test("a missing page is a 404 with the not-found page", async () => {
  const page = await renderPage(new URL("http://example.com/nowhere"));
  expect(page.status).toBe(404);
  expect(page.html).toContain("Page not found");
});

test("a user text cannot close the script or the markup", async () => {
  const doc = renderDocument(template, {
    html: "<p>$&</p>",
    state: JSON.stringify({ text: "</script><b>" }),
  });
  expect(doc).toContain("<p>$&</p>");
  expect(doc).not.toContain("</script><b>");
});

test("the browser hydrates the markup and does not load the post again", async () => {
  const page = await renderPage(new URL("http://example.com/posts/2"));
  document.body.innerHTML = `<div id="app">${page.html}</div>`;
  const button = document.querySelector("button")!;
  Object.assign(globalThis, { __STATE__: page.state });
  history.replaceState(null, "", "/posts/2");
  const warn = vi.spyOn(console, "warn");
  const requests: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requests.push(url);
    return new Response("{}");
  }) as typeof fetch;

  await import("./main.ts");

  expect(warn).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  expect(document.querySelector("button")).toBe(button);
  button.click();
  expect(button.textContent).toBe("Like (1)");
});
```

## Как работает гидрация и что она проверяет

Plugin DOM обходит разметку, которую написал сервер, рядом с узлами, которые возвращает `render(state)`. Для каждого элемента он проверяет, что тег совпадает с ожидаемым view; навешивает слушатели и регистрирует id узлов; затем переходит к дочерним. Ничего не создаётся, поэтому нет вспышки, а state элементов формы (текст, который посетитель уже набрал) сохраняется.

HTML-парсер делает две вещи, на которых споткнулся бы наивный обход: он склеивает соседние текстовые узлы и отбрасывает пустые. Гидрация отменяет оба: она делит склеенный текстовый узел в нужном месте и возвращает пустые.

Если разметка не совпадает с view, страница всё равно работает. Plugin выводит предупреждение и рендерит заново:

```text
pavlus/dom: the server render does not match the view (expected <p>); rendering afresh
```

и:

```text
pavlus/dom: the server render does not match the view (text "Hello, Bob" is not "Hello, Ann"); rendering afresh
```

Причины обычные: state в браузере не тот, что использовал сервер, или у браузера другая версия шаблона, чем у сервера.

Первый `routeChanged` после гидрации несёт адрес, который отрендерил сервер, поэтому `setRoute` не отправляет `enter`. Поэтому тест выше не видит ни одного запроса: данные уже в state.

## Что поддерживается, а что нет

SSR в pavlus намеренно мал. Этот список — вся правда:

- **Поддерживается.** Рендеринг view или компонента (с дочерними компонентами и `+outlet`) в строку; сериализация и восстановление state; гидрация через навешивание слушателей и id; ожидание запросов `http`; возврат к клиентскому рендеру, когда разметка отличается.
- **Одна строка, без потоковой передачи.** `renderToString` синхронный и возвращает всю страницу целиком.
- **Ожидается только `http`.** `http.settled()` знает только о запросах `http`. Таймер `time` или message `ws` не ожидаются, и лучше не регистрировать эти plugins на сервере.
- **State должен быть JSON.** `serializeState` — это `JSON.stringify` с одним добавлением, экземплярами компонентов. `Date` становится строкой, `undefined` и функции отбрасываются, `NaN` становится `null`, `Map` становится `{}`. Держите state простым, как и следует делать в любом случае.
- **Гидрация сравнивает структуру, а не атрибуты.** Проверяются теги, текст и маркеры. Если сервер написал `class="x"`, а в клиентском view его нет, гидрация проходит успешно, и атрибут остаётся, пока patch его не затронет. Не рендерьте на сервере другие атрибуты.
- **Маркеры должны уцелеть.** Если вы вырежете комментарии `<!--pavlus-->` и `<!--/pavlus-->` из HTML (минификатор, шаблон, сделанный вручную), браузер не увидит серверного рендера и добавит вторую копию страницы после первой. Проверяйте свой конвейер на настоящем выводе.
- **Нет управления `<head>`.** Заголовок и мета-теги — ваши: вычисляйте их из state в `renderDocument`.
- **Нет базового пути.** Сервер передаёт путь, который получил. Если ваш сайт обслуживается под префиксом, отрежьте его до отправки `routeChanged`, как это делает в браузере `windowAt` из ui-kit (см. [Маршрутизация](page:concepts-routing)).
- **Нет HTTP-сервера.** Фреймворк даёт вам функции. Маршрутизация HTTP-запросов, раздача собранных файлов и запуск Vite в разработке — работа вашего сервера. В `admin-app` этого репозитория есть полный пример в `backend/ssr.ts` и `backend/server.ts`, а `frontend/entry-server.ts` — модуль, который загружает сервер.

> [!WARNING] Один store на запрос
> Никогда не создавайте plugin store в начале серверного модуля. State оказался бы общим для всех запросов, и посетитель мог бы увидеть данные предыдущего. Создавайте store, plugin `http` и приложение внутри функции, которая обрабатывает один запрос, и в конце вызывайте для приложения dispose.

## Компоненты в state

Шаблон может встроить компонент, который является *значением* в state: `+{view}#name(...)`. Тогда в state лежит экземпляр класса, а JSON его хранить не может. `serializeState` принимает второй аргумент, объект, который даёт каждому экземпляру имя, и пишет вместо него `{"$component": name}`. `reviveState` принимает тот же объект и возвращает экземпляры на место.

```ts
class Table extends Component {}
const table = new Table();

serializeState({ n: 1, mode: table }, { table });
// {"n":1,"mode":{"$component":"table"}}
```

Экземпляр, которого нет в объекте, — это ошибка, и она говорит, что делать:

```text
pavlus/ssr: a Table instance is in the state; list it in `components` to serialize it
```

Имя, которого браузер не знает, тоже ошибка: `pavlus/ssr: no component named "zzz"`. Поэтому сервер и браузер должны импортировать один и тот же объект `components`. В примере выше он экспортируется из `app.ts`, и обе стороны его используют.

## Что вы узнали

- SSR — это тот же чистый `render`, запущенный на сервере. `renderToString` возвращает HTML между двумя комментариями-маркерами, а plugin DOM его гидрирует.
- Чтобы загрузить данные, создайте приложение без `mount`, отправьте `routeChanged` с адресом запроса и перед рендерингом дождитесь `http.settled()`.
- State путешествует как JSON в скрипте; `serializeState` и `reviveState` обрабатывают значения-компоненты.
- Создавайте store и приложение для каждого запроса. Маркеры должны дойти до браузера, а фреймворк сравнивает только структуру.

Дальше: [Как работают плагины](page:plugins-overview).
