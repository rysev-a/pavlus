---
summary: Baue von einem leeren Ordner aus einen laufenden Zähler und danach eine kleine Notizenliste mit einem Eingabefeld. Verfolge dann einen Klick Message für Message durch das Framework und sieh dir die Patches an, die dabei entstehen.
---
## Was du bauen wirst

Du baust zwei kleine Programme. Das erste ist ein Zähler: ein Absatz und ein Button. Das zweite ist eine Liste von Notizen mit einem Texteingabefeld. Zusammen nutzen sie jeden Teil einer pavlus-Anwendung: ein Template, eine Komponentenklasse mit handlern, einen Store für den State und ein DOM-Plugin, das das Ergebnis anzeigt und auf Events lauscht.

Am Ende verfolgst du einen einzelnen Klick Message für Message durch das Framework und siehst genau, was er auf der Seite ändert.

Du brauchst Node.js und einen Paketmanager. Der Code ist TypeScript, aber nichts davon braucht mehr als einfache Typen.

## Das Projekt einrichten

Ein pavlus-Projekt ist ein normales [Vite](https://vite.dev)-Projekt mit einem zusätzlichen Plugin. Das Plugin kompiliert jede `.pavlus`-Datei zu JavaScript, wenn du sie importierst. Beginne mit einer `package.json`. Das Framework ist das Paket `@service-laboratory/pavlus`.

```json package.json
{
  "name": "counter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "^8.3.5"
  }
}
```

Die Vite-Konfiguration fügt das pavlus-Plugin hinzu. Es hat eine optionale Einstellung, `runtime`, die ändert, woher kompilierte Templates ihre kleinen Hilfsfunktionen importieren. Du brauchst sie jetzt nicht.

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default { plugins: [pavlus()] };
```

Die Seite ist ein leeres Element, das die Anwendung füllen wird, und ein Skript.

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

TypeScript muss wissen, was `import view from "./counter.pavlus"` zurückgibt. Eine Deklarationsdatei erledigt das. Das Framework liefert sie mit.

```ts env.d.ts
/// <reference types="@service-laboratory/pavlus/env" />
```

## Das erste Template

Lege `counter.pavlus` an. Ein Template ist ein eingerückter Baum aus Elementen. `{count}` ist ein Ausdruck, der das Feld `count` des State liest. `@click=inc` sagt, dass ein Klick auf den Button die Message mit der id `inc` sendet.

```pavlus counter.pavlus
div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me
```

Beachte, was hier nicht steht. Es gibt keine Funktion, die beim Klick läuft. Das Template benennt nur eine Message. Was bei dieser Message passiert, wird woanders entschieden, in Code, den du für sich testen kannst.

## Die Komponente

Lege `counter.ts` an. Eine Komponente ist eine Klasse, die `Component` erweitert. Ihr Feld `view` ist das Template. Jede andere Methode ist der **handler** der Message mit demselben Namen, die Methode `inc` behandelt also die Message `inc`.

Ein handler erhält die Message und den aktuellen State. Er gibt eine Liste von Effekten zurück. Dieser gibt einen einzelnen Effekt zurück, gebaut mit dem Helfer `store.set` des Store-Plugins: „setze das Feld `count` auf den alten Wert plus eins".

```ts counter.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./counter.pavlus";

export interface CounterState {
  count: number;
}

export class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }
}

export const counter = new Counter();
```

> [!TIP] Annotiere die Parameter
> TypeScript leitet die Typen der Parameter von Klassenmethoden nicht ab. Schreibe `msg: Message` und deinen State-Typ selbst hin. Der erste Parameter wird oft nicht benutzt, nenne ihn dann `_msg`.

## Die Anwendung starten

Lege `main.ts` an. `createApp` verbindet die Komponente mit ihren Plugins. Du brauchst jetzt zwei Plugins. Das **store**-Plugin hält den State und startet mit dem Objekt, das du ihm gibst. Das **DOM**-Plugin rendert views und macht aus Browser-Events Messages. Die Option `mount` nennt das Element, in das gerendert wird.

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { counter, type CounterState } from "./counter.ts";

createApp<CounterState>({
  app: counter,
  plugins: [createStorePlugin<CounterState>({ count: 0 }), createDomPlugin()],
  mount: "#app",
});
```

