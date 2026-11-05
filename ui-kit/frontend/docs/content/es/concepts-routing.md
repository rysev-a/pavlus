---
summary: Un componente puede listar sus páginas por ruta y mostrar la que coincide con una sola línea, +outlet. Aprende la tabla de routing, la route en el state, enter y leave, las rutas anidadas y cómo servir la aplicación bajo una ruta base.
---
## Una ruta, una página

Una aplicación de una sola página muestra páginas distintas en direcciones distintas, sin cargar un documento HTML nuevo cada vez. En pavlus esto es el **routing**, y se declara como datos. Un componente recibe una tabla `routing`: asocia un patrón de ruta con el hijo que debe mostrarse. Su template dice *dónde* va el hijo con una sola línea, `+outlet`.

Este es el router más pequeño. Tres rutas, tres páginas:

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

Y el template del shell:

```pavlus
main.page
  +outlet
```

`+outlet` es un built-in. No lleva nada detrás. Cuando la route es `/about`, el elemento `main` contiene la página `about`; cuando es `/`, la página de inicio. Los patrones de la izquierda se comparan con la ruta actual, y `"*"` significa "todo lo que quede".

Un nombre que empieza con minúscula es un built-in (`outlet`); un nombre que empieza con mayúscula es un componente importado (`+Sidebar`). Por eso los dos nunca chocan.

> [!NOTE] ¿De dónde viene la ruta actual?
> Del **plugin router**. Lee la dirección del navegador y se la comunica a tu aplicación como un message. La sección "Conectar el router" más abajo muestra las tres líneas que lo conectan. Mientras el plugin no haya informado, el campo `route` del state es `null` y el outlet está vacío.

## Qué hace el compilador con +outlet

El outlet no es magia en tiempo de ejecución. El compilador convierte la línea en un *embed dinámico*: dos markers en el DOM y, entre ellos, la view de la página que coincida. Este es el `render` generado del shell anterior, la parte de `+outlet`:

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

`resolveOutlet(env, state)` mira `env`, el componente que posee el template, toma su tabla `routing` y busca coincidencia con `state.route`. Devuelve la view que se debe renderizar, el **nombre de instancia** de la página y el **state** que verá la página. El nombre se convierte en un prefijo de message: cada evento dentro de la página se envía como `<name>.<message>`. Es la misma regla que para cualquier hijo embebido, mira [messages y componentes hijos](page:concepts-messages).

Cuando el state cambia, `diff` hace una de dos cosas. Si la página que coincide es otra (otra view u otro nombre), borra todo lo que hay entre los dos markers y renderiza la página nueva. Si es la misma página, solo ejecuta el `diff` propio de esa página. Así, pasar de `/about` a `/` reconstruye el contenido, y cambiar un contador dentro de una página aplica un patch a un solo nodo de texto.

> [!WARNING] Monta el componente, no solo su view
> `+outlet` necesita `env`, el componente con la tabla `routing`. `createApp({ mount })` se lo pasa por ti. Si montas una view suelta de un template que tiene un outlet, obtienes: pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view. En los tests, usa `mountView(component, state)` de `@service-laboratory/pavlus/testing` con el propio componente.

## Patrones y coincidencias

Un patrón es una ruta formada por segmentos separados por `/`. Un segmento es texto simple o `:name`, que captura lo que haya en ese lugar de la ruta.

Las reglas son pocas:

- Un patrón coincide con la ruta exacta, o como **prefijo que termina en `/`**. `"/admin"` coincide con `/admin` y `/admin/tasks`, pero no con `/administrator`.
- `"/"` coincide solo con la ruta exacta `/`. Es la página de inicio y nunca es prefijo de nada.
- `":name"` captura un segmento y lo decodifica (`a%20b` se convierte en `a b`).
- `"*"` coincide con todo lo que no coincidió con nada más.
- Si varios patrones coinciden, gana el **más largo** (el de más segmentos); si dos son igual de largos, el que se declaró primero.
- Si nada coincide y no hay `"*"`, el outlet queda vacío.

Esta tabla es la salida real de `matchRoute` para la tabla `"/"`, `"/users"`, `"/users/:id"`, `"/admin"` y `"*"`. Las tres últimas columnas son lo que la página que coincide recibe como su `route`:

| Ruta | Patrón que coincide | route.path | route.base | route.params |
| --- | --- | --- | --- | --- |
| `/` | `/` | `/` | (vacío) | ninguno |
| `/users` | `/users` | `/` | `/users` | ninguno |
| `/users/42` | `/users/:id` | `/` | `/users/42` | id es 42 |
| `/users/42/edit` | `/users/:id` | `/edit` | `/users/42` | id es 42 |
| `/admin/x` | `/admin` | `/x` | `/admin` | ninguno |
| `/administrator` | `*` | `/administrator` | (vacío) | ninguno |

