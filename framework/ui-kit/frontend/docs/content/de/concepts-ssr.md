---
summary: Dieselben reinen Templates, die im Browser laufen, können auf einem Server laufen und HTML liefern. Du lernst, was das Modul ssr bietet, wie du Daten vor dem Rendern lädst, wie der Browser das Markup übernimmt und was nicht unterstützt wird.
---
## Warum auf dem Server rendern

Eine normale pavlus-Seite beginnt leer. Der Browser lädt eine kleine HTML-Datei, dann das JavaScript, und dann baut der Code die Seite auf. Bis das fertig ist, sieht der Besucher nichts, und ein Programm, das nur HTML liest (eine Suchmaschine, eine Linkvorschau), sieht ebenfalls nichts.

**Server-Side-Rendering** (SSR) ändert den ersten Schritt. Der Server führt deine Anwendung aus, erzeugt das HTML der Seite und schickt es zusammen mit dem JavaScript. Der Besucher sieht die Seite sofort. Dann startet das JavaScript im Browser und **hydriert** das Markup: Es hängt die Event-Listener an die Elemente, die schon da sind. Nichts wird neu aufgebaut.

Das funktioniert in pavlus ohne zweite Codebasis, weil die Anwendung aus reinen Funktionen besteht. Ein Template wird zu `render(state)` kompiliert, das einfache Daten zurückgibt, und `render` ist es egal, wo es läuft. Ein handler gibt Effekte zurück, ebenfalls einfache Daten. Nur die Plugins berühren die Außenwelt, und auf dem Server gibst du der Anwendung einfach andere Plugins.

```text
server                                   browser
createApp({ app, plugins })  --state-->  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) -> the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) --html-->    (listeners and ids on the markup)
```

## Das kleinste Beispiel

Die eine Funktion, ohne die es nicht geht, ist `renderToString`. Sie nimmt eine view und einen State und gibt einen String zurück.

::demo hello

Die Demo zeigt das HTML, das `render` für diesen State erzeugt hat. Auf dem Server würdest du aufrufen:

```ts
import { compileToView } from "@pavlus/frontend/compiler";
import { renderToString } from "@pavlus/frontend/ssr";

const view = compileToView("p Hello, {name}");
renderToString(view, { name: "Ann" });
```

und erhältst diesen String, der das HTML der Demo zwischen zwei Kommentaren ist:

```text
<!--pavlus--><p>Hello, Ann</p><!--/pavlus-->
```

(Deine Anwendung importiert die view mit `import view from "./hello.pavlus"`. `compileToView` ist der Weg, dieselbe view in einem Skript oder einem Test ohne Vite zu bekommen.)

Die zwei Kommentare `<!--pavlus-->` und `<!--/pavlus-->` sind die **Marker** eines Server-Renders. Das DOM-Plugin sucht sie beim Mounten. Sind sie da, hydriert es das Markup dazwischen; wenn nicht, baut es die Seite wie gewohnt auf.

## Was das Modul ssr bietet

Das Modul `@pavlus/frontend/ssr` hat drei Funktionen. Zwei verwandte Funktionen kommen aus dem Hauptpaket.

| Funktion | Was sie tut |
| --- | --- |
| `renderToString(view, state)` | Das HTML der view für diesen State, zwischen den zwei Marker-Kommentaren. |
| `serializeState(state, components)` | Der State als JSON. Komponentenwerte im State werden durch ihre Namen ersetzt. |
| `reviveState(json, components)` | Der State aus JSON zurück, mit den wieder eingesetzten Komponenteninstanzen. |
| `viewOf(component)` | Aus dem Hauptpaket. Die view einer Komponente, an die Komponente gebunden, damit `+outlet` und Kinder funktionieren. |
| `toHtml(vnodes)` | Aus dem Hauptpaket. Einfaches HTML aus vnodes, ohne Marker. |

`renderToString` ist `toHtml` mit einem Flag: Es schreibt auch die *Block-Marker* des Templates. Sieh dir an, was der Compiler in eine Liste einfügt:

::demo list open=vnodes

