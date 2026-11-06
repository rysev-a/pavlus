---
summary: Ein bearbeitbarer Playground, der den echten Compiler in deinem Browser ausführt. Ändere ein Template und einen State und sieh das HTML, das generierte Modul und was jeder Knoten liest. Sieben Experimente zeigen dir, was du ändern und worauf du achten kannst.
---
## Probier es aus

Unten siehst du zwei Textfelder: links ein Template und rechts einen State, als JSON geschrieben. Der Button **Compile and run** schickt beides an den echten Compiler, in deinem Browser, und zeigt das Ergebnis unter den Feldern. Nichts wird an einen Server gesendet. **Reset** holt das Beispiel zurück, mit dem du angefangen hast.

::playground

Drücke beim ersten Mal **Compile and run**, ohne etwas zu ändern. Das Startbeispiel hat eine Überschrift, einen Satz mit einer Bedingung im Text, eine Liste mit keys und einem Klassen-Umschalter und ein `if` mit einem `else`. Lies danach weiter, um zu erfahren, was die Abschnitte der Ausgabe bedeuten, und probiere die Experimente unten aus.

## Was du nach Compile and run siehst

Die Ausgabe hat dieselben Abschnitte wie die Demos auf den anderen Seiten dieses Bereichs:

- **Template** und **State**: was du kompiliert hast und das JSON, das geparst wurde.
- **Result (HTML of render(state))**: das HTML, das `render` für deinen State zurückgegeben hat. Marker werden hier nicht angezeigt.
- **Generated module**: der vollständige Text des Moduls, das `compileTemplate` zurückgegeben hat, standardmäßig geöffnet.
- **AST and what each node reads**: eine Zeile pro Knoten, mit den Wurzelnamen des State, von denen er abhängt. Das ist die Abhängigkeitsmenge, aus der die Guards von `diff` gebaut werden. Standardmäßig geöffnet.
- **The vnodes render(state) returns**: die rohen Daten, eingeklappt. Öffne sie, um die ids und die Marker zu sehen.

Hat das Template einen Fehler, siehst du **The compiler stopped:** und die Meldung, mit dem Dateinamen `playground.pavlus` und Zeile und Spalte. Ist der State kein gültiges JSON, siehst du **The state is not valid JSON:** und die Meldung des Parsers.

> [!NOTE] Was der Playground nicht kann
> Er führt `render` einmal aus, für den State, den du ihm gibst. Er hat keinen zweiten State, also gibt es hier keine Patch-Liste: Um Patches zu sehen, nutze die Demos auf den Seiten vor dieser oder rufe `diff` in einem Test auf, wie auf der [Tooling-Seite](page:compiler-tooling) gezeigt. Die Funktion `diff` kannst du trotzdem im generierten Modul lesen, und genau das tun die Experimente unten. Imports, `+{expr}`-Embeds und `+outlet` brauchen views und Komponenten, die JSON nicht tragen kann, und brechen hier daher mit einem Fehler ab.

## Sieben Experimente

Füge für jedes Experiment das Template in das linke Feld und den State in das rechte Feld ein und drücke **Compile and run**.

### 1. Ein Template, das nichts liest

```pavlus
p Hello, world
```

```json
{}
```

Öffne das generierte Modul und gehe zu `diff`. Es enthält nur `if (prev === next) return patches;` und `return patches;`. Es gibt keine Import-Zeile, weil kein Helfer gebraucht wird, und die vnodes haben keine `id`-Felder. Nichts in diesem Template kann sich je ändern, also hat der Compiler dafür nichts geschrieben.

### 2. Ein Feld lesen

```pavlus
p Hello, {name}
```

```json
{ "name": "Ann", "theme": "light" }
```

Der AST sagt *reads: name*, und der Guard in `diff` vergleicht `prev.name !== next.name`. Das Feld `theme` ist im State und wird im Modul nie erwähnt. Ändere nun das Template zu `p Hello, {name}, theme {theme}` und kompiliere erneut: Der Guard wächst um einen Vergleich, und der Text ebenfalls.

### 3. Ein Parent und ein Kind mit denselben Abhängigkeiten

```pavlus
p(title=text) {text}
```

```json
{ "text": "Hi" }
```

Finde den Guard `if (prev.text !== next.text)`. Darin siehst du das Attribut `title` und auch den Text. Der Kommentar `// line 1: text` hat kein eigenes `if`, weil der Guard des Absatzes ihn bereits abdeckt. Ändere das Attribut zu `title=other` und kompiliere erneut: Jetzt hat der Text seinen eigenen Guard.

### 4. Der Zweigindex

```pavlus
if n > 1
  p many
else if n === 1
  p one
else
  p none
```

```json
{ "n": 1 }
```

