---
summary: Компонент может перечислить свои страницы по путям и показать подходящую одной строкой, +outlet. Вы узнаете про таблицу маршрутов, route в state, enter и leave, вложенные маршруты и о том, как обслуживать приложение по базовому пути.
---
## Один путь, одна страница

Одностраничное приложение показывает разные страницы по разным адресам и не загружает каждый раз новый HTML-документ. В pavlus это **маршрутизация** (routing), и она описывается как данные. У компонента есть таблица `routing`: она сопоставляет шаблон пути с дочерним элементом, который нужно показать. Шаблон компонента одной строкой, `+outlet`, говорит, *где* он находится.

Вот самый маленький роутер. Три пути, три страницы:

```ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

А вот шаблон оболочки:

```pavlus
main.page
  +outlet
```

`+outlet` — встроенная конструкция. После неё ничего не пишется. Когда route равен `/about`, элемент `main` содержит страницу `about`, а когда `/` — главную страницу. Шаблоны слева сопоставляются с текущим путём, а `"*"` означает «всё, что осталось».

Имя, которое начинается со строчной буквы, — встроенная конструкция (`outlet`), а имя с заглавной буквы — импортированный компонент (`+Sidebar`). Поэтому они никогда не конфликтуют.

> [!NOTE] Откуда берётся текущий путь?
> Из **plugin router**. Он читает адрес браузера и сообщает о нём вашему приложению в виде message. В разделе «Подключение router» ниже показаны три строки, которые его подключают. Пока plugin ничего не сообщил, поле state `route` равно `null`, а outlet пуст.

## Что компилятор делает с +outlet

Outlet — не магия времени выполнения. Компилятор превращает строку в *динамический embed*: два маркера в DOM, а между ними view той страницы, которая подходит. Вот сгенерированный `render` оболочки выше, фрагмент для `+outlet`:

```ts
  // line 2: +outlet
  mainChildren.push({ t: "marker", id: "1s" + idSuffix });
  const outlet = resolveOutlet(env, state);
  if (outlet) {
    mainChildren.push(...outlet.view.render(
      outlet.state,
      idSuffix + "/1",
      messagePrefix + outlet.name + ".",
      outlet.component,
    ));
  }
  mainChildren.push({ t: "marker", id: "1e" + idSuffix });
