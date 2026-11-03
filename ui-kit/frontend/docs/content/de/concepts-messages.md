---
summary: Wie Messages Informationen tragen und wie sie ihre Komponente finden. Message-ids, payloads und das Feld event, wie ein Präfix eine Message an einen Child routet, wie ein Parent seine Kinder startet und beobachtet, dynamische Kinder, die Wrapper mapMessage, mapEffects und compose und ein Parent mit zwei Kindern von Anfang bis Ende.
---
## Was eine Message ist

Eine Message ist die Eingabe deiner Anwendung. Sie ist ein einfaches Objekt mit bis zu drei Feldern:

```ts
interface Message {
  id: string;
  payload?: unknown;
  event?: { type: string; value?: string; checked?: boolean; key?: string };
}
```

- **`id`** sagt, was passiert ist. Sie ist auch der Name des handlers: Die Message `inc` ruft die Methode `inc` auf.
- **`payload`** sind die Daten, die dazugehören. Du wählst sie im Template, oder ein Plugin setzt sie, zum Beispiel die Antwort einer HTTP-Anfrage.
- **`event`** ist eine kurze Zusammenfassung des Browser-Events, vom DOM-Plugin hinzugefügt bei Messages, die von der Seite kommen. Sie enthält den Event-`type` sowie `value`, `checked` und `key`, wenn das Ziel oder das Event sie hat. Es sind Daten, nicht das Browser-Event selbst, daher bleibt eine Message serialisierbar und kann geloggt und wiederholt werden.

Messages, die von anderen Plugins kommen, haben kein `event`. Ein Timer sendet `{ id: "tick" }` oder den `payload`, den du ihm gegeben hast, und eine beendete Anfrage sendet `{ id: "loaded", payload: { status: 200, data } }`.

## Messages in Templates

Ein Template ruft keine Funktionen auf. Ein Event-Attribut benennt eine Message. Der Compiler macht daraus Daten, und `diff` kann handler nach Wert vergleichen.

::demo message-ids

Sieh dir den Abschnitt `vnodes` der Demo an (klappe ihn auf). Der Klick auf das `li` hat `id: "select"`, und der payload ist die id des Nutzers. Der Klick auf den Button hat `id: "remove"` und `"stop": true`, weil der Modifier `.stop` geschrieben wurde. Der Modifier `.prevent` funktioniert genauso. Das sind genau die Objekte, die das DOM-Plugin in Messages umwandelt.

Die Regel für Argumente ist einfach. Ohne Argument hat die Message keinen payload. Mit einem Argument, `select(u.id)`, ist das Argument der payload. Mit mehreren, `move(a, b)`, ist der payload ein Array `[a, b]`. Das Argument ist ein Ausdruck, der beim render des Templates auf den State ausgewertet wird, deshalb übergibst du `u.id` und nicht den ganzen Nutzer: Die id ist klein und stabil.

> [!TIP] Lege die Identität in den payload, den neuen Wert in das event
> Nutze den payload für *welche Sache* (`remove(note.id)`) und `msg.event.value` für *was der Nutzer getippt hat* (`@input=setDraft`). Ein handler liest dann alles andere aus dem State. Er braucht nie das DOM.

## Der handler für eine Message

In einer Klassenkomponente wird die Message-`id` als Methodenname nachgeschlagen. Der handler erhält die Message, den State und einen Kontext mit zwei Funktionen und gibt ein Array von Effekten zurück:

```ts
select(msg: Message, state: UsersState, ctx: ComponentCtx) {
  return [store.set("selectedId", msg.payload)];
}
```

Der Kontext hat `send(child, id, payload?)`, das einen Child nach seinen Effekten fragt, und `setRoute(location)` für das Routing. Beide sind rein: Sie rufen nur andere handler auf und bauen Daten. Eine Message ohne handler gibt keine Effekte zurück. Namen, die nie Messages sind, und die Standard-handler sind in [Komponenten und State](page:concepts-components) aufgeführt.

## Messages für Kinder

Ein Bildschirm besteht oft aus Teilen. Ein Dashboard zeigt eine Liste von Nutzern und eine Liste von Aufgaben, und jeder Teil hat seinen eigenen State und seine eigene Logik. In pavlus ist jeder Teil eine **Child-Komponente**, und der Parent deklariert seine Kinder einmal, mit einem Namen für jedes.

**Ein Name hält alles zusammen.** Der Name `users` erscheint an drei Stellen:

| Wo | Was der Name bewirkt |
| --- | --- |
| Das Template des Parents | `+Users#users(...)` bettet die view des Childs ein. `#users` ist der Instanzname. |
| Die `children` der Parent-Klasse | Der Schlüssel `users` routet die Messages `users.*` an die Child-Komponente. |
| Der State | `state.users` ist der State-Ausschnitt, der zum Child gehört. |

