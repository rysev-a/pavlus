---
summary: Der vollständige Datenfluss einer pavlus-Anwendung, vom Event bis zum gepatchten DOM. Was reiner Code dir bringt, wie Effekte als Daten aussehen, was Plugins dürfen und was nicht, in welcher Reihenfolge Messages laufen und wie du einen handler mit einfachen Asserts testest.
---
## Ein Kreislauf

Jede pavlus-Anwendung ist derselbe Kreislauf. Etwas passiert, eine Message entsteht, dein reiner Code macht aus der Message Effekte, Plugins führen die Effekte aus, und der neue State wird auf dem Bildschirm gezeigt. Hier ist der ganze Weg, mit dem Namen des Teils, der jeden Schritt ausführt.

```text
 DOM event / HTTP reply / timer tick / socket frame / location change
        |
        |  a plugin turns it into a message
        v
 { id, payload, event }                           message: plain data
        |
        |  core: createApp puts it in the queue
        v
 handler(message, state)  ->  Effect[]            your code: pure
        |
        |  core: each effect goes to plugins[effect.plugin]
        v
 store.handle(set ...)    http.handle(request)    plugins: all side effects
        |                       |
        |                       |  later: ctx.dispatch(reply message)
        v                       +-------------------> back to the queue
 store: state replaced by a new object
        |
        |  core: state !== previous state  ->  onState(next) on every plugin
        v
 dom.onState:  view.diff(prev, next)  ->  Patch[]
        |
        v
 the dom plugin changes the real DOM
```

Alles auf der linken Seite dieses Bildes sind Daten oder reine Funktionen. Alles, was die Welt berührt, ist ein Plugin. Der Core, `createApp`, ist die dünne Schleife dazwischen. Sein Quelltext umfasst etwa hundert Zeilen und hängt nicht vom DOM ab.

Warum diese Form? Sie trennt den Teil eines Programms, der sich oft ändert und schwer richtig zu machen ist (was soll passieren, wenn der Nutzer X tut), von dem Teil, der sich selten ändert und einmal geschrieben werden kann (wie hängt man einen Listener an, wie ruft man `fetch` auf). Der erste Teil wird zu gewöhnlichen Funktionen auf gewöhnlichen Daten, und so ist er leicht zu lesen, zu testen und wiederzuverwenden.

## Was „rein" dir bringt

Eine **reine** Funktion hängt nur von ihren Argumenten ab und ändert nichts außerhalb von sich selbst. Deine handler haben die Signatur `(message, state, ctx) => Effect[]`. Weil sie rein sind:

- **Kannst du sie ohne Browser testen.** Die Eingabe sind zwei einfache Werte, und die Ausgabe ist eine Liste einfacher Werte. Du vergleichst sie mit `assert`. Am Ende dieser Seite gibt es ein vollständiges Beispiel.
- **Kannst du sie auf einem Server ausführen.** Ohne DOM rendern dieselben Komponenten in einen String. Die Seite [Server-Side-Rendering](page:concepts-ssr) nutzt das.
- **Kannst du eine Sitzung wiederholen.** Zeichne die Messages auf, gib sie einer frischen App, und du erhältst denselben State. Der Core gibt dir sogar einen Hook, `onStep(message, effects)`, der für jede verarbeitete Message aufgerufen wird.
- **Kannst du ansehen, was passiert ist.** Ein Effekt ist ein Objekt, das du ausgeben, loggen und vergleichen kannst. Ein Callback nicht.

Pavlus prüft die Reinheit **nicht**. Die Dokumentation nennt sie die Verantwortung des Autors. Ein handler, der `Math.random()` aufruft oder `Date.now()` liest, funktioniert und macht die Anwendung schwer testbar. Die Faustregel ist, stattdessen ein Plugin zu fragen. Eine Zufallszahl oder die Uhrzeit ist ein Effekt, dessen Antwort als Message zurückkommt.

## Effekte sind einfache Daten

