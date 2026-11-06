---
summary: Teile eine Seite in Templates auf und setze sie mit import und +Name zusammen. Lerne props, Instanznamen und Message-Präfixe, dynamische embeds mit +{expr}, Children, die nichts rendern, und die Zeile +outlet für geroutete Seiten.
---
## Ein Template, viele Dateien

Eine Seite wächst. Ein Header, eine Karte, eine Tabellenzeile und ein Formularfeld wollen alle einmal geschrieben und an vielen Stellen genutzt werden. In pavlus ist jede `.pavlus`-Datei ein Template, und ein Template kann ein anderes **einbetten** (embed). Das eingebettete Template heißt *Child-view* (oder einfach Child), und das, das es einbettet, ist sein Parent.

Das Einbetten hat zwei Schritte: Du **importierst** den Child am Anfang der Datei und **nutzt** ihn mit einer Zeile, die mit einem Pluszeichen beginnt.

::demo badge

Die erste Zeile, `import Badge from "./badge.pavlus"`, holt den Child unter dem lokalen Namen `Badge` herein. Die Zeile `+Badge#status(label=text)` rendert ihn an dieser Stelle. `label=text` übergibt einen **prop**: Innerhalb von `badge.pavlus` (hier: `span.badge {label}`) hat der State ein Feld `label`, und sein Wert ist der `text` des Parents.

Der Child sieht sonst nichts. Er kennt den State seines Parents nicht, nur die props, die er bekommen hat. Das macht einen Child wiederverwendbar: Seine Eingaben stehen an der Stelle, an der er genutzt wird.

Sieh dir den Schritt an: Wenn sich `text` ändert, kommt ein `text`-Patch heraus, mit der id `1/2`. Die eigenen Knoten-ids des Childs bekommen ein Suffix (`/2`) von der Zeile, die ihn einbettet, damit zwei Instanzen eines Childs nie dieselbe id erzeugen.

## Die Import-Zeile

```pavlus
import Card from "./card.pavlus"
import UserList from "../users/view.pavlus"

section
  +Card#intro(title="Welcome")
```

Alle `import`-Zeilen stehen zuerst, vor jedem Element, in Spalte 0. Der Name muss mit einem Großbuchstaben beginnen. Das sind die Fehler, die der Parser meldet:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
```

Der Großbuchstabe ist die Art, wie das Template eine Komponente von einem Tag unterscheidet: `+Card` kann nur eine importierte Komponente sein. `String`, `Array`, `Map`, `Set` und `Error` werden abgelehnt, weil der generierte Code sie selbst benutzt.

Der Pfad wird so geschrieben, wie ihn dein Bundler auflösen wird. Der Compiler kopiert die Zeile als normalen ES-Import in das generierte Modul (`import Badge from "./badge.pavlus";`, öffne das Modul der Demo oben, um es zu sehen), und das Vite-Plugin kompiliert die importierte Datei auf dieselbe Weise. Ein Child ist ein Modul mit `render` und `diff`, wie es jedes Template ist.

Nutzt du einen Namen, der nicht importiert ist, bekommst du eine Meldung, die sagt, was zu tun ist:

```text
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 2, col 4)
```

## Die embed-Zeile: +Name#id(props)

Die ganze Syntax eines embeds ist:

```text
+Name#instance(prop=value other="text {x}" flag ...spread)
```

- `Name` ist der importierte Name.
- `#instance` ist der **Instanzname**. Bei einem statischen embed ist er optional. Ohne ihn ist der Name der importierte Name mit kleinem Anfangsbuchstaben: `+UserCard` ist `userCard`.
- Die Klammern mit props sind optional.
- Nichts anderes darf in der Zeile folgen, und ein embed kann keine Child-Zeilen haben. Text danach ergibt `Unexpected "x" after component`, und eine eingerückte Zeile darunter ergibt `This line cannot have children`.

Der Instanzname hat drei Aufgaben. Er setzt ein Präfix vor die **Messages** des Childs (siehe unten). Er ist der key des Childs in der `children`-Tabelle der Logik (siehe Ende der Seite). Und er ist es, was der Compiler in den `meta.embeds` des Moduls auflistet.

