---
summary: Ein kompaktes Cheat Sheet der gesamten pavlus-Template-Sprache in Tabellen, die echten Fehlermeldungen des Compilers, die häufigsten Stolperfallen und drei größere Beispiele (ein Formular, eine gefilterte Tabelle, ein Panel mit Tabs).
---
## So benutzt du diese Seite

Diese Seite ist eine Referenz. Sie wiederholt in Kurzform, was die vier Seiten davor Schritt für Schritt erklären: [Elemente](page:syntax-elements), [Ausdrücke](page:syntax-expressions), [Events](page:syntax-events), [Bedingungen und Schleifen](page:syntax-control-flow) und [Komponenten](page:syntax-components). Lies zuerst diese Seiten, wenn dir eine Zeile unten unklar ist. Komm hierher zurück, wenn du eine Schreibweise nachschlagen willst.

Ein Template ist eine Textdatei. Sie wird zu einem Modul mit zwei reinen Funktionen kompiliert: `render(state)` gibt die virtuellen Knoten zurück, und `diff(prev, next)` gibt die Liste der Patches zwischen zwei States zurück. Alles Folgende beschreibt, was du in die Datei schreiben kannst.

## Zeilen

Jede nicht leere Zeile ist genau eine Sache. Die Einrückung (nur Leerzeichen) verschachtelt eine Zeile in der Zeile darüber.

| Du schreibst | Es ist | Hinweise |
| --- | --- | --- |
| `tag.class#id(attrs) text` | ein Element | jeder Teil darf fehlen, außer dem ersten aus Tag, Klasse oder id |
| `.card`, `#app` | ein `div` | der Tag ist standardmäßig `div` |
| eine Zeile, die mit einem Pipe-Zeichen beginnt, dann Text | eine Textzeile | ein Textknoten; Platzhalter erlaubt |
| `{expr} more text` | eine Textzeile | eine Zeile, die mit `{` beginnt, ist ebenfalls Text |
| `// note` | ein Kommentar | wird verworfen; ein `// note` am Zeilenende nach einem Leerzeichen wird ebenfalls verworfen |
| `if expr` | Beginn einer Bedingung | ein Doppelpunkt am Ende ist optional |
| `else if expr`, `else` | die weiteren Zweige | müssen auf ein `if` mit derselben Einrückung folgen |
| `for item in list` | eine Schleife | `for item, i in list key expr` fügt den Index und einen key hinzu |
| `import Name from "path"` | importiert ein Kind | nur ganz oben, der Name beginnt mit einem Großbuchstaben |
| `+Name#id(props)` | bettet ein importiertes Kind ein | `#id` ist optional |
| `+{expr}#id(props)` | bettet einen view ein, der ein Wert ist | `#id` ist Pflicht |
| `+outlet` | das geroutete Kind | danach darf nichts folgen |