Ein Effekt ist ein Objekt mit mindestens zwei Feldern: `plugin`, dem Namen des Plugins, das ihn behandelt, und `type`, was zu tun ist. Die anderen Felder sind Sache des Plugins. Hier sind echte aus den eingebauten Plugins. Du schreibst sie mit dem *Effector* jedes Plugins, einem kleinen Builder-Objekt, aber das Ergebnis ist genau das gezeigte Objekt.

```ts
{ plugin: "store", type: "set", path: "count", value: 1 }
{ plugin: "store", type: "merge", path: "user", value: { name: "Ann" } }
{ plugin: "http", type: "request", id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }
{ plugin: "time", type: "setTimeout", id: "search", ms: 300, replyTo: "searchFire", payload: "ann" }
{ plugin: "router", type: "navigate", url: "/users" }
{ plugin: "logger", type: "log", level: "info", message: "user removed", data: { id: 3 } }
{ plugin: "dom", type: "focus", selector: "#name" }
```

Zwei Dinge fallen auf. Erstens sagen Effekte, die eine Antwort brauchen, **mit welcher Message geantwortet wird**: `onSuccess: "loaded"`, `replyTo: "searchFire"`. Die Antwort kommt später als Message an, `{ id: "loaded", payload: ... }`, und läuft durch denselben Kreislauf. Dein Code wartet nie. Zweitens ersetzt ein Effekt mit einer `id` (`http`, `time`, `ws`) einen laufenden mit derselben id. So schreibt man „die letzte Anfrage gewinnt" und ein Debounce, ohne State in deinem Code.

In handlern nutzt du die Effectors, weil sie typisiert sind und sich gut lesen:

```ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";

interface SearchState {
  query: string;
  status: "idle" | "loading";
  results: string[];
}

export class Search extends Component<SearchState> {
  type(msg: Message) {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      time.setTimeout("search", 300, "fire", query),
    ];
  }

  fire(msg: Message) {
    return [
      store.set("status", "loading"),
      http.request({
        id: "search",
        url: `/api/search?q=${msg.payload}`,
        onSuccess: "found",
        onError: "failed",
      }),
    ];
  }

  found(msg: Message) {
    const reply = msg.payload as { data: string[] };
    return [store.set("status", "idle"), store.set("results", reply.data)];
  }

  failed() {
    return [store.set("status", "idle"), store.set("results", [])];
  }
}
```

Das ist eine vollständige Suche mit Debounce. Jeder Tastendruck startet den Timer mit derselben id neu, also wird nur die letzte Suchanfrage gesendet. Wird eine neue Anfrage gesendet, während eine läuft, bricht dieselbe id die alte ab. Die Komponente hat keine Timer, keinen `AbortController` und kein veränderliches Feld.

## Vom State zu Patches

Die letzten Schritte des Kreislaufs gehören dem Compiler. Wenn der Store den State ersetzt hat, ruft das DOM-Plugin die Funktion `diff(prev, next)` der gemounteten view auf. Sie gibt **Patches** zurück: ebenfalls einfache Daten, eine von acht Operationen (`text`, `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`). Das DOM-Plugin ist der einzige Code, der Patches in DOM-Aufrufe umsetzt.

::demo state-to-patches

Sieh dir die zwei Schritte der Demo an. Im ersten ändert sich nur `status`, also ist der einzige Patch das Einfügen des „Loading..."-Absatzes. Die Liste wird nicht angefasst. Im zweiten ändern sich `status` und `items`: Der Absatz wird geleert und zwei Listenelemente werden eingefügt. Ein Knoten, der nur unveränderte Felder liest, erzeugt gar nichts. Der Compiler ermittelt, welche Felder jeder Knoten liest, damit `diff` einen Teilbaum mit einer einzigen `===`-Prüfung überspringen kann.

> [!WARNING] Unveränderlichkeit ist Teil des Vertrags
> Der Core entscheidet, dass sich ein State geändert hat, indem er die Objektidentität vergleicht (`next !== state`), und `diff` vergleicht Felder auf dieselbe Weise. Das Store-Plugin ersetzt State-Objekte und teilt die Zweige, die sich nicht geändert haben, deshalb sind beide Prüfungen günstig und korrekt. Würdest du den State direkt verändern, würde kein Plugin benachrichtigt und kein Patch erzeugt.

