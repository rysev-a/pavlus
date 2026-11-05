---
summary: Eine Komponente kann ihre Seiten nach Pfad auflisten und die passende mit einer einzigen Zeile zeigen, +outlet. Du lernst die Routing-Tabelle, die Route im State, enter und leave, verschachtelte Routen und wie du die App unter einem Basispfad auslieferst.
---
## Ein Pfad, eine Seite

Eine Single-Page-Anwendung zeigt unter verschiedenen Adressen verschiedene Seiten, ohne jedes Mal ein neues HTML-Dokument zu laden. In pavlus heißt das **Routing**, und es wird als Daten deklariert. Eine Komponente bekommt eine `routing`-Tabelle: Sie ordnet einem Pfadmuster den Child zu, der gezeigt werden soll. Ihr Template sagt mit einer Zeile, *wo* der Child steht, nämlich `+outlet`.

Hier ist der kleinste Router. Drei Pfade, drei Seiten:

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

Und das Template der Shell:

```pavlus
main.page
  +outlet
```

`+outlet` ist ein Built-in. Danach steht nichts. Ist die Route `/about`, enthält das Element `main` die Seite `about`; bei `/` die Startseite. Die Muster links werden mit dem aktuellen Pfad verglichen, und `"*"` bedeutet „alles, was übrig bleibt".

Ein Name, der mit einem Kleinbuchstaben beginnt, ist ein Built-in (`outlet`); ein Name mit Großbuchstaben am Anfang ist eine importierte Komponente (`+Sidebar`). Deshalb geraten die beiden nie in Konflikt.

> [!NOTE] Woher kommt der aktuelle Pfad?
> Vom **Router-Plugin**. Es liest die Adresse des Browsers und meldet sie als Message an deine Anwendung. Der Abschnitt „Den Router anschließen" unten zeigt die drei Zeilen, die ihn verbinden. Solange das Plugin nichts gemeldet hat, ist das State-Feld `route` gleich `null`, und der outlet ist leer.

## Was der Compiler mit +outlet macht

Der outlet ist zur Laufzeit keine Magie. Der Compiler macht aus der Zeile ein *dynamisches embed*: zwei Marker im DOM, und dazwischen die view der Seite, die passt. Das ist das erzeugte `render` der Shell von oben, der Teil für `+outlet`:

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

`resolveOutlet(env, state)` sieht sich `env` an, die Komponente, der das Template gehört, nimmt ihre `routing`-Tabelle und gleicht `state.route` ab. Es gibt die view zurück, die gerendert wird, den **Instanznamen** der Seite und den **State**, den die Seite sehen wird. Der Name wird zum Message-Präfix: Jedes Event in der Seite wird als `<name>.<message>` gesendet. Das ist dieselbe Regel wie für jeden eingebetteten Child, siehe [Nachrichten und Kindkomponenten](page:concepts-messages).

Bei einer State-Änderung tut `diff` eines von zwei Dingen. Ist die passende Seite eine andere (andere view oder anderer Name), leert es alles zwischen den beiden Markern und rendert die neue Seite. Ist es dieselbe Seite, läuft nur ihr eigenes `diff`. Der Wechsel von `/about` nach `/` baut also den Inhalt neu auf, und die Änderung eines Zählers in einer Seite patcht einen einzelnen Textknoten.

> [!WARNING] Mounte die Komponente, nicht nur ihre view
> `+outlet` braucht `env`, die Komponente mit der `routing`-Tabelle. `createApp({ mount })` übergibt sie für dich. Mountest du eine nackte view eines Templates mit outlet, bekommst du: pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view. Für Tests nutze `mountView(component, state)` aus `@service-laboratory/pavlus/testing` mit der Komponente selbst.

## Muster und Abgleich

Ein Muster ist ein Pfad aus Segmenten, getrennt durch `/`. Ein Segment ist entweder einfacher Text oder `:name`, das erfasst, was an dieser Stelle des Pfads steht.

Die Regeln sind kurz:

- Ein Muster passt auf den Pfad genau oder als **Präfix, das an einem `/` endet**. `"/admin"` passt auf `/admin` und `/admin/tasks`, aber nicht auf `/administrator`.
- `"/"` passt nur auf den genauen Pfad `/`. Es ist die Startseite und nie ein Präfix von etwas.
- `":name"` erfasst ein Segment und dekodiert es (`a%20b` wird zu `a b`).
- `"*"` passt auf alles, was sonst nichts getroffen hat.
- Passen mehrere Muster, gewinnt das **längste** (die meisten Segmente); sind zwei gleich lang, das zuerst deklarierte.
- Passt nichts und gibt es kein `"*"`, bleibt der outlet leer.

