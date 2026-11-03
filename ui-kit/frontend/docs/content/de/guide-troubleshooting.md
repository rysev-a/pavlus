---
summary: Echte Probleme und ihre Lösungen. Template-Fehler mit den genauen Meldungen, die häufigen Fehler (Anführungszeichen, fehlende keys, Mutation, handler, die nichts zurückgeben), Probleme bei Setup und Deployment, wie du mit dem Logger und dem Compiler debuggst, und eine Liste häufiger Fragen.
---
## Wie du ein Problem liest

Probleme in einer pavlus-Anwendung kommen aus drei Quellen, und jede zeigt sich auf andere Weise.

- **Ein Template kompiliert nicht.** Der Fehler kommt zur Build-Zeit vom Vite-Plugin, mit dem Pfad der Datei und einer Position: `(line 3, col 5)`. Zeilen und Spalten beginnen bei 1.
- **Die Anwendung wirft zur Laufzeit.** Die Meldung beginnt mit `pavlus:` (oder `pavlus/dom:`, `pavlus/ssr:`, `pavlus/ws:`) und sagt, was falsch ist, und meistens auch, was zu tun ist. Sie steht in der Browser-Konsole.
- **Nichts passiert.** Es gibt gar keine Meldung. Das sind die schwierigsten Fälle, und der größte Teil dieser Seite handelt von ihnen. Die Regel zum Merken: Eine Message, die niemand behandelt, ist kein Fehler, sondern eine leere Liste von Effekten.

Wenn du nicht weiterkommst, geh diese Liste der Reihe nach durch. Sie findet fast jedes „Nichts passiert".

