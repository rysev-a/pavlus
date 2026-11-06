---
summary: Bringe mit {expression} lebendige Werte in ein Template. Lerne, wo Löcher erlaubt sind, die kleine Ausdruckssprache darin, was nicht unterstützt wird und wie genau Werte zu Text und Attributen werden.
---
## Ein Loch im Text

Ein Template, das immer dasselbe sagt, ist nicht sehr nützlich. Um einen Wert aus dem State zu zeigen, setzt du einen **Ausdruck** in geschweifte Klammern. Die Klammern und ihr Inhalt heißen *Interpolation* oder Loch: Der Compiler lässt ein Loch im Text und füllt es bei jedem render des Templates mit dem Wert.

Der einfachste Fall ist ein einzelner Name. `name` ist kein Text, sondern das Feld `name` des State.

::demo hello

Sieh dir die zwei Schritte an. Wenn `name` von Ann zu Bob wechselt, gibt `diff` einen Patch zurück, der den Text ersetzt. Wenn `name` zum selben Wert „geändert" wird, gibt `diff` nichts zurück: Der Compiler hat eine Prüfung generiert, die den alten und den neuen Text vergleicht und nur dann einen Patch ausgibt, wenn sie sich unterscheiden.

Alles zwischen `{` und `}` wird von pavlus selbst geparst. Es ist **nicht** JavaScript, das mit `eval` ausgeführt wird: Es ist eine kleine, reine Sprache mit eigenem Parser, und der Compiler übersetzt sie in einfaches JavaScript. Der Rest dieser Seite beschreibt diese Sprache.

## Wo Löcher erlaubt sind

Ein Loch kann an drei Stellen stehen:

- im Text: nach einem Tag (`p Hello, {name}`) und in `|`-Textzeilen;
- in einem Attributwert in Anführungszeichen: `title="Open {user.name}"`;
- als ganzer Attributwert: `alt={user.name}` oder `src=user.avatar`.

Klassen-Umschalter (`class:late=order.late`), `@event`-Argumente, `if`-Bedingungen, `for`-Listen und Komponenten-props nehmen ebenfalls einen Ausdruck. Sie werden auf eigenen Seiten beschrieben.

::demo in-attributes

In der zweiten Zeile hat `src=user.avatar` weder Klammern noch Anführungszeichen. Ein bloßer Wert ist ein Ausdruck und endet beim ersten Leerzeichen, er muss also ein einziges „Wort" sein (ohne Leerzeichen). Brauchst du Leerzeichen im Ausdruck, setze ihn in geschweifte Klammern: `alt={user.name}`. Beide Formen bedeuten dasselbe.

> [!NOTE] Anführungszeichen entscheiden, was ein Wert ist
> `alt="user.name"` ist der Literaltext `user.name`. `alt=user.name` und `alt={user.name}` lesen den State. `alt="{user.name}"` liest den State ebenfalls, und es gibt einen kleinen Unterschied, der unten im Abschnitt über Attributwerte beschrieben ist.

## Namen und Member-Zugriff

Ein bloßes Wort in einem Ausdruck ist ein **Name**. Er wird im State nachgeschlagen, den du an `render` übergibst, oder, innerhalb einer `for`-Schleife, kann er auch die Schleifenvariable sein (siehe [Bedingungen und Schleifen](page:syntax-control-flow)). Ein Punkt liest eine Eigenschaft eines Werts.

::demo members

Phone und zip sind gar nicht im State, und nichts ist kaputtgegangen. Jeder Punkt in pavlus ist **null-sicher**: `user.phone.number` wird zu `((state.user)?.phone)?.number` kompiliert, ist also irgendein Schritt auf dem Weg `null` oder `undefined`, ist der ganze Ausdruck `undefined`, und `undefined` wird als nichts gerendert. Du musst nie eine Absicherung wie `user && user.phone && user.phone.number` schreiben.

Der Ausdruck `?.` wird ebenfalls akzeptiert und bedeutet dasselbe wie `.`:

```pavlus
p {user?.name} is the same as {user.name}
```

Deshalb wirft ein Template nie, weil der State unvollständig ist. Das ist nützlich, solange Daten noch laden. Es bedeutet aber auch, dass ein Tippfehler in einem Feldnamen nicht laut fehlschlägt: Er wird als leerer Text gerendert. Wenn ein Wert nicht erscheint, prüfe zuerst die Schreibweise.

