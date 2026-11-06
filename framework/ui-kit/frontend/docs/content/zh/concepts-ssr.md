---
summary: 在浏览器中运行的同一批纯模板，也可以在服务器上运行并输出 HTML。学习 ssr 模块提供什么，如何在 render 之前加载数据，浏览器如何接管标记，以及哪些不被支持。
---
## 为什么在服务器上 render

普通的 pavlus 页面一开始是空的。浏览器下载一个小的 HTML 文件，然后下载 JavaScript，再由代码构建页面。在这完成之前，访客什么也看不到，只读取 HTML 的程序（搜索引擎、链接预览）也什么都看不到。

**服务端渲染**（SSR）改变了第一步。服务器运行你的应用，生成页面的 HTML，并把它和 JavaScript 一起发送出去。访客立刻就能看到页面。然后 JavaScript 在浏览器中启动并对标记进行 **hydrate**：它把事件监听器附加到已经存在的元素上。什么都不会被重建。

这在 pavlus 中不需要第二套代码，因为应用由纯函数组成。模板被编译成 `render(state)`，它返回普通数据，而 `render` 不关心自己在哪里运行。handler 返回 effect，同样是普通数据。只有 plugin 会接触外部世界，在服务器上你只需给应用不同的 plugin。

```text
server                                   browser
createApp({ app, plugins })  --state-->  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) -> the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) --html-->    (listeners and ids on the markup)
```

## 最小的例子

你离不开的那个函数是 `renderToString`。它接收一个 view 和一个 state，返回一个字符串。

::demo hello

demo 展示了 `render` 为这个 state 生成的 HTML。在服务器上，你会这样调用：

```ts
import { compileToView } from "@pavlus/frontend/compiler";
import { renderToString } from "@pavlus/frontend/ssr";

const view = compileToView("p Hello, {name}");
renderToString(view, { name: "Ann" });
```

并得到下面这个字符串，它就是 demo 的 HTML，夹在两条注释之间：

```text
<!--pavlus--><p>Hello, Ann</p><!--/pavlus-->
```

（你的应用用 `import view from "./hello.pavlus"` 导入 view。`compileToView` 是在脚本或测试中不借助 Vite 得到同样 view 的办法。）

两条注释 `<!--pavlus-->` 和 `<!--/pavlus-->` 是服务端 render 的**标记**。DOM plugin 在挂载时会寻找它们。如果它们在，它就对两者之间的标记进行 hydrate；如果不在，就照常构建页面。

## ssr 模块提供什么

模块 `@pavlus/frontend/ssr` 有三个函数。另有两个相关的函数来自主包。

| 函数 | 作用 |
| --- | --- |
| `renderToString(view, state)` | 这个 state 下 view 的 HTML，夹在两条标记注释之间。 |
| `serializeState(state, components)` | 把 state 序列化为 JSON。state 中的组件值被替换为它们的名字。 |
| `reviveState(json, components)` | 从 JSON 还原 state，并把组件实例放回去。 |
| `viewOf(component)` | 来自主包。组件的 view，闭包了该组件，所以 `+outlet` 和子组件都能工作。 |
| `toHtml(vnodes)` | 来自主包。vnode 的纯 HTML，不带任何标记。 |

`renderToString` 就是带一个标志的 `toHtml`：它还会写出模板的*块标记*。看看编译器在列表里放了什么：

::demo list open=vnodes

在 vnode 中，你会看到 `for` 块两侧的 `marker` 节点。它们在 DOM 中是不可见的注释，让运行时能找到块的开始和结束位置。服务端 render 必须包含它们，否则浏览器之后无法给列表打 patch。带上这个标志，同样的 state 会得到：

```text
<!--pavlus--><ul><!--1s--><!--1[#1--><li class="done">a</li><!--1]#1--><!--1[#2--><li>b</li><!--1]#2--><!--1e--></ul><!--/pavlus-->
```

如果你只想要纯 HTML，用于电子邮件或永不 hydrate 的静态页面，请使用 `toHtml(view.render(state))`。它没有标记，也更小。

### 转义

文本和属性值会自动为你转义。同一个模板，配上一个恶意的名字：

::demo escape

demo 中的 HTML 把文本显示为文本，而不是标签。在字符串中，文本里的字符 `<`、`>` 和 `&`，以及属性中的引号，都被写成了实体（`&lt;script&gt;`）。你的 state 无法向页面添加标签。

## 在 render 之前加载数据

页面很少只显示静态的 state。常见的情况是页面在被进入时用 `http` 请求加载数据。服务器必须等待这些数据，然后才能 render。看看这个计划：