Diese Tabelle ist die echte Ausgabe von `matchRoute` für die Tabelle `"/"`, `"/users"`, `"/users/:id"`, `"/admin"` und `"*"`. Die letzten drei Spalten sind das, was die passende Seite als ihre `route` erhält:

| Pfad | Passendes Muster | route.path | route.base | route.params |
| --- | --- | --- | --- | --- |
| `/` | `/` | `/` | (leer) | keine |
| `/users` | `/users` | `/` | `/users` | keine |
| `/users/42` | `/users/:id` | `/` | `/users/42` | id ist 42 |
| `/users/42/edit` | `/users/:id` | `/edit` | `/users/42` | id ist 42 |
| `/admin/x` | `/admin` | `/x` | `/admin` | keine |
| `/administrator` | `*` | `/administrator` | (leer) | keine |

Sieh dir die Spalten `route.path` und `route.base` an. Eine Seite sieht nicht den ganzen Pfad. Sie sieht, was **unterhalb** des passenden Musters übrig ist (`path`), und was verbraucht wurde, um dorthin zu kommen (`base`). Das macht die Verschachtelung möglich, und wir kommen gleich darauf zurück.

`matchRoute(routing, route)` und `routeName(pattern, spec)` werden vom Paket exportiert, du kannst dieselbe Logik also in einem Test oder auf einem Server nutzen.

## Ein Routing-Eintrag

Der Wert in der Tabelle ist eine *Route-Spec*. Sie hat die Form eines Child-Eintrags (siehe die [Seite zu Komponenten](page:concepts-messages)) plus zwei Felder:

| Feld | Bedeutung |
| --- | --- |
| `component` | Die Seite ist eine Komponente: eine Klasseninstanz mit eigenen handlern und eigener `view`. |
| `view` | Die Seite ist nur ein Template ohne eigene Logik. Nutze `view` oder `component`, nicht beides. |
| `select` | Wie `component`, aber aus dem State gewählt: `select: (state) => ...`. Für Seiten, die Werte im State sind. |
| `key` | Der Name des State-Felds, das der Seite gehört. Die Seite sieht `state[key]`, und ihre `store`-Pfade bekommen den key vorangestellt. |
| `props` | Zusätzliche schreibgeschützte Felder für die Seite, aus dem Parent-State berechnet: `props: (s) => ({ count: s.people.length })`. |
| `name` | Der Instanzname, also das Message-Präfix. Standardmäßig das letzte statische Segment des Musters. |

Der Standardname wird so ermittelt: `"/admin/tasks"` ist `tasks`, `"/users/:id"` ist `users` (das Segment `:id` wird übersprungen), `"/"` ist `index` und `"*"` ist `fallback`. Zwei Einträge dürfen nicht denselben Namen bekommen, weil eine Message sie nicht unterscheiden könnte. Das Framework lehnt das ab und nennt dir die Lösung:

```text
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
```

### View oder Komponente?

Eine **view** ist die richtige Wahl für eine Seite, die nur Daten zeigt: eine Über-uns-Seite, eine Nicht-gefunden-Seite, eine Detailseite, die `route.params` liest. Sie kostet nichts, hat keine handler, und die Daten, die sie braucht, kommen aus `props`.

Eine **Komponente** ist die richtige Wahl, wenn die Seite reagiert: Sie verarbeitet Messages, lädt Daten beim Betreten, besitzt einen Teil des States. Sie ist eine gewöhnliche Komponente; das Routing fügt nur das Feld `route` in ihrem State und die Messages `enter` und `leave` hinzu.

Eine Seite nur mit view kann trotzdem Events in ihrem Template haben. Ein Event `@click=pick(1)` in der Seite `about` wird als Message `about.pick` gesendet, und die Komponente mit der `routing`-Tabelle kann es mit einer Methode namens `"about.pick"` behandeln. Das eine Event, das du selten selbst behandeln musst, ist `navigate`, unten beschrieben.

## Die Route im State

Eine geroutete Seite hat in ihrem State ein Feld `route`. Du kannst es in handlern und im Template lesen:

```ts
{ path: "/edit", base: "/users/42", params: { id: "42" }, search: "", hash: "" }
```

`search` und `hash` sind rohe Strings, `"?page=2"` und `"#top"`. Das Framework parst den Query-String nicht. `params` enthält die `:name`-Erfassungen dieser Ebene **und jeder Ebene darüber**, sodass auch eine tief verschachtelte Seite noch die `id` ihrer Großeltern lesen kann.

::demo route-state

