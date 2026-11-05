---
summary: Alle eingebauten Plugins an einem Ort - dom, store, http, router, time, logger und ws - mit allen ihren Effekten, Feldern und den Messages, die sie zurücksenden, dazu die vier Plugins des ui-kit als Beispiele für anwendungsspezifische Plugins.
---
## Sieben Plugins, eine Tabelle am Ende

Sieben Plugins gehören zum Framework. Du registrierst die, die du brauchst, in `createApp({ plugins })`, und die anderen kosten nichts. Diese Seite beschreibt jedes: wofür es da ist, jeden Effekt, den es behandelt, mit seinen Feldern, eine kurze Verwendung in einem handler und die Message, die zurückkommt. Der letzte Abschnitt ist eine Tabelle aller Effekte zum schnellen Nachschlagen.

Jedes Beispiel nutzt den kurzen Alias des Effectors, wie in [Wie Plugins funktionieren](page:plugins-overview):

```ts
import {
  DomPlugin,
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
  wsEffector as ws,
} from "@service-laboratory/pavlus/plugins";
```

Jedes Plugin wird von einer Funktion namens `createXPlugin(options)` erzeugt — das Dom-Plugin ist die Ausnahme, eine Klasse: `new DomPlugin(options)` — und jede Option gibt es, damit ein Test die Außenwelt ersetzen kann. Die Optionen stehen am Ende der Seite ebenfalls in einer Liste.

## store

**Wofür:** den State der Anwendung halten und einen Verlauf jeder Änderung daran. Es ist das einzige Plugin, das der Kern nach dem State fragt: Der handler erhält den Wert des Stores, und wenn er sich ändert, werden die anderen Plugins benachrichtigt.

```ts
const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
plugin.getState();
plugin.history;
```

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `set` | `path`, `value` | Setzt den Wert bei `path` und legt fehlende Eltern an. Ein Wurzelpfad (ein leerer String) ersetzt den ganzen State. |
| `merge` | `path`, `value` | Führt ein Objekt flach in das Objekt bei `path` ein. |
| `remove` | `path` | Entfernt einen Wert. Bei einem Array-Element wird das Array kürzer. |
| `undo` | `steps?` | Macht die letzten `steps` (Standard 1) aufgezeichneten Änderungen rückgängig. |
| `restoreTo` | `timestamp` | Macht jede Änderung rückgängig, die nach `timestamp` aufgezeichnet wurde. |

Ein **Pfad** ist ein String mit Punkten (`"user.name"`, `"todos.0.done"`) oder ein Array (`["todos", 0, "done"]`). Numerische Segmente indizieren Arrays.

```ts
rename(msg: Message): Effect[] {
  return [
    store.set("user.name", String(msg.payload)),
    store.merge("user", { edited: true }),
    store.remove("todos.1"),
  ];
}
```

**Kommt zurück:** nichts. Das Ergebnis eines `store`-Effekts ist der neue State, den die nächste Message und die Templates sehen.

Der State ist **unveränderlich**. Jede Änderung baut neue Objekte entlang des Pfads und lässt den Rest identisch, sodass `diff` unberührte Zweige mit einem einzigen `===` überspringen kann. Einen Wert auf das zu setzen, was er schon ist, ändert nichts und zeichnet nichts auf. Verändere den State nie an Ort und Stelle: Weder der Store noch `diff` können das sehen.

Jede Änderung wird mit einem `restoreEffect` aufgezeichnet, dem Effekt, der den State davor wiederherstellt. `undo` und `restoreTo` wenden diese an, ohne etwas aufzuzeichnen. Der Verlauf behält die letzten 1000 Änderungen (`maxHistory`).

## dom

**Wofür:** der einzige Code, der das DOM berührt. Es rendert kompilierte views, wendet die Patches an, die `diff` zurückgibt, und besitzt jeden Event-Listener. Events kommen als Messages zurück.

Die Wurzel deiner Anwendung wird von `createApp({ mount })` gemountet. Die Effekte unten sind für alles andere: eine zweite view an anderer Stelle, ein Modal, ein Panel.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `mount` | `target`, `view`, `onMounted?` | Rendert `view` mit dem aktuellen State in `target` (ein CSS-Selektor oder ein Element). |
| `unmount` | `target` | Entfernt, was in `target` gemountet wurde, samt seiner Listener. |
| `focus` | `selector` | Fokussiert das erste passende Element. |
| `blur` | `selector` | Nimmt dem ersten passenden Element den Fokus. |