```

`resolveOutlet(env, state)` смотрит на `env`, то есть на компонент, которому принадлежит шаблон, берёт его таблицу `routing` и сопоставляет `state.route`. Он возвращает view для рендеринга, **имя экземпляра** страницы и **state**, который увидит страница. Имя становится префиксом message: каждое событие внутри страницы отправляется как `<name>.<message>`. Это то же правило, что и для любого встроенного дочернего компонента, см. [Сообщения и дочерние компоненты](page:concepts-messages).

При изменении state `diff` делает одно из двух. Если подходит другая страница (другой view или другое имя), он очищает всё между двумя маркерами и рендерит новую страницу. Если страница та же, он запускает только её собственный `diff`. Поэтому переход с `/about` на `/` перестраивает содержимое, а изменение счётчика внутри страницы обновляет один текстовый узел.

> [!WARNING] Монтируйте компонент, а не только его view
> Для `+outlet` нужен `env`, то есть компонент с таблицей `routing`. `createApp({ mount })` передаёт его за вас. Если вы смонтируете «голый» view шаблона с outlet, вы получите: pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view. В тестах используйте `mountView(component, state)` из `@service-laboratory/pavlus/testing` вместе с самим компонентом.

## Шаблоны путей и сопоставление

Шаблон пути состоит из сегментов, разделённых `/`. Сегмент — это либо обычный текст, либо `:name`, который захватывает всё, что стоит на этом месте пути.

Правила короткие:

- Шаблон совпадает с путём полностью или как **префикс, который заканчивается на `/`**. `"/admin"` совпадает с `/admin` и `/admin/tasks`, но не с `/administrator`.
- `"/"` совпадает только с точным путём `/`. Это главная страница, и она никогда не бывает префиксом чего-либо.
- `":name"` захватывает один сегмент и декодирует его (`a%20b` становится `a b`).
- `"*"` совпадает со всем, что не совпало ни с чем другим.
- Если подходит несколько шаблонов, побеждает **самый длинный** (с наибольшим числом сегментов); если два одинаково длинные, то тот, что объявлен раньше.
- Если ничего не подошло и нет `"*"`, outlet остаётся пустым.

Эта таблица — настоящий вывод `matchRoute` для таблицы `"/"`, `"/users"`, `"/users/:id"`, `"/admin"` и `"*"`. Последние три столбца — это то, что подходящая страница получает как свой `route`:

| Путь | Подошедший шаблон | route.path | route.base | route.params |
| --- | --- | --- | --- | --- |
| `/` | `/` | `/` | (пусто) | нет |
| `/users` | `/users` | `/` | `/users` | нет |
| `/users/42` | `/users/:id` | `/` | `/users/42` | id равен 42 |
| `/users/42/edit` | `/users/:id` | `/edit` | `/users/42` | id равен 42 |
| `/admin/x` | `/admin` | `/x` | `/admin` | нет |
| `/administrator` | `*` | `/administrator` | (пусто) | нет |

Посмотрите на столбцы `route.path` и `route.base`. Страница видит не весь путь. Она видит то, что **осталось ниже** подошедшего шаблона (`path`), и то, что было использовано, чтобы до него дойти (`base`). Именно это делает вложенность возможной, и мы скоро к ней вернёмся.

`matchRoute(routing, route)` и `routeName(pattern, spec)` экспортируются из пакета, поэтому ту же логику можно использовать в тесте или на сервере.

## Запись маршрута

Значение в таблице — это *route spec*. Он имеет форму записи дочернего компонента (см. [страницу о компонентах](page:concepts-messages)) плюс два поля:

| Поле | Значение |
| --- | --- |
| `component` | Страница — это компонент: экземпляр класса со своими handlers и своим `view`. |
| `view` | Страница — это только шаблон, без собственной логики. Используйте `view` или `component`, но не оба сразу. |
| `select` | Как `component`, но выбирается из state: `select: (state) => ...`. Для страниц, которые являются значениями в state. |
| `key` | Имя поля state, которым владеет страница. Страница видит `state[key]`, а в путях её `store` спереди добавляется key. |
| `props` | Дополнительные поля только для чтения для страницы, вычисляемые из state родителя: `props: (s) => ({ count: s.people.length })`. |
| `name` | Имя экземпляра, то есть префикс message. По умолчанию это последний статический сегмент шаблона. |

Имя по умолчанию вычисляется так: `"/admin/tasks"` — это `tasks`, `"/users/:id"` — это `users` (сегмент `:id` пропускается), `"/"` — это `index`, а `"*"` — это `fallback`. Две записи не должны получить одно и то же имя, потому что message не смог бы их различить. Фреймворк отказывается работать и подсказывает, как исправить:

```text
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
```

### View или компонент?

**View** подходит для страницы, которая только показывает данные: страница «О нас», страница «не найдено», страница сведений, которая читает `route.params`. Он ничего не стоит, у него нет handlers, а нужные данные приходят из `props`.

**Компонент** подходит, когда страница реагирует: обрабатывает messages, загружает данные при входе, владеет частью state. Это обычный компонент; маршрутизация добавляет только поле `route` в его state и messages `enter` и `leave`.

У страницы, состоящей только из view, в шаблоне всё равно могут быть события. Событие `@click=pick(1)` на странице `about` отправляется как message `about.pick`, и компонент с таблицей `routing` может обработать его методом с именем `"about.pick"`. Единственное событие, которое вам редко приходится обрабатывать самому, — это `navigate`, о нём ниже.

## Route в state

У страницы с маршрутом в state есть поле `route`. Его можно читать в handlers и в шаблоне:

```ts
{ path: "/edit", base: "/users/42", params: { id: "42" }, search: "", hash: "" }
```

`search` и `hash` — необработанные строки, `"?page=2"` и `"#top"`. Фреймворк не разбирает строку запроса. В `params` лежат захваты `:name` этого уровня **и всех уровней выше**, поэтому глубоко вложенная страница всё равно может прочитать `id` своего «деда».

::demo route-state

Демо — это страница, которая показывает пользователя. Когда адрес меняется с `/admin/users/2` на `/admin/users/7`, шаблон обновляется на месте: роутер ничего не перестраивал, страница просто получила новый `route`. Странице, которой нужно загрузить данные нового пользователя, приходит ещё и новый message `enter`, как вы скоро увидите.

## Подключение router

Внешний мир — это plugin, как всегда. **Plugin router** читает адрес браузера и меняет его. У него четыре effects: `listen`, `navigate`, `back` и `forward` (все они описаны в [разделе о встроенных plugins](page:plugins-reference)). Здесь важны два из них.

- `router.listen("routeChanged")` запускает отчёты. Plugin сразу отправляет message `routeChanged` с текущим адресом, а затем снова после каждого `navigate` и каждого нажатия кнопок «назад» или «вперёд». Payload — это `{ path, search, hash }`.
- `router.navigate("/about")` добавляет новую запись в историю. Затем plugin сообщает слушателю о новом адресе, поэтому приходит тот же `routeChanged`.

Подключение писать не нужно. У компонента с таблицей `routing` есть два handlers по умолчанию:

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _state, { setRoute }) => setRoute(msg.payload),
```

