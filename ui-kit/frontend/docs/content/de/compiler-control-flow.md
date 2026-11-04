---
summary: Wie `if`, `for` und eingebettete Kind-views kompiliert werden. Du lernst, was Marker sind, wie ein Zweigindex zwischen "diff innen" und "clear und insert" entscheidet, wie Listen mit key zu insert-, remove- und move-Patches werden und wie Embeds und `+outlet` Props an Kind-views übergeben.
---
## Strukturänderungen brauchen eine andere Art von Patch

Die letzte Seite zeigte Patches, die einen vorhandenen Knoten ändern: `text`, `attr`, `rmAttr` und `handler`. Sie reichen aus, solange die Form der Seite gleich bleibt. Aber ein `if` kann einen Absatz zeigen oder verbergen, ein `for` kann wachsen oder schrumpfen, und ein eingebetteter Kind-view kann durch einen anderen ersetzt werden. Für diese Änderungen braucht die Seite vier weitere Operationen: `insert`, `clear`, `remove` und `move`. Sie arbeiten alle auf **Bereichen von Geschwistern**, und die Bereiche sind im DOM durch **Marker** gekennzeichnet.

Ein Marker ist ein leerer Kommentarknoten. Der Compiler setzt einen vor und einen nach jedes `if`, jedes `for` und jedes dynamische Embed, und einen vor und einen nach jedes Element eines `for`. Marker haben ids, sodass ein Patch sagen kann: "alles zwischen Marker `0s` und Marker `0e`". Ein Kommentarknoten hat keine sichtbare Ausgabe und braucht kein umschließendes Element, sodass das HTML, das du schreibst, so bleibt, wie du es geschrieben hast.

## if und else

Hier ist das kleinste `if`.

::demo if-else open=module

Der erste Schritt kippt `loggedIn`, und die Antwort sind zwei Patches: `clear` und `insert`. Der zweite Schritt behält den Wert, und die Antwort ist die leere Liste. Der `insert`-Patch trägt die neuen vnodes, die die Demo nur als Anzahl zeigt (`1 vnodes`). Hier das generierte `diff`, gekürzt auf den wichtigen Teil:

```ts
  // line 1: if (reads: loggedIn)
  if (prev.loggedIn !== next.loggedIn) {
    const prevBranch = prev.loggedIn ? 0 : 1;
    const nextBranch = next.loggedIn ? 0 : 1;
    if (prevBranch !== nextBranch) {
      // another branch: replace what is between the markers
      if (prevBranch !== -1) patches.push({ op: "clear", from: "0s" + idSuffix, to: "0e" + idSuffix });
      if (nextBranch !== -1) {
        const branchNodes = [];
        if (nextBranch === 0) {
          // line 2: <p>
          ...
        } else if (nextBranch === 1) {
          // line 4: <p>
          ...
        }
        patches.push({ op: "insert", before: "0e" + idSuffix, nodes: branchNodes });
      }
```

Die Schlüsselidee ist der **Zweigindex**. Der Compiler macht aus der Kette `if / else if / else` eine Zahl: `0` für den ersten Zweig, `1` für den zweiten und so weiter. Er berechnet diese Zahl für `prev` und für `next`, mit denselben Bedingungen auf beiden Seiten.

- Sind die beiden Zahlen gleich, wird auf beiden Seiten derselbe Zweig gezeigt. Der Compiler vergleicht dann **innerhalb** des Zweigs, genau wie bei allen anderen Knoten.
- Unterscheiden sich die Zahlen, wird der alte Zweig mit einem `clear` zwischen den beiden Markern entfernt, und der neue Zweig wird aus `next` gerendert und vor dem Ende-Marker eingefügt. Es wird nicht versucht, den einen Zweig in den anderen zu verwandeln.

Die zweite Regel ist eine Designentscheidung. Zwei Zweige sind zwei verschiedene Templates, sie Knoten für Knoten zu vergleichen wäre also langsamer, als sie zu ersetzen, und würde kein besseres Ergebnis liefern. Die erste Regel macht ein `if` günstig, wenn es nicht kippt.

## Ein if ohne else