Void-Elemente (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`) dürfen keine Kindzeilen haben.

Text wird verbunden: Zwei Textzeilen hintereinander oder der Inline-Text eines Elements, gefolgt von einer Textzeile, werden durch einen Zeilenumbruch getrennt, den HTML als Leerzeichen anzeigt.

::demo comments

## Attribute

Attribute stehen in Klammern hinter dem Tag, getrennt durch Leerzeichen oder Kommas. Namen dürfen Buchstaben, Ziffern, `_`, `-`, `:`, `.` und `@` enthalten.

| Du schreibst | Bedeutung |
| --- | --- |
| `disabled` | ein boolesches Attribut, vorhanden mit leerem Wert |
| `type="button"` | ein fester String |
| `title="Open {name}"` | ein String mit Platzhaltern; jeder Platzhalter folgt den Textregeln |
| `href=url`, `value=user.name` | ein Ausdruck, ein Wort ohne Leerzeichen |
| `title={a + " " + b}` | ein Ausdruck mit Leerzeichen, in geschweiften Klammern |
| `title="{note}"` | dasselbe wie `title={note}`: nur ein Platzhalter |
| `class:on=cond` | fügt die Klasse `on` hinzu, wenn `cond` truthy ist |
| `class="a b"` | Klassen, zusammengefügt mit denen von `.a` und `class:` |
| `@click=save` | Event-Bindung, Nachricht `save` |
| `@click.prevent.stop=save(item.id)` | dasselbe, mit Modifikatoren und einem Payload |
| `\{` und `\}` | eine literale geschweifte Klammer in Text oder in einem Wert in Anführungszeichen |

Ein Wert bei `class:name` oder `@event` muss ein Ausdruck sein: `class:on` ohne Wert ist ein Fehler.

## Werte in Text und in Attributen

Derselbe Wert wird in Text und in einem Attribut unterschiedlich gerendert.

| Wert | Im Text `{v}` | In einem Attribut `a=v` |
| --- | --- | --- |
| `null`, `undefined` | nichts | kein Attribut |
| `false` | nichts | kein Attribut |
| `true` | das Wort `true` | das Attribut mit leerem Wert |
| `0` | `0` | `a="0"` |
| der leere String | nichts | `a=""` |
| eine Zahl oder ein String | sein Text | sein Text |
| ein Array | Elemente, durch Kommas verbunden | dasselbe |
| ein Objekt | `[object Object]` | dasselbe |

In einem String mit mehreren Teilen, wie `title="Note: {v}"`, folgt jeder Platzhalter der Textspalte, und das Attribut ist immer vorhanden.

## Ausdrücke

Alles innerhalb von `{ }` und jeder Attributwert ohne Anführungszeichen wird als Ausdruck geparst.

| Gruppe | Unterstützt |
| --- | --- |
| Literale | Zahlen (`1`, `.5`, `1e3`), Strings (`"a"`, `'a'`), `true`, `false`, `null`, `undefined`, Arrays `[a, b]` |
| Namen | ein Feld des State oder eine Schleifenvariable |
| Member | `a.b`, `a?.b` (beide null-sicher) |
| Index | `a[expr]` (null-sicher) |
| Aufruf | `f(x, y)`, `a.b(x)` (null-sicher) |
| unär | `!a`, `-a`, `+a` |
| Arithmetik | `*` `/` `%` dann `+` `-` |
| Vergleich | `<` `>` `<=` `>=` dann `==` `!=` `===` `!==` |
| Logik | `&&`, dann der doppelte senkrechte Strich, dann `??` |
| ternär | `a ? b : c`, verschachtelt nach rechts |
| Gruppierung | `( )` |

Nicht unterstützt: Objektliterale, Template Strings, reguläre Ausdrücke, Zuweisungen, `++`, `typeof`, `in`, `new`, `**`, bitweise Operatoren, der Komma-Operator, `?.[ ]` und `?.( )`. Pfeilfunktionen gibt es, aber nur mit Ausdruckskörper (`x => x.on`). Namen werden nur im State nachgeschlagen: Es gibt keine Globals.

Truthiness funktioniert wie in JavaScript: `false`, `0`, `""`, `null`, `undefined` und `NaN` sind falsy; ein leeres Array und ein leeres Objekt sind truthy.

## Events

| Teil | Bedeutung |
| --- | --- |
| `@click` | der DOM-Event-Name (jedes Event, das das Element auslösen kann) |
| `=save` | die Nachrichten-id; Punkte sind erlaubt: `users.open` |
| `(a, b)` | Argumente; keines bedeutet kein Payload, eines ist der Payload, mehrere ergeben ein Array |
| `.prevent` | `preventDefault()`, bevor die Nachricht gesendet wird |
| `.stop` | `stopPropagation()`, bevor die Nachricht gesendet wird |

Die Nachricht, die in der Anwendung ankommt, ist `{ id, payload, event }`, wobei `event` `{ type, value?, checked?, key? }` ist. Nachrichten, die ein eingebettetes Kind sendet, haben den Instanznamen vor der id (`row.toggle`). Ein unbekannter Modifikator wird ignoriert, und wenn dasselbe Event zweimal gebunden wird, gewinnt die letzte Bindung.

## Komponenten

| Du schreibst | Bedeutung |
| --- | --- |
| `import Card from "./card.pavlus"` | macht `Card` verfügbar |
| `+Card` | bettet es ein, Instanzname `card` |
| `+Card#intro(title="Hi")` | expliziter Instanzname, eine feste Prop |
| `+Card(title=post.title count=3 active)` | Ausdrucks-Props behalten ihren Typ; ein bloßer Name ist `true` |
| `+Card(...post)` | verteilt die Felder eines Objekts; spätere Props gewinnen |
| `+{view}#slot(...)` | ein view oder eine Komponente aus dem State; `null` rendert nichts |
| `+outlet` | die Seite, die die `routing`-Tabelle der Komponente auswählt |

Das Kind sieht nur seine Props als seinen State. Der Instanzname ist das Präfix seiner Nachrichten und seiner Knoten-ids und in der Logik der key in `children`.

## Was `diff` zurückgeben kann

Patches sind einfache Daten. Das sind alle.

| `op` | Felder | Entsteht, wenn |
| --- | --- | --- |
| `text` | `id`, `text` | sich der Text eines Knotens geändert hat |
| `attr` | `id`, `name`, `value` | ein Attribut einen neuen Wert bekommen hat |
| `rmAttr` | `id`, `name` | ein Attribut `null` oder `false` geworden ist |
| `handler` | `id`, `event`, `msg` | sich die Nachricht einer Bindung geändert hat |
| `insert` | `before`, `nodes` | ein Zweig, ein Element oder ein Kind erschienen ist |
| `clear` | `from`, `to` | alles zwischen zwei Markern entfernt wird |
| `remove` | `from`, `to` | ein Element mit key samt seinen Markern entfernt wird |
| `move` | `from`, `to`, `before` | ein Element mit key den Platz gewechselt hat |

## Die Fehler, die der Compiler meldet

Jede Meldung endet mit Zeile und Spalte. Wenn der Compiler einen Dateinamen bekommt, wie beim Vite-Plugin, beginnt die Meldung damit: `page.pavlus: Empty expression (line 1, col 4)`. Das sind echte Meldungen, jede aus einem Template, das sie auslöst.

```text
Tabs are not allowed, use spaces (line 1, col 1)
Inconsistent indentation (line 3, col 1)
This line cannot have children (line 2, col 1)
Cannot parse line "%x" (line 1, col 1)
Unexpected "!" (line 1, col 2)
Unclosed ( (line 1, col 2)
Unterminated string (line 1, col 5)
Unexpected "=" in attributes (line 1, col 5)
Unexpected "?" in attributes (line 1, col 7)
Unexpected "/" (line 1, col 5)
Unclosed { (line 1, col 1)
Empty expression (line 1, col 4)
Expected ":" (line 1, col 9)
Expected property name (line 1, col 7)
Unexpected "b" (line 1, col 6)
Unexpected character "=" (line 1, col 6)
"@click" needs an expression value (line 1, col 8)
"class:on" needs an expression value (line 1, col 4)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
`...spread` is only allowed in component props (+Name(...)) (line 1, col 3)
```

Die Meldungen zu Komponenten:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 1, col 2)
Unexpected "x" after component (line 2, col 8)
Instance name must be an identifier (line 2, col 6)
"data-x" is not a valid prop name (line 2, col 7)
A dynamic component needs an instance name: +{expr}#name(...) (line 1, col 7)
`+outlet` takes nothing after it (line 1, col 8)
Expected a component name or {expression} after + (line 1, col 2)
```

Zwei Fehler findet nicht der Compiler, sondern erst die Laufzeit: `pavlus: duplicate key 1` (zwei Elemente einer Schleife haben denselben key, von `diff` geworfen) und `pavlus: +{...} needs a view or a component with a view`.

Eine Anmerkung zur Spalte bei `Unclosed {`: Sie wird ab dem Beginn des Zeilentexts gezählt, nicht ab dem Zeilenanfang, und kann daher kleiner sein, als du erwartest. Die Zeilennummer stimmt.

## Häufige Stolperfallen

Das sind die Fehler, die am häufigsten passieren. Die ersten erzeugen überhaupt keinen Fehler, darum sind sie die teuersten.

- **Anführungszeichen entscheiden über die Bedeutung.** `class="x"` ist der Text `x`; `class=x` liest das State-Feld `x`. `target=_blank` liest ein Feld namens `_blank`, findet nichts und lässt das Attribut weg. Schreibe `target="_blank"`.
- **Text braucht ein Pipe-Zeichen.** Eine Zeile aus bloßen Wörtern ist ein Element: `Hello world` ist `<Hello>world</Hello>`. Text in einer eigenen Zeile beginnt mit `|`.
- **Eine Schleife braucht das Wort `in`.** `for x of xs` wird als Element namens `for` gelesen. Du bekommst `<for>` in der Seite und keinen Fehler.
- **Null wird angezeigt.** `{count && "items"}` rendert `0`, wenn `count` `0` ist, weil `0` ein Wert ist, nicht nichts. Nutze `{count > 0 && "items"}` oder einen ternären Ausdruck.
- **Ein leeres Array ist truthy.** `if items` ist für `[]` wahr. Schreibe `if items.length`.
- **Ein bloßer Wert endet an einem Leerzeichen.** `title=a + b` und `class:on=a === b` schlagen mit `Unexpected "=" in attributes` oder `Unexpected "?" in attributes` fehl. Setze den Ausdruck in Klammern: `title={a + b}`.
- **Ein bloßer Wert ist ein Ausdruck.** `href=/docs` schlägt mit `Unexpected "/"` fehl. Setze Pfade in Anführungszeichen: `href="/docs"`.
- **Ein doppeltes Anführungszeichen in einem Wert mit doppelten Anführungszeichen** behält seinen Backslash. Nimm einfache Anführungszeichen um den Wert.
- **Optional Chaining.** `a?.[0]` und `f?.()` sind Fehler. Index und Aufruf sind bereits null-sicher.
- **Tippfehler bleiben still.** Ein falscher Feldname rendert als leerer Text, und eine Nachricht ohne handler tut nichts.
- **Keys.** Ohne `key` ist die Position der key, und eine umsortierte Liste wird neu geschrieben. Doppelte keys werfen einen Fehler in `diff`, nicht im ersten `render`.
- **Mehrere Argumente ändern den Payload.** `@click=pick(id)` sendet den Wert; `@click=pick(id, kind)` sendet ein Array. Der handler muss dazu passen.
- **Handler werden vom Template nicht aufgerufen.** `@click=save(item)` ruft nichts auf: Es baut die Nachricht `save` mit dem Payload.
- **Imports zuerst.** `import`-Zeilen ganz oben, und `+Name` braucht einen passenden Import. Für einen view aus dem State nutze `+{name}#id`.
- **Void-Elemente haben keine Kinder.** `input`, `br`, `img` und die anderen dürfen keine eingerückten Zeilen haben.

::demo bare-words

::demo loop-typo

::demo unquoted-target

Die drei Demos oben zeigen die stillen Fehler: eine Textzeile, die zu `<Hello>` wurde, eine Schleife, die zu `<for>` wurde, und einen Link, dem im ersten Schritt das `target` fehlt.

## Alles zusammen: ein Formular

Ein Anmeldeformular, das Events mit Modifikatoren, `class:`-Umschalter, Bedingungen für die Fehler, boolesche Attribute und einen ternären Ausdruck für den Button-Text verwendet.

::demo form

Der State enthält alles, was die Seite braucht: die Werte, eine Map `errors` und die Flags `busy` und `done`. Die handler deiner Komponente ändern ihn, und das Template beschreibt nur jede Situation.

- **Validierungsfehler erscheinen.** Das Name-Eingabefeld bekommt die Klasse `invalid` (`attr`), und die beiden Fehlermeldungen werden an der Stelle ihres `if` eingefügt. Das E-Mail-Feld, das keinen Fehler hat, wird nicht angefasst.
- **Der Name wird getippt.** Der Wert des Eingabefelds, die Klasse und der Fehler dieses Felds werden aktualisiert. Der Fehler bei den Bedingungen bleibt.
- **Absenden.** Drei Patches an einem Button: `disabled` und `class` erscheinen, und der Text ändert sich. `disabled={busy}` ist davor `false` und danach `true`, also wird das Attribut hinzugefügt und entfernt; `toAttr(true)` ist ein leerer Wert.
- **Fertig.** Der Button wird zurückgesetzt, und die Nachricht `success` wird eingefügt.

Das `@submit.prevent=submit` am Formular verhindert, dass der Browser die Seite neu lädt. Der handler von `submit` liest die Werte aus dem State, weil jedes Eingabefeld seinen Wert mit `@input` dorthin kopiert hat.

## Alles zusammen: eine Tabelle mit Filtern

Eine Tabelle mit Benutzern, Filter-Buttons, einem Suchfeld und Aktionen pro Zeile. Die Liste, die die Tabelle anzeigt, ist `visible`, von der Komponente aus den vollständigen Daten, dem Filter und der Suchanfrage berechnet. Ein Template kann nicht selbst filtern und zählen, also erledigt das der handler, und das Template zeigt das Ergebnis.

::demo table

- **Filter: paused.** Die Filter-Buttons stehen in einer Schleife mit key, und die Klasse `active` wandert von einem zum anderen. Die Zeilen der anderen beiden Benutzer werden entfernt, und der Text der Fußzeile wird aktualisiert.
- **Filter: nobody.** Die letzte Zeile wird entfernt, und das `if` für die leere Zeile fügt "No users match" ein.
- **Bob wird fortgesetzt.** Die Zeile behält ihren Platz. Ihre Klasse `paused` wird entfernt, das Label ihres Buttons ändert sich, und ein `handler`-Patch gibt dem Button den neuen Payload `[2, "active"]`. Zwei Argumente: ein Array.
- **Reihenfolge umgekehrt.** Zeilen mit key werden verschoben, nicht neu geschrieben.

## Alles zusammen: ein Panel mit Tabs

Eine aus Daten gebaute Tab-Leiste und ein Body, der eines von drei Panels zeigt. Die Tab-Leiste ist eine Schleife mit key und `class:active`, und das Panel ist ein `if` / `else if` / `else`.

::demo tabs

- Beim Wechsel eines Tabs ändern sich zwei Buttons (jeweils eine Klasse und `aria-selected`, geschrieben als Text `"true"` oder `"false"`, weil ARIA die Wörter braucht, kein leeres Attribut) und der Body wird **ersetzt**: Der Zweig hat sich geändert, also `clear` und `insert`.
- Wenn ein neues Event eintrifft, während der Tab "activity" offen ist, bleibt der Zweig derselbe. Nur die Liste ändert sich: ein `insert` für das neue Element, weil die Schleife nach dem Text des Events mit einem key versehen ist.

Das ist die ganze Sprache. Alles Weitere, etwa was das DOM-plugin mit den Patches macht, wie der Store den State ändert und wie Seiten geroutet werden, liegt in den Komponenten und den plugins.

## Was du gelernt hast

- Ein Template besteht aus Zeilen: Elemente, Textzeilen, `if` / `for`, Imports und Embeds. Attribute tragen Klassen, Events und Props.
- Werte folgen festen Regeln: `null`, `undefined` und `false` sind nichts; `true` ist ein leeres Attribut; `0` und `""` sind Werte.
- Compiler-Fehler sind kurz und tragen Zeile und Spalte; gefährlich sind die Fehler, die gültig sind, aber etwas anderes bedeuten.
- Große Seiten bestehen aus denselben wenigen Bausteinen: ein State mit anzeigefertigen Werten, Bedingungen, Schleifen mit key und Events mit Payloads.

Weiter: [Die Kompilierungs-Pipeline](page:compiler-pipeline).
