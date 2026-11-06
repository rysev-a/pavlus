---
summary: Wie der Compiler herausfindet, welchen Teil des State jeder Knoten liest, und wie diese eine Antwort entscheidet, welche Knoten eine id bekommen, welche Vergleiche in diff geschrieben werden und welche Knoten ganz übersprungen werden.
---
## Die Frage, die die Analyse beantwortet

Ein Template ist eine Funktion des State. Wenn sich der State ändert, bleibt meistens der größte Teil der Seite gleich. Um die Seite günstig zu aktualisieren, muss `diff` schnell wissen, welche Knoten betroffen sein können. Der Compiler beantwortet das einmal, beim Build, für jeden Knoten: **Welche Felder des State liest dieser Knoten?**

Diese Antwort ist die **Abhängigkeitsmenge** (dependency set) des Knotens. Sie wird von einem kleinen Modul, `analyze.ts`, aus dem AST berechnet. Die Menge wird auf drei Arten genutzt:

- Ein Knoten mit **leerer** Menge kann sich nie ändern. Er bekommt keine `id` und keinen Code in `diff`.
- Ein Knoten mit nicht leerer Menge bekommt in `diff` einen **Guard**: Der Code, der den Knoten behandelt, läuft nur, wenn sich eines der Felder der Menge geändert hat.
- Die Menge eines Parents enthält die Mengen all seiner Kinder, sodass ein Guard an einem Parent einen ganzen Teilbaum auf einmal überspringen kann.

Beginne mit dem kleinsten Fall. Die Demo öffnet den AST-Abschnitt; die Spalte `reads:` ist die Abhängigkeitsmenge.

::demo basic open=ast

Das Element und sein Text lesen beide `name`. Schritt eins ändert `name`, und die Antwort ist ein `text`-Patch. Schritt zwei ändert ein Feld, das das Template nicht liest (`n`), und die Antwort ist eine leere Liste: Die erste Zeile von `diff`, die `name` erwähnt, ist falsch, und die Funktion kehrt sofort zurück.

## Freie Bezeichner eines Ausdrucks

Die Grundlage der Analyse ist eine Funktion, die einen Ausdruck nimmt und seine **freien Bezeichner** sammelt: die Namen, die von außerhalb des Ausdrucks kommen, also aus dem State (oder aus einer umgebenden Schleife). Sie durchläuft den Ausdrucksbaum und notiert nur die Bezeichner:

- Ein Literal (`1`, `"x"`, `true`) liest nichts.
- Ein Bezeichner (`count`) liest seinen Namen.
- Ein Member-Zugriff (`user.profile.name`) liest den Bezeichner an der Wurzel der Kette: `user`. Die Namen `profile` und `name` sind Properties, keine State-Felder.
- Ein Index (`items[index]`) liest beide Seiten: `items` und `index`.
- Ein Aufruf (`fmt(count, unit)`) liest den Aufgerufenen und jedes Argument: `fmt`, `count` und `unit`.
- Unäre, binäre, bedingte und Array-Ausdrücke lesen alles, was in ihnen steht.

::demo members open=ast

Sieh dir den ersten Absatz an. Er zeigt `user.profile.name` und `user.role`, und seine Abhängigkeit ist nur `user`. Der zweite liest `index` und `items`. Der dritte liest auch die Funktion `fmt`: Wenn im State eine Funktion gespeichert ist, zählt ihr Austausch als Änderung.

> [!NOTE] Die Einheit der Änderung ist ein Feld der obersten Ebene
> Der Compiler verfolgt `user`, nicht `user.profile.name`. Er vergleicht `prev.user !== next.user`, eine einzelne Prüfung der Referenz. Wenn du das ganze `user`-Objekt ersetzt, wird jeder Knoten angesehen, der irgendeinen Teil von `user` liest. Der nächste Schritt, der Vergleich des berechneten Texts, stellt dann fest, dass sich nichts Sichtbares geändert hat, und es wird kein Patch geschrieben. Eine grobe Abhängigkeit kostet also ein paar Vergleiche, nie eine falsche Seite.

## Was jede Art von Knoten liest