```ts
open(): Effect[] {
  return [DomPlugin.mount("#panel", panelView, { onMounted: "panelMounted" })];
}

panelMounted(): Effect[] {
  return [DomPlugin.focus("input.filter")];
}
```

`view` ist ein kompiliertes Template (`import panelView from "./panel.pavlus"`) oder `viewOf(component)` für eine Komponente, deren Template ein `+outlet` oder Kinder hat.

**Kommt zurück:**

| Wann | Message |
| --- | --- |
| Die view ist im DOM und `onMounted` wurde angegeben | `{ id: onMounted }` |
| Der Nutzer löst ein im Template gebundenes Event aus, etwa `@click=save(item)` | `{ id, payload, event }` |

Bei Events ist `id` die Message-id aus dem Template (mit dem Präfix eingebetteter Kinder), `payload` das Argument des handlers und `event` ein einfacher Schnappschuss: `{ type, value?, checked?, key? }`. `value` und `checked` kommen vom Ziel des Events, `key` von Tastatur-Events. `@submit.prevent` und `.stop` rufen `preventDefault()` und `stopPropagation()` auf, bevor die Message gesendet wird.

`onMounted` gehört nicht zu den sieben Antwortfeldern, denen ein Child ein Präfix voranstellt, die Message kommt also mit dem Namen an, den du geschrieben hast.

Zwei weitere Dinge, die das Plugin tut. Immer wenn sich der State ändert, führt es `view.diff(previous, state)` für jede gemountete view aus und wendet die Patches an; du sendest nie einen Update-Effekt. Und wenn das Ziel einen Server-Render enthält, hydriert `mount` das Markup, statt es aufzubauen (siehe [Server-Side-Rendering](page:concepts-ssr)).

Ein Knoten bekommt **einen** Listener pro Event-Typ für sein ganzes Leben. Ändert sich die Message eines handlers, tauscht das Plugin nur die gespeicherte Message aus. Formularfelder werden als Properties (`value`, `checked`, `selected`) ebenso wie als Attribute geschrieben, denn nachdem der Nutzer getippt hat, ändert nur die Property, was angezeigt wird.

## http

**Wofür:** Anfragen. Jede Anfrage hat eine **id**, und über die id wird sie auch abgebrochen: Eine Anfrage mit der id einer laufenden zu starten bricht die alte ab. „Die neueste Anfrage gewinnt" braucht keinen State in der Anwendung.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | Sendet eine Anfrage. |
| `cancel` | `id` | Bricht die laufende Anfrage `id` ab. |

`method` ist `GET`, wenn du nichts anderes sagst. Ein `body` als String wird unverändert gesendet; alles andere wird als JSON gesendet, und `content-type: application/json` wird hinzugefügt, wenn du keinen setzt. `responseType` ist `"json"` (Standard) oder `"text"`. Ein Body, der kein gültiges JSON ist, ergibt `data: null`.

```ts
search(msg: Message): Effect[] {
  return [
    http.request({
      id: "search",
      url: `/api/users?q=${msg.payload}`,
      onSuccess: "found",
      onError: "searchFailed",
    }),
  ];
}

save(msg: Message): Effect[] {
  return [
    http.request({
      id: "save",
      method: "POST",
      url: "/api/users",
      body: { name: msg.payload },
      onSuccess: "saved",
      onError: "saveFailed",
    }),
  ];
}
```

**Kommt zurück:**

| Wann | Message |
| --- | --- |
| Eine 2xx-Antwort | `{ id: onSuccess, payload: { status, data } }` |
| Jeder andere Status | `{ id: onError, payload: { status, error: statusText, data } }` |
| Ein Netzwerkfehler | `{ id: onError, payload: { error: message } }` |
| Abgebrochen oder ersetzt | nichts |

Das sind die echten payloads für ein falsches `fetch`, das mit 200, 404 und einem Netzwerkfehler antwortet:

```json
[
  { "id": "ok", "payload": { "status": 200, "data": [1] } },
  { "id": "err", "payload": { "status": 404, "error": "Not Found", "data": { "m": 1 } } },
  { "id": "err", "payload": { "error": "offline" } }
]
```

