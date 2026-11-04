---
summary: Wie der Compiler `diff(prev, next)` schreibt, die Funktion, die zwei States in eine kurze Liste von DOM-Patches verwandelt. Du lernst die Guards, die acht Patch-Operationen und den genauen Code kennen, der für Text, Attribute, Klassen und Event-handler generiert wird.
---
## Wofür diff da ist

Ein pavlus-Template wird zu zwei reinen Funktionen kompiliert. `render(state)` gibt das ganze Template für einen State zurück, als einfache Objekte namens **vnodes**. `diff(prev, next)` nimmt zwei States, den alten und den neuen, und gibt eine Liste von **Patches** zurück: kleine einfache Objekte wie "setze den Text von Knoten 4 auf `Bob`". Das DOM-plugin ist der einzige Code, der sie anwendet.

Die Idee ist einfach: Wenn sich der State ändert, baut niemand die Seite neu auf. Der Compiler weiß bereits, welchen Teil des State jeder Teil des Templates liest, also sieht sich `diff` nur die Teile an, die sich geändert haben können.

Der einfachste mögliche Fall ist ein Template, das nichts liest.

::demo static open=module

Sieh dir das generierte `diff` an. Es hat zwei Zeilen: `if (prev === next) return patches;` und `return patches;`. Der Compiler hat gesehen, dass das Template keinen State liest, also gibt es nichts zu vergleichen. Wie die beiden States auch aussehen, die Antwort ist die leere Liste.

## Die Form jedes diff

Nun ein Template, das zwei Felder des State liest.

::demo text open=module

Der erste Schritt ändert `count`, und `diff` gibt einen Patch zurück. Der zweite Schritt ändert beide Felder, und es ist immer noch ein Patch: Der Text des Absatzes ist ein Knoten, also ersetzt ein Patch ihn. Der dritte Schritt ändert nichts, und die Liste ist leer. Hier ist die generierte Funktion:

```ts
function diff(prev, next, idSuffix = "", messagePrefix = "", env) {
  const patches = [];
  if (prev === next) return patches;
  // line 1: <p> (reads: name, count)
  if (prev.name !== next.name || prev.count !== next.count) {
    // line 1: text
    const prevText = "Hello, " + toText(prev.name) + "! You have " + toText(prev.count) + " items.";
    const nextText = "Hello, " + toText(next.name) + "! You have " + toText(next.count) + " items.";
    if (prevText !== nextText) patches.push({ op: "text", id: "1" + idSuffix, text: nextText });
  }
  return patches;
}
```

Lies sie Zeile für Zeile, denn jedes diff hat dieselbe Form:

1. `const patches = [];` ist die Antwort, die zurückgegeben wird.
2. `if (prev === next) return patches;` ist der günstigste Ausstieg. Oft hat sich das State-Objekt gar nicht geändert, und der Aufruf endet hier.
3. Der Kommentar `// line 1: <p> (reads: name, count)` sagt, aus welcher Template-Zeile der Block stammt und von welchen Teilen des State er abhängt.
4. Der **Guard** `if (prev.name !== next.name || prev.count !== next.count)` ist die Abhängigkeitsprüfung. Hat sich keines der Felder geändert, die der Absatz liest, wird der ganze Block übersprungen.
5. Innerhalb des Guards wird der Text zweimal berechnet, einmal aus `prev` und einmal aus `next`, mit demselben Ausdruck. Nur wenn sich die beiden Strings unterscheiden, entsteht ein Patch.

Zwei Dinge in diesem Code verdienen einen Moment. Erstens vergleicht der Guard mit `!==`, was ein Referenzvergleich ist und fast nichts kostet. Der Textvergleich darin ist ein String-Vergleich und passiert nur, wenn der Guard passiert wird. Zweitens wird der Text verglichen, nachdem er gebaut wurde. Ändert sich `count` von `2` zu `"2"`, passiert der Guard, aber beide Texte sind `You have 2 items.`, also entsteht kein Patch.

## Warum diff States vergleicht, nicht Bäume

Viele Frameworks bauen bei jedem Update einen neuen Baum aus Knoten und vergleichen dann den neuen Baum mit dem alten. pavlus macht das nicht. `diff` erhält die beiden **States** und baut auf dem Update-Pfad nie einen Baum.

