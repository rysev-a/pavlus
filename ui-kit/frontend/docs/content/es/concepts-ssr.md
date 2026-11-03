---
summary: Los mismos templates puros que se ejecutan en el navegador pueden ejecutarse en un servidor y producir HTML. Aprende qué ofrece el módulo ssr, cómo cargar datos antes de renderizar, cómo el navegador toma el markup y qué no está soportado.
---
## Por qué renderizar en el servidor

Una página normal de pavlus empieza vacía. El navegador descarga un archivo HTML pequeño, luego el JavaScript, y después el código construye la página. Hasta que eso termina, el visitante no ve nada, y un programa que lee solo HTML (un buscador, una vista previa de enlaces) tampoco ve nada.

El **renderizado en servidor** (SSR) cambia el primer paso. El servidor ejecuta tu aplicación, produce el HTML de la página y lo envía junto con el JavaScript. El visitante ve la página de inmediato. Después el JavaScript arranca en el navegador y **hidrata** el markup: engancha los listeners de eventos a los elementos que ya están ahí. No se reconstruye nada.

Esto funciona en pavlus sin una segunda base de código, porque la aplicación está hecha de funciones puras. Un template se compila en `render(state)`, que devuelve datos simples, y a `render` no le importa dónde se ejecuta. Un handler devuelve effects, que también son datos simples. Solo los plugins tocan el mundo exterior, y en el servidor simplemente le das a la aplicación otros plugins.

```text
server                                   browser
createApp({ app, plugins })  --state-->  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) -> the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) --html-->    (listeners and ids on the markup)
```

## El ejemplo más pequeño

La única función de la que no puedes prescindir es `renderToString`. Recibe una view y un state y devuelve un string.

::demo hello

La demo muestra el HTML que `render` produjo para este state. En el servidor, llamarías a:

```ts
import { compileToView } from "@service-laboratory/pavlus/compiler";
import { renderToString } from "@service-laboratory/pavlus/ssr";

const view = compileToView("p Hello, {name}");
renderToString(view, { name: "Ann" });
```

y obtendrías este string, que es el HTML de la demo entre dos comentarios:

```text
<!--pavlus--><p>Hello, Ann</p><!--/pavlus-->
```

(Tu aplicación importa la view con `import view from "./hello.pavlus"`. `compileToView` es la forma de obtener la misma view en un script o en un test, sin Vite.)

Los dos comentarios `<!--pavlus-->` y `<!--/pavlus-->` son los **markers** de un render de servidor. El plugin dom los busca al montar. Si están, hidrata el markup que hay entre ellos; si no, construye la página como de costumbre.

## Qué ofrece el módulo ssr

El módulo `@service-laboratory/pavlus/ssr` tiene tres funciones. Otras dos funciones relacionadas vienen del paquete principal.

| Función | Qué hace |
| --- | --- |
| `renderToString(view, state)` | El HTML de la view para este state, entre los dos comentarios marker. |
| `serializeState(state, components)` | El state como JSON. Los valores de componentes en el state se reemplazan por sus nombres. |
| `reviveState(json, components)` | El state de vuelta desde JSON, con las instancias de componentes puestas de nuevo. |
| `viewOf(component)` | Del paquete principal. La view de un componente, cerrada sobre el componente, para que funcionen `+outlet` y los hijos. |
| `toHtml(vnodes)` | Del paquete principal. HTML simple de vnodes, sin ningún marker. |

`renderToString` es `toHtml` con una bandera: también escribe los *markers de bloque* del template. Mira lo que el compilador pone en una lista:

::demo list open=vnodes

En los vnodes ves nodos `marker` alrededor del bloque `for`. Son comentarios invisibles en el DOM, y permiten que el runtime encuentre dónde empieza y termina un bloque. Un render de servidor debe contenerlos, o el navegador no podría aplicar patches a la lista después. Con la bandera, el mismo state produce:

```text
<!--pavlus--><ul><!--1s--><!--1[#1--><li class="done">a</li><!--1]#1--><!--1[#2--><li>b</li><!--1]#2--><!--1e--></ul><!--/pavlus-->
```

Si quieres solo HTML simple, para un e-mail o una página estática que nunca se hidrata, usa `toHtml(view.render(state))`. No tiene markers y es más pequeño.

### Escapado

El texto y los valores de atributos se escapan por ti. El mismo template con un nombre hostil:

::demo escape

El HTML de la demo muestra el texto como texto, no como una etiqueta. En el string, los caracteres `<`, `>` y `&` en el texto, y las comillas en los atributos, se escriben como entidades (`&lt;script&gt;`). Tu state no puede añadir una etiqueta a la página.

## Cargar datos antes del render