> [!WARNING] Eine abgebrochene Anfrage ist still
> Eine abgebrochene Anfrage erzeugt nie eine Message, nicht einmal einen Fehler, und die Antwort einer ersetzten Anfrage, die doch noch eintrifft, wird ignoriert. Zeigst du einen Ladeindikator, warte nach einem `cancel` nicht auf `onError`, um ihn auszublenden: Blende ihn selbst aus, in dem handler, der abbricht.

Das Plugin hat `pending()`, die ids der laufenden Anfragen, und `settled()`, ein Promise, das aufgelöst wird, wenn nichts mehr unterwegs ist (für das Server-Rendering genutzt).

## router

**Wofür:** die URL und die History. Die Anwendung erfährt den Ort als Messages und ändert ihn mit Effekten; sie liest nie `window.location`.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `listen` | `onChange` | Startet das Melden. Antwortet sofort mit dem aktuellen Ort. |
| `navigate` | `url`, `replace?`, `absolute?` | Geht zu `url`. Von einem gerouteten Child aus ist eine url relativ zur Basis des Childs, außer `absolute` ist gesetzt. |
| `back` | keine | `history.back()` |
| `forward` | keine | `history.forward()` |

```ts
init(): Effect[] {
  return [router.listen("route.changed")];
}

login(): Effect[] {
  return [router.navigate("/login", { replace: true })];
}
```

**Kommt zurück:** `{ id: onChange, payload: { path, search, hash } }`. Bei `https://example.com/users?page=2#top` ist der payload:

```json
{ "path": "/users", "search": "?page=2", "hash": "#top" }
```

Sie wird gesendet, wenn `listen` behandelt wird, nach jedem `navigate` (das Plugin dispatcht selbst ein `popstate`, weil `pushState` kein Event auslöst) und wenn der Nutzer zurück oder vor geht. Ein erneutes `listen` ersetzt den Listener. `navigate` meldet nur, wenn ein `listen` aktiv ist.

Das Plugin parst die URL nicht über diese drei Teile hinaus. Routen abzugleichen ist die Aufgabe einer `routing`-Tabelle, siehe [Routing](page:concepts-routing). Unter einem Basispfad übergib `createRouterPlugin({ window })` ein window, das die Basis verbirgt.

## time

**Wofür:** die Uhr, Timeouts und Intervalle. Anwendungscode kann `Date.now()` oder `setTimeout` nicht aufrufen, weil er dadurch unrein würde. Er fragt dieses Plugin, und die Antwort kommt als Message zurück. Jeder Timer hat eine **id** und kann darüber neu gestartet oder abgebrochen werden.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `now` | `replyTo` | Antwortet mit der aktuellen Zeit. |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | Sendet `replyTo` einmal, nach `ms`. |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | Sendet `replyTo` alle `ms`. |
| `cancel` | `id` | Stoppt den Timer `id`. |
| `cancelAll` | keine | Stoppt jeden Timer. |

```ts
typing(msg: Message): Effect[] {
  return [
    store.set("query", msg.event?.value ?? ""),
    time.setTimeout("search", 300, "searchFire", msg.event?.value),
  ];
}

searchFire(msg: Message): Effect[] {
  return [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })];
}
```

Einen Timer mit einer id zu starten, die bereits läuft, **bricht den laufenden ab**. Das Beispiel ist ein Debounce ohne State: Solange der Besucher weitertippt, ersetzt jede Taste den Timer, und `searchFire` kommt 300 ms nach der letzten Taste an.

**Kommt zurück:**

| Effekt | Message |
| --- | --- |
| `now` | `{ id: replyTo, payload: <ms since the epoch> }` |
| `setTimeout` | `{ id: replyTo, payload }` einmal; der Timer wird danach vergessen |
| `setInterval` | `{ id: replyTo, payload }` bei jedem Tick |

Um ein Dokument mit der Zeit zu versehen, frag danach und beende die Arbeit, wenn die Antwort kommt: `save` gibt `time.now("save.stamped")` zurück, und `"save.stamped"` speichert `msg.payload`. Dasselbe Log von Messages ergibt dann immer dieselben Effekte.

## logger

