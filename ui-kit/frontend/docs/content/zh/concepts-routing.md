---
summary: 组件可以按路径列出它的页面，并用一行 +outlet 显示匹配的那个页面。学习路由表、state 中的 route、enter 和 leave、嵌套路由，以及如何在 base 路径下提供应用。
---
## 一个路径，一个页面

单页应用在不同的地址显示不同的页面，而不必每次都加载新的 HTML 文档。在 pavlus 中这叫**路由**，并且它是以数据的形式声明的。组件有一张 `routing` 表：它把路径模式映射到应该显示的子组件。它的模板用一行 `+outlet` 说明子组件放在*哪里*。

下面是最小的路由器。三个路径，三个页面：

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

再看 shell 的模板：

```pavlus
main.page
  +outlet
```

`+outlet` 是内置项。它后面不带任何东西。当路由是 `/about` 时，`main` 元素包含 `about` 页面；当路由是 `/` 时，则是首页。左边的模式会与当前路径匹配，而 `"*"` 表示“剩下的一切”。

以小写字母开头的名字是内置项（`outlet`）；以大写字母开头的名字是导入的组件（`+Sidebar`）。所以两者永远不会冲突。

> [!NOTE] 当前路径从哪里来？
> 来自 **router plugin**。它读取浏览器的地址，并把它作为 message 报告给你的应用。下面的“接入路由器”一节会展示连接它的三行代码。在 plugin 报告之前，state 字段 `route` 是 `null`，outlet 是空的。

## 编译器如何处理 +outlet

outlet 在运行时并不神秘。编译器把这一行变成一个*动态 embed*：DOM 中的两个标记，以及两者之间匹配页面的 view。下面是上面那个 shell 生成的 `render` 中对应 `+outlet` 的部分：

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

`resolveOutlet(env, state)` 查看 `env`，也就是拥有该模板的组件，取出它的 `routing` 表，并匹配 `state.route`。它返回要 render 的 view、页面的**实例名**，以及页面将看到的 **state**。这个名字成为 message 前缀：页面内的每个事件都以 `<name>.<message>` 的形式发送。这与任何被 embed 的子组件的规则相同，见 [消息与子组件](page:concepts-messages)。

当 state 变化时，`diff` 会做两件事之一。如果匹配的页面是另一个页面（不同的 view 或名字），它会清空两个标记之间的所有内容并 render 新页面。如果是同一个页面，它只运行该页面自己的 `diff`。所以从 `/about` 切换到 `/` 会重建内容，而页面内部计数器的变化只会给一个文本节点打 patch。

> [!WARNING] 要挂载组件，而不只是它的 view
> `+outlet` 需要 `env`，也就是带有 `routing` 表的组件。`createApp({ mount })` 会替你传入它。如果你挂载的是含有 outlet 的模板的裸 view，就会得到：pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view。在测试中，请使用 `@service-laboratory/pavlus/testing` 中的 `mountView(component, state)`，并传入组件本身。

## 模式与匹配

模式是由 `/` 分隔的若干段组成的路径。每一段要么是普通文本，要么是 `:name`，后者捕获路径中该位置上的任何内容。

规则很简短：

- 模式匹配整个路径，或者匹配**以 `/` 结尾的前缀**。`"/admin"` 匹配 `/admin` 和 `/admin/tasks`，但不匹配 `/administrator`。
- `"/"` 只匹配精确的路径 `/`。它是首页，永远不是其他路径的前缀。
- `":name"` 捕获一段并解码它（`a%20b` 变成 `a b`）。
- `"*"` 匹配其他模式都没有匹配的任何路径。
- 如果有多个模式匹配，**最长**的获胜（段数最多）；如果两个一样长，则先声明的获胜。
- 如果没有任何匹配，并且没有 `"*"`，outlet 保持为空。

下表是 `matchRoute` 对路由表 `"/"`、`"/users"`、`"/users/:id"`、`"/admin"` 和 `"*"` 的真实输出。最后三列是匹配到的页面收到的 `route`：

| 路径 | 匹配的模式 | route.path | route.base | route.params |
| --- | --- | --- | --- | --- |
| `/` | `/` | `/` | （空） | 无 |
| `/users` | `/users` | `/` | `/users` | 无 |
| `/users/42` | `/users/:id` | `/` | `/users/42` | id 是 42 |
| `/users/42/edit` | `/users/:id` | `/edit` | `/users/42` | id 是 42 |
| `/admin/x` | `/admin` | `/x` | `/admin` | 无 |
| `/administrator` | `*` | `/administrator` | （空） | 无 |

看看 `route.path` 和 `route.base` 两列。页面看不到完整的路径。它看到的是匹配的模式**之下剩下的部分**（`path`），以及为到达它而用掉的部分（`base`）。这使嵌套成为可能，我们稍后再回到这一点。