In den vnodes siehst du `marker`-Knoten um den `for`-Block. Sie sind unsichtbare Kommentare im DOM, und sie lassen die Laufzeit finden, wo ein Block beginnt und endet. Ein Server-Render muss sie enthalten, sonst könnte der Browser die Liste später nicht patchen. Mit dem Flag ergibt derselbe State:

```text
<!--pavlus--><ul><!--1s--><!--1[#1--><li class="done">a</li><!--1]#1--><!--1[#2--><li>b</li><!--1]#2--><!--1e--></ul><!--/pavlus-->
```

Willst du nur einfaches HTML, für eine E-Mail oder eine statische Seite, die nie hydriert wird, nutze `toHtml(view.render(state))`. Es hat keine Marker und ist kleiner.

### Escaping

Text und Attributwerte werden für dich escaped. Dasselbe Template mit einem feindlichen Namen:

::demo escape

Das HTML in der Demo zeigt den Text als Text, nicht als Tag. Im String werden die Zeichen `<`, `>` und `&` im Text sowie die Anführungszeichen in Attributen als Entities geschrieben (`&lt;script&gt;`). Dein State kann der Seite kein Tag hinzufügen.

## Daten vor dem Render laden

Eine Seite zeigt selten nur statischen State. Der übliche Fall ist, dass eine Seite beim Betreten mit einer `http`-Anfrage Daten lädt. Der Server muss auf diese Daten warten, bevor er rendert. Sieh dir den Plan an:

1. Erzeuge die Anwendung **ohne `mount`**. Es gibt kein DOM.
2. Gib ihr einen Store, ein `http`-Plugin und Plugins, die die Effekte der reinen Browser-Plugins annehmen und nichts tun.
3. Dispatche die Message, die der Router senden würde, mit dem angeforderten Ort.
4. Warte, bis keine Anfrage mehr unterwegs ist.
5. Lies den State und rendere.

Warum von Hand dispatchen? Im Browser liest das Router-Plugin `window.location` und sendet `routeChanged`. Auf dem Server gibt es kein window, aber der Ort ist bekannt: Es ist die URL der Anfrage. Eine Komponente mit einer `routing`-Tabelle behandelt `routeChanged` standardmäßig (`setRoute`), sodass die Seiten, die `enter` erhalten, anfangen, ihre Daten zu laden, genau wie im Browser.

Das `http`-Plugin hat eine Option `fetch`. Auf dem Server übergibst du ein `fetch`, das im selben Prozess antwortet, ohne Socket. Und `http.settled()` ist ein Promise, das aufgelöst wird, wenn nichts mehr unterwegs ist, **einschließlich der Anfragen, die die Antworten gestartet haben**. Lädt eine Seite eine Liste und dann die Details jedes Eintrags, wartet `settled` auf alle.

Effekte für Plugins, die auf dem Server keinen Sinn ergeben, brauchen einen Platzhalter. Gibt die Anwendung `router.navigate(...)` zurück und ist kein Plugin `router` registriert, wirft der Kern `no plugin "router" for effect "navigate"`. Der Platzhalter ist ein Plugin aus einer Zeile:

```ts
const inert = (name: string): Plugin => ({ name, handle() {} });
```

## Ein vollständiges Beispiel

Wir bauen eine kleine Site mit zwei Beiträgen. Die Startseite ist eine view, eine Beitragsseite ist eine Komponente, die den Beitrag beim Betreten lädt. Die Dateien sind dieselben wie bei einer Browser-Anwendung, plus `server.ts`.

Das Shell-Template und die Seiten:

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

Die Beitragsseite fragt ihre Daten in `enter` an, mit der `id` aus der Route. Die Antworten kommen als die Messages `loaded` und `failed` zurück:

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

`components` ist die Liste der Komponenteninstanzen, die *Werte* im State sind (ein Template kann `+{expr}` einbetten, und der State hält dann eine Komponente). Diese App hat keine. Wir kommen unten darauf zurück.

Nun der Server. Ein neuer Store, ein neues `http`-Plugin und eine neue Anwendung werden **für jede Anfrage** erzeugt. Die Komponenten (`shell`, `post`) werden geteilt, weil sie keinen State halten; der State wird nicht geteilt:

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