> [!TIP] Lesezugriffe werden über den Wurzelnamen verfolgt
> Der Compiler zeichnet auf, welche Namen ein Ausdruck liest. `user.address.city` liest `user`. Wenn `diff` zwei States vergleicht, fragt es zuerst: „Ist `prev.user` dasselbe Objekt wie `next.user`?" Wenn ja, wird der ganze Knoten übersprungen. Ist es ein neues Objekt, wird der Text neu berechnet und verglichen, und ein Patch entsteht nur, wenn sich das Ergebnis unterscheidet. Deshalb solltest du Objekte im State ersetzen, statt sie direkt zu verändern.

## Literale

Ein Ausdruck kann Literalwerte enthalten.

| Art | Beispiele | Hinweise |
| --- | --- | --- |
| number | `0`, `42`, `3.14`, `.5`, `1e3` | immer eine JavaScript-Zahl |
| string | `"text"`, `'text'` | beide Anführungsstile; `\n`, `\t` und `\r` sind Escapes, `\x` für jedes andere `x` ist einfach `x` |
| boolean | `true`, `false` | |
| leer | `null`, `undefined` | Wörter, wie in JavaScript |
| array | `[1, 2, 3]`, `[a, b]` | Einträge sind Ausdrücke |

Es gibt keine Objektliterale (`{ a: 1 }`), keine regulären Ausdrücke und keine Template-Strings mit Backticks.

Strings sind nützlich für den Fallback eines Operators oder für den Text eines Zweigs eines Ternary, wie du unten sehen wirst. Geschweifte Klammern innerhalb eines Strings beenden das Loch nicht: `{"}"}` ist ein Loch, das eine schließende Klammer ausgibt.

## Index-Zugriff und Aufrufe

Eckige Klammern lesen einen Eintrag nach Position oder Schlüssel. Der Index ist ein Ausdruck, kann also aus dem State kommen. Wie ein Punkt ist ein Index null-sicher.

::demo indexing

Ein Aufruf hat die Form `callee(arguments)`. Der Callee kann ein Name oder ein Member sein, du kannst also Methoden von Werten aufrufen, die im State liegen. So formatierst du einen Wert im Template:

::demo calls

`{missing.toUpperCase()}` ist leer, kein Fehler: Auch ein Aufruf ist null-sicher, und etwas aufzurufen, das `undefined` ist, ergibt `undefined`. Das verbirgt Fehler, wie beim Punkt, nutze es also bewusst.

Der generierte Code für den Aufruf ist `((state.tags)?.join)?.(", ")`: Die Methode wird weiterhin auf `state.tags` aufgerufen, damit `this` stimmt.

Eine Funktion ist nur über den State oder über einen Wert im State erreichbar. Ein Template hat keine Globals: `Math.round(x)` liest ein State-Feld namens `Math`. Brauchst du einen berechneten Wert, berechne ihn im handler, der den State ändert, und behalte das Ergebnis im State (`total`, `visibleItems`, `label`).

> [!WARNING] Optional Chaining gilt nur für Eigenschaften
> `?.` wird nur vor einem Eigenschaftsnamen akzeptiert. `items?.[0]` und `callback?.()` sind Fehler: `Expected property name`. Du brauchst sie nicht, denn `items[0]` und `callback()` sind schon null-sicher.

## Operatoren

Diese Operatoren werden unterstützt, von der höchsten Priorität zur niedrigsten:

| Operatoren | Bedeutung |
| --- | --- |
| `.` `[ ]` `( )` | Member, Index, Aufruf |
| `!` `-` `+` (vor einem Wert) | nicht, negieren, in Zahl umwandeln |
| `*` `/` `%` | multiplizieren, dividieren, Rest |
| `+` `-` | addieren (oder Strings verbinden), subtrahieren |
| `<` `>` `<=` `>=` | vergleichen |
| `==` `!=` `===` `!==` | gleich, ungleich, strikt gleich, strikt ungleich |
| `&&` | und: der erste falsy Wert oder der letzte Wert |
| ein doppelter senkrechter Strich | oder: der erste truthy Wert oder der letzte Wert |
| `??` | nullish: die rechte Seite nur, wenn die linke Seite `null` oder `undefined` ist |
| `a ? b : c` | Ternary, die niedrigste |

Die Worte „doppelter senkrechter Strich" stehen für zwei senkrechte Striche, `||`. Eine Klammer `( )` gruppiert, wie in der Arithmetik.

