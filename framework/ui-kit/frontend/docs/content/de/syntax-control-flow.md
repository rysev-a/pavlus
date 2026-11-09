---
summary: Zeige einen Block nur, wenn eine Bedingung gilt, mit if / else if / else, und wiederhole einen Block für jeden Eintrag einer Liste mit for. Lerne, warum keys wichtig sind, wie diff reagiert und wie du eine gefilterte Liste baust.
---
## Wählen, was auf der Seite steht

Bisher war jede Zeile eines Templates immer da. Echte Seiten brauchen zwei weitere Fähigkeiten: einen Block *nur dann* zu zeigen, wenn etwas wahr ist, und einen Block *einmal für jeden Eintrag* einer Liste zu zeigen. pavlus hat dafür je ein Schlüsselwort: `if` und `for`. Sie sind keine Elemente. Sie erzeugen kein eigenes Tag. Sie entscheiden nur, welche ihrer Children existieren.

Beide nehmen die darunter eingerückten Zeilen als ihren Rumpf, genauso wie ein Element.

## if

Die einfachste Bedingung ist `if`, gefolgt von einem [Ausdruck](page:syntax-expressions). Ist der Wert truthy, wird der Rumpf gerendert; ist er es nicht, ist der Rumpf überhaupt nicht da.

::demo if-simple

Sieh dir die zwei Schritte an. Wenn `loggedIn` von `true` auf `false` geht, gibt `diff` einen Patch zurück, `clear`, der alles zwischen zwei Markern namens `0s` und `0e` entfernt. Wenn es zurück auf `true` geht, gibt `diff` einen `insert`-Patch mit einem frisch gerenderten `p` zurück.

Die Marker sind unsichtbare Kommentarknoten, die der Compiler um jedes `if` und jedes `for` legt. Sie lassen einen Patch sagen „ersetze, was zwischen diesen zwei Punkten liegt", ohne zu wissen, was dort ist. Im HTML der Demo erscheinen sie nie, aber sie stehen in den vnodes, und in den Patches dieser Seite wirst du sie sehen.

Ein abschließender Doppelpunkt wird akzeptiert und bedeutet nichts: `if loggedIn:` ist dasselbe wie `if loggedIn`.

> [!NOTE] Truthiness
> Die Bedingung folgt den JavaScript-Regeln: `0`, `""`, `null`, `undefined`, `false` und `NaN` sind falsy. Ein leeres Array ist truthy, schreibe also `if items.length`, um auf „hat Einträge" zu prüfen.

## else und else if

Eine Zeile `else if` oder `else` setzt das `if` darüber fort. Sie müssen dieselbe Einrückung wie das `if` haben, direkt nach dessen Rumpf.

::demo if-else

Der erste Schritt ersetzt die ganze Begrüßung durch die Anmeldemeldung: Der Zweig hat gewechselt, also wird der Inhalt zwischen den Markern ersetzt. Der zweite Schritt bleibt im selben Zweig, und nur der Text darin wird aktualisiert. Der Compiler unterscheidet diese beiden Situationen und rendert einen Zweig, der gleich bleibt, nie neu.

Zweige werden der Reihe nach probiert, und die erste Bedingung, die truthy ist, gewinnt. Der `else`-Zweig hat keine Bedingung und muss der letzte sein.

::demo else-if open=module

Öffne das Modul und finde `prevBranch` und `nextBranch`. Für jeden der beiden States berechnet der generierte Code *die Nummer des Zweigs*, der gezeigt wird (hier 0 bis 3, oder -1, wenn es kein `else` gibt und nichts passt):

```ts
const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "error") ? 1 : ((prev.items)?.length === 0) ? 2 : 3;
const nextBranch = (next.status === "loading") ? 0 : (next.status === "error") ? 1 : ((next.items)?.length === 0) ? 2 : 3;
```

Unterscheiden sich die beiden Zahlen, wird der Zweig ersetzt: ein `clear` zwischen den Markern, dann ein `insert` des neuen, von Grund auf gerenderten Zweigs. Sind sie gleich, werden nur die Änderungen innerhalb dieses Zweigs gepatcht. Der Schritt „items 2 → 5" tut genau das: ein `text`-Patch, sonst nichts.