Die Funktion `nodeDeps` gibt die Abhängigkeitsmenge eines Knotens zurück. Ihre Regeln folgen den Knotentypen.

| Knoten | Liest |
| --- | --- |
| text | die Bezeichner in seinen Teilen |
| element | seine Attributwerte, die Bedingungen seiner Klassen-Umschalter, die Argumente seiner Events und alles, was seine Kinder lesen |
| if | den Test jedes Zweigs und alles, was die Zweige enthalten |
| for | den Listenausdruck, plus was der Body liest, minus die Schleifenvariablen |
| embed | den dynamischen view-Ausdruck, jeden Prop-Wert und jeden Spread |
| outlet | alles (siehe das Ende dieser Seite) |

Das Ergebnis für einen Knoten wird gemerkt, eine erneute Frage kostet also nichts. Weil ein Element seine Kinder einschließt, hat die Wurzel des Templates immer die größte Menge: die Vereinigung des ganzen Baums.

## Statische Knoten

Ein Knoten mit leerer Menge ist **statisch**. Der Compiler macht für ihn drei Dinge.

1. In `render` schreibt er den vnode ohne `id`, weil nie ein Patch ihn benennen wird (die einzige Ausnahme ist ein Text wie `{null}`: Er ist ein Ausdruck, bekommt also eine id, obwohl er sich nie ändern kann).
2. In `diff` schreibt er nichts. Die Funktion, die einen Knoten behandelt, beginnt mit einer Prüfung genau für diesen Fall: keine Abhängigkeiten, nichts zu tun.
3. Weil die Menge des Parents die Vereinigung der Mengen seiner Kinder ist, trägt ein statisches Kind nichts zum Guard des Parents bei.

::demo static-mix open=ast

Nur der letzte Absatz und das `div`, das ihn enthält, lesen `visits`. Der Titel und der gedämpfte Absatz zeigen `reads: —`. Vergleiche mit dem generierten `diff` für dieses Template:

```ts
function diff(prev, next, idSuffix = "", messagePrefix = "", env) {
  const patches = [];
  if (prev === next) return patches;
  // line 1: <div.card> (reads: visits)
  if (prev.visits !== next.visits) {
    // line 4: <p>
    // line 4: text
    const prevText = "Visits: " + toText(prev.visits);
    const nextText = "Visits: " + toText(next.visits);
    if (prevText !== nextText) patches.push({ op: "text", id: "6" + idSuffix, text: nextText });
  }
  return patches;
}
```

Das `h3` und das erste `p` kommen nicht vor. Nicht einmal ein Kommentar wird für sie geschrieben. Bei einer Seite mit großem statischem Layout und ein paar dynamischen Stellen hängt die Arbeit von `diff` nur von den dynamischen Stellen ab.

## Der Guard

Für einen Knoten mit nicht leerer Menge schreibt der Codegenerator den Kommentar `// line N: <tag> (reads: a, b)` und darunter ein `if`, das jedes Feld der Menge zwischen `prev` und `next` vergleicht:

```ts
if (prev.url !== next.url || prev.active !== next.active || prev.title !== next.title) {
```

Der Vergleich ist `!==`, die Identität des Werts. Bei einer Zahl oder einem String ist das ein Wertvergleich. Bei einem Objekt oder einem Array ist es ein Vergleich von Referenzen. Das ist günstig, und es ist der Grund, warum der State durch Erzeugen neuer Objekte aktualisiert werden muss.

Der Guard ist absichtlich **grob**. Er sagt "etwas, das dieser Knoten liest, hat sich geändert", nicht "dieses Attribut hat sich geändert". Innerhalb des Guards berechnet der Compiler jedes Attribut, jeden Event-Payload und jeden Text für `prev` und für `next` und schreibt nur dann einen Patch, wenn sich die beiden Ergebnisse unterscheiden. Zwei Ebenen von Prüfungen arbeiten zusammen: Der günstige Guard überspringt die meisten Knoten, und der genaue Vergleich der Ergebnisse entscheidet, was wirklich in die Patch-Liste kommt.

::demo parts open=ast