`mounted` — это message, которое `createApp({ mount })` отправляет, когда приложение попало в DOM. `setRoute` — функция в контексте компонента. Она чистая. Она возвращает effect `store.set("route", ...)` и effects `leave` и `enter` для страниц, которые изменились. Если вы сами напишете метод с именем `mounted` или `routeChanged`, он заменит вариант по умолчанию. ui-kit так и делает, чтобы при смене route ещё и устанавливать тему и раздел меню. Упрощённая версия его оболочки:

```ts
routeChanged(msg: Message, _state: AppState, { setRoute }: ComponentCtx): Effect[] {
  const path = (msg.payload as { path: string }).path;
  return [
    ...setRoute(msg.payload),
    store.set("section", sectionOf(path)),
  ];
}

mounted(_msg: Message, state: AppState): Effect[] {
  return [router.listen("routeChanged"), themeEffector.apply(state.look, false)];
}
```

Handler обязан вызвать `setRoute` и вернуть его effects. Если он забудет это сделать, `route` не будет сохранён, а outlet останется пустым.

Для приложения с маршрутами нужны такие plugins: store (в нём лежит `route`), plugin dom и plugin router:

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { type AppState, initialState, shell } from "./app.ts";

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState),
    new DomPlugin(),
    createRouterPlugin(),
  ],
  mount: "#app",
});
```

> [!TIP] Начальный state содержит route: null
> Положите `route: null` в начальный state. Пока plugin router ничего не сообщил, шаблоны читают `route.path` от `null`, а путь в выражении защищён от null, поэтому ничего не ломается. Именно этот случай показывает второй шаг следующего демо.

## Ссылки, которые настоящие ссылки

Для навигации нужны ссылки. Ссылка должна быть настоящим `<a href>`, чтобы работали клик средней кнопкой, «открыть в новой вкладке» и строка состояния. Но обычный клик не должен загружать новый документ. В pavlus для этого пишут и то и другое:

```pavlus
a(href="/about" @click.prevent=navigate("/about")) About
```

`href` нужен браузеру. `@click.prevent` останавливает действие по умолчанию, а событие становится message `navigate` с payload `"/about"`. Handler для него писать не нужно. Message `navigate` (или `something.navigate`, из встроенного шаблона или страницы только с view), которое никто не обработал, со строковым payload по умолчанию превращается в `router.navigate(url)`. Url отсчитывается от компонента, который получает message, а для оболочки это весь сайт.

::demo links

Второй шаг демо показывает активную ссылку. Класс `active` — это условие на `route.path`. Когда route меняется с `null` на `/`, обновляется только первая ссылка.

> [!NOTE] Обычные href не переписываются
> Фреймворк переписывает url effect `router.navigate`. Атрибут `href` он не трогает, потому что это просто текст в вашем шаблоне. Когда страница находится под базовым путём, напишите базу сами: `href={route.base + "/users"}`. Полную картину вы найдёте в следующем разделе.

## enter и leave

Странице часто нужно что-то сделать, когда она появляется: загрузить данные, запустить таймер. И когда она исчезает: остановить таймер. Роутер сообщает об этом странице двумя messages.

- `enter` отправляется, когда страница становится активной. Payload — её `route`.
- `leave` отправляется, когда она перестаёт быть активной.

Messages вычисляет `setRoute` из прежнего и нового route, уровень за уровнем. Начиная с первого уровня, где активная страница отличается, старые страницы уходят (сначала самые глубокие), а новые входят (сверху вниз). Конечная страница получает `enter` ещё раз и тогда, когда изменился только её собственный route, например с `/items/5` на `/items/7`, потому что `params` разные. Изменение одного только `search` или `hash` повторного входа не вызывает.

Поэтому нигде не нужен список «страниц и их данных». Странице, которой нужны данные, просит их сама:

```ts
class Post extends Component<PostState> {
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
}
```

`id: "post"` в запросе важен. Если пользователь переходит с поста 1 на пост 2, пока пост 1 ещё загружается, второй запрос заменяет первый, а ответ на первый игнорируется. См. [раздел о http](page:plugins-reference) в справочнике по plugins.

## Вложенные маршруты

Маршрутизация вкладывается. Страница с маршрутом, у которой есть собственная таблица `routing`, получает только ту часть пути, что **ниже её base**, и навигация у неё относительная, при этом она не знает, кто её встраивает. Типичный случай — административная область сайта: у оболочки есть `/admin`, у страницы admin есть вкладки `/users` и `/users/:id`, а полные адреса — `/admin/users` и `/admin/users/2`.

Панель вкладок страницы admin не знает, что живёт под `/admin`. Она читает `route.base`, который фреймворк устанавливает в `/admin`:

::demo tabs

`href` равен `route.base + "/users"`, поэтому ссылка — `/admin/users`; message — `navigate("/users")`, а фреймворк добавляет base к effect. Правило относительного navigate такое: *самая внутренняя страница с маршрутом один раз добавляет весь свой base и помечает effect как `absolute`, чтобы уровни выше не добавляли свои ещё раз.* Чтобы перейти куда-то наружу, используйте `router.navigate(url, { absolute: true })`.

## Полный пример

Вот небольшой сайт с главной страницей, областью admin с двумя вкладками, списком пользователей, страницей пользователя и страницей «не найдено». В нём используются все идеи этой страницы. Файлы перечислены в том порядке, в котором вы бы их писали.

В шаблоне оболочки есть верхняя навигация и первый outlet:

```pavlus app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
    a(href="/admin" class:active={route.base === "/admin"} @click.prevent=navigate("/admin")) Admin
  main.app__main
    +outlet