Fíjate en las columnas `route.path` y `route.base`. Una página no ve la ruta completa. Ve lo que **queda por debajo** del patrón que coincidió (`path`) y lo que se usó para llegar hasta él (`base`). Eso es lo que hace posible el anidamiento, y volvemos a ello en un momento.

`matchRoute(routing, route)` y `routeName(pattern, spec)` se exportan desde el paquete, así que puedes usar la misma lógica en un test o en un servidor.

## Una entrada de routing

El valor de la tabla es un *route spec*. Tiene la forma de una entrada de hijo (mira la [página de componentes](page:concepts-messages)) más dos campos:

| Campo | Significado |
| --- | --- |
| `component` | La página es un componente: una instancia de clase con sus propios handlers y su propia `view`. |
| `view` | La página es solo un template, sin lógica propia. Usa `view` o `component`, no ambos. |
| `select` | Como `component`, pero elegido a partir del state: `select: (state) => ...`. Para páginas que son valores del state. |
| `key` | El nombre del campo del state que posee la página. La página ve `state[key]`, y sus rutas de `store` llevan la key por delante. |
| `props` | Campos extra de solo lectura para la página, calculados a partir del state del padre: `props: (s) => ({ count: s.people.length })`. |
| `name` | El nombre de instancia, que es el prefijo de message. Por defecto, el último segmento estático del patrón. |

El nombre por defecto se calcula así: `"/admin/tasks"` es `tasks`, `"/users/:id"` es `users` (el segmento `:id` se omite), `"/"` es `index` y `"*"` es `fallback`. Dos entradas no pueden acabar con el mismo nombre, porque un message no podría distinguirlas. El framework lo rechaza y te dice cómo arreglarlo:

```text
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
```

### ¿View o componente?

Una **view** es la elección correcta para una página que solo muestra datos: una página "acerca de", una página de no encontrado, una página de detalle que lee `route.params`. No cuesta nada, no tiene handlers, y los datos que necesita llegan por `props`.

Un **componente** es la elección correcta cuando la página reacciona: maneja messages, carga datos al entrar, posee una parte del state. Es un componente normal; que esté en el routing solo añade el campo `route` en su state y los messages `enter` y `leave`.

Una página que es solo view puede tener eventos en su template. Un evento `@click=pick(1)` en la página `about` se envía como el message `about.pick`, y el componente con la tabla `routing` puede manejarlo con un método llamado `"about.pick"`. El único evento que rara vez necesitas manejar tú mismo es `navigate`, descrito más abajo.

## La route en el state

Una página con routing tiene un campo `route` en su state. Puedes leerlo en los handlers y en el template:

```ts
{ path: "/edit", base: "/users/42", params: { id: "42" }, search: "", hash: "" }
```

`search` y `hash` son strings sin procesar, `"?page=2"` y `"#top"`. El framework no analiza el query string. `params` contiene las capturas `:name` de este nivel **y de todos los niveles superiores**, así que una página muy anidada aún puede leer el `id` de su abuelo.

::demo route-state

La demo es una página que muestra un usuario. Cuando la dirección pasa de `/admin/users/2` a `/admin/users/7`, el template se actualiza en el mismo lugar: el router no reconstruyó nada, la página solo recibió una `route` nueva. Una página que necesita cargar los datos del nuevo usuario también recibe un message `enter` nuevo, como verás enseguida.

## Conectar el router

El mundo exterior es un plugin, como siempre. El **plugin router** lee la dirección del navegador y la cambia. Tiene cuatro effects: `listen`, `navigate`, `back` y `forward` (todos se describen en [la referencia de plugins](page:plugins-reference)). Dos de ellos importan aquí.

- `router.listen("routeChanged")` inicia el reporte. El plugin envía el message `routeChanged` de inmediato con la ubicación actual, y otra vez después de cada `navigate` y de cada pulsación de los botones atrás o adelante. El payload es `{ path, search, hash }`.
- `router.navigate("/about")` añade una nueva entrada al historial. Después el plugin informa al listener de la nueva ubicación, así que llega el mismo `routeChanged`.

