---
summary: Verbinde Klicks, Tippen und Formular-Submits mit deinem Code. Lerne die Syntax @event=message(args), payloads, die Modifier prevent und stop, wie eine Message ihre id bekommt und was das kompilierte Template wirklich enthält.
---
## Events sind Daten

Eine Seite, die nur Werte zeigt, ist ein Dokument. Damit sie interaktiv wird, muss das Template sagen: „Wenn der Nutzer das tut, sag es der Anwendung." In pavlus geschieht das mit einem **Event-Binding**, und was gesendet wird, ist keine Funktion. Es ist eine *Message*: ein kleines Stück einfacher Daten mit einer id und einem optionalen payload.

Ein Event-Binding ist ein Attribut, dessen Name mit `@` beginnt. Der Teil nach dem `@` ist das DOM-Event (`click`, `input`, `submit`, `keydown`, ...). Der Wert ist die id der Message, die gesendet werden soll.

::demo click open=vnodes

Sieh dir die vnodes an: Das Button-Element im Ergebnis von `render` enthält `events: { click: { id: "save" } }`. Es steckt keine Funktion darin. Das Template weiß nicht, was `save` tut. Es sagt nur, welche Message der Klick bedeutet. Deine Anwendung hat einen handler für `save` und entscheidet, was sich im State ändert.

Dieses Design hat einen Grund. Ein virtueller Knoten, der nur aus Daten besteht, kann verglichen, geloggt, aufgezeichnet und wiederholt werden. Das Template bleibt eine reine Funktion des State, und die ganze Logik bleibt an einem Ort, in den Komponenten, wo sie leicht zu testen ist.

## Mit der Message einen Wert senden

Die meisten Events müssen sagen, *welche* Sache angeklickt wurde. Das Binding kann wie ein Aufruf mit **Argumenten** aussehen. Die Argumente sind gewöhnliche [Ausdrücke](page:syntax-expressions), die beim render des Templates auf den State ausgewertet werden. Das Ergebnis reist mit der Message als ihr **payload**.

::demo payload open=vnodes

Der Remove-Button trägt `{ id: "remove", payload: 1 }`: den Wert von `item.id` zum Zeitpunkt des render. Wenn der Nutzer klickt, erhält der handler für `remove` diesen payload und weiß, welchen Eintrag er löschen muss.

Sieh dir den ersten Schritt an. Wenn `item.id` von 1 auf 2 wechselt, gibt `diff` einen Patch mit der Operation `handler` zurück:

```text
{"op":"handler","id":"3","event":"click","msg":{"id":"remove","payload":2}}
```

Der Listener sitzt schon am echten DOM-Element. Der Patch ersetzt nur die Message, die der Listener senden wird. Im zweiten Schritt ändert sich der Titel, der payload nicht, und der einzige Patch ist der Text-Patch.

### Mehrere Argumente

Bei einem Argument ist der payload dieser Wert. Bei zwei oder mehr ist der payload ein **Array** davon, der Reihe nach.

::demo several-args

Der payload ist hier `[5, "up", 1]`. Ohne Argumente oder mit leeren Klammern gibt es gar keinen payload, also sind `@click=save` und `@click=save()` dasselbe.

::demo empty-parens

> [!NOTE] Ein Wert oder ein Array
> Die Form des payload hängt davon ab, wie viele Argumente du geschrieben hast: Ein Argument ergibt diesen Wert, zwei oder mehr ergeben ein Array. Wenn du später ein zweites Argument hinzufügen willst, denke daran, dass der handler von `msg.payload` auf `msg.payload[0]` umgestellt werden muss. Viele Autoren senden aus diesem Grund einen einzelnen Wert oder ein einzelnes Objekt, das im State gebaut wird.

## Was als handler geschrieben werden darf

Der Teil vor den Klammern ist eine **Message-id**. Sie ist ein Name oder durch Punkte verbundene Namen:

::demo dotted

Hier ist die id `users.open`. Eine id mit Punkten ist nützlich, um Messages zu gruppieren, und sie lässt das Präfix von Komponenten funktionieren (siehe unten).

Der Compiler akzeptiert nur einen Namen oder eine Kette von Namen, optional gefolgt von einem Aufruf. Alles andere ist ein Fehler:

```pavlus-invalid
button(@click=ready ? start : stop) Go
```

Dieses scheitert im Attribut-Parser: `Unexpected "?" in attributes (line 1, col 21)`, weil ein bloßer Wert beim ersten Leerzeichen endet. In geschweifte Klammern gesetzt, erreicht es die nächste Prüfung, mit dieser Meldung:

```pavlus-invalid
button(@click={ready ? start : stop}) Go
```

