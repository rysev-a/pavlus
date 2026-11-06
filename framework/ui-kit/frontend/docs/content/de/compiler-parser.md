---
summary: Wie der Parser Template-Zeilen und Einrückung in einen typisierten AST verwandelt. Lerne jeden Knotentyp mit seinen echten Feldern kennen, wie Ausdrücke geparst werden, wie Knoten-ids vergeben werden und wie Fehler Zeile und Spalte melden.
---
## Was der Parser macht

Der Parser ist die erste Stufe des Compilers. Er nimmt den Text eines Templates und gibt einen **Baum** zurück, den AST (Abstract Syntax Tree). Er führt nichts aus, kennt deinen State nicht und schreibt kein JavaScript. Er beantwortet nur die Frage "was sagt dieser Text?" und bricht mit einer klaren Meldung ab, wenn der Text nichts Sinnvolles sagt.

Die Funktion heißt `parse(source)`, und das Ergebnis hat diese Form:

```ts
interface TemplateAst {
  imports: { local: string; from: string }[];
  nodes: Node[];
}
```

`imports` sind die `import`-Zeilen ganz oben. `nodes` sind die Knoten der obersten Ebene des Templates. Ein Knoten hat einen von sechs Typen: `element`, `text`, `if`, `for`, `embed` und `outlet`. Alles unterhalb der obersten Ebene hängt unter einem `element`, einem `if`-Zweig oder einem `for`.

Das kleinste interessante Template ist ein Element mit einer Interpolation. Die Demo zeigt seinen AST in dem Format, das auf dieser Seite verwendet wird (eine Zeile pro Knoten, mit der Knoten-id und dem, was er liest).

::demo ids-small open=ast

Es gibt zwei Knoten: das Element `p` mit der Knoten-id `#0` und darin einen Textknoten `#1`. Das echte Objekt hinter dieser Auflistung sieht so aus (die Ausgabe des Parsers, zum Lesen formatiert):

```json
{
  "imports": [],
  "nodes": [
    {
      "type": "element",
      "nid": 0,
      "tag": "p",
      "classes": [],
      "toggles": [],
      "attrs": [],
      "events": [],
      "children": [
        {
          "type": "text",
          "nid": 1,
          "line": 1,
          "parts": ["Hello, ", { "k": "id", "name": "name" }]
        }
      ],
      "pos": { "line": 1, "col": 1 }
    }
  ]
}
```

Zwei Details solltest du dir merken. Ein Textknoten ist eine Liste von **Teilen** (parts): Ein Teil ist entweder ein einfacher String oder ein Ausdrucksobjekt (`k` ist die Art des Ausdrucks). Und der Inline-Text von `p Hello, {name}` ist keine Eigenschaft des Elements: Der Parser macht daraus einen echten Kindknoten. Ab hier sieht der Compiler nur noch einen Baum aus Knoten.

## Zeilen und Einrückung

Der Parser arbeitet Zeile für Zeile. Zuerst bereitet er die Zeilen vor:

1. Er teilt den Quelltext an Zeilenumbrüchen und überspringt leere Zeilen.
2. Ein Tab in der Einrückung ist ein Fehler: `Tabs are not allowed, use spaces`.
3. Eine Zeile, die mit `//` beginnt, wird verworfen. Bei den anderen Zeilen wird ein `// comment` am Ende abgeschnitten, aber nur, wenn das `//` auf ein Leerzeichen folgt und außerhalb von Anführungszeichen, runden und geschweiften Klammern steht. Darum ist `href="http://example.com"` sicher.
4. Jede verbleibende Zeile merkt sich ihre Nummer, ihre Einrückung (die Anzahl der führenden Leerzeichen) und ihren getrimmten Text.

Dann baut er den Baum mit einem **Stack offener Parents**. Für jede Zeile entfernt der Parser vom Stack jeden Parent, der nicht weniger eingerückt ist als die Zeile. Was oben bleibt, ist der Parent der Zeile. Die Zeile wird an die Kinder dieses Parents angehängt und dann selbst auf den Stack gelegt.

::demo indent open=ast

In diesem Template hat `li Two` ein Kind `b`, weil `b bold` stärker eingerückt ist als `li Two`. Die Zeile `p After` hat die Einrückung von `ul`, also wird alles bis hin zu `li Two` und `b bold` vom Stack genommen, und `p` wird der nächste Knoten der obersten Ebene.