1. 创建应用时**不带 `mount`**。这里没有 DOM。
2. 给它一个 store、一个 `http` plugin，以及接受仅限浏览器的 plugin 的 effect 但什么也不做的 plugin。
3. dispatch 路由器会发送的 message，带上请求的位置。
4. 等待，直到没有请求在进行中。
5. 读取 state 并 render。

为什么要手动 dispatch？在浏览器中，router plugin 读取 `window.location` 并发送 `routeChanged`。服务器上没有 window，但位置是已知的：它就是请求的 URL。带有 `routing` 表的组件默认会处理 `routeChanged`（`setRoute`），所以被 `enter` 的页面会开始加载它们的数据，和在浏览器中一模一样。

`http` plugin 接受一个 `fetch` 选项。在服务器上，你传入一个在同一进程内应答、不经过 socket 的 `fetch`。而 `http.settled()` 是一个 promise，当不再有任何请求在进行中时它就会 resolve，**包括由这些应答所发起的请求**。如果页面加载了一个列表，然后又加载每个条目的详情，`settled` 会等待所有这些请求。

对服务器上没有意义的 plugin 的 effect，需要一个替身。如果应用返回了 `router.navigate(...)` 而没有注册 `router` plugin，核心会抛出 `no plugin "router" for effect "navigate"`。这个替身是一行的 plugin：

```ts
const inert = (name: string): Plugin => ({ name, handle() {} });
```

## 一个完整的例子

我们构建一个有两篇文章的小站点。首页是一个 view，文章页面是一个在被进入时加载文章的组件。这些文件和浏览器应用的相同，外加 `server.ts`。

shell 模板和各个页面：

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

文章页面在 `enter` 中请求它的数据，使用来自路由的 `id`。应答以 message `loaded` 和 `failed` 的形式返回：