**Wofür:** die Konsole. Anwendungscode ist rein, also ist sogar das Loggen ein Effekt.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `log` | `message`, `level?`, `data?` | Schreibt einen Eintrag. `level` ist `debug`, `info`, `warn` oder `error`, Standard `info`. |

```ts
removed(msg: Message): Effect[] {
  return [log.info("user removed", { id: msg.payload }), log.warn("slow response", 2400)];
}
```

Der Effector hat `log.debug`, `log.info`, `log.warn`, `log.error` und `log.log(level, message, data)`. Einträge gehen an die passende Methode von `console`, mit `data` als zweitem Argument, wenn vorhanden.

**Kommt zurück:** nichts.

`withLogging(component, label)` aus dem Hauptpaket umhüllt eine Komponente und fügt für jede Message, die sie behandelt, einen `debug`-Eintrag hinzu, mit dem payload und den Plugins und Typen der Effekte, die sie zurückgegeben hat. Es fügt einen Effekt hinzu, das Logger-Plugin muss also registriert sein.

```ts
createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
```

## ws

**Wofür:** WebSocket-Verbindungen, über **id**. Das Plugin hält die Sockets; die Anwendung sieht Messages.

| Effekt | Felder | Bedeutung |
| --- | --- | --- |
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | Öffnet die Verbindung `id`. |
| `send` | `id`, `data` | Sendet auf der Verbindung `id`. Ein Objekt wird als JSON gesendet, ein String unverändert. |
| `close` | `id`, `code?`, `reason?` | Schließt die Verbindung `id`. |

```ts
join(): Effect[] {
  return [
    ws.connect({ id: "chat", url: "wss://example.com/chat", onOpen: "opened", onMessage: "received", onClose: "closed", onError: "failed" }),
  ];
}

opened(): Effect[] {
  return [ws.send("chat", { text: "hi" })];
}
```

**Kommt zurück:**

| Wann | Message |
| --- | --- |
| Die Verbindung öffnet sich | `{ id: onOpen }` |
| Ein Frame kommt an | `{ id: onMessage, payload }`. Ein Text-Frame, der gültiges JSON ist, wird geparst. |
| Die Verbindung schließt sich | `{ id: onClose, payload: { code, reason } }`; die id wird vergessen |
| Ein Fehler | `{ id: onError }` |

Verbindest du dich mit der id einer offenen Verbindung, wird die alte zuerst geschlossen, ohne Message `onClose`. `send` an eine id ohne Verbindung **wirft** (`pavlus/ws: no connection "chat"`). Sende erst nach `onOpen`, und halte ein Flag `connected` im State, wenn du es wissen musst.

## Die Effekte im Überblick

Alle 24 Effekte der sieben Plugins:

