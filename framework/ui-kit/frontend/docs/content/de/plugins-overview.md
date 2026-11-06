---
summary: Der Code deiner Anwendung gibt nur Effekte zurück, einfache Daten, die beschreiben, was passieren soll. Plugins führen es aus. Du lernst den Plugin-Vertrag, wie Effekte und Antworten reisen, in welcher Reihenfolge Dinge geschehen, wie Fehler behandelt werden und wie du ein Plugin testest.
---
## Reiner Code, schmutzige Plugins

In einer pavlus-Anwendung berührt der Code, den du schreibst, nie die Außenwelt. Ein handler ruft nicht `fetch` auf, liest nicht die Uhr, schreibt nicht in `localStorage` und ändert nicht das DOM. Er nimmt eine Message und den State und **gibt eine Liste von Effekten zurück**. Ein Effekt ist ein einfaches Objekt, das beschreibt, was passieren soll.

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

Die Sache auszuführen ist die Aufgabe eines **Plugins**. Ein Plugin ist ein Objekt mit einem Namen und einer Funktion. Der Kern verbindet die beiden: Er sendet jeden Effekt an das Plugin, dessen Name `effect.plugin` ist.

```text
DOM event / HTTP reply / timer tick / WS frame
        |  plugins turn the outside world into messages
        v
  core:   app(message, state) -> effects[]        pure, deterministic
        |  effects are plain data: { plugin: "http", type: "request", ... }
        v
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

Das Bild ist ein Kreislauf. Die Welt erzeugt eine **Message** (ein Klick, eine Antwort, ein Tick). Der reine Code macht aus der Message **Effekte**. Die Plugins führen die Effekte aus, und wenn später etwas passiert, senden sie eine neue Message. Dein Code ist nur der mittlere Schritt, und der mittlere Schritt ist eine Funktion, die du in einem Test ohne jeden Browser aufrufen kannst.

Sogar ein Klick ist eine Message. Ein Template-Event ist keine Funktion, sondern Daten. Die Demo zeigt den vnode, den der Button bekommt:

::demo event-as-data open=vnodes

Das `events.click` des vnodes ist `{ id: "remove", payload: 3 }`. Das DOM-Plugin besitzt den echten Listener. Passiert der Klick, sendet es die Message `{ id: "remove", payload: 3, event: { type: "click" } }` an die Anwendung. Das Feld `event` ist eine kleine Kopie des DOM-Events aus einfachen Daten, mit `value`, `checked` und `key`, wo sie Sinn ergeben.

## Der Plugin-Vertrag

Das ist die ganze Schnittstelle eines Plugins. Es ist ein Typ aus `src/core/types.ts`, und das Hauptpaket exportiert ihn als `Plugin`:

```ts
export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
```

Nur zwei Mitglieder sind Pflicht: `name` und `handle`.

- `name` ist der String, auf den sich `effect.plugin` bezieht. Er muss in einer Anwendung eindeutig sein.
- `handle(effect, ctx)` wird für jeden Effekt aufgerufen, der an dieses Plugin adressiert ist. Der erste Parameter ist der Effekt; das Generic `E` ist der Typ der Effekte, die dieses Plugin annimmt, meist eine Union über `type`.
- `init(ctx)` läuft einmal, wenn die Anwendung erzeugt wird. Ein Plugin, das sich den Kontext merken muss (das DOM-Plugin behält ihn, um Events zu dispatchen), speichert ihn hier.
- `onState(state, ctx)` läuft, nachdem sich der State geändert hat. Das DOM-Plugin rendert darin neu.
- `dispose()` läuft, wenn die Anwendung beendet wird, und räumt auf: Listener, Timer, Sockets.

Der zweite Typ ist der Kontext, den jeder Hook erhält:

```ts
export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}
```

`dispatch` ist der einzige Weg, wie ein Plugin mit deinem Code spricht. `getState` gibt es, und das DOM-Plugin braucht es zum Rendern. `dispatchEffect` ist für Entwicklerwerkzeuge und Tests. Ein normales Plugin nutzt `dispatch` und sonst nichts.

Eine Message ist `{ id, payload?, event? }`. Die `id` ist der Name des handlers, der sie erhält.

## Effekte sind Daten

Ein Effekt hat zwei Pflichtfelder, `plugin` und `type`. Alles andere bestimmt das Plugin. `plugin` wählt das Plugin; `type` wählt, was darin zu tun ist. Das Store-Plugin hat `set`, `merge` und `remove`; das http-Plugin hat `request` und `cancel`.

Weil ein Effekt Daten ist, ergeben sich drei gute Dinge.

1. **Tests brauchen keine Mocks.** Um einen handler zu testen, rufst du ihn auf und vergleichst die Liste, die er zurückgibt, mit der Liste, die du erwartest.
2. **Effekte können aufgezeichnet, wiederholt und angezeigt werden.** Die Option `onStep` von `createApp` erhält jede Message mit ihren Effekten; der Logger und die Entwicklerwerkzeuge nutzen sie.
3. **Nichts passiert aus Versehen.** Einen Effekt zurückzugeben heißt nicht, ihn auszuführen. Ein handler, der in einem Test zehnmal aufgerufen wird, führt nichts aus.

### Effectors

Du kannst einen Effekt von Hand schreiben, aber jedes Plugin liefert einen **Effector** mit: ein kleines Objekt aus Funktionen, die genau dieses Objekt typisiert bauen. Ein falsches Feld ist dann ein Kompilierfehler, und ein handler liest sich wie ein Satz.

```ts
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@pavlus/frontend/plugins";