Merke dir die Regel: `users` im Template, `users` in `children`, `users` im State.

### Das Präfix übernimmt das Routing

Eine Message an einen Child hat den Namen des Childs und einen Punkt vor ihrer id. Der Parent entfernt ihn und reicht den Rest weiter:

1. Die Message `users.select` kommt beim Parent an.
2. Der Parent sucht einen eigenen handler namens `users.select` (dazu unten mehr).
3. Die id beginnt mit `users.`, und `users` ist ein Child, also ruft der Parent den Child mit der Message `select` und mit dem State-Ausschnitt des Childs, `state.users`, auf.
4. Der Child antwortet mit Effekten. Seine Effekte werden auf dem Weg nach außen verändert. Ein `store.set("selectedId", 2)` wird zu `store.set("users.selectedId", 2)`, weil der Store-Pfad unter den `key` des Childs gelegt wird. Eine Antwort-id wie `onSuccess: "loaded"` wird zu `"users.loaded"`, damit die Antwort zum selben Child zurückkommt.

Die Felder, die eine Antwort-id tragen, sind `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` und `onChange`. Ein Plugin, das diese Namen nutzt, bekommt das Routing geschenkt.

Auch die andere Richtung ist automatisch. Die Events im Template des Childs werden mit dem Präfix gesendet: Der Klick in `Users`, der `@click=select(u.id)` sagt, kommt beim Parent als `users.select` an. Der Code des Childs schreibt das Präfix nie und kennt seinen eigenen Namen nie. **Der Child sieht den Parent nicht.** Er sieht nur seinen eigenen State, plus die `props`, die der Parent ihm geben wollte.

### Der Parent startet einen Child

Ein Parent muss oft beim Start Arbeit in seinen Kindern anstoßen. `ctx.send(name, id, payload?)` gibt die Effekte des Childs für eine an ihn gesendete Message zurück. Es dispatcht nichts. Es ruft den handler des Childs mit dem richtigen State und Präfix auf und gibt die Effekte zurück, sodass du sie aus deinem eigenen handler zurückgibst:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

Die Effekte sind bereits für den Child umgeschrieben: Ein `set` von `status` ist ein `set` von `users.status`, und die HTTP-Antwort-id ist `users.loaded`. Ist der Name kein Child, wirft `send` `no child "name" to send "id" to`.

### Der Parent beobachtet einen Child

Bevor eine Message an einen Child weitergegeben wird, läuft der **eigene** handler des Parents für dieselbe id. So kann ein Parent beobachten, was in seinen Kindern passiert, über eine Methode mit der vollen id in Anführungszeichen:

```ts
"users.select"(msg: Message, state: DashboardState) {
  const user = state.users.items.find((u) => u.id === msg.payload);
  return [store.set("selectedName", user ? user.name : "")];
}
```

Beide handler laufen für eine Message. Die Effekte des Parents stehen zuerst in der Liste, die des Childs folgen. Erreicht die Message keinen von beiden (kein eigener handler und kein Child), fällt die Komponente auf die Standards zurück, etwa `navigate` in einen Router-Effekt zu verwandeln.

Die Beobachtung ist einseitig. Der Child erfährt nie, dass der Parent hingesehen hat. Muss der Parent den Child *ändern*, tut er das über den State des Childs im Store oder durch Senden einer Message mit `send`.

## Ein Child, vom State gewählt

Manchmal ist der Child nicht fest. Eine Seite zeigt eine Liste oder eine Tabelle, und der Besucher kann umschalten. Ein Child kann ein **Wert im State** sein. Im Template rendert ein dynamisches embed `+{expr}#name(...)` die Komponente, die der Ausdruck liefert. In der Klasse wählt `select` für die Messages dieselbe Komponente, statt `component`:

```ts
children: Children<PageState> = {
  users: { select: (state) => state.usersComponent, key: "users" },
};
```

```pavlus
div.page
  +{usersComponent}#users(...users filter=filter)
```

Ändert sich der Wert in `state.usersComponent`, wird das alte DOM entfernt und das neue Template von Grund auf gerendert. Bleibt er gleich, läuft nur das `diff` des Childs. Gibt `select` `null` oder `undefined` zurück, gibt es in diesem Moment keinen Child: Seine Messages werden ignoriert, und `ctx.send` an ihn gibt keine Effekte zurück.