Zwei Regeln halten den Baum ehrlich.

- **Alle Kinder eines Parents müssen dieselbe Einrückung benutzen.** Das erste Kind legt die Einrückung fest, und jedes spätere Geschwister mit einer anderen Einrückung ergibt `Inconsistent indentation`. Wie viele Leerzeichen du benutzt, bleibt dir überlassen (zwei sind die Konvention); wie viele mehr als der Parent, ist nicht festgelegt. Wichtig ist, dass sich die Geschwister einig sind.
- **Manche Zeilen sind Blätter.** Ein Void-Element (`br`, `img`, `input` und die übrigen HTML-Void-Tags), eine Textzeile, ein Embed und ein outlet dürfen keine Kinder haben. Ein Kind darunter ergibt `This line cannot have children`.

```pavlus-invalid bad-indent.pavlus
div
  p one
    span child of one
   p two
```

```text
bad-indent.pavlus: Inconsistent indentation (line 4, col 1)
```

Der Parser liest Zeile 4 (`   p two`, drei Leerzeichen). Ihr Parent ist `div`, dessen Kinder eine Einrückung von 2 benutzen, also wird die Zeile abgelehnt. Der Fehler zeigt immer auf Spalte 1, weil das Problem die Einrückung als Ganzes ist.

## Was für eine Zeile ist das?

Wenn die Einrückung geklärt ist, schaut der Parser auf den Anfang der Zeile und entscheidet, was sie ist. Die Prüfungen laufen in dieser Reihenfolge, und der erste Treffer gewinnt.

| Die Zeile beginnt mit | Sie ist | Knoten |
| --- | --- | --- |
| `import Name from "path"` | ein Import (nur ganz oben in der Datei) | ein Eintrag in `imports` |
| `if expr` | eine Bedingung | `IfNode` |
| `else if expr` oder `else` | der nächste Zweig des vorherigen `if` | ein neuer Zweig in diesem `IfNode` |
| `for item in list` | eine Schleife | `ForNode` |
| dem Pipe-Zeichen und einem Leerzeichen | eine Textzeile | `TextNode` |
| `{` | eine Textzeile, die mit einem Ausdruck beginnt | `TextNode` |
| `+outlet` | das geroutete Kind | `OutletNode` |
| `+` | ein Kind-view | `EmbedNode` |
| allem anderen | ein Element | `ElementNode` |

Der Doppelpunkt am Ende von `if x:` und `for a in b:` ist optional und wird ignoriert. `else` muss auf ein `if` oder ein `else if` auf derselben Ebene folgen; sonst bekommst du ``` `else` without matching `if` ```.

## Elemente

Eine Elementzeile hat diese Form: ein optionaler Tag, beliebig viele `.class` und `#id`, optionale `(attributes)` und dann optionaler Inline-Text. Der Tag ist standardmäßig `div`. Parsen wir eine Zeile, die die meisten Teile benutzt.

::demo selector-attrs open=ast

Der AST zeigt nur die Abhängigkeiten, hier also der echte Knoten, mit gekürzten langen Teilen:

```json
{
  "type": "element",
  "nid": 0,
  "tag": "a",
  "classes": ["btn"],
  "toggles": [{ "name": "on", "test": { "k": "id", "name": "open" } }],
  "attrs": [
    { "name": "id", "value": ["go"] },
    { "name": "href", "value": [{ "k": "id", "name": "url" }] },
    { "name": "disabled", "value": null }
  ],
  "events": [
    {
      "name": "click",
      "msg": "save",
      "args": [{ "k": "id", "name": "id" }, { "k": "lit", "value": 2 }],
      "prevent": true,
      "stop": false
    }
  ],
  "children": [{ "type": "text", "nid": 1, "line": 1, "parts": ["Go"] }],
  "pos": { "line": 1, "col": 1 }
}
```

Jeder Teil der Zeile landet in einem eigenen Feld:

- `.btn` geht nach `classes`. `#go` wird als gewöhnliches Attribut namens `id` gespeichert (es wird zuerst hinzugefügt, vor den Attributen in Klammern).
- `class:on=open` geht nach `toggles`: ein Klassenname und eine Bedingung. Es ist kein Attribut.
- `@click.prevent=save(id, 2)` geht nach `events`. Der Teil nach `@` ist der DOM-Event-Name, die Modifikatoren (`prevent`, `stop`) werden zu Flags. Der Ausdruck muss eine Nachrichten-id wie `save`, `users.remove` oder ein Aufruf einer solchen sein; seine Argumente sind Ausdrücke. Alles andere ist ein Fehler: `Event handler must be a message id like `save` or `remove(item)``.
- `href=url` ist ein Attribut, dessen Wert eine Liste mit einem Ausdruck ist. `disabled` ohne Wert hat `value: null`: ein boolesches Attribut.

Ein Attributwert ist immer eine Liste von Teilen, wie ein Textknoten. Ein Wert in Anführungszeichen ohne geschweifte Klammern, wie `"go"`, ist eine Liste mit einem String. So unterscheidet der Compiler ein statisches Attribut (nur Strings) von einem dynamischen (es hat einen Ausdruck). Dieser Unterschied entscheidet später über vieles.

### Drei Arten von Attributwerten

Ein Attributwert kann auf drei Arten geschrieben werden, und der Parser liest jede anders.

- **In Anführungszeichen**: `title="Open {name}"`. Der Text zwischen den Anführungszeichen wird in Strings und `{expressions}` zerlegt, genau wie eine Textzeile.
- **In geschweiften Klammern**: `hidden={count === 0}`. Alles zwischen den Klammern ist ein Ausdruck, darf also Leerzeichen enthalten.
- **Bloß**: `href=url`. Der Wert endet am ersten Leerzeichen, Komma oder schließenden `)`, das nicht in Klammern oder Anführungszeichen steht. Er wird als ein Ausdruck geparst.

Bei der bloßen Form passiert der häufigste erste Fehler. Ein Ausdruck mit Leerzeichen braucht geschweifte Klammern:

```pavlus-invalid bare.pavlus
ul
  for link in links
    a(class:current=link.href === page) {link.label}
```

```text
bare.pavlus: Unexpected "=" in attributes (line 3, col 31)
```

Der bloße Wert `link.href` endete am Leerzeichen, und der Parser traf dann auf `===`, wo er einen Attributnamen erwartete. Die Lösung sind geschweifte Klammern: `class:current={link.href === page}`.

## Textzeilen, Verbindungen und Escapes

Eine Zeile, die mit `|` beginnt, ist ein Textknoten. Der Parser entfernt das Pipe-Zeichen und ein Leerzeichen danach. Eine Textzeile kann Ausdrücke in geschweiften Klammern enthalten, und ein Backslash vor einer Klammer erhält sie als literales Zeichen.

::demo escapes open=ast

Die Kommentarzeile ist weg, ebenso der Kommentar am Ende nach `Home`, während die URL in Anführungszeichen ihr `//` behalten hat. Im Absatz wurden `\{` und `\}` zu einfachen Klammern, und `{n}` wurde zu einem Ausdruck.

Wenn zwei Textknoten aufeinander folgen, setzt der Parser vor den zweiten einen Zeilenumbruch. In HTML wird ein Zeilenumbruch zwischen Wörtern als Leerzeichen angezeigt, sodass zwei Zeilen wie ein Absatz gelesen werden, wie in der Template-Sprache pug.

::demo text-join open=ast

Der zweite Textknoten hat die Teile `"\n"`, `"two "` und den Ausdruck `x`. Den Zeilenumbruch siehst du im HTML: `one` und `two 2` stehen im Quelltext in verschiedenen Zeilen. Dieselbe Regel verbindet den Inline-Text eines Elements (`p Hello`) mit einer `|`-Zeile darunter.

## Bedingungen und Schleifen

Eine `if`-Zeile beginnt einen `IfNode`. Der Knoten hat eine Liste von `branches`. Jeder Zweig hat einen `test` (einen Ausdruck, oder `null` bei `else`) und seine `children`. Die Zeilen `else if` und `else` erzeugen keine eigenen Knoten: Sie fügen dem `if`-Knoten direkt davor einen Zweig hinzu.

::demo if-chain open=ast

Die AST-Ansicht gibt einen Knoten pro `if` aus und darunter die Gruppen `then`, `else if` und `else`. Die Knoten-ids zeigen etwas, das du dir merken solltest: Das `if` ist `#0`, die drei `p`-Elemente und ihre Texte sind `#1` bis `#6`, und die Zweige selbst haben keine ids. Ein Zweig ist kein Knoten.