Ein Element liest fünf Felder: `url`, `active`, `title`, `id` und `label`. In Schritt eins ändert sich nur `id`. Der Guard öffnet sich, und `diff` prüft jeden Teil: Das `href` ist gleich, der Titel ist gleich, die Klasse ist gleich. Nur der Event-Payload unterscheidet sich, also ist der einzige Patch `handler`. In Schritt zwei ändern sich `title` und `label`, und es gibt zwei Patches: das Attribut `title` und den Text. Beachte, dass `href` und die Klasse angesehen werden (der Guard hat sich wegen `title` geöffnet), aber keinen Patch ergeben.

Noch ein Blick auf dieselbe Idee, mit einem Baum aus Geschwistern. Jeder Absatz hat seinen eigenen Guard, sodass die Änderung eines Felds einen Absatz berührt.

::demo two-fields open=ast

In Schritt eins ändert sich nur `body`. Die `section` wird betreten, der Guard des `h2` ist falsch, der Guard von `body` ist wahr, der Guard von `author` ist falsch. Ergebnis: ein Patch. In Schritt zwei ändern sich `title` und `author`, `body` nicht, also gibt es zwei Patches, und der mittlere Absatz wird übersprungen.

## Derselbe Guard zweimal wird nur einmal geschrieben

Oft liest ein Kind genau die Felder, die sein Parent liest. Dann ist der eigene Guard des Kindes überflüssig: Der Guard des Parents beweist bereits, dass sich etwas geändert hat, das er liest. Der Compiler erkennt das (die Menge des Kindes ist gleich der des Parents) und wiederholt die Prüfung nicht. Er schreibt weiterhin den Kommentar des Knotens, aber nicht das `if`.

::demo same-deps open=ast

Hier liest der `button` `label` über sein Attribut, sein Event und seinen Text. Der Textknoten liest ebenfalls `label`. Das ist das generierte `diff`:

```ts
// line 1: <button> (reads: label)
if (prev.label !== next.label) {
  const prevTitle = toAttr(prev.label);
  const nextTitle = toAttr(next.label);
  if (prevTitle !== nextTitle) {
    patches.push(nextTitle === null
      ? { op: "rmAttr", id: "0" + idSuffix, name: "title" }
      : { op: "attr", id: "0" + idSuffix, name: "title", value: nextTitle });
  }
  const prevClickPayload = prev.label;
  const nextClickPayload = next.label;
  if (!(prevClickPayload === nextClickPayload)) {
    patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
  }
  // line 1: text
  const prevText = "Pick " + toText(prev.label);
  const nextText = "Pick " + toText(next.label);
  if (prevText !== nextText) patches.push({ op: "text", id: "1" + idSuffix, text: nextText });
}
```

Es gibt ein einziges `if (prev.label !== next.label)`. Der Text, markiert mit `// line 1: text`, hat keinen eigenen Guard, weil der Guard des Buttons dieselbe Prüfung ist. Die Patches kommen in der Reihenfolge Attribute, Event, Kinder.

Ein Guard wird nicht entfernt, wenn die Menge des Kindes kleiner ist als die des Parents, selbst um nur ein Feld. Im nächsten Beispiel liest der `footer` nur `count`, aber sein Parent liest vier Felder, also behält der Footer seinen eigenen Guard.

::demo nested open=ast

Das `div.panel` liest `body`, `count`, `open` und `title`. Der Klassen-Umschalter `class:open=open` wird direkt innerhalb des Guards des `div` ausgewertet, ohne eigenen Guard: Er gehört zum Element. Jedes Kind darunter hat einen eigenen Guard. Das `if` liest `open` und `body`. Im ersten Schritt ändert sich nur `count`, und das Ergebnis ist ein Text-Patch. Im zweiten ändert sich nur `body`, und der Patch geht an den Text im geöffneten Zweig.

Der generierte Code zeigt, wie die eigenen Attribute des Elements und seine Kinder angeordnet sind:

```ts
// line 1: <div.panel> (reads: open, title, body, count)
if (prev.open !== next.open || prev.title !== next.title || prev.body !== next.body || prev.count !== next.count) {
  const prevClass = joinClasses(["panel", (prev.open ? "open" : "")]);
  const nextClass = joinClasses(["panel", (next.open ? "open" : "")]);
  if (prevClass !== nextClass) {
    patches.push(nextClass === null
      ? { op: "rmAttr", id: "0" + idSuffix, name: "class" }
      : { op: "attr", id: "0" + idSuffix, name: "class", value: nextClass });
  }
  // line 2: <h2> (reads: title)
  if (prev.title !== next.title) {
    // line 2: text
    ...
  }
  // line 3: if (reads: open, body)
  ...
  // line 5: <footer> (reads: count)
  if (prev.count !== next.count) {
    // line 5: text
    ...
  }
}
```

Eine feine Sache zum Beachten: Wenn sich nur `count` ändert, ist der Guard des `div` wahr, also wird die Klasse für beide Seiten berechnet. Sie kommt gleich heraus, und es entsteht kein Patch. Die Attribute eines Elements werden jedes Mal neu geprüft, wenn sich darunter irgendetwas ändert. Das kostet zwei kleine String-Berechnungen und bringt dafür eine einfache Regel: Der Guard eines Knotens deckt den Knoten und alles in ihm ab.

## Schleifenvariablen werden entfernt

Innerhalb eines `for` stammen die Namen von Item und Index nicht aus dem State. Es gibt sie nur innerhalb der Schleife. Die Analyse **entfernt** sie daher aus der Menge der Schleife. Übrig bleibt, was die Schleife von außen braucht.

::demo loop open=ast

Lies die Spalte `reads:` von unten nach oben. Der Text liest `item` und `prefix`. Das `li` liest dasselbe, da sein Klassen-Umschalter `item.hot` liest. Das `for` liest `items` (die Liste) und `prefix`, aber nicht `item`: Die Schleifenvariable wird entfernt. Das `ul` darüber ist dasselbe wie das `for`.

Nun der generierte Code. Die Schleife wird mit Hilfe des Helfers `diffKeyedList` verglichen, der anhand der keys entscheidet, was eingefügt, entfernt und verschoben wird. Für Elemente, die auf beiden Seiten existieren, ruft er die Funktion `common(prevIndex, nextIndex)` auf. Darin ist die Schleifenvariable kein Name des State mehr, sondern eine lokale Variable, die für `prev` einen Wert hat und für `next` einen, und der Guard des `li` vergleicht diese:

```ts
common(prevIndex, nextIndex) {
  const prevItem = prevItemList[prevIndex];
  const nextItem = nextItemList[nextIndex];
  const itemSuffix = idSuffix + "#" + nextItemKeys[nextIndex];
  // line 3: <li> (reads: item, prefix)
  if (prevItem !== nextItem || prev.prefix !== next.prefix) {
    ...
  }
},
```

Der key-Ausdruck (`key item.id`) gehört ebenfalls zur Schleife. Er darf die Schleifenvariable benutzen; was er von außen liest, bleibt in der Menge.

In der Demo ersetzt Schritt eins ein einzelnes Element der Liste: Das Element mit `id` 1 bekommt `hot: true`. Nur das `li` dieses Elements wird gepatcht, mit der id `2#1` (Knoten 2, key 1). Die Demo baut auch für das zweite Element ein neues Objekt, sodass sich auch sein Guard öffnet, aber seine Klasse und sein Text kommen gleich heraus, und es ergibt keinen Patch. Schritt zwei ändert `prefix`, das jedes Element liest, also wird der Text jedes Elements neu berechnet, und hier wird das eine Element gepatcht.

Die Indexvariable funktioniert genauso.

::demo loop-index open=ast

Der Text liest `n` und `row`, und die Schleife liest nur `rows`. Der Index nimmt am Guard des `li` teil (`prevIndex !== nextIndex`). Das ist in einer Schleife mit key wichtig: Ein Element behält seinen key, wenn es verschoben wird, bekommt aber einen neuen Index. Im Schritt wird aus der Liste `a, b` die Liste `b, a`. Der erste Patch verschiebt das Element `a` ans Ende. Die anderen beiden Patches ändern die Nummern: `b` ist jetzt `0. b` und `a` ist jetzt `1. a`.