No tienes que escribir la conexión. Un componente que tiene una tabla `routing` tiene dos handlers por defecto:

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _state, { setRoute }) => setRoute(msg.payload),
```

`mounted` es el message que `createApp({ mount })` envía cuando la aplicación ya está en el DOM. `setRoute` es una función del contexto del componente. Es pura. Devuelve un effect `store.set("route", ...)` y los effects `leave` y `enter` de las páginas que cambiaron. Si escribes tú mismo un método llamado `mounted` o `routeChanged`, reemplaza al valor por defecto. El ui-kit lo hace para también establecer el tema y la sección del menú cuando cambia la route. Una versión simplificada de su shell:

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

El handler debe llamar a `setRoute` y devolver sus effects. Si lo olvida, la `route` nunca se guarda y el outlet queda vacío.

Los plugins que necesitas para una aplicación con routing son el store (guarda `route`), el plugin dom y el plugin router:

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

> [!TIP] El state inicial tiene route: null
> Pon `route: null` en el state inicial. Hasta que el plugin router haya informado, los templates leen `route.path` de `null`, y una ruta en una expresión es segura frente a null, así que nada se rompe. El segundo paso de la siguiente demo muestra justo ese caso.

## Links que son links de verdad

La navegación necesita links. Un link debe ser un `<a href>` real, para que funcionen el clic central, "abrir en una pestaña nueva" y la barra de estado. Pero un clic normal no debe cargar un documento nuevo. La forma de pavlus es escribir ambos:

```pavlus
a(href="/about" @click.prevent=navigate("/about")) About
```

`href` es para el navegador. `@click.prevent` detiene la acción por defecto, y el evento se convierte en el message `navigate` con el payload `"/about"`. No escribes un handler para él. Un message `navigate` (o `something.navigate`, de un template embebido o de una página que es solo view) que nadie maneja, con un payload string, se convierte por defecto en `router.navigate(url)`. La url es relativa al componente que recibe el message, que para el shell es todo el sitio.

::demo links

El segundo paso de la demo muestra el link activo. La clase `active` es una condición sobre `route.path`. Cuando la route pasa de `null` a `/`, solo se aplica un patch al primer link.

> [!NOTE] Los href simples no se reescriben
> El framework reescribe la url del effect `router.navigate`. No toca el atributo `href`, porque es solo texto en tu template. Cuando una página está bajo una base, escribe tú la base: `href={route.base + "/users"}`. La siguiente sección tiene el panorama completo.

## enter y leave

Una página a menudo tiene que hacer algo cuando aparece: cargar datos, iniciar un temporizador. Y cuando desaparece: detener el temporizador. El router se lo dice a la página con dos messages.

- `enter` se envía cuando una página pasa a estar activa. El payload es su `route`.
- `leave` se envía cuando deja de estar activa.

`setRoute` calcula los messages a partir de la route anterior y la nueva, nivel por nivel. Desde el primer nivel cuya página activa difiere, las páginas viejas salen (primero la más profunda) y las nuevas entran (de arriba hacia abajo). Una página hoja también recibe `enter` de nuevo cuando solo cambió su propia route, por ejemplo de `/items/5` a `/items/7`, porque los `params` difieren. Un cambio solo de `search` o `hash` no vuelve a entrar.

Por eso no hace falta en ningún sitio una lista de "páginas y sus datos". La página que necesita datos los pide ella misma:

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

El `id: "post"` de la petición importa. Si el usuario va del post 1 al post 2 mientras el post 1 aún está cargando, la segunda petición reemplaza a la primera, y la respuesta a la primera se ignora. Mira la [sección de http](page:plugins-reference) de la referencia de plugins.

## Rutas anidadas

El routing se anida. Una página con routing que tiene su propia tabla `routing` recibe solo la parte de la ruta **por debajo de su base**, y navega de forma relativa a ella, sin saber quién la embebe. El área de administración de un sitio es el caso típico: el shell tiene `/admin`, la página admin tiene pestañas `/users` y `/users/:id`, y las direcciones completas son `/admin/users` y `/admin/users/2`.

La barra de pestañas de la página admin no sabe que vive bajo `/admin`. Lee `route.base`, que el framework establece en `/admin`:

::demo tabs

El `href` es `route.base + "/users"`, así que el link es `/admin/users`; el message es `navigate("/users")`, y el framework añade la base al effect. La regla para un navigate relativo es: *la página con routing más interna añade su base completa una vez, y marca el effect como `absolute`, para que los niveles superiores no añadan la suya otra vez.* Para ir a un sitio fuera, usa `router.navigate(url, { absolute: true })`.

## Un ejemplo completo

Este es un sitio pequeño con una página de inicio, un área de administración con dos pestañas, una lista de usuarios, una página de usuario y una página de no encontrado. Usa todas las ideas de esta página. Los archivos están listados en el orden en que los escribirías.

El template del shell tiene la navegación superior y el primer outlet:

```pavlus app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
    a(href="/admin" class:active={route.base === "/admin"} @click.prevent=navigate("/admin")) Admin
  main.app__main
    +outlet