`matchRoute(routing, route)` 和 `routeName(pattern, spec)` 是从包中导出的，所以你可以在测试或服务器上使用同样的逻辑。

## 路由条目

表中的值是一个 *route spec*。它的形状与子组件条目（见 [组件页面](page:concepts-messages)）相同，外加两个字段：

| 字段 | 含义 |
| --- | --- |
| `component` | 页面是一个组件：一个类实例，有自己的 handler 和自己的 `view`。 |
| `view` | 页面只是一个模板，没有自己的逻辑。使用 `view` 或 `component`，不要两者都用。 |
| `select` | 与 `component` 类似，但根据 state 选择：`select: (state) => ...`。用于那些以 state 中的值表示的页面。 |
| `key` | 页面拥有的 state 字段的名字。页面看到 `state[key]`，它的 `store` 路径前面会加上这个 key。 |
| `props` | 页面的额外只读字段，由父组件的 state 计算得出：`props: (s) => ({ count: s.people.length })`。 |
| `name` | 实例名，也就是 message 前缀。默认是模式的最后一个静态段。 |

默认名字是这样得出的：`"/admin/tasks"` 是 `tasks`，`"/users/:id"` 是 `users`（跳过 `:id` 段），`"/"` 是 `index`，`"*"` 是 `fallback`。两个条目不能最终得到同一个名字，因为 message 无法区分它们。框架会拒绝这种情况，并告诉你怎么修：

```text
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
```

### view 还是组件？

对于只显示数据的页面，**view** 是正确的选择：关于页面、未找到页面、读取 `route.params` 的详情页。它没有任何开销，没有 handler，需要的数据来自 `props`。

当页面需要做出反应时，**组件**是正确的选择：它处理 message，在进入时加载数据，拥有 state 的一部分。它是普通的组件；被路由只会在它的 state 中增加 `route` 字段，以及 `enter` 和 `leave` message。

只有 view 的页面，其模板中仍然可以有事件。`about` 页面中的事件 `@click=pick(1)` 会作为 message `about.pick` 发送，而带有 `routing` 表的组件可以用名为 `"about.pick"` 的方法来处理它。你很少需要自己处理的一个事件是 `navigate`，下面会介绍。

## state 中的 route

被路由的页面在它的 state 中有一个 `route` 字段。你可以在 handler 和模板中读取它：

```ts
{ path: "/edit", base: "/users/42", params: { id: "42" }, search: "", hash: "" }
```

`search` 和 `hash` 是原始字符串，`"?page=2"` 和 `"#top"`。框架不解析查询字符串。`params` 包含本层**以及上面每一层**的 `:name` 捕获，所以深层嵌套的页面仍然可以读取它祖父级的 `id`。

::demo route-state

这个 demo 是一个显示用户的页面。当地址从 `/admin/users/2` 变为 `/admin/users/7` 时，模板被就地打了 patch：路由器没有重建任何东西，页面只是得到了新的 `route`。需要加载新用户数据的页面还会收到一条新的 `enter` message，稍后你会看到。

## 接入路由器

外部世界一如既往地是一个 plugin。**router plugin** 读取并修改浏览器地址。它有四个 effect：`listen`、`navigate`、`back` 和 `forward`（它们都在 [plugin 参考](page:plugins-reference) 中介绍）。这里有两个重要。

- `router.listen("routeChanged")` 开始报告。plugin 会立即用当前位置发送 message `routeChanged`，之后在每次 `navigate` 以及每次按下后退或前进按钮后再次发送。payload 是 `{ path, search, hash }`。
- `router.navigate("/about")` 推入一条新的历史记录。随后 plugin 会把新位置告诉监听者，所以同样的 `routeChanged` 会到达。

你不需要自己写这些接线。带有 `routing` 表的组件有两个默认 handler：

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _state, { setRoute }) => setRoute(msg.payload),
```

`mounted` 是 `createApp({ mount })` 在应用进入 DOM 之后发送的 message。`setRoute` 是组件上下文中的一个函数。它是纯的。它返回一个 `store.set("route", ...)` effect，以及发生变化的页面的 `leave` 和 `enter` effect。如果你自己写了名为 `mounted` 或 `routeChanged` 的方法，它会替换默认的。ui-kit 就这么做了，以便在路由变化时同时设置主题和菜单的分区。下面是它的 shell 的简化版本：

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

handler 必须调用 `setRoute` 并返回它的 effect。如果忘了，`route` 就永远不会被保存，outlet 会一直是空的。

路由应用所需的 plugin 是 store（它保存 `route`）、dom plugin 和 router plugin：

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { type AppState, initialState, shell } from "./app.ts";

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState),
    createDomPlugin(),
    createRouterPlugin(),
  ],
  mount: "#app",
});
```