Ein Fehler, den der Parser für dich meldet, ist ein `else`, das nichts fortsetzen kann:

```pavlus-invalid
p First
else
  p Second
```

```text
`else` without matching `if` (line 2, col 1)
```

Derselbe Fehler erscheint, wenn auf ein `else` ein zweites `else` folgt oder wenn auf ein `else` ein `else if` folgt. Auch eine Zeile zwischen dem `if` und seinem `else` bricht die Kette.

Ein `if` innerhalb eines Elements ist nur ein Child davon, und die anderen Children des Elements bleiben, wo sie sind:

::demo if-inside

Wird `subtitle` ein nichtleerer String, gibt es einen einzigen `insert`-Patch an der Stelle des `if`, zwischen der Überschrift und dem Footer. Die Marker sind der Grund, warum er an der richtigen Position landet.

## for

`for` wiederholt seinen Rumpf für jeden Eintrag einer Liste. Der Kopf hat die Form `for item in list`: ein Name für den aktuellen Eintrag, das Wort `in` und ein Ausdruck, der die Liste liefert.

::demo for-simple

Im Rumpf ist `name` der aktuelle Eintrag. Er ist eine *Schleifenvariable*: Sie existiert nur innerhalb der Schleife und verdeckt ein State-Feld mit demselben Namen, falls es eines gibt. Der Rumpf kann beliebig viele Zeilen und jede Struktur haben.

Brauchst du auch die Position, benenne sie nach einem Komma:

::demo for-index

`i` zählt ab 0. Hier macht `{i + 1}` eine menschliche Zahl. Der Index ist ein gewöhnlicher Ausdruckswert wie jeder andere.

### Leere und fehlende Listen

Eine leere Liste rendert nichts. Eine Liste, die `null` oder `undefined` ist, ist dasselbe wie eine leere, ein State, der noch lädt, bricht die Seite also nicht.

::demo for-missing

Der erste Schritt der nächsten Demo fügt einer leeren Liste einen Namen hinzu. Das `ul` bleibt, und das neue `li` wird zwischen den Markern der Schleife eingefügt:

::demo for-empty

Willst du statt einer leeren Liste eine Meldung zeigen, setze die Schleife in einen Zweig eines `if`:

::demo for-if-else

Ist eine Liste kein Array, hängt das Ergebnis von ihrer Form ab: Ein String wird Buchstabe für Buchstabe gelesen, und ein Objekt ohne `length` rendert nichts. Halte echte Listen im State.

> [!WARNING] Wörter, die wie Schlüsselwörter aussehen
> Nur `for x in list` ist eine Schleife. Eine Zeile wie `for x of list` passt nicht, und der Parser liest `for` als Tag-Namen eines Elements: Du bekommst `<for>` auf der Seite und keinen Fehler. Dasselbe gilt für ein einzelnes `if` ohne etwas danach. Erscheint eine Schleife nicht, prüfe das Wort `in`.

## Warum keys wichtig sind

Eine Liste ändert sich mit der Zeit: Einträge werden hinzugefügt, entfernt und umsortiert. Wenn `diff` die alte und die neue Liste vergleicht, muss es entscheiden, welcher alte Eintrag welchem neuen entspricht. Diese Entscheidung fällt über einen **key**.

Der key wird dem Kopf nach der Liste hinzugefügt: `for task in tasks key task.id`. Er ist ein Ausdruck, der für jeden Eintrag ausgewertet wird, und er muss in der Liste eindeutig sein und für dieselbe Sache gleich bleiben. Eine id aus deinen Daten ist perfekt.

::demo keyed-reorder

Lies jeden Schritt.