## Die Reihenfolge der Dinge

Der Core verarbeitet Messages strikt nacheinander. Diese Regeln stehen alle in `createApp`, und du kannst dich auf sie verlassen.

1. **Eine Queue.** `dispatch(message)` legt die Message in eine Queue. Läuft die Schleife schon, kehrt der Aufruf sofort zurück, und die Message wird später im selben Durchlauf behandelt, nachdem die aktuelle Message fertig ist.
2. **Effekte der Reihe nach.** Für eine Message werden die Effekte in der Reihenfolge an ihre Plugins gereicht, in der dein handler sie zurückgegeben hat.
3. **Antworten werden eingereiht.** Ein Plugin darf `ctx.dispatch` aufrufen, während es einen Effekt behandelt, sogar sofort. Die Antwort wartet in der Queue hinter der aktuellen Message. Ein handler sieht eine Antwort auf seinen eigenen Effekt nie während derselben Message.
4. **Eine Benachrichtigung pro Message.** Nachdem alle Effekte einer Message gelaufen sind, liest der Core den State einmal. Ist er ein anderes Objekt als vor der Message, wird jedes Plugin mit `onState` einmal mit dem endgültigen State aufgerufen. Drei `set`-Effekte verursachen ein render, nicht drei.
5. **Ein Sicherheitsventil.** Werden in einem Durchlauf mehr als `maxMessagesPerTick` Messages (standardmäßig 10 000) verarbeitet, wird die Queue geleert und ein Fehler geworfen. Das bedeutet, dass Messages sich in einem Zyklus gegenseitig auslösen.
6. **Fehler.** Eine Exception in einem handler oder in `plugin.handle` pflanzt sich aus `dispatch` heraus fort. Ein Effekt für ein Plugin, das nicht registriert ist, wirft `pavlus: no plugin "x" for effect "y"`. Zwei Plugins mit demselben Namen werfen beim Start der App.
7. **Herunterfahren.** `dispose()` gibt die Plugins in umgekehrter Reihenfolge der Registrierung frei, und spätere Messages werden ignoriert.

Der State, den handler erhalten, kommt vom ersten Plugin mit einer `getState()`-Methode, das ist der Store. Du kannst `getState` selbst in den Optionen übergeben, zum Beispiel in einem Test.

## Was Plugins dürfen und was nicht

Ein Plugin ist ein Objekt: `{ name, init?, handle(effect, ctx), onState?, dispose? }`. Der Core gibt ihm einen Kontext mit drei Funktionen: `dispatch(message)`, `getState()` und `dispatchEffect(effect)`.

Ein Plugin **darf**:

- veränderliche Daten besitzen: Listener, laufende Anfragen, Timer, Sockets, einen Cache. Anwendungscode sieht sie nie und räumt sie nie auf.
- jede äußere API aufrufen: das DOM, `fetch`, `setTimeout`, `localStorage`, `console`.
- äußere Events mit `ctx.dispatch` jederzeit in Messages umwandeln.
- den State mit `ctx.getState()` lesen und in `onState` auf Änderungen reagieren.
- in `dispose` aufräumen.

Ein Plugin **sollte nicht**:

- den Anwendungs-State von sich aus ändern. Nur das Store-Plugin ändert den State, und nur aufgrund eines `set`-, `merge`-, `remove`-, `undo`- oder `restoreTo`-Effekts.
- Geschäftsregeln enthalten. Es macht eine Sache für eine Familie von Effekten. „Was nach der Antwort passiert" gehört in einen handler.
- bei einem erwarteten Fehler werfen. Eine fehlgeschlagene Anfrage oder ein geschlossener Socket wird als Message gemeldet (`onError`), damit handler damit umgehen können.

Auch diese Regeln überwacht das Framework nicht. Die [Plugin-Seiten](page:plugins-overview) zeigen, was jedes eingebaute Plugin tut und wie du ein eigenes schreibst.

## Einen handler mit einfachen Asserts testen