Gibt es kein `else`, hat der Fall "nichts gezeigt" eine eigene Zahl, `-1`. Darum hat der Code zwei Prüfungen: `prevBranch !== -1` für das `clear` und `nextBranch !== -1` für das `insert`.

::demo if-alone open=module

Lies die vier Schritte als Tabelle dessen, was mit einem einzelnen `if` passieren kann:

- Von verborgen zu gezeigt: ein `insert` und kein `clear`, weil es nichts zu entfernen gibt.
- Von gezeigt zu gezeigt, mit einem neuen Wert: überhaupt keine Strukturänderung. Der Zweigindex ist auf beiden Seiten `0`, also vergleicht der Compiler innerhalb des Zweigs, und es kommt ein einzelner `text`-Patch heraus.
- Von gezeigt zu verborgen: ein `clear` und kein `insert`.
- Von verborgen zu verborgen: nichts. Der Guard wird nur passiert, wenn sich `error` geändert hat, und hier war das nicht der Fall.

Eine Bedingung wird nicht als Wert verglichen. Wenn `error` von `"Oops"` zu `"Again"` wechselt, ändert sich das Feld, aber der Zweigindex bleibt `0`, und der entscheidet.

## Ketten und was innerhalb eines Zweigs passiert

Die meisten echten Templates haben eine Kette. Diese hier ist der klassische Bildschirm für Laden, Fehlschlag und Fertig.

::demo if-chain

Bei drei Zweigen wird der Index mit einer Kette von Bedingungen berechnet, geschrieben als verschachtelte bedingte Ausdrücke:

```ts
      const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "failed") ? 1 : 2;
      const nextBranch = (next.status === "loading") ? 0 : (next.status === "failed") ? 1 : 2;
```

Die letzte Zahl ist der `else`-Zweig. Ohne `else` wäre sie `-1`. Sieh dir nun die fünf Schritte an:

- `ok → loading` und `loading → failed`: Der Zweig wechselt, also bekommst du `clear` und `insert`. Das `insert` des zweiten Schritts trägt zwei vnodes, den Absatz und den Button.
- `failed, error changes`: Der Zweig ist derselbe, und nur der Text, der `error` liest, wird gepatcht.
- `loading, error changes`: Der Guard des `if` wird passiert, weil er `error` liest (der zweite Zweig benutzt es), aber der Zweig ist immer noch `0`, und Zweig `0` ist statisch. Die Antwort ist `[]`.
- `ok, items change`: Das innere `for` hängt ein Element an; wie, siehst du gleich.

Der Code für den Fall "innen" hat einen Block pro Zweig, und jeder Block läuft nur, wenn sein Zweig der gezeigte ist:

```ts
      } else {
        // the same branch: diff inside it
        if (nextBranch === 1) {
          // line 6: <p.status.status--error> (reads: error)
          if (prev.error !== next.error) {
            // line 6: text
            const prevText = "" + toText(prev.error);
            const nextText = "" + toText(next.error);
            if (prevText !== nextText) patches.push({ op: "text", id: "5" + idSuffix, text: nextText });
          }
        }
```

Ein Zweig ohne Dynamik bekommt keinen Block. Darum hat ein `if` mit statischen Zweigen, wie die erste Demo dieser Seite, keinen `else`-Teil in seinem `diff`.

## Marker im render

Die Marker werden von `render` erzeugt, damit das DOM-plugin die Bereiche finden kann. Zwei `if`s hintereinander zeigen, wie sie nummeriert werden.

::demo if-markers open=vnodes

Öffne die vnodes. Jedes `if` ist von zwei Marker-vnodes umgeben, `{ "t": "marker", "id": "1s" }` und `{ "t": "marker", "id": "1e" }`. Die Zahl ist die Nummer des `if`-Knotens im Template, und `s` und `e` stehen für Start und Ende. Der erste Schritt fügt vor `4e` ein, dem Ende-Marker des zweiten `if`. Der zweite Schritt macht ein `clear` von `1s` bis `1e`, und nur das erste `if` wird berührt.

> [!NOTE] Marker sind unsichtbar
> Das HTML, das du in einer Demo siehst, hat keine Marker, weil `toHtml` sie weglässt, wenn man nicht anderes verlangt. Im Browser sind es leere Kommentarknoten, `<!---->`. Wenn du die Seite inspizierst, siehst du sie zwischen deinen Elementen.

