---
summary: Wie eine Komponente funktioniert. Funktions- und Klassenkomponenten, der eine State-Baum und wie store.set ihn erreicht, wie das Template den State liest, das Feld view, props, die Messages mounted, enter und leave, warum die Instanz geteilt wird und die Regeln für handler-Namen. Endet mit einer vollständigen Todo-Komponente.
---
## Was eine Komponente ist

Eine Komponente in pavlus ist ein Stück Logik, das auf Messages antwortet. Bei einer Message und dem aktuellen State gibt sie eine Liste von Effekten zurück. Sie kann auch eine **view** haben: das kompilierte Template, das den State zeigt. Mehr ist nicht nötig. Es gibt keine render-Methode, keine Lifecycle-Klasse und keine Hooks.

Eine Komponente hat eine von zwei Formen. Sie kann **eine Funktion** sein:

```ts
import { type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";

interface CounterState {
  count: number;
}

export const counter = (msg: Message, state: CounterState) => {
  switch (msg.id) {
    case "inc":
      return [store.set("count", state.count + 1)];
    case "dec":
      return [store.set("count", state.count - 1)];
    default:
      return [];
  }
};
```

Oder sie kann **eine Instanz einer Klasse sein, die `Component` erweitert**. Jede Methode ist der handler der Message mit demselben Namen, das `switch` fällt also weg:

```ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./counter.pavlus";

interface CounterState {
  count: number;
}

class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }

  dec(_msg: Message, state: CounterState) {
    return [store.set("count", state.count - 1)];
  }
}

export const counter = new Counter();
```

Beide Formen leisten dieselbe Arbeit, und `createApp({ app })` akzeptiert beide. Der Unterschied ist, was die Klassenform halten kann. Eine Funktion hat keine `view`, kann also nicht mit `createApp({ mount })` gerendert werden: Der Core wirft `mount needs an app that is a component with a view`. Sie hat auch keine `children` und kein `routing`. Nutze eine Funktion für kleine reine Logik und für Wrapper und eine Klasse für alles, was auf dem Bildschirm angezeigt wird.

Eine Klasse muss **als Instanz übergeben** werden. `createApp({ app: Counter })` wirft einen Fehler, der `Counter is a class: pass an instance (new Counter()), not the class` sagt. Auch ein einfaches Objekt mit Methoden oder eine Klasse, die nicht `Component` erweitert, wird abgelehnt, und der Fehler sagt, was du schreiben sollst.

## Der State-Baum

Die Anwendung hat **einen State**: ein einfaches Objekt, gehalten vom Store-Plugin. Jede Komponente liest daraus, und keine besitzt eine private Kopie. Eine kleine Anwendung hält alle Felder auf oberster Ebene. Eine größere gruppiert sie in Zweige, etwa `state.users` und `state.tasks`, ein Zweig für jede Child-Komponente.

Der State ist ein Baum aus einfachen Daten. Er kann Strings, Zahlen, Arrays und Objekte enthalten. Er sollte leicht auszugeben und zu vergleichen sein. Die einzige Ausnahme ist ein Komponentenwert: Ein `+{expr}`-embed (siehe [Nachrichten und Kindkomponenten](page:concepts-messages)) darf eine Komponente aus dem State lesen, aber dann ist der State kein JSON mehr.

Ein handler ändert den State nie. Er gibt einen Effekt zurück, und das Store-Plugin baut ein neues State-Objekt. Sehen wir uns an, was die Store-Effekte können. Jeder hat einen `path`, geschrieben als String mit Punkten (`"user.name"`) oder als Array (`["items", 3, "done"]`). Eine Zahl in einem Array-Pfad indiziert ein Array.

| Effekt | Builder | Was der Store tut |
| --- | --- | --- |
| `set` | `store.set(path, value)` | Setzt `value` an `path` und legt fehlende Eltern an. |
| `merge` | `store.merge(path, object)` | Mischt die Felder von `object` flach in das Objekt an `path`. |
| `remove` | `store.remove(path)` | Löscht das Feld. Ein Array-Element wird herausgespleißt. |
| `undo` | `store.undo(steps?)` | Macht die letzten `steps` Änderungen rückgängig (standardmäßig eine). |
| `restoreTo` | `store.restoreTo(timestamp)` | Macht jede Änderung rückgängig, die nach dem Zeitpunkt aufgezeichnet wurde. |