class Users extends Component<UsersState> {
  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
      log.info("loading users"),
    ];
  }
}
```

Ein Effector tut von sich aus nichts. `store.set("status", "loading")` gibt das Objekt vom Anfang dieser Seite zurück und sonst nichts. In einem Test vergleichst du das Ergebnis eines handlers mit denselben Effector-Aufrufen:

```ts
expect(toHandler(users)({ id: "load" }, state)).toEqual([
  store.set("status", "loading"),
  http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
  log.info("loading users"),
]);
```

Jedes eingebaute Plugin hat seinen Effector. Der übliche kurze Alias steht in der zweiten Spalte.

| Plugin | Effector (Alias) |
| --- | --- |
| store | `storeEffector` als `store` |
| dom | `domEffector` als `dom` |
| http | `httpEffector` als `http` |
| ws | `wsEffector` als `ws` |
| time | `timeEffector` als `time` |
| logger | `loggerEffector` als `log` |
| router | `routerEffector` als `router` |

Du kannst sie vom Einstiegspunkt eines Plugins importieren (`@pavlus/frontend/plugins/store`) oder aus dem Barrel `@pavlus/frontend/plugins`. Den Barrel zu importieren führt keinen Code aus, und der Bundler behält nur, was du benutzt.

## Plugins registrieren

Plugins werden aufgelistet, wenn die Anwendung erzeugt wird:

```ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";

createApp({
  app: dashboard,
  plugins: [createStorePlugin(initialState), new DomPlugin(), createHttpPlugin()],
  mount: "#app",
});
```

- `app` ist eine Funktion oder eine Instanz einer Klasse, die `Component` erweitert.
- Jedes Plugin hat einen `name`, und ein Effekt geht an das Plugin, dessen Name gleich `effect.plugin` ist.
- Zwei Plugins mit demselben Namen sind ein Fehler beim Start: `pavlus: duplicate plugin "store"`.
- Ein Effekt für ein Plugin, das nicht in der Liste steht, ist ein Fehler, wenn er ausgeführt wird: `pavlus: no plugin "nope" for effect "x"`. Das ist das Erste, was du prüfen solltest, wenn etwas wirft, nachdem du einen neuen Effekt hinzugefügt hast.
- Der State kommt vom ersten Plugin, das eine Methode `getState()` hat, also dem Store-Plugin. Ohne es erhalten handler `undefined` als State.
- `mount` braucht das dom-Plugin und eine `app` mit einer `view`.
- `init` ist eine Message, die dispatcht wird, sobald alle Plugins bereit sind, nach `mount`.

Du registrierst nicht ein Plugin pro Effekt-Typ, sondern eines pro *Familie* von Effekten: Alle `http`-Effekte gehen an ein Plugin-Objekt, das die Tabelle der laufenden Anfragen führt.

## Messages kommen zurück

Die meisten Plugins antworten später: eine Antwort, ein Timer, ein Frame. Der Effekt trägt die **id der Message, mit der geantwortet wird**, und das Plugin ruft `ctx.dispatch` auf, wenn es das Ergebnis hat.

```ts
http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })
// later, the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