1. Der letzte Eintrag wandert nach vorn. `diff` gibt zwei `move`-Patches zurück: Es verschiebt vorhandene DOM-Knoten. Es erzeugt, löscht oder beschriftet nichts neu, sodass alles, was an diesen Knoten lebt (ein fokussiertes Eingabefeld, eine Textauswahl, eine laufende Animation), erhalten bleibt. Der Algorithmus ist einfach, nicht minimal: Um den letzten Eintrag nach vorn zu bringen, verschiebt er die zwei anderen dahinter, und das Ergebnis ist dieselbe Reihenfolge.
2. Der erste Eintrag wird entfernt: ein `remove`-Patch nur für diesen Eintrag.
3. Ein neuer Eintrag am Ende: ein `insert`-Patch.
4. Der Titel von Eintrag 2 ändert sich: ein `text`-Patch. Die id des Textknotens ist `3#2`: die Template-id, ein `#` und der key.

Jetzt dieselbe Liste **ohne** key:

::demo unkeyed-reorder

Ohne `key` ist der key jedes Eintrags seine **Position**. Eintrag 0 bleibt Eintrag 0, was auch immer er enthält. Wandert also der letzte Eintrag nach vorn, sieht `diff` drei Einträge, deren Text sich geändert hat, und schreibt drei Texte neu (`3#0`, `3#1`, `3#2`). Wird der erste Eintrag entfernt, entfernt es das *letzte* Element und schreibt den Rest neu, weil die Elemente nach Position identifiziert wurden.

Für eine Liste aus einfachem Text gibt das ein richtiges Ergebnis, nur mit mehr Arbeit. Für eine Liste mit State im DOM, etwa Eingabefelder oder ein laufendes Video, gibt es das falsche Ergebnis: Der getippte Text bleibt im ersten Eingabefeld, aber die Daten des ersten Eintrags gehören jetzt zum zweiten.

> [!TIP] Faustregel
> Wenn Einträge hinzugefügt, entfernt oder umsortiert werden können oder wenn sie irgendeinen State halten, gib der Schleife einen key aus deinen Daten. Nutze den Index nur für eine Liste, die sich nie ändert.

Keys werden als Text verglichen (`String(key)`), `1` und `"1"` sind also derselbe key. Sie müssen eindeutig sein: Liefern zwei Einträge denselben key, wirft `diff` `pavlus: duplicate key 1`. Das erste `render` einer solchen Liste prüft das nicht, das erste `diff` aber schon, der Fehler zeigt sich also, wenn sich die Liste ändert.

Der key kann ein beliebiger Ausdruck sein, zum Beispiel eine Verbindung zweier Felder:

::demo key-expression

## Schleifen in Schleifen

Schleifen lassen sich verschachteln. Jede hat ihre eigene Variable, und der innere Rumpf sieht die Variablen beider.

::demo nested

Die äußere Schleife hat als key den Gruppennamen, die innere den Eintrag selbst. `group.name` wird im inneren Rumpf benutzt. Im Schritt erscheint ein neuer Eintrag in einer Gruppe, und `diff` erzeugt dafür einen `insert`-Patch. Die ids der Marker, etwa `4e#Veg`, tragen den key des äußeren Eintrags, so vermischen sich die beiden Gruppen nie.

## Klassen in einer Schleife umschalten

Das Attribut `class:name=condition` aus [Elemente, Text und Attribute](page:syntax-elements) funktioniert in einer Schleife genauso, mit der Schleifenvariable.

::demo class-toggle

Ein Attributwert ohne Anführungszeichen endet beim ersten Leerzeichen. `task.id === currentId` hat Leerzeichen und muss deshalb in geschweifte Klammern gesetzt werden: `class:current={task.id === currentId}`. Ohne sie hält der Parser beim ersten Leerzeichen an und meldet `Unexpected "=" in attributes`.

Sieh dir die zwei Schritte an. Wenn `currentId` von 2 auf 3 wechselt, wird die Klasse eines Eintrags entfernt und die eines anderen hinzugefügt. Im zweiten Schritt wird der `class`-Wert von Eintrag 2 zu `done current`: Alle Umschalter eines Elements werden in einem `class`-Attribut gesammelt, und ein Patch schreibt den ganzen Wert.

## Filtern mit if in for

Eine kurze Liste lässt sich direkt im Ausdruck filtern (`items.filter(x => x.done)`)); ein `if` als einziges Child eines `for` ist ein anderer Weg: Jeder Eintrag wird nur gezeigt, wenn seine Bedingung gilt. Ein guter Weg, eine kurze Liste zu filtern, ohne ein neues Array zu bauen.