Una página rara vez muestra solo state estático. Lo habitual es que una página cargue datos al entrar, con una petición `http`. El servidor tiene que esperar esos datos antes de renderizar. Mira el plan:

1. Crea la aplicación **sin `mount`**. No hay DOM.
2. Dale un store, un plugin `http` y plugins que acepten los effects de los plugins solo de navegador y no hagan nada.
3. Despacha el message que enviaría el router, con la ubicación pedida.
4. Espera hasta que no haya ninguna petición en curso.
5. Lee el state y renderiza.

¿Por qué despachar a mano? En el navegador, el plugin router lee `window.location` y envía `routeChanged`. En el servidor no hay window, pero la ubicación se conoce: es la URL de la petición. Un componente con una tabla `routing` maneja `routeChanged` por defecto (`setRoute`), así que las páginas que hacen `enter` empiezan a cargar sus datos, exactamente como en el navegador.

El plugin `http` acepta una opción `fetch`. En el servidor pasas un `fetch` que responde en el mismo proceso, sin socket. Y `http.settled()` es una promesa que se resuelve cuando ya no hay nada en curso, **incluidas las peticiones que iniciaron las respuestas**. Si una página carga una lista y luego carga los detalles de cada elemento, `settled` espera a todas.

Los effects para plugins que no tienen sentido en el servidor necesitan un sustituto. Si la aplicación devuelve `router.navigate(...)` y no hay ningún plugin `router` registrado, el core lanza `no plugin "router" for effect "navigate"`. El sustituto es un plugin de una línea:

```ts
const inert = (name: string): Plugin => ({ name, handle() {} });
```

## Un ejemplo completo

Construimos un sitio pequeño con dos posts. La página de inicio es una view, una página de post es un componente que carga el post al entrar. Los archivos son los mismos que en una aplicación de navegador, más `server.ts`.

El template del shell y las páginas:

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

La página del post pide sus datos en `enter`, con el `id` de la route. Las respuestas vuelven como los messages `loaded` y `failed`:

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

`components` es la lista de instancias de componentes que son *valores* en el state (un template puede embeber `+{expr}` y entonces el state contiene un componente). Esta aplicación no tiene ninguno. Volvemos a ello más abajo.

Ahora el servidor. Se crean un store nuevo, un plugin `http` nuevo y una aplicación nueva **para cada petición**. Los componentes (`shell`, `post`) se comparten, porque no guardan state; el state no se comparte:

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

Lee `renderPage` despacio. Devuelve tres cosas: el `status`, el `html` y el `state` como JSON. El status viene de `matchRoute`, la misma función que usa el outlet: si la mejor coincidencia es la entrada `"*"` o no hay ninguna, el servidor responde 404. El framework no hace esto por ti, porque la respuesta HTTP es asunto de tu servidor.

`renderDocument` pone las piezas en `index.html`. El markup va en el elemento de montaje, **con los comentarios marker, que escribió `renderToString`**. El state va en un script antes del script propio de la aplicación. Dos detalles:

- El JSON se convierte primero en un string de JavaScript (`JSON.stringify` del string), y `<` se escribe como `<`. Un texto como `</script>` en tu state no puede cerrar el elemento script.
- `replace` se llama con una función, no con un string. En un string de reemplazo, `$&` y `$'` tienen significado, así que un post que los contenga quedaría corrompido.

Por último, el navegador. Revive el state, si lo hay, y monta como de costumbre:

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

Cuando el destino `#app` ya contiene un render de servidor, `mount` lo **hidrata**. Cuando la página no tiene state (una compilación simple sin servidor), `json` es undefined y el store arranca desde `initialState`; la aplicación funciona como una aplicación de cliente normal.

Un test ejecuta el servidor, pone el resultado en jsdom, arranca el código del cliente y comprueba las tres promesas del SSR: el contenido está ahí, los nodos no se reconstruyen y el post no se carga una segunda vez.

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

## Cómo funciona la hidratación y qué comprueba

El plugin dom recorre el markup que escribió el servidor junto a los nodos que devuelve `render(state)`. Para cada elemento comprueba que la etiqueta sea la que espera la view; engancha los listeners y registra los ids de los nodos; después sigue con los hijos. No se crea nada, así que no hay parpadeo, y el state de los controles de formulario (el texto que el visitante ya escribió) sobrevive.

El parser de HTML hace dos cosas con las que un recorrido ingenuo tropezaría: une los nodos de texto adyacentes y descarta los vacíos. La hidratación deshace ambas: divide un nodo de texto unido en el lugar correcto y vuelve a insertar los vacíos.

Cuando el markup no coincide con la view, la página sigue funcionando. El plugin imprime una advertencia y renderiza de nuevo:

```text
pavlus/dom: the server render does not match the view (expected <p>); rendering afresh
```