```

У компонента оболочки три записи: главная страница только с view, компонент admin под key `admin` и запасной вариант `"*"`.

```ts app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import { admin, type AdminState, initialAdmin } from "./admin.ts";
import view from "./app.pavlus";
import homeView from "./home.pavlus";
import notFoundView from "./not-found.pavlus";

export interface AppState {
  route: Route | null;
  admin: AdminState;
}

export const initialState: AppState = { route: null, admin: initialAdmin };

export class Shell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/admin": { component: admin, key: "admin" },
    "*": { view: notFoundView },
  };
}

export const shell = new Shell();
```

Две простые страницы:

```pavlus home.pavlus
section
  h1 Home
  p Welcome to the site.
```

```pavlus not-found.pavlus
section
  h1 Page not found
  a(href="/" @click.prevent=navigate("/")) Back to the home page
```

У компонента admin своя таблица. Обратите внимание на три вида записей: view с `props`, компонент с `key` и `props`, и view с явным `name`, потому что `/users` и `/users/:id` оба назывались бы `users`.

```ts admin.ts
import { Component, type Routing } from "@service-laboratory/pavlus";
import view from "./admin.pavlus";
import overviewView from "./overview.pavlus";
import userView from "./user.pavlus";
import { usersPage, type UsersState } from "./users.ts";

export interface Person {
  id: number;
  name: string;
}

export interface AdminState {
  people: Person[];
  usersPage: UsersState;
}

export const initialAdmin: AdminState = {
  people: [
    { id: 1, name: "Ann" },
    { id: 2, name: "Bob" },
  ],
  usersPage: { visits: 0 },
};

export class Admin extends Component<AdminState> {
  view = view;

  routing: Routing<AdminState> = {
    "/": { view: overviewView, props: (s) => ({ count: s.people.length }) },
    "/users": {
      component: usersPage,
      key: "usersPage",
      props: (s) => ({ people: s.people }),
    },
    "/users/:id": { view: userView, name: "user" },
  };
}

export const admin = new Admin();
```

```pavlus admin.pavlus
div.admin
  nav.admin__tabs
    a(href={route.base} class:active={route.path === "/"} @click.prevent=navigate("/")) Overview
    a(href={route.base + "/users"} class:active={route.path !== "/"} @click.prevent=navigate("/users")) Users
  +outlet