::demo operators

Beachte diese Zeilen der Demo:

- `{qty > 1 && "many"}` ist hier `"many"`. Wäre `qty` gleich 1, wäre der Wert `false`, was als nichts gerendert wird: ein kurzer Weg zu „zeige diesen Text nur, wenn".
- `{qty >= 3 || "few"}` ist hier `true`, und `true` wird als der Text `true` gerendert. Das Ergebnis eines Vergleichs ist ein boolean, also ist `||` ein Fallback-Werkzeug für Werte, nicht für Bedingungen. Wenn du Text willst, nimm ein Ternary.
- `{label ?? "no label"}` ersetzt `null`.

Der Unterschied zwischen `??` und dem doppelten senkrechten Strich ist bei Werten wie `0` wichtig. Der doppelte senkrechte Strich ersetzt jeden falsy Wert, `??` ersetzt nur `null` und `undefined`:

::demo nullish

Ist `count` gleich `0`, fällt die erste Zeile auf `none` zurück, und die zweite Zeile zeigt die `0`. Nutze `??`, wenn null oder ein leerer String ein echter Wert ist.

Zwei Dinge unterscheiden sich von JavaScript, sei also vorsichtig, wenn du einen Ausdruck aus deinem Code kopierst. Erstens gibt es keine Bit-Operatoren, kein `**`, kein `typeof`, `in`, `new`, keine Zuweisung (`=`, `++`) und keinen Komma-Operator. Zweitens ist `??` ein gewöhnlicher Operator, der ohne Klammern mit `&&` und `||` gemischt werden kann. Er bindet schwächer als `||`: `a ?? b || c` bedeutet `a ?? (b || c)`.

::demo precedence

Im Zweifel setze Klammern. Sie kosten im generierten Code nichts, weil der Compiler ohnehin um jede Operation eigene Klammern schreibt.

## Das Ternary: einen Wert wählen

`condition ? a : b` wählt einen von zwei Werten. Ternaries verschachteln sich nach rechts, eine Kette liest sich also wie `else if`:

::demo ternary

Im zweiten Schritt geht die Anzahl von 2 auf 9: Beide Zeilen ändern sich. Im ersten Schritt (1 auf 2) ändert sich nur die erste Zeile, weil `few` weiterhin `few` ist. Der Compiler vergleicht den endgültigen Text jeder Zeile, nicht die Eingaben.

Für ein ganzes Stück der Seite, das erscheint oder verschwindet, nimm `if`, kein Ternary. Ein Ternary erzeugt einen *Wert*; `if` erzeugt *Knoten*.

## Arrays

Ein Array-Literal erzeugt ein Array. Es ist vor allem nützlich, um eine Methode zu füttern oder einen Wert per Index zu wählen.

::demo arrays

## Truthiness

Wo eine Bedingung erwartet wird (`?:`, `&&`, `||`, `!`, `if`, `class:name=...`), nutzt pavlus die JavaScript-Regeln, weil der generierte Code JavaScript ist. Diese Werte sind **falsy**: `false`, `0`, `""`, `null`, `undefined` und `NaN`. Alles andere ist truthy.

::demo truthiness

Zwei der Zeilen überraschen Leute, die aus anderen Sprachen kommen. Ein leeres Array ist truthy, also ist `if items` für eine leere Liste wahr; schreibe `if items.length`, um zu fragen, ob etwas darin ist. Und der String `"0"` ist truthy.

## Wie Werte als Text geschrieben werden

Ein Loch im Text ruft einen Helfer namens `toText` auf. Hier ist seine ganze Definition aus der Runtime:

```ts
export function toText(value: unknown): string {
  return value == null || value === false ? "" : String(value);
}
```

Also werden `null`, `undefined` und `false` zum leeren String. Alles andere wird mit `String(...)` umgewandelt.

::demo text-values

Das ist Absicht. Es lässt `{cond && "text"}` als „zeige den Text, wenn die Bedingung gilt" funktionieren und macht fehlende Daten unsichtbar. Beachte drei Ergebnisse, die dich überraschen können:

- `0` wird als `0` gezeigt. Das ist meist das, was du für eine Anzahl willst.
- `true` wird als das Wort `true` gezeigt.
- Ein Objekt hat keinen nützlichen Text: Es wird zu `[object Object]`, und ein Array wird zu seinen Einträgen, durch Kommas verbunden. Siehst du eines davon, gibst du einen ganzen Wert aus, wo du ein Feld meintest.