Weil eine Komponente eine reine Funktion ist, braucht ein Unit-Test keine Vorbereitung. `toHandler` macht aus einer Komponente eine einfache Funktion `(message, state) => Effect[]`. Rufe sie auf und vergleiche. Dieser Test nutzt nur die Standardbibliothek:

```ts search.test.ts
import assert from "node:assert/strict";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { toHandler } from "@pavlus/frontend";
import { Search } from "./search.ts";

const search = toHandler(new Search());
const state = { query: "ann", status: "idle" as const, results: [] };

assert.deepEqual(search({ id: "fire", payload: "ann" }, state), [
  store.set("status", "loading"),
  http.request({
    id: "search",
    url: "/api/search?q=ann",
    onSuccess: "found",
    onError: "failed",
  }),
]);

assert.deepEqual(search({ id: "nobody-handles-this" }, state), []);
```

Eine Message ohne handler gibt eine leere Liste zurück, keinen Fehler. Du vergleichst mit der eigenen Ausgabe der Effectors, der Test bricht also, wenn ein Effekt eines Plugins seine Form ändert, und du schreibst das Objekt nie von Hand.

Um mehrere Schritte zusammen zu testen, lässt du den echten Core nur mit dem Store-Plugin laufen. Das `dom`-Plugin ist nicht nötig, weil du nur den State prüfen willst. Die Option `onStep` sammelt, was passiert ist.

```ts flow.test.ts
import assert from "node:assert/strict";
import { createApp, type Plugin } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { Search } from "./search.ts";

const fakeHttp: Plugin = {
  name: "http",
  handle(effect, ctx) {
    ctx.dispatch({
      id: effect.onSuccess as string,
      payload: { status: 200, data: ["Ann Lee", "Anna Fox"] },
    });
  },
};
const fakeTime: Plugin = {
  name: "time",
  handle(effect, ctx) {
    ctx.dispatch({ id: effect.replyTo as string, payload: effect.payload });
  },
};

const store = createStorePlugin({ query: "", status: "idle", results: [] });
const steps: string[] = [];
const app = createApp({
  app: new Search(),
  plugins: [store, fakeHttp, fakeTime],
  onStep: (message) => steps.push(message.id),
});

app.dispatch({ id: "type", event: { type: "input", value: "ann" } });

assert.deepEqual(steps, ["type", "fire", "found"]);
assert.deepEqual(store.getState().results, ["Ann Lee", "Anna Fox"]);
assert.equal(store.getState().status, "idle");
```

Die zwei Fake-Plugins haben je vier Zeilen. Sie antworten sofort, und der Test sieht die ganze Kette: `type`, dann `fire` vom Timer, dann `found` von der Anfrage. Keine Uhr, kein Netzwerk, kein Browser.

Wenn du ein Template wirklich in einem DOM prüfen willst, hat `@pavlus/frontend/testing` die Funktion `mountView(viewOrComponent, initialState)`. Sie mountet eine view in einem frischen Container ohne den Core und gibt den Container zurück, die `messages`, die die Seite gesendet hat, und ein `set(next)`, um den State zu ändern. Ein Klick auf einen Button gibt dir die Message zum Vergleichen, und `set` zeigt das gepatchte DOM.

## Was du gelernt hast

- Der Kreislauf ist: Event, Message, handler, Effekte, Plugins, Store, neuer State, `diff`, Patches, DOM. Messages, Effekte und Patches sind alle einfache Daten.
- Reine handler lassen sich mit `assert` testen, auf einem Server ausführen und wiederholen. Reinheit ist eine Konvention, die das Framework nicht erzwingt.
- Messages laufen nacheinander. Effekte laufen in der zurückgegebenen Reihenfolge, Antworten warten in der Queue, und Plugins erfahren den State einmal pro Message.
- Plugins besitzen jeden Seiteneffekt und die veränderlichen Daten dafür. Sie antworten mit Messages, und nur der Store ändert den State.
- Du kannst einen handler direkt mit `toHandler` testen oder einen ganzen Ablauf mit `createApp`, dem Store und kleinen Fake-Plugins.

Weiter: [Komponenten und State](page:concepts-components).