Beachte, dass der State des Childs der Ausschnitt `state.users` ist und einen Austausch überlebt. Die Message, die die Komponente austauscht, sollte auch den Ausschnitt zurücksetzen. Außerdem ist eine Komponente im State kein JSON, eine serialisierte Historie zeigt sie also nicht. Mache nie ein `store.set` auf einen Pfad *innerhalb* eines Komponentenwerts, denn der Store würde eine Klasseninstanz als einfaches Objekt kopieren und ihren Prototyp verlieren.

## Wrapper: mapMessage, mapEffects, compose

Komponenten sind am Ende Funktionen, `(message, state) => Effect[]`, du kannst sie also umhüllen. Die Wrapper geben einfache Funktionen zurück, die ebenfalls Komponenten sind. Sie werden aus dem Hauptpaket exportiert.

```ts
import {
  compose,
  mapEffects,
  mapMessage,
  namespace,
  toHandler,
  withLogging,
} from "@service-laboratory/pavlus";

const counter = toHandler(new Counter());

const renamed = mapMessage(counter, (msg) =>
  msg.id === "bump" ? { ...msg, id: "inc" } : msg.id === "drop" ? null : msg,
);

const quiet = mapEffects(counter, (effects) =>
  effects.filter((effect) => effect.plugin !== "logger"),
);

const twice = compose(counter, counter);

const nested = namespace("c", counter, { key: "k" });

const logged = withLogging(counter, "counter");
```

- `mapMessage(inner, f)` ändert die Eingabe. `f` erhält die Message und den State und gibt eine Message zurück oder `null`, um sie zu verwerfen. Hier wird `bump` als `inc` behandelt, und `drop` wird ignoriert.
- `mapEffects(inner, f)` ändert die Ausgabe. `f` erhält die Effekte, die Message und den State und gibt die zu verwendenden Effekte zurück. Nutze es, um Effekte zu filtern, hinzuzufügen oder umzuschreiben.
- `compose(a, b, ...)` lässt alle auf dieselbe Message laufen und hängt ihre Effekte aneinander. `twice` oben gibt den `set`-Effekt zweimal zurück.
- `namespace(prefix, child, { key, props })` ist das Primitiv hinter `children`. Nur ids, die mit `c.` beginnen, kommen durch, der Child sieht den Rest, und seine `store`-Pfade und Antwort-ids werden umgeschrieben. Wenn `inc` `store.set("n", state.n + 1)` macht, ist das Ergebnis für `{ id: "c.inc" }` und den State `{ k: { n: 5 } }` `store.set("k.n", 6)`.
- `withLogging(inner, label)` setzt einen `logger`-Effekt mit dem Level `debug` vor die Effekte. Für `inc` mit einem Effekt liest er sich `[counter] inc -> 1 effect(s)`, und die Daten enthalten den payload und die Liste der Effekte als `plugin.type`.

Weil das Funktionen von Funktionen sind, lassen sie sich miteinander und mit Klassen kombinieren: `compose` akzeptiert eine Klasseninstanz und eine Funktion im selben Aufruf.

## Ein Parent mit zwei Kindern, von Anfang bis Ende

Jetzt das ganze Bild. Ein Dashboard hat ein Filter-Eingabefeld, eine Liste von Nutzern und eine Liste von Aufgaben. Die Nutzerliste liest den Filter als prop. Der Parent lädt beide Listen beim Start und merkt sich, wann die Nutzer ankommen und welcher Nutzer ausgewählt ist.

Die Nutzerliste ist ein Template und eine Komponente. Das Template liest die Felder des Child-States und den prop `filter`:

```pavlus users.pavlus
ul.users
  for u in items key u.id
    if !filter || u.name.includes(filter)
      li(class:selected={u.id === selectedId} @click=select(u.id)) {u.name}
```

```ts users.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./users.pavlus";

export interface User {
  id: number;
  name: string;
}

export interface UsersState {
  status: "idle" | "loading" | "failed";
  items: User[];
  selectedId: number;
  filter?: string;
}

export class Users extends Component<UsersState> {
  view = view;

  load() {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: User[] };
    return [store.set("items", reply.data), store.set("status", "idle")];
  }

  failed() {
    return [store.set("status", "failed")];
  }

  select(msg: Message) {
    return [store.set("selectedId", msg.payload)];
  }
}

export const users = new Users();
```

Die Aufgabenliste folgt derselben Idee, mit einer Checkbox:

```pavlus tasks.pavlus
ul.tasks
  for t in items key t.id
    li(class:done=t.done)
      input(type="checkbox" checked=t.done @change=toggle(t.id))
      span {t.title}
```

```ts tasks.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./tasks.pavlus";

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export interface TasksState {
  items: Task[];
}

export class Tasks extends Component<TasksState> {
  view = view;

  load() {
    return [
      http.request({
        id: "tasks",
        url: "/api/tasks",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: Task[] };
    return [store.set("items", reply.data)];
  }

  toggle(msg: Message, state: TasksState) {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [store.set("items", items)];
  }
}

export const tasks = new Tasks();
```