## Wie Werte als Attribute geschrieben werden

Ein Attribut unterscheidet sich von Text, weil ein Attribut *fehlen* kann. Der Helfer ist `toAttr`:

```ts
export function toAttr(value: unknown): string | null {
  if (value == null || value === false) return null;
  return value === true ? "" : String(value);
}
```

- `null`, `undefined` und `false` bedeuten **kein Attribut**. Das Attribut wird nicht gerendert, und war es vorher da, entfernt `diff` es mit einem `rmAttr`-Patch.
- `true` bedeutet ein Attribut mit leerem Wert, wie `disabled=""`. So wird ein boolesches Attribut eingeschaltet.
- Alles andere ist der Wert als String, einschließlich `0` und des leeren Strings.

::demo attr-values

Lies die Ausgabe und die drei Schritte. `checked={on}` wurde zu `checked=""`. `disabled=off` fehlt, weil `off` gleich `false` ist. `title="{note}"` fehlt, solange `note` gleich `null` ist, dann fügt der Schritt es hinzu, und der letzte Schritt entfernt es. `data-count=count` behält die `0`.

Ein bloßes Attribut ohne Wert, wie `disabled` in `button(disabled)`, ist überhaupt kein Ausdruck: Es ist das feste leere Attribut.

### Ein Loch oder ein String mit einem Loch

Besteht der Wert in Anführungszeichen **nur** aus einem Loch, `title="{note}"`, behandelt der Compiler ihn genau wie `title={note}` und nutzt `toAttr`. Hat der Wert anderen Text um das Loch herum, `title="Note: {note}"`, ist der ganze Wert ein String, der durch Verbinden von Stücken entsteht, und jedes Loch darin nutzt `toText`. Ein String fehlt nie.

::demo attr-strings

Die erste Zeile hat kein `title`, solange `note` gleich `null` ist. Die zweite Zeile hat `title="Note: "`. Wähle die erste Form, wenn „kein Wert" das Attribut entfernen soll, und die zweite, wenn du ein Präfix willst.

Um ein Attribut mit einer Bedingung zu zeigen oder zu verbergen, nutze ein Ternary, das `null` zurückgibt:

::demo ternary-attr

Hier fehlt `data-state`, weil `busy` falsch ist, und `aria-pressed` hat den Text `"true"` oder `"false"`. Das ist auch der richtige Weg, ein Attribut zu schreiben, das eine CSS-Regel wie `[data-state="busy"]` liest: Ein boolean `true` wäre ein leerer Wert und würde nicht passen.

## Wie ein interpolierter String kompiliert wird

Nimm ein Template mit drei Löchern und öffne das Modul, das der Compiler dafür generiert:

::demo compiled open=module

In `render` wird der Text durch Verbinden der Stücke mit `+` gebaut: Die Literalstücke sind JavaScript-Strings, jedes Loch ist in `toText(...)` eingewickelt. Das ist die Zeile, die der Compiler für das Template oben geschrieben hat:

```ts
text: "" + toText((state.user)?.name) + " wrote " + toText(state.count) + " " + toText(((state.count === 1) ? "post" : "posts"))
```

Weil dieser String mit einem Loch beginnt, setzt der Compiler `""` an den Anfang, damit das Ergebnis immer ein String ist, auch wenn das erste Loch eine Zahl ist. Ein String, der mit Literaltext beginnt, etwa `Hello, {name}!`, beginnt stattdessen mit diesem Text.

`diff` baut denselben Ausdruck zweimal, einmal für `prev` und einmal für `next`, und vergleicht die zwei Strings. Deshalb ist der Patch eine einzige `text`-Operation mit dem vollständigen neuen Text, und deshalb erzeugt ein unveränderter Text nichts. Der Kommentar `(reads: user, count)` im generierten Code ist die Liste der Namen, die der Knoten liest. Die Zeile `if (prev.user !== next.user || prev.count !== next.count)` darunter ist die Absicherung, die die Arbeit überspringt, wenn sich keiner davon geändert hat.

Jeder Operator ist in der Ausgabe in Klammern gesetzt, jeder Member-Zugriff in `?.`, jeder Aufruf in `?.( )`. Nichts wird zur Kompilierzeit ausgewertet, und nichts in deinem Ausdruck kann den State verlassen: Die kompilierte Funktion sieht nur `state`, die Helfer und die Werte, die sie selbst baut.