```

Страницы под вкладками. Страницы overview и user — это views. Страница users — компонент: он считает, сколько раз в неё входили.

```pavlus overview.pavlus
p There are {count} people.
```

```pavlus user.pavlus
h2 User {route.params.id}
```

```pavlus users.pavlus
section
  h2 Users (this page was opened {visits} times)
  ul
    for person in people key person.id
      li
        a(href={route.base + "/" + person.id} @click.prevent=navigate("/" + person.id)) {person.name}
```

```ts users.ts
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./users.pavlus";

export interface UsersState {
  visits: number;
}

export class UsersPage extends Component<UsersState> {
  view = view;

  enter(_msg: Message, state: UsersState): Effect[] {
    return [store.set("visits", state.visits + 1)];
  }
}

export const usersPage = new UsersPage();
```

Три детали стоит рассмотреть повнимательнее.

Во-первых, state страницы users лежит в `admin.usersPage`. Страница пишет `store.set("visits", ...)`, и effect покидает страницу как `usersPage.visits`, а оболочку — как `admin.usersPage.visits`: каждый уровень ставит свой `key` спереди. Страница ничего не знает о том, где она смонтирована.

Во-вторых, `navigate("/" + person.id)` на странице users ведёт на `/admin/users/1`, потому что у страницы users маршрут `/admin/users`, а относительный url добавляется к её base.

В-третьих, `href` используют `route.base`: на странице users он равен `/admin/users`, поэтому ссылка — `/admin/users/1`, и браузер откроет правильный адрес по клику средней кнопкой.

Тест управляет всем сайтом с настоящими plugins в jsdom. Он кликает по ссылкам и смотрит на адрес и на страницу:

```ts routing.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { type AppState, initialState, shell } from "./app.ts";

function start(path: string) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", path);
  const store = createStorePlugin<AppState>(initialState);
  const app = createApp<AppState>({
    app: shell,
    plugins: [store, new DomPlugin(), createRouterPlugin()],
    mount: "#app",
  });
  return { app, store };
}
const click = (text: string) =>
  [...document.querySelectorAll("a")]
    .find((a) => a.textContent === text)!
    .click();
const main = () => document.querySelector("main")!.textContent;
const hrefs = () =>
  [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));

test("click through the site", () => {
  const { app, store } = start("/");
  expect(main()).toContain("Welcome");
  click("Admin");
  expect(location.pathname).toBe("/admin");
  expect(main()).toContain("There are 2 people.");
  expect(hrefs()).toEqual(["/", "/admin", "/admin", "/admin/users"]);
  click("Users");
  expect(location.pathname).toBe("/admin/users");
  expect(main()).toContain("opened 1 times");
  expect(hrefs()).toContain("/admin/users/2");
  expect(store.getState().admin.usersPage.visits).toBe(1);
  click("Bob");
  expect(location.pathname).toBe("/admin/users/2");
  expect(main()).toContain("User 2");
  click("Overview");
  expect(location.pathname).toBe("/admin");
  click("Users");
  expect(main()).toContain("opened 2 times");
  app.dispose();
});

test("a direct visit and an unknown path", () => {
  const a = start("/admin/users/1");
  expect(main()).toContain("User 1");
  a.app.dispose();
  const b = start("/nowhere");
  expect(main()).toContain("Page not found");
  click("Back to the home page");
  expect(location.pathname).toBe("/");
  b.app.dispose();
});
```

Messages, отправляемые при каждой навигации, — обычные данные, поэтому изменение route можно проверить и без DOM. Вызов оболочки как функции с message `routeChanged` даёт effects. Переход с `/admin` на `/admin/users` возвращает обновление `route` и один effect страницы users, потому что в неё вошли:

```json
[{ "plugin": "store", "type": "set", "path": "admin.usersPage.visits", "value": 1 }]
```

## Обслуживание по базовому пути

Сайт на GitHub Pages находится не в корне домена. ui-kit, исходный код которого и есть эта документация, живёт по адресу `/pavlus/`. Там страница кнопки — `/pavlus/button`, а приложение хочет называть её `/button`. Если роутер видит настоящий путь, `/pavlus/button` совпадает только с `"*"`, и пользователь видит страницу «не найдено».

У plugin router нет опции базового пути. Зато есть опция `window`, и это точка расширения. ui-kit даёт ей небольшой объект, похожий на окно браузера, но с отрезанным базовым путём при чтении адреса и с возвращённым при записи истории:

```ts base-window.ts
/** `"/pavlus/"` → `"/pavlus"`, `"/"` → `""`. */
export const rootOf = (base: string): string => base.replace(/\/+$/, "");