## Props

Ein prop wird wie ein Attribut geschrieben und hat dieselben Wertformen. Der Unterschied ist, was damit geschieht: Er kommt nicht ins HTML, er wird ein Feld im State des Childs.

::demo props

Lies die drei embeds:

| Wert | Beispiel | Was der Child bekommt |
| --- | --- | --- |
| Text in Anführungszeichen | `kind="static"` | den String |
| Text mit Löchern | `kind="user {user.id}"` | einen String, mit `toText` für jedes Loch |
| ein Ausdruck | `label=user.name`, `count=items.length` | den Wert selbst, mit erhaltenem Typ |
| ein bloßer Name | `active` | `true` |
| ein Spread | `...user` | jedes Feld des Objekts |

Bei einem Ausdruck bleibt der **Typ erhalten**: `count=items.length` gibt dem Child eine Zahl, und `label=user.items` würde ihm das Array selbst geben, keinen Text. Ein String mit Löchern und anderem Text ist immer ein String. Ein prop in Anführungszeichen, der nur aus einem Loch besteht, `kind="{x}"`, ist dasselbe wie `kind=x`: Der Typ bleibt erhalten.

Props werden der Reihe nach geschrieben, und ein späterer gewinnt: Im dritten embed bringt `...user` das `label` („From spread"), und `count=0` ersetzt ein `count`, das der Spread vielleicht hatte. Ein prop, der nicht angegeben ist, ist `undefined`, deshalb beginnt der Titel des dritten Chips mit `: `: `kind` fehlt, und `toText(undefined)` ist leer.

Prop-Namen müssen einfache Bezeichner sein. Ein Name wie `data-x` ist ein Fehler: `"data-x" is not a valid prop name`. Und ein Spread ist nur in einer Komponente erlaubt (`+Name(...x)`); an einem Element ist es `` `...spread` is only allowed in component props ``.

## Wann aktualisiert sich der Child?

Jedes embed bekommt seine eigene Absicherung im `diff` des Parents. Der generierte Code für ein embed mit zwei props:

```ts
if (prev.noteTitle !== next.noteTitle || prev.noteBody !== next.noteBody) {
  patches.push(...Card.diff(
    { "title": prev.noteTitle, "body": prev.noteBody },
    { "title": next.noteTitle, "body": next.noteBody },
    idSuffix + "/2",
    messagePrefix + "note.",
    childEnv(env, "note", next),
  ));
}
```

Der Parent baut die alten und die neuen props aus seinen zwei States und ruft damit das eigene `diff` des Childs auf. Hat sich keiner der von den props gelesenen Namen geändert, wird der Child gar nicht aufgerufen.

::demo child-diff

Im ersten Schritt ändert sich der Text (body), und das `diff` der Karte gibt einen `text`-Patch zurück. Im zweiten Schritt ändert sich nur die Überschrift, und die Karte wird nicht angesehen. Ein Child ist so günstig wie ein Teil des Parent-Templates.

## Messages von einem Child

Die Events eines Childs werden mit dem Instanznamen als Präfix gesendet. Das wurde auf [der Events-Seite](page:syntax-events) erklärt: Der `reset`-Button eines Zählers wird je nach Instanz zu `apples.reset` oder `pears.reset`.

::demo two-instances

Zwei Instanzen desselben `Counter` haben zwei Namen, damit die Anwendung sie unterscheiden kann. Im Schritt ändert sich `pears`. Der prop `value` ändert sich, also kommt der Text-Patch heraus, und auch ein `handler`-Patch, weil sich auch der payload von `reset(value)` geändert hat. Die id in diesem Patch ist bereits `pears.reset`:

```text
{"op":"handler","id":"5/1","event":"click","msg":{"id":"pears.reset","payload":6}}
```

Das Präfix wächst mit jeder Ebene: Ein Child eines Childs ergibt `apples.cell.reset`. Identität innerhalb einer Schleife ist etwas anderes. Der Instanzname ist im Template fest und kann nicht vom Eintrag abhängen, daher unterscheidest du die Instanzen in einer Schleife über den payload:

::demo in-loop

Jede Zeile sendet die Message `row.toggle`, mit der id ihrer Aufgabe als payload. Der handler `"row.toggle"` des Parents erhält diese id. Beachte die id des Klassen-Patches, `0#2/2`: Der Knoten der Zeile (`0`), der key des Eintrags (`#2`) und das embed (`/2`) erscheinen alle darin.

## embeds in if und for

Ein embed ist ein Knoten wie jeder andere. Er kann in `if`, `else`, `for` oder einem anderen Element stehen. Seine Position bestimmen die Zeilen um ihn herum.

::demo in-if

Wird `open` wahr, wird das Panel von Grund auf gerendert und eingefügt. Geht es zurück auf falsch, wird es geleert. Der State des Childs bleibt nicht im DOM: Beim nächsten Mal wird er wieder aus den props gerendert.

## Ein Child, der nichts rendert

Ein Child-Template ist ein normales Template, es kann also nichts zu zeigen haben, zum Beispiel weil sein einziger Knoten ein `if` ist, das falsch ist. Das ist erlaubt. Der Parent hält einen Platz dafür frei, und die anderen Zeilen des Parents werden nicht verschoben.

::demo empty-child

Verfolge die Schritte. Am Anfang gibt es keinen Hinweis auf der Seite, und `After the notice` steht an der richtigen Stelle. Wird `message` zu `Saved`, fügt das `if` des Childs ein `p` an der Stelle des Childs ein (beachte die Marker-ids, die auf `/2` enden). Ändert sich die Meldung, ändert sich nur der Text. Wird sie leer, wird der Hinweis geleert. Der Parent hat nichts Besonderes getan: Die ganze Arbeit steckt im eigenen `diff` des Childs.

## Dynamische embeds: +{expr}

Manchmal ist der Child beim Schreiben des Templates nicht bekannt: eine Tab-Leiste, die pro Tab eine andere view zeigt, ein Widget, das der Nutzer wählt. Etwas, das aus dem State kommt, kannst du nicht importieren, deshalb hat pavlus eine zweite Form, bei der der Child der **Wert eines Ausdrucks** ist:

```pavlus
div.tabs
  +{tab.component}#content(...tab.state)
```

Der Ausdruck liefert eine view oder eine Komponente, die eine `view` hat. Ein dynamisches embed *muss* einen Instanznamen haben (`#content`), weil es keinen importierten Namen gibt, von dem man einen nehmen könnte: `+{tab}(x=1)` ist ein Fehler, `A dynamic component needs an instance name: +{expr}#name(...)`.

Was die Seite tut, wenn sich der Wert ändert:

- der Wert ist **dieselbe view**: Ihr eigenes `diff` läuft, wie bei einem statischen embed;
- der Wert ist **eine andere view**: Der alte Inhalt wird zwischen den beiden Markern geleert, und die neue view wird von Grund auf gerendert. Die beiden Templates werden nie miteinander verglichen;
- der Wert ist `null` oder `undefined`: Das embed rendert nichts.

::demo dynamic-empty

Der letzte Fall ist der Child, der nicht da ist. Das `h2` und das `p` stehen an ihrem Platz, und dazwischen ist nichts. Ist der Wert etwas, das keine view ist (zum Beispiel eine Zahl), wirft `render` `pavlus: +{...} needs a view or a component with a view`.

> [!NOTE] views im State
> Eine view ist ein Objekt mit Funktionen, kein JSON. Der Store behält sie, wie sie ist, aber ein Werkzeug, das den State speichert oder ausgibt, wird sie nicht zeigen. Brauchst du einen State, den du serialisieren kannst, halte einen Namen im State (`tab: "users"`) und wähle mit `if` und `else if`, beide Zweige importiert. Die Form `+{expr}` ist für die Fälle, in denen die Menge der Children offen ist.

## +outlet: die Seite, die die Route wählt

Eine Single-Page-Anwendung hat eine Hülle (einen Header, ein Menü) und in der Mitte die Seite, die die Adresse auswählt. Die Hülle braucht einen Platz für „die Seite". Das ist `+outlet`.

```pavlus
header.shell
  nav
    a(href="/") Home
    a(href="/about") About
main.page
  +outlet
```

`+outlet` nimmt nichts nach sich: Eine Zeile wie `+outlet x` ist ein Fehler. Es rendert den **gerouteten Child** der Komponente, der das Template gehört. Welcher Child das ist, kommt aus der `routing`-Tabelle der Komponente:

```ts shell.ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { component: dashboard, key: "dashboard", name: "dashboard" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

Ein outlet verhält sich wie ein dynamisches embed. Wechselt die Route zu einer anderen Seite, wird die alte Seite zwischen den Markern geleert und die neue gerendert. Bleibt die Route auf derselben Seite, läuft nur das `diff` dieser Seite. Ihre Messages bekommen den Instanznamen als Präfix, wie bei jedem Child: Eine als `dashboard` registrierte Seite sendet `dashboard.something`. Passt kein Eintrag zur Adresse und gibt es keinen `"*"`-Eintrag, ist das outlet leer, wie ein null-Child.

Weil die Route kein Feld ist, das das Template sehen kann, kann der Compiler die Namen, die ein outlet liest, nicht auflisten. Die Knoten darum herum werden bei jeder State-Änderung geprüft, und die Seiten darin überspringen weiterhin, was sich nicht geändert hat. Deshalb sagt der `diff`-Code eines Templates mit outlet `reads: the route and the routed child`.

Das outlet braucht eine Komponente, nicht nur ein Template. Mountest du nur die view, wirft `render` diesen Fehler:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

Aus diesem Grund rendern die Demos dieser Seite kein outlet. [Routing](page:concepts-routing) beschreibt den ganzen Mechanismus.

## Die Logik-Seite eines Childs

Alles oben handelt von Templates. Ein Child-Template kann auch eine Komponente mit eigenen handlern haben. Der Parent deklariert sie in der `children`-Tabelle seiner Komponente, mit demselben Namen, den das Template der Instanz gegeben hat:

```ts dashboard.ts
class Dashboard extends Component<DashboardState> {
  view = dashboardView;
  children: Children<DashboardState> = {
    users: {
      component: usersList,
      key: "users",
      props: (s) => ({ filter: s.filter }),
    },
  };
}
```

und das Template sagt `+UsersList#users(...users filter=filter)`. Merke dir die Regel: `users` im Template, `users` in `children`, `users` im State. Eine Message `users.select` geht an den handler `select` von `usersList`, mit entferntem Präfix. [Komponenten und State](page:concepts-components) erzählt die ganze Geschichte.

## Alles zusammen

Ein Parent, der eine Schleife mit key, eine Bedingung und zwei Arten von Child nutzt. Die Templates `Row` und `Panel` sind die der Demos oben.

```pavlus
import Row from "./row.pavlus"
import Panel from "./panel.pavlus"

section.tasks
  h3 Tasks ({tasks.length})
  ul
    for task in tasks key task.id
      +Row#row(id=task.id title=task.title done=task.done)
  if selected
    +Panel#details(title=selected.title)
  else
    p.muted Select a task
```

Jede `row`-Message trägt die id ihrer Aufgabe, und jede `details`-Message geht an die Logik des Panels. Das Parent-Template enthält keinen einzigen eigenen Event-handler. Es entscheidet nur, welche Children existieren und was jeder erhält.

## Was du gelernt hast

- `import Name from "./file.pavlus"` oben, `+Name#id(props)` dort, wo der Child hingehört; der Child sieht nur seine props.
- Props sind Text in Anführungszeichen, Text mit Löchern, Ausdrücke (mit erhaltenem Typ), bloße Flags oder `...spread`; ein späterer prop gewinnt.
- Der Instanzname setzt ein Präfix vor die Messages des Childs (`pears.reset`) und bindet den Child an die `children` seiner Komponente.
- `+{expr}#id` rendert eine view, die ein Wert ist; ein `null`-Wert, ein leeres Template und ein nicht passendes outlet rendern alle nichts.
- `+outlet` rendert den gerouteten Child der Komponente, der das Template gehört.

Weiter: [Syntax-Referenz](page:syntax-reference).