Lies `renderPage` langsam. Es gibt drei Dinge zurück: den `status`, das `html` und den `state` als JSON. Der Status kommt von `matchRoute`, derselben Funktion, die der outlet nutzt: Ist der beste Treffer der Eintrag `"*"` oder gibt es keinen, antwortet der Server mit 404. Das Framework macht das nicht für dich, denn die HTTP-Antwort ist Sache deines Servers.

`renderDocument` setzt die Teile in `index.html` ein. Das Markup kommt in das Mount-Element, **mit den Marker-Kommentaren, die `renderToString` geschrieben hat**. Der State kommt in ein Skript vor dem eigenen Skript der Anwendung. Zwei Details:

- Das JSON wird zuerst zu einem JavaScript-String gemacht (`JSON.stringify` des Strings), und `<` wird als `<` geschrieben. Ein Text wie `</script>` in deinem State kann das Script-Element nicht schließen.
- `replace` wird mit einer Funktion aufgerufen, nicht mit einem String. In einem Ersetzungs-String haben `$&` und `$'` eine Bedeutung, ein Beitrag, der sie enthält, würde also verfälscht.

Schließlich der Browser. Er belebt den State wieder, falls es einen gibt, und mountet wie gewohnt:

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

Enthält das Ziel `#app` bereits einen Server-Render, **hydriert** `mount` ihn. Hat die Seite keinen State (ein einfacher Build ohne Server), ist `json` undefined, und der Store startet mit `initialState`; die Anwendung funktioniert wie eine normale Client-Anwendung.

Ein Test führt den Server aus, setzt das Ergebnis in jsdom ein, startet den Client-Code und prüft die drei Versprechen von SSR: Der Inhalt ist da, die Knoten werden nicht neu aufgebaut, und der Beitrag wird nicht ein zweites Mal geladen.

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

## Wie Hydration funktioniert und was sie prüft

Das DOM-Plugin geht das Markup, das der Server geschrieben hat, Seite an Seite mit den Knoten durch, die `render(state)` zurückgibt. Für jedes Element prüft es, dass das Tag das ist, das die view erwartet; es hängt die Listener an und registriert die Knoten-ids; dann geht es zu den Kindern über. Nichts wird erzeugt, es gibt also kein Flackern, und der Zustand von Formularfeldern (der Text, den ein Besucher schon getippt hat) bleibt erhalten.

Der HTML-Parser tut zwei Dinge, über die ein naiver Durchlauf stolpern würde: Er verschmilzt benachbarte Textknoten und lässt leere weg. Die Hydration macht beides rückgängig: Sie teilt einen verschmolzenen Textknoten an der richtigen Stelle und fügt die leeren wieder ein.

Passt das Markup nicht zur view, funktioniert die Seite trotzdem. Das Plugin gibt eine Warnung aus und rendert neu:

```text
pavlus/dom: the server render does not match the view (expected <p>); rendering afresh
```

und:

```text
pavlus/dom: the server render does not match the view (text "Hello, Bob" is not "Hello, Ann"); rendering afresh
```

Die Gründe sind die üblichen: Der State im Browser ist nicht der State, den der Server benutzt hat, oder der Browser hat eine andere Version des Templates als der Server.

Das erste `routeChanged` nach der Hydration trägt den Ort, den der Server gerendert hat, deshalb sendet `setRoute` kein `enter`. Darum sieht der Test oben keine Anfrage: Die Daten sind schon im State.

## Was unterstützt wird und was nicht

SSR in pavlus ist bewusst klein. Diese Liste ist die ganze Wahrheit:

- **Unterstützt.** Eine view oder eine Komponente (mit Kindern und `+outlet`) zu einem String rendern; einen State serialisieren und wiederbeleben; hydrieren, indem Listener und ids angehängt werden; auf `http`-Anfragen warten; auf einen Client-Render zurückfallen, wenn das Markup abweicht.
- **Ein String, kein Streaming.** `renderToString` ist synchron und gibt die ganze Seite zurück.
- **Nur `http` wird abgewartet.** `http.settled()` kennt `http`-Anfragen. Auf einen `time`-Timer oder eine `ws`-Message wird nicht gewartet, und es ist besser, diese Plugins auf dem Server nicht zu registrieren.
- **Der State muss JSON sein.** `serializeState` ist `JSON.stringify` mit einer Ergänzung, den Komponenteninstanzen. Ein `Date` wird zu einem String, `undefined` und Funktionen fallen weg, `NaN` wird zu `null`, eine `Map` wird zu `{}`. Halte den State einfach, wie du es ohnehin solltest.
- **Die Hydration vergleicht die Struktur, nicht die Attribute.** Tags, Text und Marker werden geprüft. Hat der Server `class="x"` geschrieben und die Client-view keines, gelingt die Hydration, und das Attribut bleibt, bis ein Patch es berührt. Rendere auf dem Server keine anderen Attribute.
- **Die Marker müssen erhalten bleiben.** Entfernst du die Kommentare `<!--pavlus-->` und `<!--/pavlus-->` aus dem HTML (ein Minifier, ein selbstgebautes Template), erkennt der Browser keinen Server-Render und hängt eine zweite Kopie der Seite hinter die erste. Teste deine Pipeline mit der echten Ausgabe.
- **Keine `<head>`-Verwaltung.** Titel und Meta-Tags sind deine Sache: Berechne sie in `renderDocument` aus dem State.
- **Kein Basispfad.** Der Server gibt den Pfad weiter, den er erhalten hat. Wird deine Site unter einem Präfix ausgeliefert, entferne es, bevor du `routeChanged` dispatchst, so wie es `windowAt` des ui-kit im Browser tut (siehe [Routing](page:concepts-routing)).
- **Kein HTTP-Server.** Das Framework gibt dir die Funktionen. HTTP-Anfragen zu routen, die gebauten Dateien auszuliefern und Vite in der Entwicklung zu betreiben ist die Arbeit deines Servers. Die `admin-app` dieses Repositorys hat einen vollständigen, in `@pavlus/backend/ssr` und `backend/server.ts`, mit `app/entry-server.ts` als dem Modul, das der Server lädt.

> [!WARNING] Ein Store pro Anfrage
> Erzeuge das Store-Plugin nie auf oberster Ebene des Server-Moduls. Der State würde von allen Anfragen geteilt, und ein Besucher könnte die Daten des vorherigen sehen. Erzeuge den Store, das `http`-Plugin und die Anwendung innerhalb der Funktion, die eine Anfrage behandelt, und beende die Anwendung am Ende mit dispose.

## Komponenten im State

Ein Template kann eine Komponente einbetten, die ein *Wert* im State ist: `+{view}#name(...)`. Dann hält der State eine Klasseninstanz, und JSON kann sie nicht halten. `serializeState` nimmt ein zweites Argument, ein Objekt, das jeder Instanz einen Namen gibt, und schreibt stattdessen `{"$component": name}`. `reviveState` nimmt dasselbe Objekt und setzt die Instanzen wieder ein.

```ts
class Table extends Component {}
const table = new Table();

serializeState({ n: 1, mode: table }, { table });
// {"n":1,"mode":{"$component":"table"}}
```

Eine Instanz, die nicht im Objekt steht, ist ein Fehler, der sagt, was zu tun ist:

```text
pavlus/ssr: a Table instance is in the state; list it in `components` to serialize it
```

Und ein Name, den der Browser nicht kennt, ist ebenfalls ein Fehler: `pavlus/ssr: no component named "zzz"`. Deshalb müssen Server und Browser dasselbe `components`-Objekt importieren. Im Beispiel oben wird es aus `app.ts` exportiert, und beide Seiten benutzen es.

## Was du gelernt hast

- SSR ist dasselbe reine `render`, auf einem Server ausgeführt. `renderToString` gibt das HTML zwischen zwei Marker-Kommentaren zurück, und das DOM-Plugin hydriert es.
- Um Daten zu laden, erzeuge die App ohne `mount`, dispatche `routeChanged` mit dem Ort der Anfrage und warte auf `http.settled()`, bevor du renderst.
- Der State reist als JSON in einem Skript; `serializeState` und `reviveState` behandeln Komponentenwerte.
- Erzeuge Store und App für jede Anfrage. Die Marker müssen den Browser erreichen, und das Framework vergleicht nur die Struktur.

Weiter: [Wie Plugins funktionieren](page:plugins-overview).