Der Store ändert nur den Zweig auf dem Pfad. Die Objekte auf anderen Zweigen behalten ihre Identität, ein Template, das `state.tasks` liest, sieht also keine Änderung, wenn `state.users.status` gesetzt wird. Denselben Wert noch einmal zu schreiben ändert nichts und wird nicht aufgezeichnet. Jede Änderung speichert ihre eigene Umkehrung, so funktioniert `undo` ohne Snapshots.

## Wie der State das Template erreicht

Ein Template erhält keine props und keinen Kontext. Es liest **das State-Objekt**. Ein Bezeichner in einem Ausdruck ist ein Feld des State oder eine Schleifenvariable. In `p Hello, {user.name}` ist das Wort `user` gleich `state.user`.

::demo state-and-template

Die Demo zeigt beide Seiten. Das Template liest zwei Felder, `user` und `unread`. Wenn `unread` von 3 auf 4 geht, gibt das kompilierte `diff` einen `text`-Patch für den Absatz zurück. Das ist die ganze Beziehung zwischen einer Komponente und ihrem Template: **Die handler schreiben den State, das Template liest ihn.** Keines ruft das andere auf.

Das prägt, wie du den State entwirfst. Das Template kann kleine Dinge mit Ausdrücken tun: vergleichen, addieren, auf Leere prüfen, Methoden wie `includes` aufrufen. Es kann keinen beliebigen Code ausführen, weil Ausdrücke eine kleine reine Teilmenge von JavaScript sind. Alles, was eine echte Berechnung braucht, etwa eine Anzahl offener Aufgaben, eine sortierte Kopie oder ein formatiertes Datum, wird im handler berechnet und als Feld gespeichert. Das Todo-Beispiel am Ende der Seite macht das mit `left`.

## Die view

Das Feld `view` hält das Template der Komponente, das ist der Default-Export einer `.pavlus`-Datei:

```ts
import view from "./todos.pavlus";

class Todos extends Component<TodoState> {
  view = view;
}
```

Eine view ist `{ render, diff, meta }`: zwei reine Funktionen, vom Compiler erzeugt. `createApp({ app, mount })` rendert `app.view` in das Element `mount`, und das DOM-Plugin hält sie aktuell. Die view einer Child-Komponente wird mit einem embed (`+Child#name`) in das Template eines Parents gesetzt. Eine Komponente ohne view ist in Ordnung: Sie ist dann nur Logik, zum Beispiel ein Child, mit dem ein Parent spricht, das er aber nicht anzeigt.

`viewOf(component)` gibt die view zurück, eingeschlossen in ihre Komponente. Dadurch finden `+outlet` und die eingebetteten Kinder das `routing` und die `children` der Komponente. Du rufst es selten selbst auf, weil `mount` und der Test-Helfer `mountView` es für dich tun.

## Props

Ein Parent kann einem Child über `props` **schreibgeschützte Eingaben** geben. Es ist eine Funktion vom State des Parents zu einem Objekt, und das Objekt wird in den State des Childs gemischt:

```ts
children: Children<DashboardState> = {
  users: {
    component: users,
    key: "users",
    props: (state) => ({ filter: state.filter }),
  },
};
```

Das Child sieht `{ ...state.users, filter }`. In seinen handlern und in seinem Template ist `filter` einfach ein Feld. Zwei Regeln sind wichtig. Die props werden **nach** dem eigenen Ausschnitt des Childs eingemischt, ein prop gewinnt also gegen ein Feld mit demselben Namen. Und ein prop ist nur eine Eingabe: Das Child darf es nicht schreiben. Ein `store.set("filter", ...)` im Child würde `users.filter` im State des Parents schreiben, was ein anderer Ort ist. Die Seite [Nachrichten und Kindkomponenten](page:concepts-messages) zeigt die ganze Verdrahtung.

## Lifecycle: mounted, enter und leave

Pavlus hat keine Lifecycle-Methoden. Es gibt **Messages**, wie bei jedem anderen Event, die das Framework zu drei Zeitpunkten sendet. Eine Komponente behandelt sie mit Methoden gleichen Namens und gibt Effekte zurück.

| Message | Wann sie gesendet wird | Wer sie erhält |
| --- | --- | --- |
| `mounted` | Einmal, nachdem die Anwendung im DOM ist. Sie ist die erste Message einer mit `mount` erzeugten App. | Die Root-Komponente. Bei einer view, die durch den Effekt `dom.mount` gemountet wird, wählst du die Message mit der Option `onMounted`. |
| `enter` | Ein gerouteter Child wurde aktiv, oder die eigene Route einer Blattseite hat sich geändert (zum Beispiel `/items/5` zu `/items/7`). Der payload ist die Route des Childs. | Der geroutete Child, als `enter`. |
| `leave` | Ein gerouteter Child ist nicht mehr aktiv. Der payload ist die Route, die er hatte. | Der geroutete Child, als `leave`. |