1. Öffne die Konsole. Gibt es einen Fehler `pavlus:`?
2. Stimmt der Name der Message? Logge jeden Schritt (siehe „Debugging" unten) und suche die Message, die du erwartest.
3. Hat der handler den Effekt zurückgegeben, den du erwartest?
4. Ist das Plugin für diesen Effekt in `createApp({ plugins })` registriert?
5. Hat sich der State geändert? Sieh in der Entwicklung auf `pavlus.store.getState()`.
6. Liest das Template dieses Feld? Ein Knoten, der ein Feld nicht liest, ändert sich nie, wenn sich das Feld ändert.

## Template-Fehler

Der Compiler hält beim ersten Fehler an. Das sind die echten Meldungen, erzeugt, indem die Templates durch `compileTemplate` laufen. Vite zeigt sie mit dem Pfad der Datei davor.

| Du hast geschrieben | Die Meldung beginnt mit | Die Lösung |
| --- | --- | --- |
| Einen Tab in der Einrückung | Tabs are not allowed | Rücke mit Leerzeichen ein. Zwei sind die Konvention. |
| Eine Zeile mit 4 unter einem Parent und die nächste mit 2 | Inconsistent indentation | Jede Ebene muss dieselbe Schrittweite benutzen. |
| `a(href=url` | Unclosed ( | Schließe die Attributliste. |
| `p Hello {name` | Unclosed { | Schließe den Ausdruck, oder schreibe `\{` für eine wörtliche Klammer. |
| `p(title="abc) x` | Unterminated string | Schließe das Anführungszeichen. |
| `p {items.map(x => x)}` | Unexpected character "=" | Keine Pfeilfunktionen. Berechne den Wert im handler. |
| `p {a = 1}` | Unexpected character "=" | Ein Ausdruck liest; er weist nie zu. |
| Ein Template-Literal in geschweiften Klammern | Unexpected character | Keine Template-Literale. Nutze `"a " + b`. |
| `button(@click) Go` | "@click" needs an expression value | Schreibe `@click=save`. |
| `button(@click=1+2) Go` | Event handler must be a message id | Ein Event ist eine Message-id, optional mit Argumenten. |
| Ein `else` ohne `if` darüber | else without matching if | Setze `else` direkt hinter den `if`-Block, mit derselben Einrückung. |
| `+Row#r(a=1)` ohne import | "Row" is not imported | Füge oben die Zeile `import Row from "..."` hinzu. |
| Ein `import` unter dem ersten Element | import lines must be at the top of the file | Verschiebe ihn. |
| `import row from "..."` | cannot be used as a component name | Eine Komponente beginnt mit einem Großbuchstaben. |
| `+outlet(a=1)` | +outlet takes nothing after it | Schreibe `+outlet` und sonst nichts. |
| Ein Kind unter einer Textzeile (eine Zeile, die mit einem Pipe-Zeichen beginnt) | This line cannot have children | Nur Elemente haben Kinder. |
| `p {}` | Empty expression | Setze etwas zwischen die Klammern. |

Und der genaue Text jeder Meldung, zum Suchen:

```text
Tabs are not allowed, use spaces (line 2, col 1)
Inconsistent indentation (line 3, col 1)
Unclosed ( (line 1, col 2)
Unclosed { (line 1, col 7)
Unterminated string (line 1, col 9)
Unexpected character "=" (line 1, col 16)
Unexpected character "`" (line 1, col 4)
"@click" needs an expression value (line 1, col 8)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
"Row" is not imported. Add `import Row from "..."` or use +{Row} for a component that comes from the state (line 1, col 2)
`import` lines must be at the top of the file (line 2, col 1)
"row" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
`+outlet` takes nothing after it (line 1, col 8)
This line cannot have children (line 2, col 1)
Empty expression (line 1, col 4)
```

Zwei Templates, die falsch aussehen, werden akzeptiert, und das ist ein Fehler des Schreibenden, nicht des Compilers: `if` ohne etwas dahinter und `for x todos` (ohne `in`) passen nicht auf die Schlüsselwörter, deshalb wird jedes als **Element** namens `if` oder `for` gelesen. Die Seite zeigt `<if>` im DOM. Erscheint ein Element mit so einem Namen, prüfe die Zeile.

## Anführungszeichen entscheiden, was ein Wert ist

Das ist der häufigste erste Fehler. `href="url"` ist der Text `url`. `href=url` ist das Feld `url` des States. Beides ist gültig, der Compiler kann also nicht warnen.

::demo quotes-text

::demo quotes-expression

Die erste Demo hat den Link `href="url"`, einen einfachen String, egal was der State ist. Die zweite liest den State: Ihr HTML hat die Adresse, und wenn sich `url` ändert, ist es ein einziger `attr`-Patch. Geht ein Link nach `/url` oder zeigt ein Attribut den Namen eines Felds, suche nach fehlenden Klammern und unerwünschten Anführungszeichen. Text in einem Template ist das Gegenteil: `p Hello, name` ist der Text `name`, und `p Hello, {name}` liest das Feld.

Um eine Klammer als Text zu zeigen, escape sie:

::demo braces

## Ein `for` ohne `key`

`key` ist optional. Ohne ihn ist der **Index** des Elements seine Identität. Die Seite funktioniert, aber das Entfernen eines Elements am Anfang sieht aus wie eine Änderung jedes Elements danach. Vergleiche die Patches derselben Änderung, dem Entfernen des ersten von drei Personen.

::demo keyed

::demo unkeyed

Mit `key person.id` ist der Patch ein einziges `remove` des Blocks von Ann. Ohne den key wird der letzte Block entfernt, und der Text der beiden übrigen wird **neu geschrieben** (`Bob` kommt in den ersten Block, `Eve` in den zweiten). Bei Text ist das Ergebnis dasselbe. Bei allem, was ein Eigenleben hat, nicht: Ein Eingabefeld, in das der Besucher getippt hat, ein Fokus, eine Scrollposition, eine laufende CSS-Animation bleibt an ihrer Position in der Liste, statt mit dem Element zu wandern. Gib einer Liste einen key, wann immer Elemente eingefügt, entfernt oder umsortiert werden können.

## Den State mutieren

Das kompilierte `diff` vergleicht mit `===`. Änderst du ein Array an Ort und Stelle, hält der nächste State dasselbe Array, der Vergleich sagt „nichts hat sich geändert", und nichts wird gepatcht. Der Store hat dieselbe Regel: `store.set` mit demselben Wert zeichnet nichts auf.

::demo mutation

Im ersten Schritt wurde das Array mit `push` geändert und erneut übergeben. Die Patch-Liste ist leer, obwohl das Array eine dritte Person hat. Im zweiten Schritt wird ein neues Array übergeben, und das diff fügt das Element ein. In einem handler heißt das:

```ts
// wrong: the same array, the page does not change
state.items.push(todo);
return [store.set("items", state.items)];

// right: a new array
return [store.set("items", [...state.items, todo])];
```

Dasselbe gilt für Objekte (`{ ...todo, done: true }`) und für das `.sort()` eines Arrays (sortiere eine Kopie). TypeScript hilft, wenn du den State mit `readonly`-Feldern und `ReadonlyArray` deklarierst.

## Probleme mit handlern

**Der handler gibt etwas anderes als ein Array zurück.** Dieser Fall hat eine klare Meldung:

```text
pavlus: handler "add" must return an array of effects
```

Die übliche Ursache ist `return store.set("a", 1)` statt `return [store.set("a", 1)]`. Ein handler, der nichts zu tun hat, gibt `[]` zurück.

**Der handler wird nicht gefunden.** Dieser Fall hat keine Meldung. Ein Klick auf `@click=remvoe(todo.id)` sendet die Message `remvoe`, niemand behandelt sie, und das Ergebnis ist eine leere Liste von Effekten. Tippfehler im Namen, ein handler, der `_private` ist (Namen, die mit `_` beginnen, und `#`-Mitglieder sind nie Messages): Alles ergibt Stille. Um das zu finden, logge jeden Schritt mit der Option `onStep` von `createApp`:

```ts
const app = createApp({
  app: shell,
  plugins,
  onStep: (message, effects) => {
    if (effects.length === 0) console.debug(`${message.id}: no effects`);
  },
});
```

Hier ist seine Ausgabe bei einem Zähler, der `inc` behandelt und dem `incc` gesendet wird:

```text
inc -> 1 effect(s)
incc -> 0 effect(s)  <- nobody handled it?
```

Manche Messages haben legitim keine Effekte (ein Klick, der nur in einem Parent zählt), lies die Liste also, statt jede Zeile als Bug zu behandeln.

**Die id einer Child-Message ist falsch.** Ein Event eines Childs, der als `+Row#row` eingebettet ist, wird als `row.select` gesendet. Der Parent behandelt es mit einem Methodennamen in Anführungszeichen: `"row.select"(msg) { ... }`. Ein handler namens `select` im Parent erhält es nie. Bei einem verschachtelten Child werden die ids verbunden: `grid.card.add`.

**`ctx.send` an einen Child, den es nicht gibt,** wirft: `pavlus: no child "nope" to send "x" to`.

**Eine Klasse statt einer Instanz.** `createApp({ app: Todos })` wird abgelehnt mit `pavlus: Todos is a class: pass an instance (new Todos()), not the class`. Ein einfaches Objekt wird ebenfalls abgelehnt: `pavlus: a component is a function or an instance of a class extending Component, got a plain object (defineComponent is gone: write a class that extends Component)`.

**`store.set` mit einem falschen Pfad** schlägt nicht fehl. Es legt die fehlenden Eltern an, ein Tippfehler (`"itemz"`) erzeugt also ein neues Feld, und das Template, das `items` liest, ändert sich nicht. Sieh dir den State in der Konsole an und den Verlauf.

## Probleme bei Setup und Plugins

Diese werden geworfen, wenn die Anwendung startet oder wenn ein Effekt ausgeführt wird. Jede nennt ihre Lösung.

```text
pavlus: no plugin "http" for effect "request"
pavlus: duplicate plugin "store"
pavlus: `mount` needs the dom plugin (createDomPlugin)
pavlus/dom: target "#nope" not found
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
pavlus/ws: no connection "chat"
pavlus: more than 10000 messages in one tick (message loop?)
```

- **no plugin** bedeutet, dass ein handler einen Effekt für ein Plugin zurückgegeben hat, das nicht in der Liste steht. Registriere es, oder du hast den Namen des Plugins falsch geschrieben.
- **target not found** bedeutet, dass das Element für `mount` nicht in der `index.html` steht oder das Skript lief, bevor es da war. Setze das Skript ans Ende von `<body>` oder nutze `type="module"`, was verzögert wird.
- **two children named** ist eine Routing-Tabelle mit zwei Einträgen, die auf dasselbe Segment enden. Die Seite über [Routing](page:concepts-routing) erklärt `name`.
- **+outlet needs a component** bedeutet, dass eine view mit outlet ohne ihre Komponente gemountet wurde. Mounte die Komponente, nicht `component.view`.
- **message loop** bedeutet, dass handler einander immer wieder antworten. Der übliche Fall ist eine Message von einem Plugin (eine Antwort), die ein handler behandelt, der die Anfrage erneut sendet.
- **ws: no connection** bedeutet ein `send` vor der Message `onOpen` oder nachdem der Socket geschlossen wurde.

### Typen: `Cannot find module './page.pavlus'`

TypeScript kennt die `*.pavlus`-Dateien nicht. Die Deklaration steckt im Framework, und dein Projekt muss sie einbinden. In `src/env.d.ts`:

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@service-laboratory/pavlus/env" />
```

Ohne die Zeile `pavlus/env` gibt jeder Template-Import diesen Fehler. Ein Projekt mit beiden Zeilen kompiliert sauber:

```text
src/app.ts(2,23): error TS2307: Cannot find module './about.pavlus' or its corresponding type declarations.
```

### `?raw`-Importe

Manchmal willst du den **Text** eines Templates, nicht das kompilierte Modul. Das ui-kit macht das für seinen Tab Source: Er zeigt das Template, die Logik und die Styles jeder Seite. Das Suffix `?raw` von Vite liefert die Datei als String, und das pavlus-Plugin lässt Importe mit `?raw`, `?url` und `?inline` in Ruhe:

```ts
import source from "./about.pavlus?raw";
import view from "./about.pavlus";
```

In einem Test ausgeführt, ist der erste der Text, `section.about\n  h1 About\n  p A todo list`, und der zweite die view mit `render`, `diff` und `meta`. Eine Sache geht schief. Die Deklaration `pavlus/env` deckt `*.pavlus` ab, nicht `*.pavlus?raw`, ohne `/// <reference types="vite/client" />` sagt TypeScript also `Cannot find module './about.pavlus?raw'`.

Für einen ganzen Ordner liefert `import.meta.glob` mit den Optionen `{ query: "?raw", import: "default" }` eine Tabelle von Lazy-Loadern, einen Chunk pro Datei, so macht es das Source-Plugin des ui-kit.

## Ein 404 auf einem statischen Host

Alles funktioniert mit `npm run dev`, und auf der veröffentlichten Site funktioniert ein Klick auf einen Link, aber ein Neuladen ergibt „404 Not Found". Oder die Site liegt unter `/pavlus/`, und jede Seite sagt „Page not found".

- **Das Neuladen ergibt einen 404.** Ein statischer Host sucht an diesem Pfad nach einer Datei. Eine Single-Page-Anwendung hat nur `index.html`. Lass den Host jeden unbekannten Pfad mit `index.html` beantworten. Auf GitHub Pages, wo du die Regeln nicht ändern kannst, kopiere `index.html` zur Build-Zeit nach `404.html`; das ui-kit macht das mit einem winzigen Vite-Plugin. Der Code steht unter [Routing](page:concepts-routing).
- **„Page not found" unter einem Präfix.** Der Router sieht `/pavlus/button`, und kein Muster passt darauf. Gib dem Router-Plugin ein `window`, das das Präfix verbirgt (`windowAt(root)` im ui-kit), und baue die `href`s damit. Setze außerdem `base` in der Vite-Konfiguration, damit Skripte und Styles von `/pavlus/assets/...` angefordert werden und nicht von `/assets/...`.
- **Bilder und Icons ergeben 404.** Nutze in `index.html` `%BASE_URL%favicon.svg` und im Code `import.meta.env.BASE_URL`.

## Debugging

### Logge, was passiert

Das Logger-Plugin gibt Einträge aus. Es weiß nicht, was passiert ist, du musst also danach fragen. `withLogging(component, label)` fragt nach jeder Message einer Komponente und ist der schnellste Weg zu sehen, was die Anwendung tut:

```ts
createApp({
  app: withLogging(shell, "shell"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin(), createDomPlugin()],
  mount: "#app",
});
```

Für eine Message `inc` mit dem payload 5 erhält der Logger diesen Eintrag:

```json
["[counter] inc -> 1 effect(s)", { "payload": 5, "effects": ["store.set"] }]
```

Der Eintrag ist ein Eintrag der Stufe `debug`. Manche Browser blenden `debug`-Meldungen standardmäßig aus (in Chrome schalte die Konsole auf die Stufe Verbose, um sie zu sehen). Der Wrapper fügt einen Effekt hinzu, das Logger-Plugin muss also registriert sein, sonst wirft der Kern `no plugin "logger"`.

### In der Entwicklung an der Anwendung herumstochern

Das ui-kit stellt die Anwendung und den Store bereit, nur in der Entwicklung:

```ts
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
```

In der Konsole kannst du dann eine Message senden, den State lesen und in der Zeit zurückgehen, weil der Store jede Änderung mit dem Effekt aufzeichnet, der sie rückgängig macht:

```text
pavlus.app.dispatch({ id: "header.toggleSidebar" })
pavlus.store.getState().sidebar
pavlus.store.history.length
pavlus.store.history.at(-1)
```

`store.undo()` und `store.restoreTo(timestamp)` sind Effekte, du wendest sie also wie jeden anderen an: aus einem handler oder über die Dev-Tools.

### Sieh dir die Ausgabe des Compilers an

Ein Template sind zwei reine Funktionen, und du kannst sie selbst aufrufen. `compileToView` aus `@service-laboratory/pavlus/compiler` kompiliert einen String und gibt dir `render` und `diff`, ohne Vite:

```ts
import { compileToView } from "@service-laboratory/pavlus/compiler";

const view = compileToView("p Hello, {name}");
console.log(JSON.stringify(view.render({ name: "Ann" })));
console.log(JSON.stringify(view.diff({ name: "Ann" }, { name: "Bob" })));
```

Die erste Zeile gibt die **vnodes** aus, die zweite die **Patches**:

```json
[{"t":"el","tag":"p","attrs":{},"events":{},"children":[{"t":"text","id":"1","text":"Hello, Ann"}]}]
[{"op":"text","id":"1","text":"Hello, Bob"}]
```

Die vnodes zeigen die echten Attribute und die Events als Daten (`events.click` ist die Message, die der Klick senden wird). Die Patches zeigen, was sich im DOM ändern würde. Ist eine Patch-Liste leer, obwohl du eine Änderung erwartet hast, ist entweder der State dasselbe Objekt (eine Mutation) oder der Knoten liest dieses Feld nicht. Die Demos auf diesen Seiten zeigen dieselben Daten, und jede Demo kann den AST aufklappen: Die Zeile `reads: people` unter einem Knoten sagt, welche Felder ihn ändern können.

Kompilierte Templates sind lesbares JavaScript, in der Entwicklung wie im Bundle. Öffne ein `.pavlus`-Modul im Sources-Panel der DevTools (die Datei heißt etwa `todos.pavlus?import`). Die Kommentare `// line 12: <li> (reads: user, selectedId)` sagen, aus welcher Zeile des Templates ein Block stammt und wovon er abhängt. Es gibt bewusst keine Source Map: Die DevTools zeigen den erzeugten Code, und der ist es, der läuft.

### Teste die Seite, nicht nur den handler

Liegt ein Bug im Template, teste ihn mit `mountView` aus `@service-laboratory/pavlus/testing`, das eine view in jsdom ohne den Kern mountet. Das ist ein Test für ein Zähler-Template:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });
expect(h.root.textContent).toContain("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
```

## Fragen und Antworten

- **Kann ich in einem Template eine Pfeilfunktion oder ein Template-Literal benutzen?** Nein, beides sind Kompilierfehler. Die Ausdruckssprache ist eine kleine reine Teilmenge von JavaScript: Pfade (null-sicher), Literale, Operatoren, der Bedingungsoperator, Array-Literale, Indexzugriff (`items[0]`) und Aufrufe. Der Aufruf einer Methode eines Werts funktioniert: `{name.toUpperCase()}` zeigt `ANN` für `ann`. Aufrufe sind ebenfalls null-sicher, und das versteckt Tippfehler: `{fmt(name)}` ruft das State-Feld `fmt` auf, und gibt es kein solches Feld, zeigt es einen leeren Text und keinen Fehler. Alles, was länger ist als ein kurzer Ausdruck, gehört in den handler: Berechne es dort und halte das Ergebnis im State.
- **Wie zeige ich eine gefilterte oder sortierte Liste?** Berechne sie im handler, speichere sie mit `store.set` und iteriere über die gespeicherte Liste. Die [Anleitung](page:guide-todo-app) macht das für einen Filter.
- **Wohin kommt asynchroner Code?** Nirgends in einen handler. Ein handler gibt Effekte zurück, und ein Plugin erledigt die asynchrone Arbeit und antwortet mit einer Message. Für eine Anfrage nutze `http.request`, für einen Timer `time.setTimeout`.
- **Wie lese ich, was der Nutzer getippt hat?** `msg.event?.value` bei `@input`, `msg.event?.checked` beim `@change` einer Checkbox und `msg.event?.key` bei Tastatur-Events. Das Eingabefeld behält, was der Nutzer getippt hat; `value=field` setzt nur den Anfangswert und folgt späteren Änderungen des Felds.
- **Warum zeigt meine Seite einen leeren Wert statt eines Fehlers, wenn ein Feld fehlt?** Pfade in Templates sind null-sicher. `{user.name}` ist ein leerer Text, wenn `user` gleich `null` ist. handler sind einfaches TypeScript und nicht null-sicher: Nutze dort `?.`.
- **Wie bekomme ich die Zeit oder eine Zufallszahl?** Frage ein Plugin. `time.now("stamped")` antwortet mit der Zeit als Message; ein Random-Plugin sind ein paar Zeilen, und [Eigene Plugins schreiben](page:plugins-custom) liest eines.
- **Wie führe ich etwas aus, wenn die App startet?** Behandle `mounted` in der Wurzelkomponente (es wird gesendet, wenn die Anwendung im DOM ist), oder übergib `init: { id: "start" }` an `createApp`. In einer gerouteten Seite behandle `enter`.
- **Wie stoppe ich einen Timer, wenn ich eine Seite verlasse?** Behandle `leave` und gib `time.cancel(id)` zurück.
- **Können zwei Komponenten eine Message mit demselben Namen haben?** Ja. Kinder haben Namensräume: Das `select` eines Childs ist für seinen Parent `row.select`. Zwei Geschwister mit demselben Instanznamen sind nicht erlaubt.
- **Wie nenne ich einen handler `users.remove`?** Mit einem Methodennamen in Anführungszeichen: `"users.remove"(msg: Message) { ... }`.
- **Kann eine Komponente Daten in einem Klassenfeld halten?** Keine Daten, die sich ändern. Die Instanz wird von jeder Message geteilt, sie muss also frei von veränderlichem State sein. Halte Daten im Store.
- **Kann ich mit SVG zeichnen?** Nicht als Elemente. Das DOM-Plugin erzeugt Elemente ohne XML-Namespace, ein `svg`-Tag würde also nicht gezeichnet. Das ui-kit nutzt CSS-Masken für Icons und Boxen, Verläufe und Emoji für Zeichnungen.
- **Kann ich pavlus ohne Vite benutzen?** Der Compiler ist eine einfache Funktion: `compileTemplate(source)` gibt den Text eines ES-Moduls zurück. Das Vite-Plugin ist die Integration, die es gibt, und alles auf diesen Seiten setzt sie voraus.
- **Warum ist mein erster Render leer?** Weil `route` gleich `null` ist, bis das Router-Plugin etwas meldet. Mounte zuerst, dann startet `mounted` das `router.listen`. Benutzt du ein eigenes `mounted`, muss es auch `router.listen("routeChanged")` zurückgeben.
- **Funktioniert der Server-Render mit jedem Plugin?** Nein. Gib dem Server Platzhalter für die Plugins des Browsers; siehe [Server-Side-Rendering](page:concepts-ssr).

## Was du gelernt hast

- Ein Template-Fehler trägt eine Zeile und eine Spalte. Ein Laufzeitfehler beginnt mit `pavlus:` und nennt seine Lösung. Ein stiller Fehlschlag ist fast immer eine Message, die niemand behandelt, oder ein Effekt, den niemand ausgeführt hat.
- Anführungszeichen machen Text, keine Anführungszeichen machen ein Feld. Eine Liste, die sich ändert, braucht einen `key`. Der State wird nie mutiert.
- `onStep`, `withLogging`, `compileToView` und die Dev-Konsole zeigen die Messages, die Effekte, die vnodes und die Patches.
- Ein statischer Host braucht einen Fallback auf `index.html`, und eine Site unter einem Präfix braucht ein Router-window, das es verbirgt.

Du hast das Ende der Docs erreicht. Der [Überblick über das Framework](page:overview) listet jede Seite auf, und das [Live-Playground](page:compiler-playground) lässt dich ein eigenes Template ausprobieren.