```ts post.ts
import {
  Component,
  type Effect,
  type Message,
  type Route,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
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
} from "@pavlus/frontend";
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

`components` 是在 state 中作为*值*的组件实例列表（模板可以 embed `+{expr}`，此时 state 中就保存着一个组件）。这个应用没有这样的组件。我们在下面再回到这一点。

现在是服务器。**每个请求**都会创建新的 store、新的 `http` plugin 和新的应用。组件（`shell`、`post`）是共享的，因为它们不保存 state；state 则不共享：

```ts server.ts
import {
  createApp,
  matchRoute,
  type Plugin,
  viewOf,
} from "@pavlus/frontend";
import {
  createHttpPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { renderToString, serializeState } from "@pavlus/frontend/ssr";
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

请慢慢读 `renderPage`。它返回三样东西：`status`、`html`，以及 JSON 形式的 `state`。状态码来自 `matchRoute`，也就是 outlet 使用的同一个函数：如果最佳匹配是 `"*"` 条目，或者没有匹配，服务器就返回 404。框架不会替你做这件事，因为 HTTP 响应是你的服务器的事。

`renderDocument` 把各个部分放进 `index.html`。标记放进挂载元素，**连同 `renderToString` 写出的标记注释一起**。state 放进应用自己的脚本之前的一个 script 中。有两个细节：

- JSON 首先被变成 JavaScript 字符串（对字符串做 `JSON.stringify`），并且 `<` 被写成 `<`。state 中像 `</script>` 这样的文本无法关闭 script 元素。
- `replace` 是用函数调用的，而不是用字符串。在替换字符串中，`$&` 和 `$'` 有特殊含义，所以包含它们的文章会被破坏。

最后是浏览器。如果有 state，它就还原 state，然后照常挂载：

```ts main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { reviveState } from "@pavlus/frontend/ssr";
import { type AppState, components, initialState, shell } from "./app.ts";

const json = (globalThis as { __STATE__?: string }).__STATE__;

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(
      json ? reviveState<AppState>(json, components) : initialState,
    ),
    new DomPlugin(),
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

当目标 `#app` 已经包含服务端 render 时，`mount` 会对它进行 **hydrate**。当页面没有 state（没有服务器的普通构建）时，`json` 是 undefined，store 从 `initialState` 开始；应用作为普通的客户端应用工作。

一个测试运行服务器，把结果放进 jsdom，启动客户端代码，并检查 SSR 的三个承诺：内容已经在那里，节点没有被重建，文章也没有被第二次加载。

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

## hydration 如何工作，它检查什么

DOM plugin 把服务器写出的标记，与 `render(state)` 返回的节点并排遍历。对每个元素，它检查标签是否是 view 所期望的；附加监听器并注册节点 id；然后继续处理子节点。不会创建任何东西，所以没有闪烁，表单控件的状态（访客已经输入的文本）也得以保留。

HTML 解析器会做两件让简单遍历栽跟头的事：它会合并相邻的文本节点，并丢弃空的文本节点。hydration 会撤销这两者：它在正确的位置拆分被合并的文本节点，并把空节点插回去。

当标记与 view 不匹配时，页面仍然可以工作。plugin 会打印一条警告并重新 render：

```text
pavlus/dom: the server render does not match the view (expected <p>); rendering afresh
```

以及：

```text
pavlus/dom: the server render does not match the view (text "Hello, Bob" is not "Hello, Ann"); rendering afresh
```

原因都是常见的：浏览器中的 state 不是服务器所用的 state，或者浏览器的模板版本与服务器的不同。

hydration 之后的第一次 `routeChanged` 携带的是服务器 render 时的位置，所以 `setRoute` 不会发送 `enter`。这就是为什么上面的测试看不到任何请求：数据已经在 state 中了。

## 支持什么，不支持什么

pavlus 中的 SSR 有意保持得很小。这份列表就是全部的事实：

- **支持。** 把 view 或组件（含子组件和 `+outlet`）render 成字符串；序列化和还原 state；通过附加监听器和 id 进行 hydrate；等待 `http` 请求；标记不同时回退到客户端 render。
- **一个字符串，没有流式传输。** `renderToString` 是同步的，返回整个页面。
- **只等待 `http`。** `http.settled()` 只知道 `http` 请求。`time` 定时器或 `ws` message 不会被等待，最好不要在服务器上注册这些 plugin。
- **state 必须是 JSON。** `serializeState` 就是 `JSON.stringify` 外加一项：组件实例。`Date` 变成字符串，`undefined` 和函数被丢弃，`NaN` 变成 `null`，`Map` 变成 `{}`。请保持 state 的朴素，无论如何你都应该这样做。
- **hydration 比较的是结构，而不是属性。** 检查标签、文本和标记。如果服务器写了 `class="x"` 而客户端 view 没有，hydration 会成功，该属性会一直保留，直到某个 patch 碰到它。不要在服务器上 render 不同的属性。
- **标记必须保留。** 如果你从 HTML 中去掉注释 `<!--pavlus-->` 和 `<!--/pavlus-->`（压缩工具、手写的模板），浏览器就看不出这是服务端 render，并会在第一份之后再追加第二份页面副本。请用真实的输出测试你的流程。
- **不管理 `<head>`。** 标题和 meta 标签由你负责：在 `renderDocument` 中根据 state 计算它们。
- **没有 base 路径。** 服务器传入的是它收到的路径。如果你的站点是在某个前缀下提供的，请在 dispatch `routeChanged` 之前去掉它，就像 ui-kit 的 `windowAt` 在浏览器中所做的那样（见 [路由](page:concepts-routing)）。
- **没有 HTTP 服务器。** 框架给你的是函数。路由 HTTP 请求、提供构建后的文件以及在开发中运行 Vite，都是你的服务器的工作。本仓库的 `admin-app` 有一个完整的服务器，在 `backend/ssr.ts` 和 `backend/server.ts` 中，`frontend/entry-server.ts` 是服务器加载的模块。

> [!WARNING] 每个请求一个 store
> 永远不要在服务器模块的顶层创建 store plugin。state 会被所有请求共享，访客可能看到上一个访客的数据。请在处理单个请求的函数内部创建 store、`http` plugin 和应用，并在结束时 dispose 应用。

## state 中的组件

模板可以 embed 一个作为 state 中*值*的组件：`+{view}#name(...)`。这时 state 中保存着一个类实例，而 JSON 无法保存它。`serializeState` 接收第二个参数，一个给每个实例命名的对象，并写入 `{"$component": name}` 来代替。`reviveState` 接收同一个对象，并把实例放回去。

```ts
class Table extends Component {}
const table = new Table();

serializeState({ n: 1, mode: table }, { table });
// {"n":1,"mode":{"$component":"table"}}
```

不在该对象中的实例是一个错误，错误信息会告诉你该怎么做：

```text
pavlus/ssr: a Table instance is in the state; list it in `components` to serialize it
```

浏览器不认识的名字同样是一个错误：`pavlus/ssr: no component named "zzz"`。这就是服务器和浏览器必须导入同一个 `components` 对象的原因。在上面的例子中，它从 `app.ts` 导出，双方都使用它。

## 你学到了什么

- SSR 就是在服务器上运行同一个纯 `render`。`renderToString` 返回两条标记注释之间的 HTML，DOM plugin 对它进行 hydrate。
- 要加载数据，创建不带 `mount` 的应用，用请求的位置 dispatch `routeChanged`，并在 render 之前等待 `http.settled()`。
- state 以 JSON 的形式放在 script 中传输；`serializeState` 和 `reviveState` 处理组件值。
- 为每个请求创建 store 和应用。标记必须到达浏览器，框架只比较结构。

下一页：[plugin 如何工作](page:plugins-overview)。