Starte `npx vite`, öffne die ausgegebene Adresse und klicke auf den Button. Die Zahl steigt. Hier ist dasselbe Template als Live-Demo, mit den zwei Patches, die das `diff` des Compilers für die ersten zwei Klicks zurückgibt:

::demo counter

Jeder Klick erzeugt genau einen Patch der Art `text`. Er benennt den Knoten über seine id und gibt den neuen Text an. Nichts anderes auf der Seite wird angefasst, weil nichts anderes `count` liest.

> [!NOTE] Woher der State kommt
> Der erste State ist das Objekt, das du an `createStorePlugin` übergibst. Jedes Feld, das ein Template liest, muss darin sein, sonst liest das Template `undefined`. Der Store hält ein einfaches Objekt, und die handler ändern es nie. Sie geben `set`-Effekte zurück, und der Store macht ein neues Objekt.

## Einen Klick verfolgen

Jetzt die versprochene Tour. Hier ist alles, was passiert, der Reihe nach, vom Klick bis zum geänderten Text. Jede Zeile ist ein echter Schritt von `createApp`.

1. **Start.** `createApp` initialisiert die Plugins, rendert die view in `#app` und sendet die Message `{ id: "mounted" }`. Der Zähler hat keinen `mounted`-handler, also gibt er keine Effekte zurück.
2. **Der Klick.** Das DOM-Plugin hat einen Listener auf den Button gesetzt. Er liest die Message, die das Template diesem Button gegeben hat, `{ id: "inc" }`, fügt eine Zusammenfassung des Browser-Events hinzu und sendet `{ id: "inc", event: { type: "click", value: "" } }`. Der `value` ist die value-Eigenschaft des Buttons, ein leerer String.
3. **Die Queue.** Der Core legt die Message in seine Queue. Messages werden nacheinander verarbeitet.
4. **Der handler.** Der Core ruft deinen Code mit der Message und dem aktuellen State `{ count: 0 }` auf. Die Methode `inc` gibt `[{ plugin: "store", type: "set", path: "count", value: 1 }]` zurück.
5. **Der Effekt.** Der Core reicht diesen Effekt an das Plugin weiter, das darin genannt ist, `store`. Der Store baut einen neuen State `{ count: 1 }`.
6. **Der State hat sich geändert.** Der Core liest den State erneut. Es ist ein anderes Objekt, also erhält jedes Plugin `onState(next)`.
7. **Das diff.** Das DOM-Plugin ruft `diff(prev, next)` der view auf. Das Ergebnis ist ein Patch, `{ op: "text", id: "2", text: "Clicked 1 times" }`, und das Plugin setzt diesen Text auf den Knoten mit der id `2`.

Die ganze Kette besteht in der Mitte aus einfachen Daten: eine Message, eine Liste von Effekten, eine Liste von Patches. Du kannst jedes davon ausgeben.

## Eine Liste mit einem Eingabefeld

Das zweite Programm braucht mehr von der Sprache. Es hat ein Texteingabefeld, ein Formular, das eine Notiz hinzufügt, und eine Liste mit einem Button zum Entfernen jeder Notiz. Es braucht auch mehr State: den Text, der gerade getippt wird, die Notizen und einen Zähler, der jeder Notiz eine id gibt.

::demo notes-list

Speichere dieses Template als `notes.pavlus` (die Demo zeigt seinen Quelltext). Lies es von oben. `input(value=draft ... @input=setDraft)` zeigt das Feld `draft` und sendet `setDraft` bei jedem Tastendruck. `form(@submit.prevent=add)` sendet `add`, wenn das Formular abgeschickt wird, und `.prevent` verhindert, dass der Browser die Seite neu lädt. Die Schleife `for note in notes key note.id` wiederholt das `li`, und der `key` lässt `diff` erkennen, welche Notiz welche ist, wenn sich die Liste ändert. `@click=remove(note.id)` sendet die Message `remove` mit der id der Notiz als **payload**.

Die Komponente folgt dem Template, ein handler pro Message:

```ts notes.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./notes.pavlus";

export interface Note {
  id: number;
  text: string;
}

export interface NotesState {
  draft: string;
  notes: Note[];
  nextId: number;
}

export class Notes extends Component<NotesState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: NotesState) {
    const text = state.draft.trim();
    if (text === "") return [];
    return [
      store.set("notes", [...state.notes, { id: state.nextId, text }]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  remove(msg: Message, state: NotesState) {
    return [
      store.set(
        "notes",
        state.notes.filter((note) => note.id !== msg.payload),
      ),
    ];
  }
}

export const notes = new Notes();
```

Drei Dinge verdienen einen genaueren Blick:

- `setDraft` liest `msg.event?.value`. Das DOM-Plugin hängt `event` an jede Message, die von der Seite kommt, und bei einem Eingabefeld ist `value` der Text, den es gerade enthält.
- `add` gibt drei Effekte zurück. Sie werden in dieser Reihenfolge angewendet. Wenn der Text leer ist, gibt es eine leere Liste zurück, das heißt „nichts soll passieren".
- `remove` liest die id aus `msg.payload`. Das Template hat `remove(note.id)` geschrieben, und ein Argument wird zum payload.

Die `main.ts` ist dieselbe wie zuvor, mit `app: notes` und dem Anfangs-State `{ draft: "", notes: [], nextId: 1 }`.

## Was ein Tastendruck und ein Submit bewirken

Wenn das Notizen-Programm läuft, wiederholen sich dieselben sieben Schritte für jede Message, aber die Patches sind reichhaltiger. Die drei Schritte der Demo oben zeigen sie.

- **Tippen.** Die Message ist `{ id: "setDraft", event: { type: "input", value: "Call Ann" } }`. Der handler gibt ein `set` für `draft` zurück. Der einzige Patch ist ein `attr`-Patch für den `value` des Eingabefelds. Die Liste und die Anzahl werden nicht angefasst.
- **Submit.** Die Message ist `{ id: "add", event: { type: "submit" } }`. Drei `set`-Effekte laufen der Reihe nach, und dann erfahren die Plugins einmal vom neuen State. Die Patches: Der `value` des Eingabefelds geht zurück auf einen leeren String, ein `insert` fügt die neue Notiz hinzu, und ein `text`-Patch aktualisiert die Anzahl.
- **Entfernen.** Die Message ist `{ id: "remove", payload: 1, event: { type: "click", value: "" } }`. Ein `remove`-Patch nimmt die Notiz heraus, und die Anzahl ändert sich.

Die Patches werden von `diff` allein aus dem State erzeugt. Die Komponente sagt nie „füge einen Knoten ein". Sie sagt, wie der State sein soll, und das kompilierte Template ermittelt die DOM-Änderungen.

> [!WARNING] Ändere den State nie direkt
> Schreibe in einem handler nicht `state.notes.push(note)`. Der Store gibt dir den aktuellen State zum Lesen. `diff` entscheidet, dass sich etwas geändert hat, indem es mit `===` vergleicht. Ein verändertes Array sieht also unverändert aus, und der Bildschirm würde nicht aktualisiert. Gib immer ein neues Array zurück, so wie `add` es mit `[...state.notes, ...]` tut.

## Was du gelernt hast

- Ein pavlus-Projekt ist ein Vite-Projekt mit dem `pavlus()`-Plugin, einer `index.html`, einer `env.d.ts`, einem Template, einer Komponentenklasse und einem `createApp`-Aufruf.
- Ein Template benennt Messages (`@click=inc`). Eine Komponentenklasse behandelt sie mit einer Methode pro Message und gibt Effekte wie `store.set(path, value)` zurück.
- `createApp` nimmt eine Komponente und Plugins. Der Store hält den State, das DOM-Plugin zeigt die view und meldet Events als Messages mit einem `event`-Feld.
- Ein Klick ist: Message, handler, Effekte, Store, neuer State, `diff`, Patches, DOM. Die mittleren Teile sind einfache Daten, die du ausgeben kannst.
- handler dürfen den State nie verändern. Sie geben neue Werte zurück.

Weiter: [Elemente, Text und Attribute](page:syntax-elements).