`mounted` ist der Ort, an dem eine Anwendung ihre Arbeit beginnt: Daten laden, Timer starten, auf den Router hören. Ein Parent, der Kinder einbettet, startet sie mit `ctx.send`:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

`enter` und `leave` gehören zum Routing. Eine Seite lädt ihre Daten, wenn sie betreten wird, und stoppt ihre Timer, wenn sie verlassen wird:

```ts
class Tasks extends Component<TasksState> {
  enter() {
    return [store.set("status", "loading")];
  }

  leave() {
    return [store.set("status", "idle")];
  }
}
```

Hat eine Komponente mit `routing` kein eigenes `mounted`, gibt das Standard-`mounted` `router.listen("routeChanged")` zurück, und das Standard-`routeChanged` ruft `ctx.setRoute` auf. Das speichert die Route und gibt die `leave`- und `enter`-Effekte für jeden gerouteten Child zurück, den die Änderung betrifft. Die tiefsten Kinder gehen zuerst, und neue treten von oben nach unten ein. Siehe [Routing](page:concepts-routing).

> [!NOTE] Es gibt noch keine Template-Hooks
> Ein Template kann keine Message senden, wenn seine Knoten erscheinen oder verschwinden. Die Design-Notizen führen das als nicht gebaut auf. Vorerst startet ein Parent einen Child ausdrücklich mit `ctx.send`, und eine geroutete Seite nutzt `enter`.

## Eine Instanz, geteilt von jeder Message

Eine Komponente wird einmal erzeugt, `export const todos = new Todos()`, und behandelt dann jede Message der Anwendung. Der Core cacht sogar eine handler-Funktion pro Instanz. Die Instanz darf also **keinen veränderlichen State** halten. Würde ein handler `this.count++` tun, überlebte die Zahl zwischen Messages, ein Test könnte sie nicht vorhersagen, und auf einem Server würde sie von allen Anfragen geteilt. Der State gehört in den Store und wird als Argument übergeben.

```ts
class Bad extends Component<{ n: number }> {
  calls = 0;

  inc(_msg: Message, state: { n: number }) {
    this.calls++;
    return [store.set("n", state.n + this.calls)];
  }
}
```

Vergleiche das mit der Version, in der alles, was sich ändert, im State liegt. Der handler berechnet den neuen Wert nur aus seinen Argumenten.

```ts
class Good extends Component<{ n: number }> {
  inc(_msg: Message, state: { n: number }) {
    return [store.set("n", state.n + 1)];
  }
}
```

Unveränderliches Setup ist in Ordnung. `this` in einem handler ist die Komponente, also funktioniert Konfiguration im Konstruktor: `new UsersList(20)` kann eine Seitengröße speichern. Eine Unterklasse darf einen handler überschreiben und `super` aufrufen. Pavlus verbietet veränderliche Felder nicht. Das liegt in der Verantwortung des Autors, wie alle Reinheit.

## Regeln für handler-Namen

Der Core sucht einen handler anhand der Message-id: die Methode mit diesem Namen auf der Instanz. Diese Regeln entscheiden, was zählt.

- Eine Message, deren id keine Methode hat, erhält eine leere Liste von Effekten, keinen Fehler. Ein Tippfehler in einem Template bleibt stumm, prüfe also die Namen.
- Ein handler muss ein Array zurückgeben. Sonst wirft der Core `handler "x" must return an array of effects`, mit dem Namen des handlers.
- **Namen, die nie Messages sind:** `view`, `children`, `routing`, `dispatch`, jeder Name, der mit `_` beginnt, jedes `#private`-Mitglied und alles, was ein Objekt standardmäßig hat (`toString`, `constructor`, `hasOwnProperty`...). Eine Message mit der id `view` oder `_left` ruft nie etwas auf.
- Nutze `_name` für Hilfsmethoden, die du aus handlern aufrufst. `this._left(items)` funktioniert, und eine Message `_left` kann sie nie erreichen.
- Ein handler darf ein Klassenfeld mit einem Funktionswert sein. `load: Handler<S> = (msg, state, ctx) => [...]` wird wie eine Methode gefunden und gibt TypeScript die Parametertypen.
- Eine Message-id mit einem Punkt braucht einen Methodennamen in Anführungszeichen: `"users.remove"(msg) { ... }`. So beobachtet ein Parent seine Kinder, was die nächste Seite zeigt.