> [!TIP] 初始 state 中 route 为 null
> 在初始 state 中放入 `route: null`。在 router plugin 报告之前，模板读取的是 `null` 的 `route.path`，而表达式中的路径是 null 安全的，所以什么都不会坏。下一个 demo 的第二步恰好展示了这种情况。

## 真正的链接

导航需要链接。链接应该是真正的 `<a href>`，这样鼠标中键点击、“在新标签页中打开”和状态栏才都能正常工作。但普通的点击不应该加载新文档。pavlus 的做法是两者都写：

```pavlus
a(href="/about" @click.prevent=navigate("/about")) About
```

`href` 给浏览器用。`@click.prevent` 阻止默认动作，事件变成 message `navigate`，payload 为 `"/about"`。你不需要为它写 handler。一条没人处理、带字符串 payload 的 message `navigate`（或来自被 embed 的模板或只有 view 的页面的 `something.navigate`），默认会被变成 `router.navigate(url)`。这个 url 相对于接收该 message 的组件，对于 shell 来说就是整个站点。

::demo links

demo 的第二步展示了活动链接。class `active` 是 `route.path` 上的一个条件。当路由从 `null` 变为 `/` 时，只有第一个链接被打了 patch。

> [!NOTE] 普通的 href 不会被改写
> 框架会改写 effect `router.navigate` 的 url。它不会碰 `href` 属性，因为那只是你模板中的文本。当页面位于某个 base 之下时，请自己写上 base：`href={route.base + "/users"}`。下一节有完整的说明。

## enter 和 leave

页面常常需要在出现时做点什么：加载数据、启动定时器。在消失时：停止定时器。路由器用两条 message 告诉页面。

- `enter` 在页面变为活动时发送。payload 是它的 `route`。
- `leave` 在页面不再活动时发送。

这些 message 由 `setRoute` 根据之前和新的路由，逐层计算出来。从第一个活动页面不同的层开始，旧页面离开（最深的先离开），新页面进入（从上往下）。当叶子页面只有它自己的路由变化时，例如 `/items/5` 到 `/items/7`，它也会再次收到 `enter`，因为 `params` 不同。只有 `search` 或 `hash` 变化时，不会再次进入。

这就是为什么任何地方都不需要“页面及其数据”的列表。需要数据的页面自己去要：

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

请求的 `id: "post"` 很重要。如果用户在文章 1 还在加载时从文章 1 跳到文章 2，第二个请求会取代第一个，第一个的响应会被忽略。参见 plugin 参考中的 [http 一节](page:plugins-reference)。

## 嵌套路由

路由可以嵌套。有自己 `routing` 表的被路由页面，只得到路径中**它的 base 之下**的部分，并且相对于它来导航，而不需要知道是谁 embed 了它。网站的管理区域是典型的例子：shell 有 `/admin`，管理页面有标签页 `/users` 和 `/users/:id`，完整地址是 `/admin/users` 和 `/admin/users/2`。

管理页面的标签栏不知道自己位于 `/admin` 之下。它读取 `route.base`，框架把它设为 `/admin`：

::demo tabs

`href` 是 `route.base + "/users"`，所以链接是 `/admin/users`；message 是 `navigate("/users")`，框架会把 base 加到 effect 上。相对 navigate 的规则是：*最内层的被路由页面把它完整的 base 加上一次，并把 effect 标记为 `absolute`，这样上面的层就不会再加它们自己的 base。* 要去外部的某处，请使用 `router.navigate(url, { absolute: true })`。

## 一个完整的例子

下面是一个小站点，有首页、带两个标签页的管理区域、用户列表、用户页面和未找到页面。它用到了本页的每一个思路。文件按你编写的顺序列出。

shell 模板有顶部导航和第一个 outlet：

```pavlus app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
    a(href="/admin" class:active={route.base === "/admin"} @click.prevent=navigate("/admin")) Admin
  main.app__main
    +outlet
```

shell 组件有三个条目：只有 view 的首页、key 为 `admin` 的管理组件，以及 `"*"` 兜底页面。

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

两个简单的页面：

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

管理组件有它自己的表。看看这三种条目：带 `props` 的 view、带 `key` 和 `props` 的组件，以及带显式 `name` 的 view，因为 `/users` 和 `/users/:id` 否则都会叫 `users`。

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

标签页下面的页面。overview 和用户页面是 view。users 页面是一个组件：它统计自己被进入了多少次。

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

有三个细节值得再看一眼。