Die echten Felder des Knotens, ohne die Kinder:

```json
{
  "type": "if",
  "nid": 0,
  "line": 1,
  "branches": [
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "loading" } }, "children": [] },
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "error" } }, "children": [] },
    { "test": null, "children": [] }
  ]
}
```

Eine `for`-Zeile hat mehr Teile: einen Item-Namen, einen optionalen Indexnamen, den Listenausdruck und einen optionalen `key`-Ausdruck.

::demo for-index open=ast

```json
{
  "type": "for",
  "nid": 0,
  "line": 1,
  "item": "u",
  "index": "i",
  "of": { "k": "id", "name": "users" },
  "key": { "k": "member", "obj": { "k": "id", "name": "u" }, "prop": "id" },
  "children": []
}
```

Der Parser teilt `users key u.id` am Wort `key`. Der key dient der Schleife dazu, Elemente zu unterscheiden, wenn sich die Liste ändert; ohne ihn ist die Position in der Liste der key. Die Namen `u` und `i` sind nur innerhalb der Schleife sichtbar. Die nächste Seite, [Abhängigkeitsanalyse](page:compiler-analysis), zeigt, wie der Compiler das nutzt.

## Kind-views und das outlet

Eine `import`-Zeile gibt einem anderen Template einen Namen. Eine Zeile, die mit `+` beginnt, platziert es. Der Name vor `#` ist der **Instanzname**: Er ist das Präfix der Nachrichten des Kindes und der key seines State.

::demo embeds open=ast

```json
{
  "type": "embed",
  "nid": 1,
  "component": "Badge",
  "dynamic": null,
  "name": "first",
  "props": [
    { "name": "label", "value": ["Hi ", { "k": "id", "name": "name" }] },
    { "name": "strong", "value": null }
  ],
  "pos": { "line": 4, "col": 3 }
}
```

Die AST-Ansicht zeigt die beiden Embeds ohne ihre Props, aber die Abhängigkeiten zeigen den Unterschied: `+Badge#first` liest `name`, und `+Badge#second(...extra)` liest `extra`, weil auch ein Spread-Eintrag (`{ "spread": expr }`) eine Prop ist. Eine Prop ohne Wert (`strong`) bedeutet `true`.

Der Parser prüft diese Regeln, weil der Compiler sie nicht umgehen kann:

- `import`-Zeilen sind nur ganz oben in der Datei erlaubt, bei Einrückung 0, vor jedem Knoten.
- Der importierte Name muss mit einem Großbuchstaben beginnen und darf keiner von `String`, `Array`, `Map`, `Set` oder `Error` sein, die der generierte Code selbst benutzt.
- `+Name` braucht einen passenden Import: `"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state`.
- Ein dynamisches Embed, `+{expr}`, hat keinen Namen, aus dem sich ein Instanzname ableiten ließe, also braucht es einen: `+{view}#page`.
- `+outlet` darf nichts nach sich haben. Es wird zu einem `OutletNode` mit nur `nid` und `line`.

## Ausdrücke

Jedes `{...}`, jeder Attributwert in geschweiften Klammern oder bloß und jede Bedingung geht an einen zweiten, getrennten Parser in `expr.ts`. Er behandelt absichtlich eine kleine Teilmenge von JavaScript. Es gibt drei Schritte: den Text in Tokens zerlegen (Zahlen, Strings, Namen und Satzzeichen), dann die Präzedenzstufen hinaufklettern, dann prüfen, dass nichts übrig bleibt.

Das Ergebnis ist ein kleiner Baum. Jeder Knoten hat ein Feld `k` mit seiner Art:

| `k` | Felder | Geschrieben als |
| --- | --- | --- |
| `lit` | `value` | `1`, `"text"`, `true`, `false`, `null`, `undefined` |
| `id` | `name` | `count` |
| `member` | `obj`, `prop` | `user.name` und `user?.name` |
| `index` | `obj`, `index` | `list[0]` |
| `call` | `callee`, `args` | `format(price, "usd")` |
| `unary` | `op`, `arg` | `!done`, `-n`, `+n` |
| `binary` | `op`, `left`, `right` | `a + b`, `a === b`, `x ?? y` |
| `cond` | `test`, `then`, `else` | `ok ? "yes" : "no"` |
| `array` | `items` | `[1, x]` |