- Der Compiler weiß beim Build, welcher Knoten welches Feld liest. Ein Baumvergleich muss das zur Laufzeit erneut herausfinden, Knoten für Knoten.
- Ein Feld, das kein Template liest, ist kostenlos. In der nächsten Demo hat der State ein Feld `theme`, aber das Template liest nur `name`.

::demo other-field open=module

Der Guard ist `prev.name !== next.name`. Eine Änderung von `theme` betritt den Block nie, also ist die Antwort `[]`, ohne einen einzigen String zu vergleichen.

- `render` wird bei einem Update nicht aufgerufen. Nur wenn ein neues Stück erscheint (ein Zweig eines `if`, ein neues Element eines `for`), wird dieses Stück gerendert, und nur dieses.
- Das Ergebnis sind einfache Daten. Du kannst `diff` in einem Test aufrufen, die Patches ausgeben oder über eine Leitung senden. Nichts braucht einen Browser.

## Woher die Guards kommen

Der Compiler berechnet für jeden Knoten die Menge der **freien Namen**, die er liest: die Wurzelfelder des State und die Variablen umgebender Schleifen. Das ist die *Abhängigkeitsmenge*. Du siehst sie im AST-Abschnitt jeder Demo (*reads: name*) und im Kommentar `(reads: ...)` des generierten Codes.

Eine Abhängigkeit ist immer die **Wurzel** eines Ausdrucks. `{user.name}` hängt von `user` ab, nicht von `user.name`, und `{items[page]}` hängt von `items` und `page` ab.

::demo member open=module

Im Schritt ist `user` ein neues Objekt mit demselben `name`. Der Guard `prev.user !== next.user` wird passiert, der Text wird erneut gebaut, die Strings sind gleich, und das Ergebnis ist `[]`. Der Guard ist günstig und grob; der String-Vergleich darin ist exakt.

> [!WARNING] Der State muss unveränderlich sein
> `diff` verlässt sich auf `!==`. Wenn du `state.user.name` an Ort und Stelle änderst, sind `prev.user` und `next.user` dasselbe Objekt, der Guard schlägt nicht an, und es entsteht kein Patch. Gib einem geänderten Wert immer eine neue Identität: Baue ein neues Objekt oder ein neues Array. Das store-plugin macht das für dich.

## Die Patch-Operationen

Ein Patch ist ein Objekt mit einem Feld `op`. Es gibt acht Arten. Die ersten vier ändern einen vorhandenen Knoten, die letzten vier ändern die Struktur.

| Operation | Felder | Bedeutung |
| --- | --- | --- |
| `text` | `id`, `text` | Setzt den Textinhalt des Knotens `id`. |
| `attr` | `id`, `name`, `value` | Setzt das Attribut `name` des Elements `id`. |
| `rmAttr` | `id`, `name` | Entfernt das Attribut `name` des Elements `id`. |
| `handler` | `id`, `event`, `msg` | Ersetzt die Nachricht, die das Event `event` des Elements `id` sendet. |
| `insert` | `before`, `nodes` | Erzeugt die vnodes `nodes` und fügt sie vor dem vorhandenen Knoten `before` ein. |
| `clear` | `from`, `to` | Entfernt alles streng zwischen den Markern `from` und `to`. |
| `remove` | `from`, `to` | Entfernt den Geschwisterbereich `from` bis `to`, beide eingeschlossen. |
| `move` | `from`, `to`, `before` | Verschiebt den Geschwisterbereich `from` bis `to` so, dass er vor dem Knoten `before` steht. |

Diese Seite handelt von den ersten vier. Die anderen vier sind das Thema der [nächsten Seite](page:compiler-control-flow), weil sie zu `if`, `for` und Embeds gehören.

Jede `id` ist ein String. Ein Knoten kann nur gepatcht werden, wenn er eine id hat, also gibt der Compiler einem Knoten **nur dann** eine id, **wenn ein Patch ihn treffen kann**: ein Textknoten mit `{expressions}`, ein Element mit einem dynamischen Attribut, einem Klassen-Umschalter oder einem Event mit Argumenten. Ein statischer Knoten hat gar keine id. Das DOM-plugin führt eine Map von id zu DOM-Knoten, die beim Bauen der Knoten gefüllt wird, und wendet einen Patch an, indem es die id nachschlägt. Ist eine id unbekannt, wirft es `pavlus/dom: unknown node id`.