y:

```text
pavlus/dom: the server render does not match the view (text "Hello, Bob" is not "Hello, Ann"); rendering afresh
```

Las razones son las habituales: el state en el navegador no es el state que usó el servidor, o el navegador tiene otra versión del template distinta de la del servidor.

El primer `routeChanged` tras la hidratación lleva la ubicación que renderizó el servidor, así que `setRoute` no envía `enter`. Por eso el test anterior no ve ninguna petición: los datos ya están en el state.

## Qué está y qué no está soportado

El SSR en pavlus es pequeño a propósito. Esta lista es toda la verdad:

- **Soportado.** Renderizar una view o un componente (con hijos y `+outlet`) a un string; serializar y revivir un state; hidratar enganchando listeners e ids; esperar peticiones `http`; volver a un render de cliente cuando el markup difiere.
- **Un string, sin streaming.** `renderToString` es síncrono y devuelve la página completa.
- **Solo se espera `http`.** `http.settled()` conoce las peticiones `http`. Un temporizador de `time` o un message de `ws` no se esperan, y es mejor no registrar esos plugins en el servidor.
- **El state debe ser JSON.** `serializeState` es `JSON.stringify` con una adición, las instancias de componentes. Un `Date` se convierte en string, `undefined` y las funciones se descartan, `NaN` se convierte en `null`, un `Map` se convierte en `{}`. Mantén el state simple, como deberías hacer de todos modos.
- **La hidratación compara la estructura, no los atributos.** Se comprueban etiquetas, texto y markers. Si el servidor escribió `class="x"` y la view del cliente no tiene ninguna, la hidratación tiene éxito y el atributo se queda hasta que un patch lo toque. No renderices atributos distintos en el servidor.
- **Los markers deben sobrevivir.** Si quitas los comentarios `<!--pavlus-->` y `<!--/pavlus-->` del HTML (un minificador, un template hecho a mano), el navegador no ve un render de servidor y añade una segunda copia de la página después de la primera. Prueba tu pipeline con la salida real.
- **Sin gestión de `<head>`.** El título y las etiquetas meta son cosa tuya: calcúlalos a partir del state en `renderDocument`.
- **Sin ruta base.** El servidor pasa la ruta que recibió. Si tu sitio se sirve bajo un prefijo, quítalo antes de despachar `routeChanged`, como hace `windowAt` del ui-kit en el navegador (mira [Enrutamiento](page:concepts-routing)).
- **Sin servidor HTTP.** El framework te da las funciones. Enrutar las peticiones HTTP, servir los archivos compilados y ejecutar Vite en desarrollo es trabajo de tu servidor. La `admin-app` de este repositorio tiene uno completo, en `backend/ssr.ts` y `backend/server.ts`, con `frontend/entry-server.ts` como el módulo que carga el servidor.

> [!WARNING] Un store por petición
> Nunca crees el plugin store al principio del módulo del servidor. El state se compartiría entre todas las peticiones, y un visitante podría ver los datos del anterior. Crea el store, el plugin `http` y la aplicación dentro de la función que maneja una petición, y haz dispose de la aplicación al final.

## Componentes en el state

Un template puede embeber un componente que es un *valor* en el state: `+{view}#name(...)`. Entonces el state contiene una instancia de clase, y JSON no puede contenerla. `serializeState` recibe un segundo argumento, un objeto que da un nombre a cada instancia, y escribe `{"$component": name}` en su lugar. `reviveState` recibe el mismo objeto y vuelve a poner las instancias.

```ts
class Table extends Component {}
const table = new Table();

serializeState({ n: 1, mode: table }, { table });
// {"n":1,"mode":{"$component":"table"}}
```

Una instancia que no está en el objeto es un error que dice qué hacer:

```text
pavlus/ssr: a Table instance is in the state; list it in `components` to serialize it
```

Y un nombre que el navegador no conoce también es un error: `pavlus/ssr: no component named "zzz"`. Por eso el servidor y el navegador deben importar el mismo objeto `components`. En el ejemplo anterior se exporta desde `app.ts`, y ambos lados lo usan.

## Lo que aprendiste

- El SSR es el mismo `render` puro ejecutado en un servidor. `renderToString` devuelve el HTML entre dos comentarios marker, y el plugin dom lo hidrata.
- Para cargar datos, crea la app sin `mount`, despacha `routeChanged` con la ubicación de la petición y espera a `http.settled()` antes de renderizar.
- El state viaja como JSON en un script; `serializeState` y `reviveState` manejan los valores de componentes.
- Crea el store y la app para cada petición. Los markers deben llegar al navegador, y el framework compara solo la estructura.

Siguiente: [Cómo funcionan los plugins](page:plugins-overview).