Zwei Messages haben einen Standard, wenn sie niemand behandelt. Eine Message, deren letzter Teil `navigate` ist (etwa `navigate` oder `header.navigate`), mit einem String als payload wird zu `router.navigate(url)`. Und in einer Komponente mit `routing` erledigen `mounted` und `routeChanged` die Router-Verdrahtung. Ein handler mit demselben Namen ersetzt den Standard.

## Ein vollständiges Beispiel: eine Todo-Komponente

Das letzte Beispiel setzt die Teile zusammen: eine view mit einem Formular, einem Filter und einer Liste; einen State mit einem Entwurf, Einträgen und einem Zähler offener Aufgaben; und handler, die das abgeleitete Feld `left` korrekt halten.

::demo todo

Das Template liest `draft`, `filter`, `items` und `left`. Die Checkbox sendet `toggle` mit der Eintrags-id, der Button sendet `remove`, und die Filter-Buttons senden `setFilter` mit einem String. In der Demo schaltet der erste Schritt Eintrag 1 um: Die Klasse des `li`, die Eigenschaft `checked` der Checkbox und der Text des Zählers ändern sich. Der zweite Schritt ändert den Filter, also ändert sich die Klasse der zwei Filter-Buttons, und der erledigte Eintrag wird aus der Liste geleert.

Hier ist die Komponente. Beachte, dass es eine einzige Stelle gibt, `_left`, die zu zählen weiß, und dass jeder handler, der `items` ändert, auch ihr Ergebnis zurückgibt.

```ts todos.ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todos.pavlus";

export interface Item {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  draft: string;
  filter: "all" | "open";
  items: Item[];
  nextId: number;
  left: number;
}

export class Todos extends Component<TodoState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.payload)];
  }

  add(_msg: Message, state: TodoState) {
    const text = state.draft.trim();
    if (text === "") return [];
    const items = [...state.items, { id: state.nextId, text, done: false }];
    return [
      store.set("items", items),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
      this._left(items),
    ];
  }

  toggle(msg: Message, state: TodoState) {
    const items = state.items.map((item) =>
      item.id === msg.payload ? { ...item, done: !item.done } : item,
    );
    return [store.set("items", items), this._left(items)];
  }

  remove(msg: Message, state: TodoState) {
    const items = state.items.filter((item) => item.id !== msg.payload);
    return [store.set("items", items), this._left(items)];
  }

  _left(items: Item[]) {
    return store.set("left", items.filter((item) => !item.done).length);
  }
}

export const todos = new Todos();
```

Weil die Komponente rein ist, ist ihr Test kurz und braucht keinen Browser:

```ts todos.test.ts
import assert from "node:assert/strict";
import { toHandler } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { todos, type TodoState } from "./todos.ts";

const handle = toHandler(todos);
const state: TodoState = {
  draft: "Write docs",
  filter: "all",
  items: [],
  nextId: 1,
  left: 0,
};

assert.deepEqual(handle({ id: "add" }, state), [
  store.set("items", [{ id: 1, text: "Write docs", done: false }]),
  store.set("nextId", 2),
  store.set("draft", ""),
  store.set("left", 1),
]);

assert.deepEqual(handle({ id: "add" }, { ...state, draft: "  " }), []);
assert.deepEqual(handle({ id: "_left" }, state), []);
```

Die letzte Zeile zeigt die Namensregel bei der Arbeit: Der Helfer `_left` ist für eine Message nicht erreichbar.

## Was du gelernt hast

- Eine Komponente ist eine Funktion oder eine Instanz einer Klasse, die `Component` erweitert. In einer Klasse behandelt jede Methode die Message mit ihrem Namen. Übergib die Instanz, nicht die Klasse.
- Der State ist ein Baum im Store. handler geben `store.set`-, `merge`- oder `remove`-Effekte mit Pfaden zurück, und das Template liest den State über Namen.
- `view` ist das kompilierte Template, `props` sind schreibgeschützte Eingaben eines Parents, und `mounted`, `enter` und `leave` sind gewöhnliche Messages, die im richtigen Moment gesendet werden.
- Die Instanz wird von jeder Message geteilt, halte sie also frei von veränderlichem State. Berechne abgeleitete Werte in handlern und speichere sie.
- Namen, die nie Messages sind: `view`, `children`, `routing`, `dispatch`, `_private` und `#private` und was jedes Objekt hat.

Weiter: [Nachrichten und Kindkomponenten](page:concepts-messages).