Eine id ist die Nummer des Knotens im Template (der Parser zählt die Knoten in Lesereihenfolge), gefolgt vom **Suffix** der Instanz. Ein Template auf oberster Ebene hat den Suffix `""`, seine ids sehen also aus wie `"1"`. Der Suffix ist länger innerhalb eines `for`-Elements oder eines eingebetteten Kindes, und so kann dasselbe Template mehrfach auf einer Seite erscheinen, ohne dass zwei Knoten eine id teilen.

## Text-Patches

Den `text`-Patch hast du gesehen. Hat ein Template mehrere Textknoten, hat jeder seine eigene id und seinen eigenen Guard, sodass eine Änderung nur den Knoten berührt, der sie liest.

::demo guards open=module

Das `div` liest `title` und `author`, sein Guard ist also die Vereinigung der Guards seiner Kinder. Darin haben `h2` und `p` jeweils einen eigenen Guard. Die statische Zeile `Static line` liest nichts und hat überhaupt keinen Code in `diff`. Der vierte Schritt übergibt einen `title`, der erst der String `"1"` und dann die Zahl `1` ist: Der Guard wird passiert, der Text ist auf beiden Seiten `"1"`, und es kommt kein Patch heraus.

Hier der Teil des generierten Codes, der die Verschachtelung zeigt:

```ts
  // line 1: <div.card> (reads: title, author)
  if (prev.title !== next.title || prev.author !== next.author) {
    // line 2: <h2> (reads: title)
    if (prev.title !== next.title) {
      // line 2: text
      const prevText = "" + toText(prev.title);
      const nextText = "" + toText(next.title);
      if (prevText !== nextText) patches.push({ op: "text", id: "2" + idSuffix, text: nextText });
    }
    // line 3: <p.muted> (reads: author)
    if (prev.author !== next.author) {
      // line 3: text
      const prevText = "by " + toText(prev.author);
      const nextText = "by " + toText(next.author);
      if (prevText !== nextText) patches.push({ op: "text", id: "4" + idSuffix, text: nextText });
    }
  }
```

Der äußere Guard ist nur eine Abkürzung: Wenn sich keines der Felder geändert hat, ersetzt eine Prüfung zwei. Ein Kind, dessen Abhängigkeiten dieselben sind wie die seines Parents, bekommt keinen eigenen Guard, weil die Prüfung des Parents es bereits abdeckt. Das siehst du in der nächsten Demo, in der ein Element und sein Text beide das Feld `text` lesen.

::demo redundant open=module

Das Attribut `title` und der Text liegen beide in einem Guard, `if (prev.text !== next.text)`. Der Kommentar `// line 1: text` hat kein eigenes `if`.

## Attribut-Patches

Ein Attribut, dessen Wert ein Ausdruck oder ein String mit `{holes}` ist, kann sich ändern. Für jedes solche Attribut schreibt der Compiler dieselben vier Zeilen: den Wert auf beiden Seiten berechnen, vergleichen und `attr` oder `rmAttr` pushen.

::demo attributes open=module

Die drei Schritte ändern `url`, `name` und beides. Hier der Code für die beiden Attribute:

```ts
    const prevHref = toAttr(prev.url);
    const nextHref = toAttr(next.url);
    if (prevHref !== nextHref) {
      patches.push(nextHref === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "href" }
        : { op: "attr", id: "0" + idSuffix, name: "href", value: nextHref });
    }
    const prevTitle = "Open " + toText(prev.name);
    const nextTitle = "Open " + toText(next.name);
    if (prevTitle !== nextTitle) {
      patches.push(nextTitle === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "title" }
        : { op: "attr", id: "0" + idSuffix, name: "title", value: nextTitle });
    }
```

Der Runtime-Helfer `toAttr` verwandelt einen State-Wert in einen Attributwert. `null`, `undefined` und `false` werden zu `null`, was "kein Attribut" bedeutet. `true` wird zum leeren String, so schreibt HTML ein boolesches Attribut. Alles andere wird zu seinem String. Ein String mit Platzhaltern, wie `"Open {name}"`, ist immer ein String, daher kann der `null`-Zweig dafür nie laufen; der Compiler schreibt für jedes Attribut denselben Code, weil das den Generator einfach hält.

Die nächste Demo zeigt die drei Ergebnisse: Das Attribut wird entfernt, auf einen leeren Wert gesetzt und auf einen Text gesetzt.

::demo attribute-removed open=module