::demo filtered open=ast

Lies das Template von oben. Das Such-Eingabefeld sendet bei jeder Taste `setQuery`. Das `for` hat `task.id` als key. Darin versteckt das `if` die Aufgaben, die nicht zur Suchanfrage passen (`!query` lässt eine leere Suchanfrage alles treffen). Nach der Liste zeigt ein zweites `if` die Anzahl oder eine Meldung, wenn nichts passt.

Im ersten Schritt tippt der Nutzer `es`. `diff` gibt zurück:

- einen `attr`-Patch für den Wert des Eingabefelds;
- zwei `clear`-Patches, die das `if` der Einträge 1 und 3 leeren, die nicht mehr passen: Die Einträge bleiben in der Liste, aber ihr Inhalt ist weg;
- einen `text`-Patch für den Zähler.

Im zweiten Schritt passt nichts. Der letzte verbliebene Eintrag wird geleert, und der Zähler-Zweig wechselt vom `else` zur Meldung „No task matches".

Der Zähler, `shown`, ist ein gewöhnliches State-Feld, vom handler von `setQuery` in deiner Komponente berechnet. Ein Template kann die passenden Einträge nicht zählen, weil es nur Ausdrücke auswerten kann und keine Schleifen hat, die Werte zurückgeben. Das ist die übliche Aufgabenteilung: Der handler berechnet, das Template zeigt.

Ist die Liste lang, filtere stattdessen im handler und gib dem Template nur, was sichtbar ist. Dann hat die Schleife nur die gezeigten Einträge, und ein geänderter Filter ist eine Menge von `insert`- und `remove`-Patches:

::demo filtered-visible

Beide Ansätze ergeben korrekte Seiten. Der erste hält die ganze Arbeit im Template, der zweite hält das DOM klein.

## Alles zusammen

Dieser Posteingang hat einen Ladezustand, einen Fehlerzustand, eine Liste, eine Bedingung pro Eintrag und eine Leer-Meldung. Er nutzt alles von dieser Seite.

::demo inbox

Gehe die Schritte durch:

1. **Von Loading zu Ready.** Der Zweig wechselt vom ersten zum dritten, also wird das `p` geleert und das `ul` eingefügt. Es wird einmal gerendert, mit beiden Mails.
2. **Mail 2 ist gelesen.** Nur zwei Patches: Die Klasse `unread` wird vom Eintrag entfernt (`rmAttr`), und der Button `Mark as read`, der in einem `if` sitzt, wird geleert. Sonst wird nichts angefasst.
3. **Eine neue Mail kommt oben an.** Ein `insert`-Patch, vor dem Eintrag mit dem key 1 platziert.
4. **Alle Mails werden gelöscht.** Zwei `remove`-Patches, und die Meldung „Nothing here" wird eingefügt.
5. **Ein Fehler.** Der dritte Zweig wird durch den zweiten ersetzt: Die Liste wird geleert, und die Meldung mit ihrem Retry-Button wird eingefügt.

Das Template sagt, wie die Seite für jeden State aussieht. Der Compiler ermittelt die kleinste Menge an Änderungen zwischen zwei beliebigen States, und das sind die Patches, die du gesehen hast.

## Was du gelernt hast

- `if`, `else if` und `else` zeigen einen Zweig. Ein anderer Zweig bedeutet `clear` und `insert`; derselbe Zweig bedeutet nur die Änderungen darin.
- `for item, i in list key expr` wiederholt einen Rumpf. Eine leere oder fehlende Liste rendert nichts.
- Ein key identifiziert einen Eintrag zwischen zwei States. Mit key verschiebt, fügt ein und entfernt `diff` ganze Einträge; ohne ihn ist die Position der key, und die Inhalte werden neu geschrieben.
- `if` in `for` filtert, ein Zähler oder eine abgeleitete Liste gehört in den State, und ein Wert mit Leerzeichen in einem Attribut braucht geschweifte Klammern.

Weiter: [Komponenten, Imports und Outlets](page:syntax-components).