Die Antwortfelder haben übliche Namen: `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` und `onChange`. Die Namen sind wichtig, wegen der Komponenten. Eine Child-Komponente wird unter einem Message-Präfix gemountet (`users`). Der Child schreibt `onSuccess: "loaded"`, und das Framework stellt genau diesen sieben Feldern das Präfix voran, sodass die Antwort ihren Weg zurück zum Child als `users.loaded` findet. So sieht der Effekt eines Childs aus, nachdem er den Child verlassen hat:

```json
[
  { "plugin": "time", "type": "setTimeout", "id": "t", "ms": 10, "replyTo": "kid.tick" },
  { "plugin": "q", "type": "q", "onDone": "done", "onSuccess": "kid.ok" }
]
```

Sieh dir den zweiten Effekt an. Ein Feld mit anderem Namen, hier `onDone`, wird nicht verändert, und seine Message ginge an die Wurzel, nicht an den Child. Ein Plugin, das innerhalb von Komponenten funktionieren soll, muss also die Standardnamen benutzen.

## Wem was gehört

- Das **Store**-Plugin besitzt den State der Anwendung. Hat sich der State nach einer Message geändert, ruft der Kern `onState(state)` bei jedem Plugin auf, das es definiert.
- Jedes Plugin besitzt seinen **privaten veränderlichen State**: das DOM-Plugin seine Listener, http seine laufenden Anfragen, time seine Timer, ws seine Sockets. Dein Code sieht ihn nie und muss ihn nie aufräumen.
- Alles mit einer **id** (eine http-Anfrage, ein Timer, eine Verbindung) wird ersetzt, wenn dieselbe id wieder benutzt wird, und kann über diese id abgebrochen werden. Ein Debounce oder „die neueste Anfrage gewinnt" braucht keinen State in der Anwendung: Starte dieselbe id noch einmal.

## Reihenfolge, Lebenszyklus und Schleifen

Messages werden **streng nacheinander** verarbeitet. Für eine Message ruft der Kern die Anwendung auf, führt die Effekte in der Reihenfolge aus, in der sie zurückgegeben wurden, und ruft dann, wenn sich der State geändert hat, `onState` bei jedem Plugin auf. Eine Message, die ein Plugin dispatcht, während es einen Effekt behandelt, wird nicht sofort verarbeitet. Sie wartet in einer Queue und läuft, nachdem die aktuelle Message fertig ist.

Ein Test macht es konkret. Das Plugin `echo` antwortet sofort, und trotzdem kommen die Antworten nach beiden Effekten:

```ts overview.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
} from "@pavlus/frontend";
import {
  createStorePlugin,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";

const echo: Plugin = {
  name: "echo",
  handle(effect, ctx) {
    ctx.dispatch({ id: "echoed", payload: effect.text });
  },
};

test("effects run in order, replies wait for the next turn", () => {
  const seen: string[] = [];
  const app = createApp({
    app: (message: Message): Effect[] => {
      seen.push(message.id);
      return message.id === "start"
        ? [
            { plugin: "echo", type: "say", text: "a" },
            { plugin: "echo", type: "say", text: "b" },
          ]
        : [];
    },
    plugins: [createStorePlugin({}), echo],
  });
  app.dispatch({ id: "start" });
  expect(seen).toEqual(["start", "echoed", "echoed"]);
});
```

Auch die Hooks haben eine feste Reihenfolge. Der Test unten zeichnet jeden Aufruf auf. `init` wird in der Reihenfolge des Arrays aufgerufen, vor allem anderen; der Store-Effekt wird vor dem Effekt für `x` angewendet; `onState` kommt nach allen Effekten der Message, einmal pro Plugin; und `dispose` läuft in **umgekehrter** Reihenfolge, sodass ein Plugin, das von einem früheren abhängt, zuerst gestoppt wird.

```ts
test("the hooks run in a fixed order", () => {
  const calls: string[] = [];
  const spy = (name: string): Plugin => ({
    name,
    init: () => void calls.push(`${name}.init`),
    handle: (effect) => void calls.push(`${name}.handle:${effect.type}`),
    onState: (state) =>
      void calls.push(`${name}.onState:${JSON.stringify(state)}`),
    dispose: () => void calls.push(`${name}.dispose`),
  });
  const app = createApp({
    app: () => [store.set("n", 1), { plugin: "x", type: "hello" }],
    plugins: [createStorePlugin({ n: 0 }), spy("x"), spy("y")],
  });
  app.dispatch({ id: "go" });
  app.dispose();
  expect(calls).toEqual([
    "x.init",
    "y.init",
    "x.handle:hello",
    'x.onState:{"n":1}',
    'y.onState:{"n":1}',
    "y.dispose",
    "x.dispose",
  ]);
});
```