Der Parent deklariert beide Kinder in `children` und bettet beide in sein Template ein. Die Demo unten nutzt genau diese Child-Templates. Ihre drei Schritte ändern jeweils einen Ausschnitt. Sieh dir die ids der Patches an: `3/2#2` bedeutet Knoten 3 des Child-Templates, innerhalb des embeds mit der id 2 des Parents, für den Listeneintrag mit dem key 2. Jeder Child hat seine eigenen ids, die Patches kollidieren also nie.

::demo dashboard

Das Parent-Template (das in der Demo) wird als `dashboard.pavlus` gespeichert. Es folgt der Namensregel: `#users` und `#tasks` sind die Schlüssel von `children` und die Felder des State. Der Spread `...users` gibt den Ausschnitt des Childs weiter, und `filter=filter` fügt das Eingabefeld hinzu. Die Events des Eingabefelds gehören dem Parent und haben kein Präfix, während die Events innerhalb der Kinder als `users.select` und `tasks.toggle` herauskommen.

```ts dashboard.ts
import {
  Component,
  type Children,
  type ComponentCtx,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { tasks, type TasksState } from "./tasks.ts";
import { users, type UsersState } from "./users.ts";
import view from "./dashboard.pavlus";

export interface DashboardState {
  filter: string;
  users: UsersState;
  tasks: TasksState;
  selectedName: string;
  usersLoaded: number;
}

export class Dashboard extends Component<DashboardState> {
  view = view;

  children: Children<DashboardState> = {
    users: {
      component: users,
      key: "users",
      props: (state) => ({ filter: state.filter }),
    },
    tasks: { component: tasks, key: "tasks" },
  };

  mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
    return [...send("users", "load"), ...send("tasks", "load")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.event?.value ?? "")];
  }

  "users.select"(msg: Message, state: DashboardState) {
    const user = state.users.items.find((u) => u.id === msg.payload);
    return [store.set("selectedName", user ? user.name : "")];
  }

  "users.loaded"(_msg: Message, state: DashboardState) {
    return [store.set("usersLoaded", state.usersLoaded + 1)];
  }
}

export const dashboard = new Dashboard();
```

Mit einem Fake-HTTP-Plugin, das sofort antwortet, läuft es Message für Message so ab:

```text
mounted       -> store.set, http.request, http.request
users.loaded  -> store.set, store.set, store.set
tasks.loaded  -> store.set
```

Die Message `mounted` wird vom Parent behandelt. Er gibt das `set` von `users.status` und die zwei Anfragen zurück, bereits mit Präfix für ihre Kinder. Dann kommen die zwei Antworten als `users.loaded` und `tasks.loaded` an, jede in ihrer eigenen Runde. Für `users.loaded` läuft zuerst der eigene handler des Parents, ein `set` für `usersLoaded`, und das `loaded` des Childs folgt mit zwei weiteren. Alle drei `set`-Effekte stehen im selben Schritt. Keiner der Kinder weiß vom anderen.

> [!WARNING] Halte die drei Namen gleich
> Ist der Schlüssel in `children` `users`, das Template sagt aber `#user`, kommt der Klick als `user.select` an, kein Child hat diesen Namen, und die Message bewirkt nichts. Es gibt keinen Fehler, weil eine Message, die niemand behandelt, kein Fehler ist. Wenn ein Child tot wirkt, vergleiche zuerst die drei Namen.

## Was du gelernt hast

- Eine Message ist `{ id, payload?, event? }`. Das Template erzeugt id und payload, das DOM-Plugin fügt `event` hinzu, und ein Argument ist der payload, während mehrere ein Array ergeben.
- Derselbe Name bindet das Template-embed (`#users`), den `children`-Schlüssel und den State-Ausschnitt. Das Präfix `users.` routet eine Message an den Child, der sie ohne Präfix sieht.
- Die Effekte des Childs werden auf dem Weg nach außen umgeschrieben: Store-Pfade bekommen den `key`, Antwort-ids das Präfix. Der Child sieht seinen Parent nie.
- Ein Parent startet einen Child mit `ctx.send` und beobachtet ihn mit einem handler in Anführungszeichen wie `"users.select"`, der vor dem Child läuft. Ein mit `select` gewählter Child, der `null` zurückgibt, wird ignoriert.
- `mapMessage`, `mapEffects`, `compose`, `namespace` und `withLogging` umhüllen Komponenten und geben Funktionen zurück.

Weiter: [Routing](page:concepts-routing).