/** `/pavlus/button` → `/button`; a path outside the base is left alone. */
export function stripBase(root: string, pathname: string): string {
  if (!root) return pathname;
  if (pathname === root) return "/";
  return pathname.startsWith(root + "/")
    ? pathname.slice(root.length)
    : pathname;
}

/** `/button?x=1` → `/pavlus/button?x=1`; `/` → `/pavlus/`. */
export function withBase(root: string, url: string): string {
  return url.startsWith("/") ? root + url : url;
}

export function windowAt(root: string, win: Window = window): Window {
  const location = {
    get pathname() {
      return stripBase(root, win.location.pathname);
    },
    get search() {
      return win.location.search;
    },
    get hash() {
      return win.location.hash;
    },
  };
  const history = {
    pushState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.pushState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    replaceState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.replaceState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    back: () => win.history.back(),
    forward: () => win.history.forward(),
  };
  return {
    location,
    history,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
  } as unknown as Window;
}
```

Приложение никогда не видит base. Знает о нём только `main.ts`:

```ts main.ts
const root = rootOf(import.meta.env.BASE_URL);

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState({ root })),
    new DomPlugin(),
    createRouterPlugin({ window: windowAt(root) }),
  ],
  mount: "#app",
});
```

Работают три части:

1. Опция Vite `base`. ui-kit собирается с `UI_KIT_BASE=/pavlus/`, локально base равен `/`. `import.meta.env.BASE_URL` — это это значение, а `rootOf` превращает `/pavlus/` в `/pavlus`.
2. `windowAt(root)` для роутера, как выше. Таблица routing остаётся `"/button"`, `"/tabs"`.
3. Настоящие href. Это текст, поэтому им нужен base. ui-kit хранит `root` в своём state, а шаблоны пишут `href={root + "/templates"}`.

::demo base-href

Демо показывает, как `href` следует за `root` в state. Handler клика не меняется: `navigate("/about")` отсчитывается от приложения, а обёрнутое окно добавляет base.

### 404 при прямом заходе

Есть ещё одна проблема, и она не в приложении. GitHub Pages — статический файловый сервер. Запрос `/pavlus/button` не находит файла `button` и отвечает 404 раньше, чем запустится любой JavaScript. Клик по ссылке работает, потому что браузер сервер не спрашивает. Перезагрузка страницы или открытие присланной кем-то ссылки не работает.

GitHub Pages отдаёт файл `404.html` для любого неизвестного пути. Поэтому приём такой: опубликовать оболочку приложения и под этим именем. ui-kit делает это небольшим plugin для Vite:

```js vite.config.mjs
/**
 * GitHub Pages has no history fallback: a direct load of /pavlus/button would
 * be a 404. It does serve 404.html for any unknown path, so the build emits
 * the app shell under that name too and the router takes it from there.
 */
const spaFallback = () => ({
  name: "ui-kit:spa-fallback",
  // "post": Vite's own HTML plugin adds index.html to the bundle first.
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: index.source,
        });
      }
    },
  },
});
```

Браузер получает оболочку со статусом 404, загружает скрипты, роутер читает настоящий адрес и показывает нужную страницу. На сервере, который вы контролируете, вместо этого отвечайте на каждый неизвестный путь файлом `index.html` со статусом 200.

## Чего нет

Знайте об ограничениях, чтобы не искать то, чего нет:

- Нет guards и нет redirects в виде записей маршрута. Redirect — это handler: при `enter` верните `router.navigate("/login", { replace: true })`.
- Нет разбора строки запроса. `route.search` — необработанная строка.
- `route.params` имеет тип `Record<string, string>`: каждый param — строка.
- Нет ленивой загрузки страниц. Все страницы импортируются в начале файла.

## Что вы узнали

- Таблица `routing` сопоставляет шаблоны со страницами, а `+outlet` показывает подходящую. Побеждает самый длинный шаблон, а `"*"` ловит остальное.
- Страница — это `view` (шаблон) или `component` (логика). Она видит `route`, получает `enter` и `leave`, а `key` и `props` формируют её state.
- Ссылки — настоящие `href` с `@click.prevent=navigate(...)`. Маршрутизация вкладывается, а navigate из вложенной страницы отсчитывается от её base.
- Под базовым путём дайте plugin router `window`, который скрывает base, и стройте href с его помощью.

Дальше: [Серверный рендеринг](page:concepts-ssr).