## Schleifen: ein Bereich pro Element

Ein `for` ist eine Liste von Bereichen. Jedes Element hat seinen eigenen Start- und Ende-Marker, und die ganze Schleife hat ebenfalls einen Start- und Ende-Marker. Die ids der Marker enthalten den **key** des Elements, sodass ein Patch genau ein Element benennen kann.

```pavlus
ul.todos
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}
```

Der Teil von `render`, der das macht, ist kurz:

```ts
  const todoList = (state.todos) || [];
  for (let todoIndex = 0; todoIndex < todoList.length; todoIndex++) {
    const todo = todoList[todoIndex];
    const todoKey = String((todo)?.id);
    const todoSuffix = idSuffix + "#" + todoKey;
    ulChildren.push({ t: "marker", id: "1[" + todoSuffix });
    ...
    ulChildren.push({ t: "marker", id: "1]" + todoSuffix });
  }
```

Der key wird in einen String umgewandelt. Der **Suffix** des Elements ist der Suffix des äußeren Templates plus `#` und der key. Jeder Knoten innerhalb des Elements bekommt seine id aus diesem Suffix, sodass das zweite `li` einer Liste die id `2#2` hat (Knoten 2, key 2) und nicht die id des ersten. So bleibt auch eine Schleife in einer Schleife eindeutig: Der innere Suffix erweitert den äußeren.

Der Ende-Marker eines Elements hat eine id wie `1]#2`. Das `[` und `]` in den ids dient nur dazu, die Marker eines Elements von `s` und `e`, den Markern der ganzen Liste, zu unterscheiden.

## Listen ohne key

Schreibst du keinen `key`, ist der key eines Elements sein Index. Das ist die einfachste Form, und eine gute Wahl, wenn eine Liste nur am Ende wächst und schrumpft.

::demo for-unkeyed

- Das Anhängen eines Elements fügt einen Bereich vor dem Ende-Marker der Liste ein.
- Das Entfernen des letzten Elements entfernt seinen Bereich.
- Das Entfernen des **ersten** Elements entfernt nicht den ersten Bereich. Die keys sind `0, 1, 2` und dann `0, 1`, also verschwindet der Bereich mit key `2`, und die Texte der keys `0` und `1` werden auf die neuen Werte gepatcht. Das Ergebnis sieht gleich aus, aber die Arbeit ist eine andere: zwei `text`-Patches und ein `remove`.
- Das Umkehren von drei Elementen patcht zwei Texte. Das mittlere blieb gleich, es kostet also nichts.

> [!WARNING] Ohne key folgt das DOM der Position
> Mit einem Index als key bleiben die DOM-Knoten an ihrer Position und bekommen neuen Inhalt. Für Text ist das in Ordnung. Aber wenn ein Element etwas hat, das nur das DOM kennt (den Fokus, den Cursor, in ein Eingabefeld getippten Text, den der State nicht speichert), bleibt dieses Etwas an der Position, nicht beim Element. Gib der Schleife einen key, wann immer Elemente aus der Mitte entfernt oder umsortiert werden können.

## Listen mit key

Mit `key todo.id` ist ein Element dasselbe Element, solange sein key derselbe ist, egal wo es in der Liste steht. Jetzt kann der Compiler sagen, was passiert ist: Ein Element wurde hinzugefügt, entfernt, verschoben oder hat sich geändert.

::demo for-keyed

Jede Art von Änderung ergibt ihre eigene Art von Patch:

- `append D`, `insert D in the middle`: `insert`, mit `before` auf den Start-Marker des Elements gesetzt, das folgen muss (oder den Ende-Marker der Liste).
- `remove A`, `remove B`: `remove`, vom Start-Marker bis zum Ende-Marker des Elements, beide eingeschlossen. Der `remove`-Patch entfernt auch die Marker. Das unterscheidet ihn von `clear`, das die Marker behält.
- `swap A and B`: ein einzelner `move`.
- `B done`: keine Strukturänderung. Nur das Attribut des Elements, das sich geändert hat, wird gepatcht, mit der id dieses Elements.
- `all replaced`: zwei `remove` und zwei `insert`. Beachte die Reihenfolge. Die Inserts werden vom Ende der Liste zu ihrem Anfang hin gemacht.
- `nothing changed`: Die Demo übergibt ein neues Array mit denselben drei Objekten. Der Guard der Schleife wird passiert, weil die Arrays zwei Objekte sind, aber jedes Element ist auf beiden Seiten dasselbe Objekt, also findet `common` nichts zu patchen.