Das Ergebnis ist `<p>one</p>`. Finde im Modul `nextBranch`: eine Kette von Bedingungen, die mit der Nummer des `else`-Zweigs endet. Lösche das `else` und seine Zeile und kompiliere erneut: Die Kette endet jetzt mit `-1`, dem Wert für "nichts gezeigt". Öffne die vnodes: Das `if` ist von zwei Marker-Knoten umgeben, mit den ids `0s` und `0e`.

### 5. Schleifen mit und ohne key

```pavlus
ul
  for item in items key item.id
    li {item.name}
```

```json
{ "items": [{ "id": 7, "name": "Ann" }, { "id": 9, "name": "Bob" }] }
```

Finde die Zeile, die mit `const prevItemKeys` beginnt. Sie bildet jedes Element auf `String((item)?.id)` ab. Lösche nun ` key item.id` aus dem Template und kompiliere erneut: Die Zeile wird zu `String(itemIndex)`. Sieh dir die vnodes in beiden Versionen an: Die Marker der Elemente sind nach dem key benannt, `1[#7` und `1[#9` in der ersten, `1[#0` und `1[#1` in der zweiten. Diese Namen benutzen die Patches `remove` und `move`.

### 6. Ein Event mit Argumenten

```pavlus
button(class:on=on @click=pick(id, kind)) Pick
```

```json
{ "on": true, "id": 1, "kind": "a" }
```

Der vnode des Buttons hat ein Feld `events` mit `"click": { "id": "pick", "payload": [1, "a"] }`: Der handler sind Daten. In `diff` werden die beiden Argumente mit `sameValues` verglichen, und die Klasse wird mit `joinClasses` neu gebaut. Ändere `@click=pick(id, kind)` zu `@click.prevent=pick(id, kind)` und suche nach `prevent: true`. Ändere es zu `@click=pick`, und der handler verschwindet aus `diff`, weil sich ein handler ohne Argumente nicht ändern kann. Der Button behält seine `id`, weil sich seine Klasse trotzdem ändern kann.

### 7. Fehler

Zerstöre das Template absichtlich. Entferne die schließende Klammer:

```pavlus-invalid
p Hello, {name
```

Die Ausgabe wird durch die Meldung `playground.pavlus: Unclosed { (line 1, col 8)` ersetzt. Setze die Klammer wieder ein und schreibe nun eine Zeile mit einem `if` ohne Bedingung:

```pavlus
if
  p one
```

Das ist kein Fehler. Das Ergebnis ist `<if><p>one</p></if>`, ein Element namens `if`. Es erinnert daran, dass die Ausgabe der beste Weg ist, herauszufinden, was der Compiler verstanden hat.

## Worauf du im Modul achten solltest

Wenn du das generierte Modul eines beliebigen Templates öffnest, gehe es in dieser Reihenfolge durch:

1. Die **Import-Zeile** sagt dir, welche Helfer das Template braucht. Eine längere Zeile bedeutet mehr Features.
2. **`meta`** listet die eingebetteten Kinder auf und sagt, ob es ein outlet gibt.
3. Folge in **`render`** den Kommentaren `// line N: ...`. Jeder ist eine Zeile deines Templates. Variablen sind danach benannt: `liChildren` sind die Kinder eines `li`, `userList` ist die Liste eines `for user in ...`.
4. Sieh in **`render`**, welche Knoten eine `id` haben. Nur Knoten, die gepatcht werden können, haben eine.
5. Finde in **`diff`** die Kommentare `(reads: ...)`. Die Zeile unter jedem ist ein Guard.
6. Finde in **`diff`** die Aufrufe von `patches.push`. Jeder ist eine der acht Patch-Operationen, und seine Felder sind das, was das DOM-plugin erhält.
7. Sieh dir **`idSuffix`** und **`messagePrefix`** an. Sie stecken in jeder id und jeder Nachricht, sodass ein Template in einer Schleife oder in einem anderen Template benutzt werden kann.

## Was du gelernt hast

- Der Playground führt `compileTemplate` und `render` in deinem Browser aus. Er zeigt das HTML, das Modul und die Abhängigkeitsmenge jedes Knotens, und er hat keine Patch-Liste.
- Immer nur eine Sache zu ändern und das Modul vorher und nachher zu vergleichen, ist der schnellste Weg, den Compiler zu lernen.
- Ein Template, das nichts liest, bekommt ein leeres `diff`; ein Knoten mit den Abhängigkeiten seines Parents teilt sich dessen Guard; ein key ändert, wie Elemente benannt werden.
- Ein Tippfehler kann trotzdem kompilieren. Lies das Ergebnis, nicht nur das Fehlen eines Fehlers.

Weiter: [Architektur: reiner Code und Effekte](page:concepts-architecture).