Die Demo ist eine Seite, die einen Nutzer zeigt. Wenn die Adresse von `/admin/users/2` zu `/admin/users/7` wechselt, wird das Template an Ort und Stelle gepatcht: Der Router hat nichts neu aufgebaut, die Seite hat nur eine neue `route` bekommen. Eine Seite, die die Daten des neuen Nutzers laden muss, bekommt außerdem eine neue Message `enter`, wie du gleich sehen wirst.

## Den Router anschließen

Die Außenwelt ist wie immer ein Plugin. Das **Router-Plugin** liest die Browser-Adresse und ändert sie. Es hat vier Effekte: `listen`, `navigate`, `back` und `forward` (alle sind in der [Plugin-Referenz](page:plugins-reference) beschrieben). Zwei davon sind hier wichtig.

- `router.listen("routeChanged")` startet das Melden. Das Plugin sendet die Message `routeChanged` sofort mit dem aktuellen Ort und noch einmal nach jedem `navigate` und jedem Druck auf Zurück oder Vor. Der payload ist `{ path, search, hash }`.
- `router.navigate("/about")` legt einen neuen History-Eintrag an. Das Plugin teilt dem Listener dann den neuen Ort mit, sodass dieselbe `routeChanged` ankommt.

Du musst die Verdrahtung nicht schreiben. Eine Komponente mit einer `routing`-Tabelle hat zwei Standard-handler:

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _state, { setRoute }) => setRoute(msg.payload),
```

`mounted` ist die Message, die `createApp({ mount })` sendet, sobald die Anwendung im DOM ist. `setRoute` ist eine Funktion im Komponentenkontext. Sie ist rein. Sie gibt einen Effekt `store.set("route", ...)` zurück sowie die Effekte `leave` und `enter` der Seiten, die gewechselt haben. Schreibst du selbst eine Methode namens `mounted` oder `routeChanged`, ersetzt sie den Standard. Das ui-kit tut das, um beim Routenwechsel auch das Theme und den Menüabschnitt zu setzen. Eine vereinfachte Version seiner Shell:

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

Der handler muss `setRoute` aufrufen und dessen Effekte zurückgeben. Vergisst er das, wird die `route` nie gespeichert, und der outlet bleibt leer.

Die Plugins, die du für eine geroutete Anwendung brauchst, sind der Store (er hält `route`), das dom-Plugin und das Router-Plugin:

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

> [!TIP] Der Anfangs-State hat route: null
> Setze `route: null` in den Anfangs-State. Solange das Router-Plugin nichts gemeldet hat, lesen Templates `route.path` von `null`, und ein Pfad in einem Ausdruck ist null-sicher, es geht also nichts kaputt. Der zweite Schritt der nächsten Demo zeigt genau diesen Fall.

## Links, die echte Links sind

Navigation braucht Links. Ein Link sollte ein echtes `<a href>` sein, damit der Mittelklick, „In neuem Tab öffnen" und die Statusleiste funktionieren. Ein normaler Klick sollte aber kein neues Dokument laden. Der pavlus-Weg ist, beides zu schreiben:

```pavlus
a(href="/about" @click.prevent=navigate("/about")) About
```

`href` ist für den Browser. `@click.prevent` stoppt die Standardaktion, und das Event wird zur Message `navigate` mit dem payload `"/about"`. Dafür schreibst du keinen handler. Eine Message `navigate` (oder `something.navigate`, aus einem eingebetteten Template oder einer Seite nur mit view), die niemand behandelt und die einen String als payload hat, wird standardmäßig zu `router.navigate(url)`. Die url ist relativ zu der Komponente, die die Message erhält, bei der Shell also die ganze Site.

::demo links

Der zweite Schritt der Demo zeigt den aktiven Link. Die Klasse `active` ist eine Bedingung auf `route.path`. Wenn die Route von `null` zu `/` wechselt, wird nur der erste Link gepatcht.

> [!NOTE] Einfache hrefs werden nicht umgeschrieben
> Das Framework schreibt die url des Effekts `router.navigate` um. Das Attribut `href` rührt es nicht an, weil es nur Text in deinem Template ist. Liegt eine Seite unter einer Basis, schreibe die Basis selbst: `href={route.base + "/users"}`. Der nächste Abschnitt zeigt das ganze Bild.

## enter und leave

Eine Seite muss oft etwas tun, wenn sie erscheint: Daten laden, einen Timer starten. Und wenn sie verschwindet: den Timer stoppen. Der Router sagt es der Seite mit zwei Messages.

- `enter` wird gesendet, wenn eine Seite aktiv wird. Der payload ist ihre `route`.
- `leave` wird gesendet, wenn sie nicht mehr aktiv ist.

Die Messages berechnet `setRoute` aus der vorherigen und der neuen Route, Ebene für Ebene. Ab der ersten Ebene, deren aktive Seite sich unterscheidet, verlassen die alten Seiten die Bühne (die tiefste zuerst), und die neuen treten ein (von oben nach unten). Eine Blattseite bekommt auch dann erneut `enter`, wenn sich nur ihre eigene Route geändert hat, zum Beispiel `/items/5` zu `/items/7`, weil sich `params` unterscheiden. Eine Änderung von `search` oder `hash` allein löst kein erneutes `enter` aus.

Deshalb braucht es nirgends eine Liste von „Seiten und ihren Daten". Die Seite, die Daten braucht, fragt selbst danach:

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

Die `id: "post"` der Anfrage ist wichtig. Geht der Nutzer von Beitrag 1 zu Beitrag 2, während Beitrag 1 noch lädt, ersetzt die zweite Anfrage die erste, und die Antwort auf die erste wird ignoriert. Siehe den [http-Abschnitt](page:plugins-reference) der Plugin-Referenz.

## Verschachtelte Routen

Routing lässt sich verschachteln. Eine geroutete Seite, die eine eigene `routing`-Tabelle hat, erhält nur den Teil des Pfads **unterhalb ihrer Basis** und navigiert relativ dazu, ohne zu wissen, wer sie einbettet. Der Admin-Bereich einer Site ist der typische Fall: Die Shell hat `/admin`, die Admin-Seite hat die Tabs `/users` und `/users/:id`, und die vollständigen Adressen sind `/admin/users` und `/admin/users/2`.

Die Tab-Leiste der Admin-Seite weiß nicht, dass sie unter `/admin` lebt. Sie liest `route.base`, das das Framework auf `/admin` setzt:

::demo tabs

Der `href` ist `route.base + "/users"`, der Link also `/admin/users`; die Message ist `navigate("/users")`, und das Framework fügt dem Effekt die Basis hinzu. Die Regel für ein relatives navigate lautet: *Die innerste geroutete Seite fügt ihre ganze Basis einmal hinzu und markiert den Effekt als `absolute`, damit die Ebenen darüber ihre nicht noch einmal hinzufügen.* Um nach außen zu gehen, nutze `router.navigate(url, { absolute: true })`.

## Ein vollständiges Beispiel

Hier ist eine kleine Site mit Startseite, einem Admin-Bereich mit zwei Tabs, einer Nutzerliste, einer Nutzerseite und einer Nicht-gefunden-Seite. Sie nutzt jede Idee dieser Seite. Die Dateien stehen in der Reihenfolge, in der du sie schreiben würdest.

Das Shell-Template hat die obere Navigation und den ersten outlet:

```pavlus app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
    a(href="/admin" class:active={route.base === "/admin"} @click.prevent=navigate("/admin")) Admin
  main.app__main
    +outlet