Die binären Operatoren und ihre Präzedenz, vom schwächsten zum stärksten: `??`, dann `||`, dann `&&`, dann die Gleichheitsoperatoren (`==`, `!=`, `===`, `!==`), dann die Vergleiche (`<`, `>`, `<=`, `>=`), dann `+` und `-`, dann `*`, `/` und `%`. Der ternäre Operator `? :` bindet schwächer als alle diese, und die unären Operatoren binden stärker. Klammern gruppieren wie üblich. Also ist `a + b * 2` dasselbe wie `a + (b * 2)`.

::demo expressions open=ast

Die AST-Ansicht gibt jeden Ausdruck aus seinem Baum wieder aus, mit den hinzugefügten Klammern in `{a + (b * 2)}`: Das ist der Baum, nicht dein Text. Beachte auch, dass `user?.name` als `user.name` ausgegeben wird. Der Parser behandelt `.` und `?.` gleich, weil der generierte Code ohnehin jeden Member mit `?.` liest. Ein Template kann kein "cannot read properties of undefined" werfen.

Hier ein paar echte Bäume. Links steht der Ausdruck als Text, das JSON ist das, was `parseExpr` zurückgibt:

```json
{ "k": "binary", "op": "+",
  "left": { "k": "id", "name": "a" },
  "right": { "k": "binary", "op": "*", "left": { "k": "id", "name": "b" }, "right": { "k": "lit", "value": 2 } } }
```

```json
{ "k": "cond",
  "test": { "k": "unary", "op": "!", "arg": { "k": "id", "name": "ok" } },
  "then": { "k": "id", "name": "n" },
  "else": { "k": "unary", "op": "-", "arg": { "k": "lit", "value": 1 } } }
```

Der erste ist `a + b * 2`, der zweite ist `!ok ? n : -1`.

> [!NOTE] Was Ausdrücke nicht können
> Es gibt keine Zuweisung, keine Arrow Function, keinen Template String, kein Objektliteral, kein `typeof`, kein `new`. Ein Template liest den State, es ändert ihn nicht. Jedes davon ergibt beim Build einen klaren Fehler, zum Beispiel ergibt `{x = 1}` `Unexpected character "="`, und `{`a`}` ergibt ``Unexpected character "`"``. Änderungen passieren, indem ein Event eine Nachricht sendet.

## Knoten-ids

Jeder Knoten bekommt eine Nummer, seine **nid**, wenn der Parser ihn erzeugt. Der Zähler beginnt für jedes Template bei 0 und zählt in Dokumentreihenfolge um eins hoch: ein Parent vor seinen Kindern, ein Knoten vor den Knoten darunter. Der Inline-Text eines Elements bekommt die nächste Nummer direkt nach dem Element.

Imports und Zweige bekommen keine Nummer. Zweige sind Teil eines `if`-Knotens, und Imports gehören nicht zum Baum.

::demo tree open=ast

Lies die Nummern in der Auflistung. Die `section` ist `#0`, dann ist `h2` `#1` und sein Text `#2`. Das `if` ist `#3` und belegt die ids `#4` bis `#9` für alles in seinen beiden Zweigen. Nach dem `if` kommt der `footer` als `#10` und sein Text als `#11`. Das ist schlichte Tiefensuche-Reihenfolge.

Diese Nummern sind für den Rest des Compilers wichtig. Der Codegenerator schreibt sie in die Strings, die in den vnodes (`"11"` für den Footer-Text) und in den Patches zu ids werden. In einer Liste ist die id eines Knotens seine nid, gefolgt von `#` und dem Element-key (`"7#1"`), und die id eines Knotens eines Kind-views wird um `/` und die nid des Embeds erweitert (`"1/3"`). Zwei Knoten eines Templates können nie dieselbe id haben, weil sich ihre nids unterscheiden, und zwei Kopien eines Knotens in einer Liste unterscheiden sich durch den key.

> [!TIP] ids sind keine stabilen Namen
> Speichere keine nid und schreibe sie nicht in deinen eigenen Code. Füge oben in einem Template eine Zeile hinzu, und jede Nummer darunter verschiebt sich um eins. Die Nummern sind eine interne Vereinbarung zwischen `render` und `diff` desselben kompilierten Moduls.

## Positionen und Fehler

Der Parser behält Quellpositionen dort, wo ein Fehler gemeldet werden könnte. Ein Element und ein Embed haben ein `pos` mit einer 1-basierten `line` und `col`. Andere Knoten haben eine `line`. Fehler tragen beide Zahlen und benutzen in jeder Stufe dieselbe Konvention.