## Wie die Listen abgeglichen werden

Der generierte Code entscheidet nicht, was eingefügt, verschoben oder entfernt wird. Er ruft einen Helfer aus der Runtime auf, `diffKeyedList`, und gibt ihm vier kleine Funktionen, eine für jeden Fall. Das ist der Aufruf, aus dem generierten Modul:

```ts
    diffKeyedList(prevTodoKeys, nextTodoKeys, todoStartId, "1e" + idSuffix, {
      remove(key) { patches.push({ op: "remove", from: todoStartId(key), to: todoEndId(key) }); },
      insert(index, beforeId) {
        ...
        patches.push({ op: "insert", before: beforeId, nodes: todoNodes });
      },
      move(key, beforeId) { patches.push({ op: "move", from: todoStartId(key), to: todoEndId(key), before: beforeId }); },
      common(prevIndex, nextIndex) {
        ...
      },
    });
```

Der Helfer arbeitet in drei Durchgängen:

1. **Remove.** Jeder key aus `prev`, der nicht in `next` ist, wird entfernt. Die keys, die bleiben, werden in der Reihenfolge notiert, die sie im DOM haben.
2. **Insert und move, vom Ende.** Der Helfer läuft `next` vom letzten bis zum ersten Element durch. Für jedes Element kennt er das Element, das ihm folgen muss, und damit den Marker, vor dem eingefügt oder verschoben wird. Ein neuer key ergibt `insert`. Ein alter key, der nicht schon vor seinem Nachfolger steht, ergibt `move`. Das Laufen vom Ende her garantiert, dass der Marker, auf den sich ein Patch bezieht, existiert, wenn der Patch angewendet wird.
3. **Common.** Für jeden key, der auf beiden Seiten vorhanden ist, vergleicht `common(prevIndex, nextIndex)` den Inhalt des Elements. Der Code in `common` ist das normale diff des Schleifenkörpers, mit `prevTodo` und `nextTodo` als Element auf den beiden Seiten.

Die Funktion `insert` rendert das neue Element nur von der Seite `next`. In der Funktion `common` kommen die Guards der vorigen Seite wieder zum Einsatz, mit dem Element als Wurzel der Abhängigkeit.

Das Verfahren ist einfach, und es ist nicht das Minimum. Ein Element weit zu verschieben kann mehrere moves kosten, weil jedes Element, an dem es vorbeikommt, gegen seinen Nachfolger geprüft wird.

::demo for-moves

- Das erste Element ans Ende zu verschieben kostet einen `move`.
- Das letzte Element nach vorn zu verschieben kostet drei: Der Helfer verschiebt `c`, dann `b`, dann `a`, statt nur `d` zu verschieben.
- Das Umkehren von vier Elementen kostet drei moves.

Das ist ein bewusster Kompromiss. Der Algorithmus ist klein und vorhersehbar, und in der Praxis sind die meisten Listenänderungen Anhängen, Entfernen und gelegentliches Vertauschen. Ein kürzestes Edit-Skript würde eine längste aufsteigende Teilfolge brauchen, also mehr Code für einen seltenen Fall. Wenn du sehr lange Listen oft umsortierst, ist das die Stelle, auf die du im generierten Code achten solltest.

## Die Indexvariable

Eine Schleife kann den Index benennen: `for item, i in items`. Der Index gehört zur Abhängigkeitsmenge des Schleifenkörpers, weil er sich ändern kann, wenn ein Element verschoben wird.

::demo for-index open=module