- `locked` geht von `true` auf `false`: `toAttr(false)` ist `null`, also ist der Patch `rmAttr`.
- `locked` geht von `false` auf `true`: Der Wert ist der leere String, also ist der Patch `attr` mit `value: ""`, und der Button ist wieder deaktiviert.
- `hint` geht von `null` auf einen Text und zurück: `attr`, dann `rmAttr`.
- `hint` geht von einem Text auf den leeren String `""`. Das ist nicht `null`, also bleibt das Attribut mit leerem Wert bestehen. Nur `null`, `undefined` und `false` entfernen ein Attribut.

## Klassen-Patches

Eine Klasse ist ein Attribut wie jedes andere, mit einem Unterschied: Ein Template kann sie aus drei Quellen bauen, den statischen Klassen (`li.item`), den Umschaltern (`class:active=cond`) und einem Attribut `class`. Ist eine davon dynamisch, verbindet der Compiler alle mit dem Helfer `joinClasses` und vergleicht das ganze Ergebnis.

::demo classes open=module

```ts
    const prevClass = joinClasses(["item", (prev.active ? "active" : ""), (prev.done ? "done" : "")]);
    const nextClass = joinClasses(["item", (next.active ? "active" : ""), (next.done ? "done" : "")]);
    if (prevClass !== nextClass) {
      patches.push(nextClass === null
        ? { op: "rmAttr", id: "0" + idSuffix, name: "class" }
        : { op: "attr", id: "0" + idSuffix, name: "class", value: nextClass });
    }
```

Ein Umschalter fügt also nicht einen Klassennamen hinzu oder entfernt ihn. Er ersetzt das ganze Attribut `class` durch den neuen vollständigen String, `item` oder `item active done`. Das ist einfach und sicher: Das DOM hält nie eine Klassenliste, die das Template nicht kennt. Der Preis ist, dass eine Klasse, die du per Hand mit JavaScript hinzufügst, bei der nächsten Änderung überschrieben wird. In pavlus gehört das Attribut dem Template.

`joinClasses` gibt `null` zurück, wenn keine Klasse übrig bleibt, zum Beispiel wenn ein Template nur Umschalter hat und alle ausgeschaltet sind.

::demo class-removed

Wenn `on` zu `false` wird, ist die Liste der Klassen leer, der Helfer gibt `null` zurück, und der Patch ist `rmAttr` für `class`.

## Event-handler-Patches

In pavlus ist ein Event-handler keine Funktion. `@click=pick(id)` sind **Daten**: die Nachricht `{ id: "pick", payload: id }`. Das hat eine Konsequenz für `diff`: handler können per Wert verglichen werden, und ein handler, der sich nicht geändert hat, kostet nichts.

Ein handler kann sich nur ändern, wenn er Argumente hat. `@click=save` ist in jedem State dieselbe Nachricht, also behandelt der Compiler ihn als statisch und erwähnt ihn in `diff` nie.

::demo static-handler

Mit einem Argument ist der Payload Teil des State, und der Compiler vergleicht die Payloads.

::demo handler open=module

```ts
    const prevClickPayload = prev.id;
    const nextClickPayload = next.id;
    if (!(prevClickPayload === nextClickPayload)) {
      patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
    }
```

Der `handler`-Patch trägt die ganze neue Nachricht. Das DOM-plugin fügt keinen neuen Listener hinzu: Es hat einen Listener pro Element und Event, und dieser Listener liest immer die neueste Nachricht. Ein `handler`-Patch ersetzt also nur einen Wert in einer Map, und ein Klick nach dem Patch sendet den neuen Payload.

Bei mehreren Argumenten ist der Payload ein Array, also benutzt der Compiler den Helfer `sameValues`, der zwei Arrays mit denselben Elementen als gleich behandelt. Ein neues Array mit denselben Elementen ist keine Änderung. Die Modifikatoren `.prevent` und `.stop` werden in der Nachricht zu `prevent: true` und `stop: true`.

::demo handler-many open=module

Der erste Schritt ändert nur `kind`, und der zweite Schritt ändert nur `title`. Sieh, wie jede Änderung auf genau eine Art von Patch abgebildet wird: `kind` steckt im handler-Payload, `title` im Text und `url` in einem Attribut. Der dritte Schritt ändert `url` und `id` und erzeugt zwei Patches, ein `attr` und ein `handler`.

Das Präfix `messagePrefix` ist bei einem Template auf oberster Ebene leer. Bei einem als Kind eingebetteten Template ist es der Instanzname plus ein Punkt, und so findet eine Nachricht eines Kindes ihren Weg zum richtigen handler. Embeds werden auf der [nächsten Seite](page:compiler-control-flow) erklärt.