> [!WARNING] Eine Schleifenvariable verdeckt ein State-Feld mit demselben Namen
> Innerhalb der Schleife bedeutet der Name `name` die Schleifenvariable und nicht das State-Feld `name`. Die Analyse entfernt sie aus der Menge der Schleife, wie sie es muss, also ist ein Lesen des äußeren `name` innerhalb der Schleife nicht möglich. Wähle Schleifennamen, die nicht mit deinem State kollidieren: `user in users`, nicht `name in names`, wenn `name` auch ein Feld ist.

::demo shadow open=ast

Der erste Absatz liest das State-Feld `name`. Die Schleife liest nur `names`, und das span darin liest die Schleifenvariable `name`, die lokal ist. Die beiden `name` sind verschiedene Dinge, die zufällig gleich geschrieben werden.

## Bedingungen

Ein `if` liest die Tests all seiner Zweige und alles, was die Zweige enthalten. Eine Änderung der Tests kann den Zweig wechseln; eine Änderung innerhalb des Zweigs ändert nur dessen Inhalt. Der Codegenerator schreibt beide Fälle und trennt sie.

::demo branches open=ast

Das `if` liest `user` und `guest`. Sieh dir das generierte `diff` an:

```ts
const prevBranch = prev.user ? 0 : prev.guest ? 1 : 2;
const nextBranch = next.user ? 0 : next.guest ? 1 : 2;
if (prevBranch !== nextBranch) {
  // another branch: replace what is between the markers
  if (prevBranch !== -1) patches.push({ op: "clear", from: "0s" + idSuffix, to: "0e" + idSuffix });
  if (nextBranch !== -1) {
    ...
    patches.push({ op: "insert", before: "0e" + idSuffix, nodes: branchNodes });
  }
} else {
  // the same branch: diff inside it
  if (nextBranch === 0) {
    // line 2: <p> (reads: user)
    if (prev.user !== next.user) {
      ...
    }
  }
}
```

Der Compiler macht aus der Kette von Tests für beide States eine Zahl, den **Zweigindex** (`-1` bedeutet "kein Zweig", wenn es kein `else` gibt). Hat sich die Zahl geändert, ersetzt er den Inhalt zwischen den beiden Markern. Hat sie sich nicht geändert, sieht er nur in diesen Zweig hinein, und nur die Zweige, in denen es etwas anzusehen gibt, bekommen Code (hier nur Zweig 0). In der Demo ist Schritt eins derselbe Zweig (der Name hat sich von Ann zu Bob geändert) und ergibt einen `text`-Patch. Schritt zwei wechselt den Zweig und ergibt ein `clear` und ein `insert`.

Ein `if`, bei dem in den Zweigen nichts dynamisch ist, liest trotzdem seine Tests. Ein Zweig, der nichts liest, trägt nichts zur Menge des `if` bei.

## Kind-views

Ein Embed liest seine Props. Die Props sind Ausdrücke, und die Analyse sammelt sie wie überall sonst. Ein Spread (`...extra`) liest den Ausdruck nach den Punkten.

::demo embed open=ast

Die Zeile `+Badge#state` liest `status`, also ruft der Parent `Badge.diff` nur auf, wenn sich `status` ändert (der Guard ist `if (prev.status !== next.status)`). Das `p` darunter ist statisch: Es liest nichts, und das Kind wird nicht danach gefragt. Auch das Umgekehrte gilt: Der Parent weiß nichts darüber, was das Kind liest. Das `diff` des Kindes entscheidet das aus seiner eigenen Analyse, anhand der Props, die es bekommt.

## Ein outlet liest alles

Ein `+outlet` zeigt das Kind, das die Route der Komponente auswählt. Was es zeigt, hängt von der Route und von einem State-Ausschnitt ab, den das Template nicht benennen kann. Die Analyse kann ihm also keine Liste von Feldern geben. Stattdessen gibt sie ihm eine besondere Markierung, den leeren String `""`, der "immer" bedeutet.

```pavlus layout.pavlus
div.layout
  h1 {title}
  nav Menu
  +outlet
```

Die AST-Ansicht dieses Templates gibt die Markierung als `* (an outlet reads everything)` aus:

```text
el  div.layout                                  #0   reads: * (an outlet reads everything)
  el  h1 {title}                                  #1   reads: title
    text  {title}                                   #2   reads: title
  el  nav Menu                                    #3   reads: — (reads nothing)
    text  Menu                                      #4   reads: — (reads nothing)
  outlet  +outlet                                 #5   reads: * (an outlet reads everything)
```

Die Markierung wandert zu jedem Parent hinauf, da ein Parent die Mengen seiner Kinder einschließt. Für so einen Knoten kann der Guard keine Liste von Vergleichen sein, daher lautet der generierte Code `if (true) {`, und der Kommentar sagt `(reads: the route and the routed child)`. Die Geschwister behalten ihre eigenen Guards: Das `h1` liest weiterhin nur `title`, und das `nav` ist weiterhin statisch. Nur das outlet selbst und seine Vorfahren haben den immer eingeschalteten Guard. Das ist ein weiterer Grund, das outlet nahe an der Wurzel eines Layouts zu platzieren und nicht in einer tiefen, belebten Struktur.

## Eine größere Seite

Alles auf dieser Seite arbeitet an einem realistischen Layout zusammen: ein Header mit einer Navigation mit keys, eine bedingte Flash-Meldung, ein Artikel und ein Footer. Öffne den AST und lies zuerst die Spalte `reads:`. Dann sieh dir an, was die beiden Schritte patchen.

::demo big open=ast

Einige Dinge, die in der Spalte auffallen.

- Das Wurzel-`main` liest alles, was die Seite braucht: `article`, `flash`, `links`, `page` und `site`. Es ist die Vereinigung.
- Das `nav` liest `links` und `page`. Das `for` darin liest dieselben beiden, und seine Schleifenvariable `link` fehlt in der Menge, während `a` und sein Text `link` lesen (und `page`, für den Klassen-Umschalter).
- Der Absatz `p.static` liest nichts. Er hat keine id, und `diff` erwähnt ihn nicht.
- Das `if flash` liest nur `flash`. Der `footer` liest `site`, wie das `h1`, obwohl nur der Teil `year` genutzt wird: Die Einheit ist das Feld.

Schritt eins ändert `page` von `/` zu `/about`. Nur die beiden Links werden berührt, und nur ihre Klasse: `/` verliert `current` (`rmAttr`) und `/about` bekommt es (`attr`). Der Header-Titel, der Artikel und der Footer werden nicht verglichen, weil ihre Guards andere Felder lesen. Schritt zwei ändert nur `article`: ein `text`-Patch, für die Überschrift. Das ist die Wirkung der Analyse, die du sehen kannst.

## Grenzen, die du kennen solltest

- Die Analyse folgt Namen, nicht Werten. Eine Funktion im State, die einen anderen Teil des State liest (ein Getter, eine Closure), verbirgt dieses Lesen vor dem Compiler. Halte abgeleitete Werte im State oder übergib die Eingaben als Argumente: `{total(items)}` liest `total` und `items` und funktioniert.
- Die Einheit ist das Feld der obersten Ebene, und es wird per Referenz verglichen. Aktualisiere durch Ersetzen: `{ ...state, user: { ...state.user, name } }`.
- Ein Knoten mit großer Menge (die Wurzel, ein Layout, ein outlet) wird oft betreten. Das ist nicht langsam, denn die Prüfungen darin sind wieder Guards. Es ist aber ein Grund, die dynamischen Teile klein und nahe an den Blättern zu halten.

## Was du gelernt hast

- Jeder Knoten hat eine Abhängigkeitsmenge: die State-Felder der obersten Ebene, die er liest, ohne die Schleifenvariablen seiner eigenen Schleifen.
- Ein Knoten, der nichts liest, ist statisch: keine id in `render`, kein Code in `diff`.
- Ein Knoten, der etwas liest, bekommt einen Guard, der diese Felder mit `!==` vergleicht. Innerhalb des Guards wird jedes Attribut, jeder Payload und jeder Text anhand seines eigenen Ergebnisses verglichen, sodass nur echte Änderungen Patches erzeugen.
- Ein Guard, der den Guard seines Parents wiederholt, wird nicht doppelt geschrieben. Ein outlet liest alles und macht die Guards darüber immer wahr.

Weiter: [Codegenerierung: render](page:compiler-render).