第一，users 页面的 state 位于 `admin.usersPage`。页面写的是 `store.set("visits", ...)`，这个 effect 离开页面时是 `usersPage.visits`，离开 shell 时是 `admin.usersPage.visits`：每一层都把自己的 `key` 加在前面。页面完全不知道自己被挂载在哪里。

第二，users 页面中的 `navigate("/" + person.id)` 会去往 `/admin/users/1`，因为 users 页面被路由在 `/admin/users`，相对 url 会被加到它的 base 上。

第三，`href` 使用 `route.base`：在 users 页面中它是 `/admin/users`，所以链接是 `/admin/users/1`，浏览器从鼠标中键点击就能打开正确的地址。

一个测试在 jsdom 中用真实的 plugin 驱动整个站点。它点击链接，并查看地址和页面：

```ts routing.test.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
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
    plugins: [store, createDomPlugin(), createRouterPlugin()],
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

每次导航时发送的 message 都是普通数据，所以你也可以在没有 DOM 的情况下测试路由变化。用 `routeChanged` message 把 shell 当作函数调用，就能得到 effect。从 `/admin` 到 `/admin/users` 会返回 `route` 的更新，以及来自 users 页面的一个 effect，因为它被进入了：

```json
[{ "plugin": "store", "type": "set", "path": "admin.usersPage.visits", "value": 1 }]
```

## 在 base 路径下提供应用

GitHub Pages 上的站点不在域名的根路径。ui-kit，也就是本文档的源码，位于 `/pavlus/`。在那里按钮的页面是 `/pavlus/button`，但应用想把它叫作 `/button`。如果路由器看到的是真实路径，`/pavlus/button` 只会匹配 `"*"`，用户就会看到未找到页面。

router plugin 没有 base 路径选项。它有一个 `window` 选项，这就是接缝所在。ui-kit 给它一个看起来像浏览器 window 的小对象，但读取位置时去掉 base 路径，写入历史记录时再把它加回去：

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

应用从不会看到 base。只有 `main.ts` 知道它：

```ts main.ts
const root = rootOf(import.meta.env.BASE_URL);

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState({ root })),
    createDomPlugin(),
    createRouterPlugin({ window: windowAt(root) }),
  ],
  mount: "#app",
});
```

三个部分让它运作起来：

1. Vite 的 `base` 选项。ui-kit 用 `UI_KIT_BASE=/pavlus/` 构建，本地的 base 是 `/`。`import.meta.env.BASE_URL` 就是这个值，`rootOf` 把 `/pavlus/` 变成 `/pavlus`。
2. 给路由器用的 `windowAt(root)`，如上所示。路由表仍然是 `"/button"`、`"/tabs"`。
3. 真实的 href。它们是文本，所以需要 base。ui-kit 把 `root` 保存在它的 state 中，模板里写 `href={root + "/templates"}`。

::demo base-href

demo 展示了 `href` 跟随 state 中的 `root`。点击 handler 不变：`navigate("/about")` 是相对于应用的，包装后的 window 会加上 base。

### 直接访问时的 404

还有一个问题，而且它不在应用里。GitHub Pages 是静态文件服务器。对 `/pavlus/button` 的请求找不到文件 `button`，在任何 JavaScript 运行之前就返回了 404。点击链接可以工作，因为浏览器从不向服务器发请求。重新加载页面，或打开别人发给你的链接，就会失败。

GitHub Pages 会对每个未知路径提供文件 `404.html`。所以窍门是也用这个名字发布应用的 shell。ui-kit 用一个小的 Vite plugin 来做到这一点：

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

浏览器以状态 404 拿到 shell，加载脚本，路由器读取真实地址并显示正确的页面。在你能控制的服务器上，请改为对每个未知路径返回 `index.html` 和状态 200。

## 没有做的事

请了解这些限制，免得你去找它们：

- 路由条目中没有守卫，也没有重定向。重定向是一个 handler：在 `enter` 时返回 `router.navigate("/login", { replace: true })`。
- 没有查询字符串解析。`route.search` 是原始字符串。
- `route.params` 的类型是 `Record<string, string>`：每个参数都是字符串。
- 没有页面的懒加载。所有页面都在文件顶部导入。

## 你学到了什么

- `routing` 表把模式映射到页面，`+outlet` 显示匹配的那个。最长的模式获胜，`"*"` 兜住其余的。
- 页面是 `view`（模板）或 `component`（逻辑）。它能看到 `route`，会收到 `enter` 和 `leave`，`key` 和 `props` 决定它的 state 的形状。
- 链接是真正的 `href`，配合 `@click.prevent=navigate(...)`。路由可以嵌套，嵌套页面的 navigate 相对于它的 base。
- 在 base 路径下，给 router plugin 一个隐藏 base 的 `window`，并用它来构造 href。

下一页：[服务端渲染](page:concepts-ssr)。