## Wie das DOM-plugin Patches anwendet

Wenn sich der State der Anwendung ändert, ruft das DOM-plugin für jeden gemounteten view `view.diff(oldState, newState)` auf und wendet die Liste der Reihe nach an. Für die vier Operationen dieser Seite ist die Arbeit ein Nachschlagen und ein DOM-Aufruf:

- `text` setzt `textContent` des Knotens.
- `attr` ruft `setAttribute` auf. Bei `value`, `checked` und `selected` setzt es zusätzlich die Live-Property, weil das Attribut bei Formularfeldern nur den Anfangswert angibt.
- `rmAttr` ruft `removeAttribute` auf.
- `handler` ersetzt die Nachricht, die der Listener des Elements sendet.

Patches werden in der Reihenfolge angewendet, in der `diff` sie zurückgegeben hat. Diese Reihenfolge ist für die strukturellen Patches auf der nächsten Seite wichtig, und sie ist stabil: Der Code von `diff` folgt der Reihenfolge des Templates.

## Ein größeres Beispiel

Diese Produktkarte hat eine Klasse aus zwei Umschaltern, Text mit mehreren Feldern, einen Button mit einem dynamischen Attribut, einem Titel und einem handler sowie ein `if`, das ein Badge zeigt. Öffne das generierte Modul und finde die Guards: einen für die Karte und einen für jedes Kind.

::demo product open=module

Lies die Schritte einzeln und finde den Guard, der jeden durchgelassen hat:

- `stock 3 → 2`: Die Karte, der Button und `<p.stock>` lesen `stock`, also werden ihre Guards passiert. Die Klasse und das Attribut `disabled` werden erneut berechnet, aber ihre Werte sind gleich, also kommt nur ein `text`-Patch heraus.
- `stock 1 → 0`: Die Klasse bekommt `out`, der Button bekommt `disabled`, und der Text ändert sich. Drei Patches, in Template-Reihenfolge.
- `price 20 → 15, onSale false → true`: Die Klasse bekommt `sale`, der Preistext ändert sich, und das `if` fügt das Badge ein. Der `insert`-Patch wird auf der nächsten Seite erklärt.
- `another product`: Der Name, der Preis, der `title` des Buttons und sein handler ändern sich gleichzeitig. Die ids `2`, `4` und `8` sind Knotennummern in Lesereihenfolge.
- `currency only`: Der Guard der Karte wird passiert, der Guard von `<p.price>` wird passiert, und alles andere wird von seinem eigenen Guard übersprungen.

Die ganze Funktion ist eine Liste unabhängiger Blöcke. Die Kosten eines Aufrufs sind die Anzahl der Guards, die passiert werden, mal die Größe dessen, was in ihnen steckt, und nicht die Größe des Templates.

> [!TIP] Lies den generierten Code
> Wenn ein Patch fehlt, den du erwartest, öffne das generierte Modul (der eingeklappte Abschnitt jeder Demo oder die Datei in den DevTools deines Browsers) und finde den Block für diese Template-Zeile. Der Kommentar zeigt, was der Block liest, und der Guard zeigt, welche Felder er vergleicht. Die meisten Überraschungen sind ein Feld, das nicht zur Abhängigkeitsmenge gehört, oder ein Wert, der an Ort und Stelle geändert wurde.

## Was du gelernt hast

- `diff(prev, next)` vergleicht zwei States mit generierten Guards (`!==` auf den Wurzelfeldern, die ein Knoten liest) und gibt einfache Patches zurück; es baut oder vergleicht nie Bäume.
- Ein Knoten kann sich nur ändern, wenn er State liest, also kosten statische Knoten nichts und bekommen keine id. Kinder mit denselben Abhängigkeiten wie ihr Parent teilen sich den Guard des Parents.
- `text`, `attr`, `rmAttr` und `handler` ändern einen Knoten per id. Ein Klassen-Umschalter ersetzt das ganze Attribut `class`, und `null`, `undefined` und `false` entfernen ein Attribut.
- handler sind Daten, also wird ein handler mit Argumenten per Wert verglichen, und `@click=save` ohne Argumente wird nie gepatcht.
- Der State muss unveränderlich sein: Eine Änderung, die dasselbe Objekt behält, ist für die Guards unsichtbar.

Weiter: [if, for und Embeds kompilieren](page:compiler-control-flow).
