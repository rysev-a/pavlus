---
summary: Ein Template ist ein eingerückter Baum aus Elementen. Lerne, Tags, Klassen, ids, Text und Attribute zu schreiben, vom einzeiligen Absatz bis zu einer kleinen Karte.
---
## Das kleinste Template

Ein pavlus-Template ist eine Textdatei, meist mit dem Namen `something.pavlus`. Jede Zeile ist eine Sache: ein Element, ein Stück Text oder ein Schlüsselwort. Die **Einrückung** sagt, was in was enthalten ist, wie in Python oder YAML. Es gibt keine schließenden Tags und keine geschweiften Klammern um Blöcke.

Das kleinste nützliche Template ist eine Zeile: ein Tag-Name, gefolgt von seinem Text.

::demo hello

Die Demo oben wird gerade jetzt in deinem Browser vom echten Compiler kompiliert. Du siehst das Template, das HTML, das `render` erzeugt hat, und weiter unten das Modul, das der Compiler generiert hat. Klappe die eingeklappten Abschnitte auf, wenn du neugierig bist; der Rest dieser Seite nutzt nur die ersten beiden.

> [!TIP] Leerzeichen, keine Tabs
> Rücke mit zwei Leerzeichen ein. Eine Zeile, die stärker eingerückt ist als die vorherige, wird ihr Child; eine Zeile, die weniger eingerückt ist, beendet den Block.

## Klassen und ids

Nach dem Tag-Namen kannst du Klassen mit einem Punkt und eine id mit einer Raute hinzufügen, in derselben Reihenfolge, in der du einen CSS-Selektor schreiben würdest. Der Tag-Name kann weggelassen werden: `.card` bedeutet `div.card`.

::demo selectors

Mehrere Klassen werden verkettet: `a.btn.btn-primary`. Ohne Tag ist das Element ein `div`, also ist `#app` gleich `<div id="app">`.

## Text

Text nach dem Tag, in derselben Zeile, ist das erste Child des Elements. Für längeren oder gemischten Inhalt setzt du Text in eigene Zeilen, die mit einem senkrechten Strich `|` beginnen. Jede `|`-Zeile ist ein Textknoten, und der Text darf `{expressions}` enthalten (siehe nächste Seite).

::demo text-lines

Eine Zeile, die mit `//` beginnt, ist ein Kommentar. Er gelangt nie in die Ausgabe.

## Attribute

Attribute stehen in Klammern nach dem Tag, getrennt durch Leerzeichen. Ein Wert kann ein String in Anführungszeichen, ein zahlenähnliches Literal oder ein Ausdruck sein.

::demo attributes

- `type="button"` ist ein einfacher String.
- `disabled` ohne Wert ist ein boolesches Attribut: Es ist vorhanden und bedeutet *true*.
- `href=url` hat keine Anführungszeichen, also ist `url` **ein Ausdruck**: Er liest das Feld `url` des State.
- `title="Open {name}"` ist ein String mit einem Loch darin; der Compiler macht daraus eine Verkettung.

> [!NOTE] Anführungszeichen entscheiden, was ein Wert ist
> `class="x"` ist der Text `x`. `class=x` ist das State-Feld `x`. Das ist der häufigste erste Fehler, und der Compiler kann nicht davor warnen, weil beide Formen gültig sind.

## Eine Klasse umschalten

Eine statische Klasse wird mit einem Punkt geschrieben. Eine Klasse, die vom State abhängt, wird als Attribut namens `class:name` geschrieben, mit einer Bedingung als Wert. Die Klasse ist am Element, wenn die Bedingung wahr ist.

::demo class-toggle

Beachte den zweiten Schritt der Demo: Nur das Attribut `class` wird gepatcht, sonst nichts. Wie der Compiler weiß, was er patchen muss, ist das Thema des [Compiler-Abschnitts](page:compiler-diff).

## Alles zusammen

Hier ist eine kleine Karte, die alles von dieser Seite nutzt. Lies sie von oben: das äußere `div`, eine Überschrift mit einer id, ein Absatz, dann ein Button mit mehreren Attributen.

::demo card open=ast

Der AST-Abschnitt zeigt für jeden Knoten den Teil des State, den er liest. Knoten mit *reads: none* können sich nie ändern, deshalb überspringt das generierte `diff` sie vollständig.

## Was du gelernt hast

- Eine Zeile ist ein Element: `tag.class#id(attr=value) text`.
- Einrückung ist Verschachtelung. Ein führendes `|` macht eine Textzeile. `//` macht einen Kommentar.
- Werte in Anführungszeichen sind Text, Werte ohne Anführungszeichen sind Ausdrücke, `class:name=cond` schaltet eine Klasse um.

Weiter: [Ausdrücke und Interpolation](page:syntax-expressions).