Das Entfernen des ersten Elements entfernt seinen Bereich, und dann werden die zwei verbleibenden Elemente gepatcht: Ihre Nummern gingen von `2.` und `3.` zu `1.` und `2.`. Das Element selbst hat sich nicht geändert, aber `common` wird dafür mit einem neuen Index aufgerufen, und der Guard `prevIndex !== nextIndex || prevItem !== nextItem` lässt es durch.

## Leere und fehlende Listen

Der Listenausdruck wird als `(items) || []` ausgewertet. Ein State, in dem `items` fehlt, `null` oder `undefined` ist, ist dasselbe wie eine leere Liste. Das ist ein Feature, aber beachte, was es für andere Bedingungen bedeutet.

::demo for-empty

- `[] → [x, y]`: zwei `insert`-Patches, zuerst für `y`, weil der Helfer vom Ende her läuft, und ein `clear` für den Absatz "Nothing here".
- `[x, y] → []`: zwei `remove` und ein `insert` des Absatzes.
- `[] → undefined`: Die Schleife sieht auf beiden Seiten eine leere Liste. Die Bedingung `items.length === 0` ist `(items)?.length === 0`, also `undefined === 0`, also falsch, und der Absatz wird geleert. Wenn du den Absatz auch bei einer fehlenden Liste willst, schreibe die Bedingung als `!items || items.length === 0`.

> [!DANGER] Keys müssen eindeutig sein
> Zwei Elemente mit demselben key lassen `diffKeyedList` einen Fehler werfen, und die Meldung nennt den key: `pavlus: duplicate key 1`. Ein fehlender key ergibt für alle Elemente den key `undefined`, und der Fehler ist `pavlus: duplicate key undefined`. Der Fehler kommt aus `diff`. `render` prüft die keys nicht, sodass eine Seite einmal rendern und beim ersten Update scheitern kann. Nimm einen Wert, der in der Liste eindeutig ist und sich für dasselbe Element nicht ändert, etwa eine id vom Server.

## Schleifen in Schleifen

Schleifen verschachteln sich, und jede Ebene erweitert den Suffix. Die innere Liste einer Gruppe liegt zwischen Markern, in deren ids der key der Gruppe steckt.

::demo for-nested

Der Insert ist an `6e#g2` adressiert, den Ende-Marker der Mitgliederliste der Gruppe mit key `g2`. Die erste Gruppe wird nicht berührt: Sie ist in `prev` und `next` dasselbe Objekt, also schlägt ihr Guard sofort fehl. Die zweite Gruppe ist ein neues Objekt, das seine übrigen Felder teilt, so aktualisierst du unveränderlichen State.

## Embeds: ein Kind-view in deinem Template

Ein **Embed** setzt ein anderes kompiliertes Template in dieses. Ein statisches Embed nennt ein importiertes Template, einen Instanznamen nach `#` und Props in Klammern.

```pavlus
import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role hot=admin)
```

Das importierte Template ist ein gewöhnliches Template. Für diese Seite ist es:

```pavlus
span.badge(class:hot=hot) {label}
```

Das Kind liest den State seines Parents nicht. Es erhält ein Objekt, und `label=role` bedeutet, dass das Objekt ein Feld `label` hat, dessen Wert das `role` des Parents ist.

::demo embed-static open=module

Ein Embed ist kein besonderer Patch. Der Compiler schreibt einen Aufruf des eigenen `diff` des Kindes, mit den Props von `prev` und den Props von `next`, und legt die Patches in dieselbe Liste:

```ts
    // line 5: +Badge#badge (reads: role, admin)
    if (prev.role !== next.role || prev.admin !== next.admin) {
      patches.push(...Badge.diff(
        { "label": prev.role, "hot": prev.admin },
        { "label": next.role, "hot": next.admin },
        idSuffix + "/3",
        messagePrefix + "badge.",
        childEnv(env, "badge", next),
      ));
    }
```

Drei Argumente nach den States sagen, wer das Kind ist:

- **Der Suffix** `idSuffix + "/3"` macht die ids des Kindes eindeutig. `3` ist die Nummer des Embed-Knotens im Parent. In der Demo hat der Text des Kindes die id `1/3`: Knoten 1 des Kindes, innerhalb von Embed 3 des Parents.
- **Das Präfix** `messagePrefix + "badge."` wird vor jede Nachrichten-id gesetzt, die das Kind sendet. Ein Klick im Kind sendet `badge.something`, sodass die Parent-Komponente die Nachricht an das richtige Kind routen kann.
- **Die Umgebung** `childEnv(env, "badge", next)` findet die Komponente hinter der Instanz, falls es eine gibt. Ein Kind mit einem eigenen `+outlet` braucht sie.