## Geschweifte Klammern escapen

Ein literales `{` im Text beginnt ein Loch. Um eine Klammer zu schreiben, setze einen Backslash davor. Ein `}`, das kein Loch schließt, kann so geschrieben werden, wie es ist.

::demo escapes

`\{` und `\}` sind die einzigen Escapes im Text. Innerhalb eines Attributwerts in Anführungszeichen funktionieren sie ebenfalls. Anführungszeichen sind anders: Innerhalb von `"..."` kannst du kein doppeltes Anführungszeichen schreiben (der Backslash bleibt im Wert), nutze also einfache Anführungszeichen um den Wert, `title='He said "hi"'`, oder setze den String in ein Loch.

## Was nicht unterstützt wird

Die Sprache ist absichtlich klein. Der Compiler ist leichter zu durchdenken, jede Abhängigkeit eines Knotens lässt sich zur Kompilierzeit auflisten, und ein Template kann keinen beliebigen Code ausführen. Hier ist, was du zuerst versuchen wirst, und der echte Fehler, den du bekommst.

```pavlus-invalid
p {items.map(x => x.name)}
```

Eine Pfeilfunktion: `Unexpected character "=" (line 1, col 16)`.

```pavlus-invalid
p {`Hello ${name}`}
```

Ein Template-String: `Unexpected character "`" (line 1, col 4)`. Nutze stattdessen `"Hello {name}"` in einem Attribut oder Text mit Löchern.

```pavlus-invalid
p {count = 1}
```

Zuweisung: `Unexpected character "=" (line 1, col 10)`. Das Template ändert den State nie. Das tun Events, indem sie Messages an deinen Code senden.

```pavlus-invalid
p {typeof user}
```

Operatoren aus JavaScript, die nicht in der Tabelle stehen: `Unexpected "user" (line 1, col 11)`. Das Wort `typeof` wird als Name gelesen, und dann hat `user` keinen Operator vor sich.

```pavlus-invalid
p {a, b}
```

Der Komma-Operator: `Unexpected "," (line 1, col 5)`. Kommas trennen nur Aufruf-Argumente und Array-Einträge.

```pavlus-invalid
p {}
```

Ein Loch ohne Inhalt: `Empty expression (line 1, col 4)`.

```pavlus-invalid
p {name
```

Ein Loch, das nie geschlossen wird: `Unclosed { (line 1, col 1)`.

Die gemeinsame Antwort auf all das ist dieselbe: Erledige die Arbeit dort, wo sich der State ändert, in einem handler, und halte einen fertig anzeigbaren Wert im State. Ein Template liest dann nur Werte und wählt zwischen ihnen.

## Alles zusammen

Diese Bestellübersicht nutzt Member-Zugriff, einen Methodenaufruf, ein Ternary, einen Vergleich, `??`, `class:` und ein Loch in einem Attribut.

::demo all-in-one

Im Schritt wird der Kunde entfernt. Zwei Dinge ändern sich, und sonst nichts: das Attribut `title` (ein String mit einem Loch, wird also als `Placed by someone` neu berechnet) und der Text des Absatzes. Die Überschrift und die Zeilenanzahl lesen `order`, das im Schritt seine Identität nicht geändert hat, ihre Prüfungen werden also schon durch den ersten Vergleich übersprungen.

Sowohl `order.customer?.name ?? 'someone'` als auch `order.customer.name ?? 'someone'` würden funktionieren. Das `?.` ist nur eine Erinnerung für den Leser.

## Was du gelernt hast

- `{expr}` kann im Text stehen, in einem Attributwert in Anführungszeichen oder ein ganzer Attributwert sein (`alt={x}` oder `alt=x`).
- Die Sprache hat Literale, Namen, `.` und `[ ]` (beide null-sicher), Aufrufe, unäre und binäre Operatoren, `?:` und Arrays. Nichts wird zugewiesen, und es gibt keine Pfeilfunktionen oder Template-Strings.
- `null`, `undefined` und `false` sind leerer Text und ein fehlendes Attribut; `true` ist ein leeres Attribut; `0` und `""` sind Werte.
- Der Compiler macht aus einem String mit Löchern `"literal" + toText(expr) + ...` und vergleicht das Ergebnis von `prev` und `next`, um über einen Patch zu entscheiden.

Weiter: [Events und Nachrichten](page:syntax-events).