```text
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

Dieselbe Meldung erscheint bei `@click=items[0]` und bei einem Aufruf eines Aufrufs, `a.b(1)(2)`. Ein Binding ganz ohne Wert, `button(@click)`, sagt `"@click" needs an expression value`.

## Modifier: prevent und stop

Der Browser tut manches von selbst. Ein Klick auf einen Link folgt dem Link. Ein Submit eines Formulars lädt die Seite neu. Ein Klick steigt außerdem zu den Parents des Elements auf, und deren handler laufen auch. Oft willst du das abschalten.

Das geht mit **Modifiern**, geschrieben nach dem Event-Namen, getrennt durch Punkte:

| Modifier | Was er tut |
| --- | --- |
| `.prevent` | ruft `preventDefault()` auf dem DOM-Event auf: Der Link wird nicht verfolgt, das Formular wird nicht abgeschickt |
| `.stop` | ruft `stopPropagation()` auf: Die Listener der Parents sehen das Event nicht |

Sie lassen sich in beliebiger Reihenfolge kombinieren: `@click.prevent.stop=openHelp`.

::demo modifiers open=vnodes

Sieh dir die vnodes an. Die Modifier sind nicht Teil des Event-Namens. Sie sind zwei Flags an der Message, `prevent: true` und `stop: true`. Das DOM-Plugin liest sie, wenn das Event eintritt, ruft die DOM-Methode auf und sendet erst dann die Message. Auch hier bleibt die Seite also reine Daten.

Ein Modifier, den der Compiler nicht kennt, wird stillschweigend ignoriert: `@click.foo=save` ist dasselbe wie `@click=save`. Prüfe die Schreibweise von `.prevent`, wenn ein Formular die Seite trotzdem neu lädt.

> [!WARNING] Mehrere Bindings für dasselbe Event
> Ein Element kann viele verschiedene Events haben (`@input`, `@keydown`, `@focus`), aber nur ein Binding pro Event-Namen. Schreibst du `@click` zweimal am selben Element, gewinnt das letzte, und das erste wird ohne Fehler verworfen.

::demo many-events

## Was der handler erhält

Wenn der Nutzer klickt, sendet das DOM-Plugin deiner Anwendung ein Message-Objekt mit drei Feldern:

| Feld | Wert |
| --- | --- |
| `id` | die Message-id, mit dem Präfix der eingebetteten Komponenten davor |
| `payload` | der payload aus dem Template oder `undefined` |
| `event` | ein kleiner Schnappschuss des DOM-Events |

Der Schnappschuss, `msg.event`, ist die einzige Stelle, an der der Browser in deine Logik durchsickert, und er ist absichtlich klein: `type` (der Event-Name), `value` (der `value` des Elements, wenn er ein String ist), `checked` (für Checkboxen) und `key` (für Tastatur-Events). Das reicht für Formulare.

Eine Komponente ist eine Klasse. **Jede Methode ist ein handler für die Message mit demselben Namen.** Ein handler ist rein: Er erhält die Message und den aktuellen State und gibt eine Liste von Effekten zurück, zum Beispiel „setze diesen Pfad im Store".

```ts todo.ts
import {
  Component,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./todo.pavlus";

interface State {
  text: string;
  tasks: { id: number; title: string }[];
}

class Todo extends Component<State> {
  view = view;

  setText(msg: Message) {
    return [store.set("text", msg.event?.value ?? "")];
  }

  remove(msg: Message, state: State) {
    return [
      store.set(
        "tasks",
        state.tasks.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}
```

Das Template dieser Komponente hat `input(value=text @input=setText)` und `button(@click=remove(task.id))`. Die Namen stimmen mit den Methodennamen überein. Eine Message ohne Methode ist kein Fehler: Es passiert nichts, und es werden keine Effekte zurückgegeben. Dadurch bleibt ein Tippfehler in einer Message-id still, teste deine Seite also durch Anklicken.

Der State, der im Eingabefeld gezeigt wird, ist nur ein Startwert. Der Browser behält, was der Nutzer getippt hat. Der `@input`-handler kopiert es in den State, und der State hält den Rest der Anwendung aktuell.

## Events in Schleifen

Events innerhalb einer `for`-Schleife sind der häufigste Fall. Der payload sagt dem handler, welcher Eintrag angeklickt wurde.

::demo in-loop open=vnodes

Jede Aufgabe hat ihr eigenes Paar Buttons, und der payload jedes Buttons ist die `id` seiner Aufgabe: 10 für die erste und 20 für die zweite. Es gibt einen handler für `toggle`, nicht eine Funktion pro Zeile, und er funktioniert für beliebig viele Zeilen. Das `.stop` am zweiten Button hält den Klick davon ab, das Listenelement zu erreichen, falls das Element einen eigenen handler hätte.

Warum `task.id` und nicht die Position der Aufgabe in der Liste? Wenn sich die Liste ändert, ändern sich die Positionen, die ids aber nicht. Eine Message, die die id trägt, meint immer dieselbe Aufgabe. Siehe auch die [nächste Seite](page:syntax-control-flow) zum `key`.

## Woher die Message-id ihr Präfix bekommt

Wenn ein Template mit `+Name#instance` in ein anderes eingebettet wird, ist das eingebettete Template eine eigene Datei mit eigenen Messages: Es sagt `@click=pick(id)` und weiß nicht, wer es nutzen wird. Der Parent gibt jeder eingebetteten Instanz einen **Namen**, und der Compiler setzt diesen Namen und einen Punkt vor jede Message-id, die daraus kommt.

::demo with-component open=vnodes

Das `Row`-Template sendet `pick`. Die zwei Instanzen heißen `first` und `second`, also sind die Messages `first.pick` und `second.pick`. Der `Reset`-Button gehört dem Parent und hat kein Präfix. Das generierte Modul zeigt, wie es funktioniert:

```ts
ulChildren.push(...Row.render(
  { "id": 1, "label": "One" },
  idSuffix + "/1",
  messagePrefix + "first.",
  childEnv(env, "first", state),
));
```

Jede kompilierte view hat einen Parameter `messagePrefix`. Eine view auf oberster Ebene bekommt einen leeren. Ein embed übergibt `messagePrefix + "first."`, und jedes Event wird als `id: messagePrefix + "pick"` geschrieben. Würde `Row` selbst etwas einbetten, wüchse das Präfix um einen weiteren Namen: `first.cell.pick`. Der Child braucht kein Wissen über seine Parents, daher kann dasselbe Template überall platziert werden.

Schreibst du kein `#name`, ist der Name der importierte Name mit kleinem Anfangsbuchstaben:

::demo default-name

Das erste embed sendet `userCard.open`, das zweite, mit `#admin`, sendet `admin.open`. Nutze einen ausdrücklichen Namen für jedes Template, das du mehr als einmal einbettest, damit sich die Messages der Instanzen unterscheiden lassen.

Auf der Anwendungsseite wird das Präfix genutzt, um Messages an die richtige Child-Komponente zu senden und dem Parent die Möglichkeit zu geben, die Messages seiner Kinder mit einem handler mit Namen in Anführungszeichen zu beobachten, etwa `"first.pick"(msg) { ... }`. Das ist in [Komponenten](page:concepts-components) und [Nachrichten](page:concepts-messages) beschrieben.

## Was gleich bleibt und was sich ändert

Vergleiche zwei Dinge, die du auf dieser Seite gesehen hast. Ein Binding ohne Argumente (`@click=save`) hat im vnode keine `id` an seinem Element, weil sich daran nie etwas ändern kann, sodass `diff` es nie finden muss.

::demo static-event

Wenn sich `busy` ändert, entsteht nur der Klassen-Patch. Das Event-Binding wird nicht angesehen. Ein Binding mit Argumenten ist anders: Der Compiler merkt sich die id des Elements und gibt, wenn `diff` einen anderen payload findet, einen `handler`-Patch aus. Ein Knoten, dessen Bindings, Attribute und Text sich nicht ändern können, kostet beim Update nichts.

## Alles zusammen

Eine kleine Liste mit einem Eingabefeld, die nutzt, was du gesehen hast. Das Template ist das folgende, und dieselbe Form kannst du im [Live-Playground](page:compiler-playground) ausprobieren:

```pavlus
section.todo
  form(@submit.prevent=add)
    input(type="text" placeholder="New task" value=text @input=setText)
    button(type="submit") Add
  ul
    for task in tasks key task.id
      li(class:done=task.done)
        input(type="checkbox" checked={task.done} @change=toggle(task.id))
        span {task.title}
        button(type="button" @click.stop=remove(task.id)) x
```

Lies die Events von oben:

- `@submit.prevent=add` hält den Browser davon ab, die Seite neu zu laden, und sendet dann `add`. Der handler liest den Text aus dem State, weil `@input=setText` ihn mit jeder Taste dorthin kopiert hat.
- `@input=setText` sendet `setText` mit `msg.event.value`.
- `@change=toggle(task.id)` sendet `toggle` mit der id der Aufgabe. Der handler kann auch `msg.event.checked` lesen.
- `@click.stop=remove(task.id)` sendet `remove` mit der id und hält den Klick vom Aufsteigen ab.

Es gibt vier Message-ids und drei payloads, und keine einzige Funktion im Template.

## Was du gelernt hast

- `@event=name(args)` sendet eine Message, keine Funktion. Ein Argument ist der payload, mehrere Argumente ergeben ein Array, keines ergibt keinen payload.
- `.prevent` und `.stop` sind Flags an der Message; das DOM-Plugin wendet sie an und sendet dann die Message.
- Ein handler ist eine Komponentenmethode, benannt nach der Message-id; er erhält `msg.id`, `msg.payload` und ein kleines `msg.event` (`type`, `value`, `checked`, `key`).
- Ein eingebettetes Template sendet seine Messages mit dem Instanznamen als Präfix: `first.pick`.
- Ändert sich ein payload, gibt `diff` einen `handler`-Patch zurück; ein Binding ohne Argumente wird nie gepatcht.

Weiter: [Bedingungen und Schleifen](page:syntax-control-flow).