```

Die Shell-Komponente hat drei Einträge: eine Startseite nur mit view, die Admin-Komponente unter dem key `admin` und den Fallback `"*"`.

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

Die zwei einfachen Seiten:

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

Die Admin-Komponente hat ihre eigene Tabelle. Sieh dir die drei Arten von Einträgen an: eine view mit `props`, eine Komponente mit `key` und `props` und eine view mit explizitem `name`, weil `/users` und `/users/:id` sonst beide `users` hießen.

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

Die Seiten unter den Tabs. Die Übersicht und die Nutzerseite sind views. Die Nutzerseite ist eine Komponente: Sie zählt, wie oft sie betreten wurde.

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

Drei Details lohnen einen zweiten Blick.

Erstens lebt der State der Users-Seite unter `admin.usersPage`. Die Seite schreibt `store.set("visits", ...)`, und der Effekt verlässt die Seite als `usersPage.visits` und die Shell als `admin.usersPage.visits`: Jede Ebene stellt ihren `key` voran. Die Seite weiß nichts darüber, wo sie gemountet ist.

Zweitens geht `navigate("/" + person.id)` in der Users-Seite nach `/admin/users/1`, weil die Users-Seite unter `/admin/users` geroutet ist und eine relative url an ihre Basis angehängt wird.

Drittens benutzen die `href`s `route.base`: In der Users-Seite ist es `/admin/users`, der Link also `/admin/users/1`, und der Browser öffnet bei einem Mittelklick die richtige Adresse.

Ein Test steuert die ganze Site mit den echten Plugins in jsdom. Er klickt die Links und sieht sich Adresse und Seite an:

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

Die Messages, die bei jeder Navigation gesendet werden, sind einfache Daten, du kannst eine Routenänderung also auch ohne DOM testen. Ruft man die Shell als Funktion mit einer Message `routeChanged` auf, erhält man die Effekte. Der Wechsel von `/admin` zu `/admin/users` gibt das Update von `route` und einen Effekt der Users-Seite zurück, weil sie betreten wurde:

```json
[{ "plugin": "store", "type": "set", "path": "admin.usersPage.visits", "value": 1 }]
```

## Unter einem Basispfad ausliefern

Eine Site auf GitHub Pages liegt nicht an der Wurzel der Domain. Das ui-kit, dessen Quelltext diese Dokumentation ist, liegt unter `/pavlus/`. Dort ist die Seite für den Button `/pavlus/button`, aber die Anwendung will sie `/button` nennen. Sieht der Router den echten Pfad, passt `/pavlus/button` nur auf `"*"`, und der Nutzer sieht die Nicht-gefunden-Seite.

Das Router-Plugin hat keine Option für einen Basispfad. Es hat eine Option `window`, und das ist die Nahtstelle. Das ui-kit gibt ihr ein kleines Objekt, das aussieht wie das Browserfenster, bei dem aber beim Lesen des Orts der Basispfad abgezogen und beim Schreiben der History wieder angefügt wird:

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

Die Anwendung sieht die Basis nie. Nur `main.ts` kennt sie:

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

Drei Teile lassen es funktionieren:

1. Die Option `base` von Vite. Das ui-kit baut mit `UI_KIT_BASE=/pavlus/`, lokal ist die Basis `/`. `import.meta.env.BASE_URL` ist dieser Wert, und `rootOf` macht aus `/pavlus/` `/pavlus`.
2. `windowAt(root)` für den Router, wie oben. Die Routing-Tabelle bleibt `"/button"`, `"/tabs"`.
3. Echte hrefs. Sie sind Text, brauchen also die Basis. Das ui-kit hält `root` in seinem State, und die Templates schreiben `href={root + "/templates"}`.

::demo base-href

Die Demo zeigt, wie der `href` dem `root` im State folgt. Der Klick-handler ändert sich nicht: `navigate("/about")` ist relativ zur Anwendung, und das umhüllte window fügt die Basis hinzu.

### Der 404 bei einem direkten Aufruf

Es gibt noch ein Problem, und es liegt nicht in der Anwendung. GitHub Pages ist ein statischer Dateiserver. Eine Anfrage nach `/pavlus/button` findet keine Datei `button` und antwortet mit einem 404, bevor irgendein JavaScript läuft. Das Klicken eines Links funktioniert, weil der Browser den Server nie fragt. Die Seite neu zu laden oder einen Link zu öffnen, den dir jemand geschickt hat, schlägt fehl.

GitHub Pages liefert für jeden unbekannten Pfad die Datei `404.html` aus. Der Trick ist also, die Anwendungs-Shell auch unter diesem Namen zu veröffentlichen. Das ui-kit macht das in einem kleinen Vite-Plugin:

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

Der Browser erhält die Shell mit dem Status 404, lädt die Skripte, der Router liest die echte Adresse und zeigt die richtige Seite. Auf einem Server, den du kontrollierst, beantworte stattdessen jeden unbekannten Pfad mit `index.html` und dem Status 200.

## Was nicht gemacht wird

Kenne die Grenzen, damit du nicht danach suchst:

- Keine Guards und keine Redirects als Routen-Einträge. Ein Redirect ist ein handler: Gib bei `enter` `router.navigate("/login", { replace: true })` zurück.
- Kein Parsen des Query-Strings. `route.search` ist der rohe String.
- `route.params` ist als `Record<string, string>` typisiert: Jeder Parameter ist ein String.
- Kein Lazy Loading von Seiten. Alle Seiten werden oben in der Datei importiert.

## Was du gelernt hast

- Eine `routing`-Tabelle ordnet Mustern Seiten zu, und `+outlet` zeigt die passende. Das längste Muster gewinnt, und `"*"` fängt den Rest.
- Eine Seite ist eine `view` (ein Template) oder eine `component` (Logik). Sie sieht `route`, bekommt `enter` und `leave`, und `key` und `props` formen ihren State.
- Links sind echte `href`s mit `@click.prevent=navigate(...)`. Routing verschachtelt sich, und ein navigate aus einer verschachtelten Seite ist relativ zu ihrer Basis.
- Gib dem Router-Plugin unter einem Basispfad ein `window`, das die Basis verbirgt, und baue die hrefs damit.

Weiter: [Server-Side-Rendering](page:concepts-ssr).