Eine Schleife von Messages (ein handler, der auf eine Message antwortet, indem er dieselbe Message erneut auslöst) wird nach `maxMessagesPerTick` Messages in einem Durchlauf gestoppt, standardmäßig 10 000:

```text
pavlus: more than 50 messages in one tick (message loop?)
```

(Die Zahl in der Meldung ist das gesetzte Limit. Hier war es 50, gesetzt mit der Option `maxMessagesPerTick` von `createApp`.)

## Fehler

Es gibt zwei Arten von Fehlschlägen, und sie werden unterschiedlich behandelt.

**Erwartete Fehlschläge sind Messages.** Eine Anfrage, die scheitert, ein Socket, der schließt, eine Datei, die nicht gefunden wird: Das sind keine Exceptions. Das Plugin dispatcht eine Fehler-Message (`onError`), und dein Code entscheidet, was angezeigt wird. Eine Anfrage, die abgebrochen oder ersetzt wurde, sendet gar nichts.

**Bugs werfen.** Wirft `handle`, verlässt die Exception `app.dispatch`. Die übrigen Effekte dieser Message werden übersprungen, und die bereits angewendeten State-Änderungen bleiben. Die Anwendung selbst ist nicht kaputt: Das nächste `dispatch` funktioniert.

Zwei Fälle übersieht man leicht:

- Ein Fehler in einem Promise-Callback oder einem Timer-Callback eines Plugins erreicht den Kern nie, weil der Kern nicht mehr auf dem Stack ist. Ein Plugin muss seine eigenen asynchronen Fehler abfangen und in eine Fehler-Message verwandeln. Alle eingebauten Plugins tun das.
- Ein handler, der kein Array zurückgibt, ist ein Fehler der Komponente, mit dem Namen der Message: `pavlus: handler "add" must return an array of effects`.

## Ein Plugin testen

Jedes eingebaute Plugin nimmt die Außenwelt als Option. Das http-Plugin nimmt `fetch`, das time-Plugin eine Uhr, das ws-Plugin eine Socket-Fabrik, der Logger eine Senke, der Router ein `window`, das dom-Plugin ein `document`. Ein Test übergibt eine Attrappe, und eine Mocking-Bibliothek ist nicht nötig.

Du kannst ein Plugin ohne Anwendung testen. Erzeuge einen falschen Kontext, der die Messages aufzeichnet, rufe `handle` auf und prüfe, was dispatcht wurde:

```ts
test("a plugin is tested with a fake context", () => {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  echo.handle({ plugin: "echo", type: "say", text: "hi" }, ctx);
  expect(sent).toEqual([{ id: "echoed", payload: "hi" }]);
});
```

Eine dritte Ebene ist ein Test der ganzen Anwendung mit echten Plugins und falschen Außenwelten. Die [Anleitung](page:guide-todo-app) macht das für eine Todo-Liste.

> [!TIP] Teste lieber den handler
> Der Großteil deiner Logik steckt in handlern, und ein handler ist eine reine Funktion. Teste ihn, indem du `toHandler(component)(message, state)` aufrufst. Einen Plugin-Test brauchst du nur, wenn du ein Plugin schreibst, und dann testet er, was das Plugin mit einem Effekt macht.

## Was du gelernt hast

- Ein handler gibt Effekte zurück, einfache Objekte `{ plugin, type, ... }`. Effectors bauen sie typisiert. Ein Plugin ist `{ name, handle }` plus optional `init`, `onState` und `dispose`.
- Plugins antworten per `ctx.dispatch`. Der Effekt benennt die Antwort-Messages mit `replyTo`, `onSuccess`, `onError` und den anderen Standardfeldern, und eine Child-Komponente bekommt das Präfix zurück.
- Messages laufen nacheinander, Effekte der Reihe nach, und eine Message von einem Plugin wartet auf den nächsten Durchlauf. Plugins werden in umgekehrter Reihenfolge beendet.
- Erwartete Fehlschläge sind Messages, Bugs werfen. Ein Plugin-Test braucht nur einen falschen Kontext.

Weiter: [Eingebaute Plugins](page:plugins-reference).