Der Guard listet die Props auf, die gelesen werden, und nur diese. Ändert sich das `name` des Parents, wird das Badge nicht einmal aufgerufen. Wird eine Prop ohne State geschrieben, wie `label="Fixed"`, ist sie statisch. Ein Embed, das nichts liest, wird ganz übersprungen.

Embeds werden oft in einer Schleife benutzt. Hier eines in einer Schleife mit key:

::demo embed-in-loop open=module

Die ids in den Patches sind `0#2/4` und `1#2/4`. Jede ist die Nummer eines Knotens des Kindes (`0` oder `1`), gefolgt von seinem Suffix `#2/4`: das Element mit key `2`, dann das Embed, das Knoten `4` des Parents ist. Dafür ist der Suffix da. Zwei Badges können dasselbe Template haben und teilen nie eine id.

Eine Spread-Prop, `+Row#row(...item selected=flag)`, kopiert alle Felder von `item` in die Props und fügt dann `selected` hinzu. Props werden der Reihe nach geschrieben, also gewinnt eine spätere.

## Dynamische Embeds

Manchmal ist das Kind beim Schreiben des Templates nicht bekannt. Ein **dynamisches Embed**, `+{expr}#name(props)`, nimmt den view aus dem State: Der Wert des Ausdrucks ist ein kompiliertes Template oder ein Komponentenobjekt mit einem `view`. Der Instanzname ist Pflicht, weil der Compiler ihn nicht erraten kann.

```pavlus
section.panel
  h2 {title}
  +{panel}#panel(items=items)
```

Weil das Kind auf jeder Seite ein anderes Template sein kann, muss der Compiler drei Fälle behandeln. Der Helfer `asView` gibt den view hinter einem Wert zurück oder `null` für `null` und `undefined`.

::demo embed-dynamic open=module

In der Demo hält der State echte kompilierte views (ausgegeben als `<view list.pavlus>`). Der Code hat drei Pfade:

```ts
      const prevPanelView = asView(prev.panel);
      const nextPanelView = asView(next.panel);
      if (prevPanelView !== nextPanelView) {
        // another view means another template: replace, never diff across
        if (prevPanelView) patches.push({ op: "clear", from: "3s" + idSuffix, to: "3e" + idSuffix });
        if (nextPanelView) {
          patches.push({ op: "insert", before: "3e" + idSuffix, nodes: nextPanelView.render(
            ...
          ) });
        }
      } else if (nextPanelView) {
        patches.push(...nextPanelView.diff(
          ...
        ));
      }
```

- Derselbe view auf beiden Seiten: Das eigene `diff` des views wird aufgerufen. Im ersten Schritt hängt der Listen-view ein Element an und gibt ein `insert` zurück.
- Ein anderer view: Der alte Inhalt wird zwischen den Markern geleert, und der neue view wird aus den Props von `next` gerendert und eingefügt. Ein diff zwischen einer Liste und einer Tabelle würde keinen Sinn ergeben.
- Ein view, der erscheint oder verschwindet (`null`): nur das `insert` oder nur das `clear`.

Ist der Wert weder ein view noch eine Komponente mit einem view, wirft `asView` `pavlus: +{...} needs a view or a component with a view`. Anders als ein statisches Embed hat ein dynamisches Marker, weil sein Inhalt kommen und gehen kann.

## Die geroutete Seite: +outlet

`+outlet` ist ein dynamisches Embed, dessen view vom Router kommt. Eine Komponente deklariert eine `routing`-Tabelle, und das outlet zeigt das Kind, das zu `state.route` passt. Die Tabelle selbst siehst du unter [Routing](page:concepts-routing). Das Template ist eine Zeile:

```pavlus
main
  +outlet
```

Sein `diff` hat dieselben drei Pfade wie ein dynamisches Embed, mit zwei Unterschieden:

```ts
  // line 4: <main> (reads: the route and the routed child)
  if (true) {
    // line 5: +outlet
    const prevOutlet = resolveOutlet(env, prev);
    const nextOutlet = resolveOutlet(env, next);
    if (prevOutlet?.view !== nextOutlet?.view || prevOutlet?.name !== nextOutlet?.name) {
      // another page: replace what is between the markers
      if (prevOutlet) patches.push({ op: "clear", from: "4s" + idSuffix, to: "4e" + idSuffix });
      if (nextOutlet) {
        patches.push({ op: "insert", before: "4e" + idSuffix, nodes: nextOutlet.view.render(
          ...
        ) });
      }
    } else if (nextOutlet) {
      ...
    }
  }
```

Erstens ist der Guard `if (true)`. Was das outlet zeigt, hängt von der Route und vom State des gerouteten Kindes ab, und das Template kann diese Felder nicht benennen. Also markiert der Compiler den Knoten als "kann sich ändern, wann immer sich irgendetwas ändert", und jeder Parent eines outlets wird bei jedem Update geprüft. Zweitens wird die Seite ersetzt, wenn sich der view **oder der Instanzname** ändert: Zwei Routen können dasselbe Template benutzen und trotzdem zwei verschiedene Seiten sein.

Du kannst auf dieser Seite kein outlet in einer Demo ausführen, weil es eine Komponente braucht, der die routing-Tabelle gehört. Ein Template mit `+outlet`, das ohne eine läuft, bricht mit diesem Fehler ab:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

## Alles zusammen

Dieses Board hat eine Überschrift, eine `if / else if / else`-Kette, eine Schleife mit key und Index, einen Klassen-Umschalter, ein Event mit einem Argument, ein statisches Embed in der Schleife und ein dynamisches Embed danach. Der `footer` ist ein view, der im State gespeichert ist.

::demo everything

Gehe die Schritte durch und benenne den Code, der jeden Patch erzeugt hat:

- `loading true → false`: Der Zweig wechselt von `0` zu `2`. Ein `clear` und ein `insert` bauen die Liste mit allen Elementen in einem Patch.
- `card 1 done, card 2 moves up`: ein `move`, weil sich die Reihenfolge der Liste geändert hat, und dann die Änderungen in den Elementen: die Nummern (der Index hat sich geändert), die `class` der Karte, die jetzt erledigt ist, und das Badge, ein Kind-view, der die neue Prop `hot` bekommt. Der Titel der Karte hat sich nicht geändert, wird also nicht gepatcht.
- `last card removed`: ein `remove` und der Footer-Text, `1 cards`. Der Footer ist ein dynamisches Embed mit demselben view auf beiden Seiten, also wird sein eigenes `diff` mit der neuen Anzahl aufgerufen.
- `all cards removed`: Der Zweig wechselt von `2` zu `1`, also wird die ganze Liste geleert und der Absatz "No cards" eingefügt. Für die Elemente ist kein `remove` nötig: Das `clear` entfernt alles zwischen den Markern. Der Footer-Text ändert sich zu `0 cards`.

## Was du gelernt hast

- `if`-Ketten werden zu einem Zweigindex kompiliert (`-1`, wenn nichts gezeigt wird). Derselbe Index bedeutet ein diff innerhalb des Zweigs; ein anderer Index bedeutet `clear` zwischen den Markern und `insert` des neuen Zweigs.
- Marker sind leere Kommentarknoten um jedes `if`, jedes `for`-Element, jede Schleife und jedes dynamische Embed. Struktur-Patches (`insert`, `clear`, `remove`, `move`) arbeiten auf Bereichen zwischen ihnen.
- Ein `for` wird zu `diffKeyedList` mit vier Callbacks. Keys müssen eindeutig und stabil sein; ohne key ist der Index der key, und das DOM folgt der Position.
- Ein statisches Embed ist ein Aufruf des `diff` des Kindes mit den Props beider Seiten, einem längeren id-Suffix und einem Nachrichtenpräfix. Ein dynamisches Embed oder ein outlet ersetzt den Inhalt, wenn sich der view ändert.

Weiter: [API, Vite-Plugin und Fehler](page:compiler-tooling).