```

El componente shell tiene tres entradas: una página de inicio que es solo view, el componente admin bajo la key `admin` y el fallback `"*"`.

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

Las dos páginas simples:

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

El componente admin tiene su propia tabla. Fíjate en los tres tipos de entrada: una view con `props`, un componente con `key` y `props`, y una view con un `name` explícito, porque `/users` y `/users/:id` se llamarían ambos `users`.

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

Las páginas bajo las pestañas. La página de resumen y la de usuario son views. La página de usuarios es un componente: cuenta cuántas veces se entró en ella.

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

Tres detalles merecen una segunda mirada.

Primero, el state de la página de usuarios vive en `admin.usersPage`. La página escribe `store.set("visits", ...)`, y el effect sale de la página como `usersPage.visits` y del shell como `admin.usersPage.visits`: cada nivel pone su `key` por delante. La página no sabe nada de dónde está montada.

Segundo, `navigate("/" + person.id)` en la página de usuarios va a `/admin/users/1`, porque la página de usuarios tiene su route en `/admin/users` y una url relativa se añade a su base.

Tercero, los `href` usan `route.base`: en la página de usuarios es `/admin/users`, así que el link es `/admin/users/1`, y el navegador abre la dirección correcta con un clic central.

Un test maneja todo el sitio con los plugins reales en jsdom. Hace clic en los links y mira la dirección y la página:

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

Los messages enviados en cada navegación son datos simples, así que también puedes probar un cambio de route sin DOM. Llamar al shell como una función con un message `routeChanged` devuelve los effects. Pasar de `/admin` a `/admin/users` devuelve la actualización de `route` y un effect de la página de usuarios, porque se entró en ella:

```json
[{ "plugin": "store", "type": "set", "path": "admin.usersPage.visits", "value": 1 }]
```

## Servir bajo una ruta base

Un sitio en GitHub Pages no está en la raíz del dominio. El ui-kit, cuyo código fuente es esta documentación, vive en `/pavlus/`. Allí la página del botón es `/pavlus/button`, pero la aplicación quiere llamarla `/button`. Si el router ve la ruta real, `/pavlus/button` solo coincide con `"*"`, y el usuario ve la página de no encontrado.

El plugin router no tiene una opción de ruta base. Tiene una opción `window`, y esa es la costura. El ui-kit le da un objeto pequeño que parece la ventana del navegador, pero que quita la ruta base al leer la ubicación y la vuelve a poner al escribir el historial:

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

La aplicación nunca ve la base. Solo `main.ts` la conoce:

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

Tres piezas lo hacen funcionar:

1. La opción `base` de Vite. El ui-kit se compila con `UI_KIT_BASE=/pavlus/`, en local la base es `/`. `import.meta.env.BASE_URL` es ese valor, y `rootOf` convierte `/pavlus/` en `/pavlus`.
2. `windowAt(root)` para el router, como arriba. La tabla de routing sigue siendo `"/button"`, `"/tabs"`.
3. Hrefs reales. Son texto, así que necesitan la base. El ui-kit guarda `root` en su state, y los templates escriben `href={root + "/templates"}`.

::demo base-href

La demo muestra cómo el `href` sigue a `root` en el state. El handler de clic no cambia: `navigate("/about")` es relativo a la aplicación y la window envuelta añade la base.

### El 404 en una visita directa

Hay un problema más, y no está en la aplicación. GitHub Pages es un servidor de archivos estáticos. Una petición de `/pavlus/button` no encuentra ningún archivo `button` y responde con un 404, antes de que se ejecute ningún JavaScript. Hacer clic en un link funciona, porque el navegador nunca le pregunta al servidor. Recargar la página, o abrir un link que alguien te envió, falla.

GitHub Pages sirve el archivo `404.html` para cada ruta desconocida. Así que el truco es publicar el shell de la aplicación también con ese nombre. El ui-kit lo hace en un pequeño plugin de Vite:

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

El navegador recibe el shell con el estado 404, carga los scripts, el router lee la dirección real y muestra la página correcta. En un servidor que controlas, responde a cada ruta desconocida con `index.html` y el estado 200.

## Lo que no se hace

Conoce los límites, para que no los busques:

- No hay guards ni redirects como entradas de routing. Un redirect es un handler: en `enter`, devuelve `router.navigate("/login", { replace: true })`.
- No hay análisis del query string. `route.search` es el string sin procesar.
- `route.params` está tipado como `Record<string, string>`: cada param es un string.
- No hay carga diferida de páginas. Todas las páginas se importan al principio del archivo.

## Lo que aprendiste

- Una tabla `routing` asocia patrones con páginas, y `+outlet` muestra la que coincide. Gana el patrón más largo, y `"*"` recoge el resto.
- Una página es una `view` (un template) o un `component` (lógica). Ve `route`, recibe `enter` y `leave`, y `key` y `props` dan forma a su state.
- Los links son `href` reales con `@click.prevent=navigate(...)`. El routing se anida, y un navigate desde una página anidada es relativo a su base.
- Bajo una ruta base, dale al plugin router una `window` que oculte la base, y construye los hrefs con ella.

Siguiente: [Renderizado en servidor](page:concepts-ssr).