| Plugin | Effekt | Felder | Message zurück |
| --- | --- | --- | --- |
| store | `set` | `path`, `value` | keine |
| store | `merge` | `path`, `value` | keine |
| store | `remove` | `path` | keine |
| store | `undo` | `steps?` | keine |
| store | `restoreTo` | `timestamp` | keine |
| dom | `mount` | `target`, `view`, `onMounted?` | `onMounted` |
| dom | `unmount` | `target` | keine |
| dom | `focus` | `selector` | keine |
| dom | `blur` | `selector` | keine |
| http | `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | `onSuccess` oder `onError` |
| http | `cancel` | `id` | keine |
| router | `listen` | `onChange` | `onChange` |
| router | `navigate` | `url`, `replace?`, `absolute?` | `onChange` des Listeners |
| router | `back` | keine | `onChange` des Listeners |
| router | `forward` | keine | `onChange` des Listeners |
| time | `now` | `replyTo` | `replyTo` |
| time | `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` einmal |
| time | `setInterval` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` wiederholt |
| time | `cancel` | `id` | keine |
| time | `cancelAll` | keine | keine |
| logger | `log` | `message`, `level?`, `data?` | keine |
| ws | `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | die vier Callbacks |
| ws | `send` | `id`, `data` | keine |
| ws | `close` | `id`, `code?`, `reason?` | `onClose` |

Und die Option jedes Plugins, die ein Test ersetzt:

| Plugin | Option | Was zu übergeben ist |
| --- | --- | --- |
| store | `now`, `maxHistory` | Ein Zähler für Zeitstempel. |
| dom | `document` | Ein jsdom-Dokument. |
| http | `fetch` | Ein falsches `fetch`; es braucht nur `ok`, `status`, `statusText` und `json()` oder `text()`. |
| router | `window` | Ein jsdom-window oder ein Wrapper, der einen Basispfad verbirgt. |
| time | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | Eine falsche Uhr, oder nutze `vi.useFakeTimers()`. |
| logger | `sink` | Ein Objekt mit `debug`, `info`, `warn` und `error`, das Aufrufe sammelt. |
| ws | `create` | Eine Funktion, die einen falschen Socket zurückgibt. |

## Die eigenen Plugins des ui-kit

Das Framework hat kein Plugin für `localStorage`, für Zufallszahlen oder für das Element `<html>`, weil eine Anwendung sie nur manchmal braucht. Das ui-kit, die Site, die du gerade liest, hat vier eigene Plugins. Sie zeigen, wie ein anwendungsspezifisches Plugin aussieht. Alle vier sind in seiner `main.ts` registriert:

```ts main.ts
export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    new DomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});
```

| Plugin | Effekt | Felder | Kommt zurück |
| --- | --- | --- | --- |
| theme | `apply` | `look`, `vars`, `persist` | keine |
| random | `int` | `max`, `replyTo` | `{ id: replyTo, payload: n }`, eine ganze Zahl von 0 bis ausschließlich `max` |
| source | `load` | `path`, `onSuccess`, `onError` | `{ id: onSuccess, payload: { path, text } }` oder `{ id: onError, payload: path }` |
| docs | `load` | `slug`, `lang`, `onSuccess`, `onError` | `onSuccess` mit der fertigen Seite oder `onError` mit dem slug |
| docs | `run` | `template`, `state`, `onSuccess` | `onSuccess` mit der kompilierten und ausgeführten Demo |
| docs | `remember` | `lang` | keine |

- **theme** ist der einzige Code, der `<html>` für das Aussehen der Site berührt: die Klasse `dark` oder `light`, die CSS-Variablen, das Attribut `data-style` und die in `localStorage` gespeicherte Wahl. Die Anwendung berechnet die Variablen mit einer reinen Funktion und gibt `themeEffector.apply(look)` zurück.
- **random** gibt es, weil ein handler `Math.random()` nicht aufrufen kann. Die nächste Seite, [Eigene Plugins schreiben](page:plugins-custom), liest es Zeile für Zeile.
- **source** lädt den Quelltext einer Seite für den Tab Source. Die Dateien werden von `import.meta.glob` mit `query: "?raw"` als Lazy-Raw-Chunks gebündelt, und das Plugin lädt eine, wenn der Tab geöffnet wird. Die Anwendung fragt und erhält den Text als Message zurück, dann zerlegt sie ihn mit einer reinen Funktion in hervorgehobene Zeilen.
- **docs** lässt diese Dokumentation funktionieren. `load` holt das Markdown einer Seite und die Demos dieser Seite, lädt bei Bedarf den Compiler, kompiliert die Demos und antwortet mit der fertigen Seite; `run` macht dasselbe für das Playground; `remember` speichert die Sprache.

Jedes folgt derselben Form wie ein eingebautes Plugin: ein Typ für den Effekt, ein Effector, eine Funktion `createXPlugin` mit der Außenwelt als Parameter und eine Antwort per `ctx.dispatch`.

## Was du gelernt hast

- Sieben Plugins decken das DOM, den State, das Netzwerk, die URL, die Zeit, die Konsole und Sockets ab. Jeder Effekt hat feste Felder, und die meisten Antworten werden vom Effekt selbst benannt.
- Dinge mit einer `id` (http-Anfragen, Timer, Verbindungen) werden ersetzt, wenn die id wieder benutzt wird, und können abgebrochen werden. Das gibt dir Debounce und „der Neueste gewinnt" ohne State.
- Nur `store` ändert den State. Jedes andere Plugin antwortet mit Messages, und erwartete Fehlschläge sind ebenfalls Messages.
- Ein anwendungsspezifisches Plugin ist ein kleines Objekt mit derselben Form: ein Effekt-Typ, ein Effector und ein `handle`.

Weiter: [Eigene Plugins schreiben](page:plugins-custom).