```ts
class TemplateError extends Error {
  readonly line: number;
  readonly col: number;
}
```

Die Meldung endet mit der Position in Klammern, zum Beispiel `Unclosed { (line 1, col 8)`. Die beiden Zahlen sind auch als `error.line` und `error.col` verfügbar, sodass ein Tool wie ein Editor die genaue Stelle unterstreichen kann. `compileTemplate` stellt den Dateinamen voran, wenn es einen kennt, und das siehst du im Build-Log.

Die Spalte eines Ausdrucksfehlers ist exakt: Der Parser übergibt dem Ausdrucks-Parser die Position des ersten Zeichens des Ausdrucks, und dieser addiert den Versatz des Tokens. Eine Ungenauigkeit solltest du kennen: Bei `Unclosed {` im Text zählt die Spalte ab dem Anfang des Texts nach dem Tag, nicht ab dem Zeilenanfang. Im ersten Beispiel unten steht das `{` in Spalte 10 der Zeile, und die Meldung sagt 8. Einige echte Meldungen aus dem Kompilieren fehlerhafter Templates:

```pavlus-invalid unclosed.pavlus
p Hello, {user.name
```

```text
unclosed.pavlus: Unclosed { (line 1, col 8)
```

```pavlus-invalid expression.pavlus
p Total: {price *}
```

```text
expression.pavlus: Unexpected end of expression (line 1, col 18)
```

```pavlus-invalid branch.pavlus
p one
else
  p two
```

```text
branch.pavlus: `else` without matching `if` (line 2, col 1)
```

```pavlus-invalid event.pavlus
button(@click=a+b) Save
```

```text
event.pavlus: Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

Jeder Fehler beendet das Parsen beim ersten Problem. Der Parser versucht nicht weiterzumachen, also behebe die erste Meldung und kompiliere erneut.

> [!WARNING] Anführungszeichen entscheiden, was ein Wert ist
> `class="x"` ist der Text `x`. `class=x` ist das Feld `x` des State. Beides ist gültig, also ist keines ein Fehler. Wenn eine Seite dort nichts zeigt, wo du eine Klasse erwartest, prüfe zuerst die Anführungszeichen.

## Ein AST, drei Leser

Du hast jetzt alles gesehen, was der Parser erzeugt. Es ist ein einfacher Baum aus einfachen Objekten ohne Methoden, und drei spätere Stufen lesen denselben Baum: Die Analyse liest ihn, um zu berechnen, was jeder Knoten liest, die `render`-Generierung liest ihn, um die vnodes zu schreiben, und die `diff`-Generierung liest ihn, um die Vergleiche zu schreiben. Weil die Stufen einen Baum teilen, können sie sich nicht darüber uneinig sein, was das Template bedeutet. Sieh dir das große Ganze noch einmal an, mit einem Template, das alle Knotentypen außer dem Embed hat:

::demo if-chain

Dasselbe Template hat im AST ein `if` mit drei Zweigen. In `render` wird daraus eine `if / else if / else`-Kette zwischen zwei Markern. In `diff` wird daraus die Berechnung der Zweignummer für `prev` und für `next`, und ein Zweigwechsel wird zu einem `clear` und einem `insert`. Der Schritt oben zeigt genau das. Die Details stehen auf den nächsten Seiten.

## Was du gelernt hast

- `parse` liest Zeilen und Einrückung in einen Baum aus sechs Knotentypen. Die Einrückung legt den Parent fest, und alle Geschwister müssen sich darin einig sein.
- Inline-Text wird zu einem echten Textknoten; Attributwerte und Text sind Listen von Teilen (Strings und Ausdrücke), so weiß der Compiler, was statisch ist.
- Ausdrücke werden von einem eigenen kleinen Parser in neun Arten von Knoten geparst. `.` und `?.` sind gleich, und ein Template kann nur lesen.
- Knoten-ids sind die Reihenfolge der Erzeugung in einer Tiefensuche. Sie sind intern und werden zu den ids von vnodes und Patches.
- Ein Fehler ist ein `TemplateError` mit Zeile und Spalte; das Build-Log zeigt außerdem den Dateinamen.

Weiter: [Abhängigkeitsanalyse](page:compiler-analysis).
