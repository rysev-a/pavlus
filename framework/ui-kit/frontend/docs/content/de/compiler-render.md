---
summary: Wie der Compiler render(state) schreibt. Lies den generierten Code Zeile für Zeile, von einem einzelnen Absatz bis zu einer vollständigen Karte: die Form der vnodes, Attribute, Klassen, Events, Text, Ausdrücke, Bedingungen, Schleifen und Kind-views.
---
## Was render ist

`render(state)` ist die Funktion, die die Frage beantwortet: "Wie sieht die Seite für diesen State aus?". Sie fasst das DOM nicht an. Sie baut eine Liste einfacher Objekte, die **vnodes**, die die Seite beschreiben, und gibt sie zurück. Das DOM-plugin baut daraus einmal echte Elemente, wenn ein view gemountet wird. Server-Rendering macht aus derselben Liste HTML-Text. Nach dem ersten render übernimmt `diff` (siehe [Die Kompilierungs-Pipeline](page:compiler-pipeline)).

`render` wird aus dem AST in einem festen Muster generiert: ein Codeblock pro Knoten, in der Reihenfolge des Templates. Diese Seite zeigt das Muster vom kleinsten Template aufwärts. Jeder Codeblock, den du hier siehst, ist die echte Ausgabe des Compilers, aus einem Lauf kopiert.

Beginne mit einer Zeile.

::demo static-line open=module

Öffne das Modul und lies `render` von oben.

```ts
function render(state, idSuffix = "", messagePrefix = "", env) {
  const nodes = [];
  // line 1: <p.note>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Hello" });
  const pAttrs = { "class": "note" };
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
  return nodes;
}
```

- Die Funktion hat vier Parameter. `state` sind die Daten. `idSuffix`, `messagePrefix` und `env` werden benutzt, wenn dieser view in einen anderen eingebettet wird; ein view auf oberster Ebene lässt sie auf ihren Defaults.
- `nodes` ist das Ergebnis: die vnodes der obersten Ebene.
- Der Kommentar `// line 1: <p.note>` sagt, welche Zeile des Templates den Code darunter erzeugt hat. Der Tag und die Klassen werden angezeigt, damit du dich in einem langen Modul zurechtfindest.
- `pChildren` ist die Liste der Kinder des `p`. Der Text wird zuerst gepusht.
- `pAttrs` ist das Attributobjekt. Die Klasse `note` ist statisch, daher wird sie als Literal geschrieben.
- Zuletzt wird das Element in `nodes` gepusht, mit den fünf Feldern, die jeder Element-vnode hat.

Die Kinder werden vor dem Element geschrieben, weil JavaScript das Array braucht, wenn es benutzt wird. Das gilt für jedes Element: **zuerst die Kinder, dann die Attribute, dann das Element selbst**.

## Die drei vnodes

Es gibt nur drei Arten von vnodes, und jede hat ein kurzes Typ-Tag in `t`.

| `t` | Felder | Bedeutung |
| --- | --- | --- |
| `el` | `tag`, `attrs`, `events`, `children`, optional `id` | ein Element |
| `text` | `text`, optional `id` | ein Textknoten |
| `marker` | `id` | ein leerer Kommentarknoten, der den Anfang oder das Ende eines Blocks markiert |

Die `attrs` eines Elements sind ein einfaches Objekt von Namen zu Strings. Die `events` sind ein einfaches Objekt von DOM-Event-Namen zu Nachrichtenbeschreibungen `{ id, payload, prevent?, stop? }`. In einem vnode gibt es keine Funktionen: Er ist Daten, kann also verglichen, geloggt, über ein Netzwerk gesendet und in HTML-Text verwandelt werden.

Die `id` ist das interessante Feld, und sie ist optional. **Eine id wird nur geschrieben, wenn `diff` den Knoten patchen kann.** In `static-line` gibt es überhaupt keine id. Im weiteren Verlauf dieser Seite siehst du genau, wann eine erscheint: bei einem Text mit einem Ausdruck, bei einem Element mit dynamischem Attribut, dynamischer Klasse oder dynamischem Event-Payload und bei jedem Marker.

## Verschachtelung und Namen

Elemente in Elementen verschachteln ihre Blöcke. Jedes Element deklariert seine eigenen Variablen, benannt nach dem Tag.

::demo nesting open=module

```ts
// line 1: <div>
const divChildren = [];
// line 2: <h1>
const h1Children = [];
h1Children.push({ t: "text", text: "Title" });
const h1Attrs = {};
divChildren.push({
  t: "el",
  tag: "h1",
  attrs: h1Attrs,
  events: {},
  children: h1Children,
});
// line 3: <p>
const pChildren = [];
pChildren.push({ t: "text", text: "Text" });
const pAttrs = {};
divChildren.push({
  t: "el",
  tag: "p",
  attrs: pAttrs,
  events: {},
  children: pChildren,
});
const divAttrs = {};
nodes.push({
  t: "el",
  tag: "div",
  attrs: divAttrs,
  events: {},
  children: divChildren,
});
```

Das `h1` und das `p` pushen sich selbst in `divChildren`, und am Ende pusht sich `div` in `nodes`. Das Ergebnis ist der Baum `div > (h1, p)`.

Die Namen stammen aus einem kleinen Allocator (`names.ts`). Er geht vom Tag aus, `h1Children`, und fügt nur dann eine Zahl hinzu, wenn der Name in einem Block, der an dieser Stelle offen ist, bereits benutzt wird: Ein zweites `li` neben dem ersten wird zu `liChildren2`. Namen, die JavaScript reserviert (`class`, `new`, ...), die Wörter, die der generierte Code braucht (`state`, `nodes`, `patches`, ...), und die Namen der Helfer und importierten views werden nie für Variablen benutzt. Ein Tag wie `my-card` wird zu `myCard`. Eine Schleifenvariable wird nach deiner Variable benannt; ist dieser Name vergeben, wird eine Zahl hinzugefügt.

Die Einrückung, die Zeilenumbrüche und die Regel "ein Aufruf, der nicht in 100 Spalten passt, bekommt ein Argument pro Zeile" stammen von einem kleinen `Writer`. Darum ist der lange `setAttr`-Aufruf in der Demo `classes` weiter unten auf mehrere Zeilen verteilt und die kurzen nicht.

## Statische Attribute und Klassen

Attribute mit festem Wert werden direkt in das Attributobjekt geschrieben, in einem Literal.

::demo static-attrs open=module

```ts
const aAttrs = { "id": "go", "href": "/home", "target": "_blank", "hidden": "", "class": "btn big" };
```

Beachte die Reihenfolge: zuerst `id` (das `#go` des Selektors ist ein Attribut wie jedes andere, und der Parser setzt es an den Anfang), dann die Attribute in der Reihenfolge des Quelltexts und zuletzt `class`. Die beiden Klassen `.btn.big` werden zu einem String verbunden. Ein boolesches Attribut wie `hidden` hat den Wert `""`, so sagt HTML "vorhanden". Hier ist nichts dynamisch, also hat das Element keine id, und die Helfer werden gar nicht importiert.

## Text und Interpolation

Text mit Platzhaltern wird mit `+` gebaut. Jeder Platzhalter läuft durch `toText`, das `null`, `undefined` und `false` in einen leeren String verwandelt.

::demo interpolation open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "Hello, " + toText(state.name) + "! You have " + toText(state.count) + " new messages." });
```

Die Teile des Texts, der Reihe nach: der String `"Hello, "`, der Ausdruck `name`, der String `"! You have "`, der Ausdruck `count` und der String `" new messages."`. Die Strings werden als JSON-String-Literale geschrieben; die Ausdrücke werden mit `toText` umhüllt.

Der Text hat eine `id`, `"1" + idSuffix`. Die `1` ist die Knoten-id vom Parser. Der `idSuffix` ist bei einem view auf oberster Ebene leer; er macht eine id eindeutig, wenn der view eingebettet oder in einer Schleife wiederholt wird. Hat ein Textknoten keinen Ausdruck, hat er keine id.

Wenn der erste Teil ein Ausdruck ist, beginnt der Code mit einem leeren String: `"" + toText(state.name)`. Das dient nur der Einheitlichkeit: `toText` gibt bereits einen String zurück, und der leere String hält jeden interpolierten Text in derselben Form `"" + ...`.

## Dynamische Attribute

Ein Attribut, dessen Wert einen Ausdruck hat, wird mit `setAttr` und einem von zwei Konvertern berechnet.

::demo dynamic-attrs open=module

```ts
const aAttrs = {};
setAttr(aAttrs, "href", toAttr(state.url));
setAttr(aAttrs, "title", "Open " + toText(state.name));
setAttr(aAttrs, "data-id", toAttr(state.id));
setAttr(aAttrs, "hidden", toAttr(state.gone));
```

- Ein Wert, der ein einzelner Ausdruck ist (`href=url`), läuft durch `toAttr`. `null`, `undefined` und `false` bedeuten "dieses Attribut gar nicht schreiben". `true` bedeutet ein bloßes Attribut (ein leerer String). Alles andere wird in einen String verwandelt: `data-id=id` mit `id: 0` ergibt `"0"`, weil `0` ein Wert ist wie jeder andere.
- Ein Wert, der Text und Ausdrücke mischt (`title="Open {name}"`), wird wie Text gebaut. Er ist immer ein String, wird also immer geschrieben.
- `setAttr(attrs, name, value)` schreibt das Attribut, außer der Wert ist `null`.

Im HTML der Demo gibt es kein `hidden`, weil `gone` `false` ist. Das Element hat eine `id` (`"0" + idSuffix`), weil `diff` dazu etwas zu sagen haben kann. Der Schritt der Demo setzt `url` auf null, und `diff` antwortet mit `rmAttr`: Das Attribut wird entfernt.

## Klassen-Umschalter

Eine Klasse, die vom State abhängt, ist ein Eintrag der Art `class:name=condition`. Zusammen mit den statischen Klassen und einem optionalen Attribut `class=` ergibt sie einen Wert, den `joinClasses` berechnet.

::demo classes open=module

```ts
setAttr(liAttrs, "class", 
  joinClasses(["item", (state.active ? "active" : ""), ((state.state === "done") ? "done" : ""), toAttr(state.extra)]),
);
```

Die Liste enthält der Reihe nach: die statischen Klassen (`.item`, zu einem String verbunden), einen Eintrag pro Umschalter (`(condition ? "name" : "")`) und das Attribut `class=`, falls es eins gibt. `joinClasses` verwirft die leeren Einträge und verbindet den Rest mit Leerzeichen, sodass das HTML `class="item active wide"` ist. Bleibt nichts übrig, gibt es `null` zurück, und `setAttr` schreibt nichts.

Der Schritt zeigt, wie sich `state` von `open` zu `done` ändert. Die neue Klassenliste ist `item active done wide`, und der Patch ist ein einzelnes `attr` für den ganzen Klassenwert, nicht eines pro Klassenname. Der Ausdruck des zweiten Umschalters benutzt geschweifte Klammern (`class:done={state === "done"}`), weil er Leerzeichen enthält; siehe [Parsing](page:compiler-parser).

## Void-Elemente

HTML hat Elemente, die nie Inhalt haben: `input`, `br`, `img` und ein paar mehr. Der Parser erlaubt keine Kinder darunter, und der Compiler schreibt keine. Der vnode hat trotzdem eine `children`-Liste, und sie ist leer.

::demo voids open=module

```ts
// line 3: <br>
const brChildren = [];
const brAttrs = {};
formChildren.push({
  t: "el",
  tag: "br",
  attrs: brAttrs,
  events: {},
  children: brChildren,
});
```

Wenn die vnodes in HTML verwandelt werden, kennt `toHtml` dieselbe Liste von Void-Tags und schreibt `<br>` ohne schließendes Tag. Im DOM-plugin bekommt `document.createElement("br")` einfach keine Kinder. Nur das `input` hat hier eine id, weil sein Attribut `value` den State liest.

## Events

Ein Event ist im vnode keine Funktion. Es ist eine Nachrichtenbeschreibung: die id einer Nachricht und ein Payload. Die Anwendung erhält die Nachricht, wenn der Benutzer klickt; das Template enthält nie Logik.

::demo events open=module

```ts
const buttonEvents = {
  "click": { id: messagePrefix + "save", payload: undefined },
};
...
const buttonEvents2 = {
  "click": { id: messagePrefix + "remove", payload: state.id },
};
...
const buttonEvents3 = {
  "click": { id: messagePrefix + "move", payload: [state.id, 1] },
};
...
const aEvents = {
  "click": { id: messagePrefix + "open", payload: undefined, prevent: true, stop: true },
};
```

- Die Nachrichten-id ist `messagePrefix + "save"`. Ein view auf oberster Ebene hat das leere Präfix, also ist die Nachricht `save`. Ein eingebetteter view hat den Instanznamen als Präfix, also ist ein `save` in einem Kind `+Form#editor` `editor.save`.
- Kein Argument ergibt `payload: undefined`. Ein Argument ergibt seinen Wert, und mehrere Argumente ergeben ein Array.
- Die Modifikatoren `.prevent` und `.stop` werden in der Beschreibung zu den Flags `prevent: true` und `stop: true`. Das DOM-plugin liest sie, wenn das Event eintrifft.

Sieh dir an, welche Buttons eine `id` haben. Der erste, `@click=save`, hat keine: Seine Beschreibung ändert sich nie. Der zweite und der dritte lesen `state.id`, haben also ids (`"3"` und `"5"`), und `diff` kann ihre Payloads neu binden. Im Schritt ändert sich `id` von 4 auf 5: zwei `handler`-Patches, einer pro Button, mit dem neuen Payload. Die Listener werden nicht angefasst.

## Ausdrücke

Alle Ausdrücke werden von einer Funktion übersetzt, mit einem Fall für jede Art von Knoten im Ausdrucks-AST. Die Übersetzung folgt zwei Regeln. **Jeder zusammengesetzte Ausdruck wird in Klammern gesetzt**, sodass die Auswertungsreihenfolge nie von der Präzedenz des gedruckten Texts abhängt. Und **jeder Member-Zugriff ist null-sicher**.

| Im Template | Im generierten Code |
| --- | --- |
| `count` | `state.count` |
| `user.name` | `(state.user)?.name` |
| `rows[i].title` | `((state.rows)?.[state.i])?.title` |
| `format(price)` | `(state.format)?.(state.price)` |
| `!done` | `(!(state.done))` |
| `-n` | `(-(state.n))` |
| `a + b * 2` | `(state.a + (state.b * 2))` |
| `ok ? "yes" : "no"` | `(state.ok ? "yes" : "no")` |
| `name ?? "anonymous"` | `(state.name ?? "anonymous")` |
| `["a", n]` | `["a", state.n]` |
| `null`, `1`, `"x"` | `null`, `1`, `"x"` |

Innerhalb einer Schleife sind die Schleifenvariablen lokale Variablen und werden ohne `state.` geschrieben.

::demo operators open=module

```ts
pChildren4.push({ t: "text", id: "7" + idSuffix, text: "" + toText((((state.x > 0) && (state.y < 10)) || state.z)) });
pChildren6.push({ t: "text", id: "11" + idSuffix, text: "" + toText(((state.count === 1) ? "item" : "items")) });
```

Die Operatoren werden unverändert übernommen: `===` bleibt `===`, `??` bleibt `??`. Die Template-Sprache wählt eine sichere Teilmenge von JavaScript und benutzt sie dann so, wie sie ist.

Die nächste Demo zeigt, was Null-Sicherheit bewirkt. Der State hat `user: null`, ein leeres `rows` und eine Funktion `format`. Nichts wirft einen Fehler.

::demo access open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "" + toText(((state.user)?.address)?.city) });
pChildren2.push({ t: "text", id: "3" + idSuffix, text: "" + toText(((state.rows)?.[state.i])?.title) });
pChildren3.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.format)?.(state.price)) });
```

In reinem JavaScript würde `state.user.address.city` einen Fehler werfen, wenn `user` `null` ist. Hier hält jedes `?.` die Kette beim ersten fehlenden Glied an und ergibt `undefined`, und `toText` macht daraus einen leeren String. Das HTML hat für die ersten beiden leere Absätze, `$3` für den Aufruf und nichts für das Literal `null`. Ein Template kann nicht abstürzen, weil die Daten noch nicht angekommen sind. Darum kann ein Template ohne `if user`-Guards vor jedem Lesen geschrieben werden.

> [!NOTE] Auch Aufrufe sind optional
> `format(price)` wird zu `(state.format)?.(state.price)` übersetzt. Fehlt `format`, ist das Ergebnis `undefined`, wieder ohne Fehler. Die Funktion erhält die Werte als Argumente; sie sollte rein sein, weil `diff` sie sowohl für `prev` als auch für `next` aufruft.

## Bedingungen

Ein `if` wird als gewöhnliche JavaScript-`if`-Kette gerendert, mit einem Marker auf jeder Seite.

::demo if-else open=module

```ts
// line 1: if
nodes.push({ t: "marker", id: "0s" + idSuffix });
if (state.loading) {
  // line 2: <p>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Loading" });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
} else {
  // line 4: <p>
  const pChildren = [];
  pChildren.push({ t: "text", id: "4" + idSuffix, text: "Loaded " + toText(state.count) });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
}
nodes.push({ t: "marker", id: "0e" + idSuffix });
```

Nur der Zweig, der wahr ist, wird gebaut. Die beiden Marker sind immer da: `0s` ist der Anfang (die Knoten-id `0` und der Buchstabe `s`), `0e` ist das Ende. Im DOM sind sie leere Kommentarknoten. Wenn der Zweig wechselt, entfernt `diff` alles zwischen den beiden Markern und fügt den neuen Zweig vor dem Ende-Marker ein. Ohne Marker gäbe es keine Stelle, an der man sagen könnte "hier lebt der Block", wenn der Block leer ist.

Jeder Zweig ist ein eigener Block, also verwendet der Allocator die Namen wieder (`pChildren` kommt in beiden vor), ohne Zahl. Sie begegnen sich nie.

## Schleifen

Ein `for` ist eine JavaScript-`for`-Schleife mit einem Marker vor und nach der ganzen Liste und einem Marker vor und nach jedem Element.

::demo for-loop open=module

```ts
// line 2: for tag, i
ulChildren.push({ t: "marker", id: "1s" + idSuffix });
const tagList = (state.tags) || [];
for (let i = 0; i < tagList.length; i++) {
  const tag = tagList[i];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "1[" + tagSuffix });
  // line 3: <li>
  const liChildren = [];
  liChildren.push({ t: "text", id: "3" + tagSuffix, text: "" + toText(i) + ": " + toText(tag) });
  ...
  ulChildren.push({ t: "marker", id: "1]" + tagSuffix });
}
ulChildren.push({ t: "marker", id: "1e" + idSuffix });
```

- `(state.tags) || []` macht aus einer fehlenden Liste eine leere Liste.
- Der key ist `String(...)` des key-Ausdrucks. Hier ist es `key tag`, also ist der key das Tag selbst. Ohne `key` ist der key der Index, geschrieben als `String(i)`.
- Jedes Element hat seinen eigenen Suffix, `idSuffix + "#" + key`. Alle ids innerhalb des Elements enden damit: Der Text ist `"3" + tagSuffix`, zum Beispiel `3#a`. Derselbe Textknoten in zwei Elementen hat zwei verschiedene ids. Der key macht das stabil: Wenn ein Element verschoben wird, wandern seine ids mit.
- Der Start- und der Ende-Marker eines Elements sind `"1["` und `"1]"`, gefolgt vom Suffix. Die Marker erlauben `diff`, ein ganzes Element als einen Bereich von Geschwistern zu verschieben oder zu entfernen.

Der Index und das Element haben die Namen, die du im Template vergeben hast. Lässt du den Index weg, erfindet der Allocator `tagIndex`, das du in der Demo `card` weiter unten siehst.

## Kind-views

Ein Embed wird zu einem Aufruf von `render` des Kindes, und das Ergebnis wird in die Kinder des Parents gespreadet.

::demo embed open=module

```ts
// line 4: +Badge#one
divChildren.push(...Badge.render(
  { "label": "Hi " + toText(state.name), "count": state.n },
  idSuffix + "/1",
  messagePrefix + "one.",
  childEnv(env, "one", state),
));
```

Die vier Argumente sind der Reihe nach der `state` des Kindes (die Props, als Objekt), der id-Suffix, das Nachrichtenpräfix und die Umgebung. Das Props-Objekt behält den Typ einer Prop aus einem einzelnen Ausdruck (`count: state.n` ist eine Zahl, wenn `n` eine Zahl ist) und baut einen String für eine Prop mit Text und Platzhaltern (`label="Hi {name}"`). Der Suffix wird um `/1` erweitert, die Knoten-id des Embeds, sodass die ids des Kindes nie auf die des Parents treffen. Das Präfix wird um `one.` erweitert, den Instanznamen. Das letzte Argument ist die Komponente hinter der Instanz, vom Helfer `childEnv` gefunden; das Kind braucht sie hauptsächlich für ein `+outlet`.

Eine Prop ohne Wert (`strong`) ist `true`. Ein Spread-Eintrag (`...extra`) wird im Props-Objekt zu `...(state.extra)`.

Ein **dynamisches Embed**, `+{expr}#name`, ist ein view, der aus dem State kommt. Es wird zur Laufzeit geprüft und bekommt daher Marker, wie eine Bedingung:

```ts
// line 2: +{...}#view
sectionChildren.push({ t: "marker", id: "1s" + idSuffix });
const viewView = asView(state.page);
if (viewView) {
  sectionChildren.push(...viewView.render(
    { "title": state.title },
    idSuffix + "/1",
    messagePrefix + "view.",
    state.page,
  ));
}
sectionChildren.push({ t: "marker", id: "1e" + idSuffix });
```

`asView` akzeptiert einen view oder ein Komponentenobjekt mit einem `view` oder `null` für "nichts". Der Rest ist derselbe Aufruf, in ein `if` gepackt.

Ein `+outlet` wird ähnlich gerendert, mit Markern und einem Nachschlagen des gerouteten Kindes zur Laufzeit:

```ts
// line 3: +outlet
divChildren.push({ t: "marker", id: "3s" + idSuffix });
const outlet = resolveOutlet(env, state);
if (outlet) {
  divChildren.push(...outlet.view.render(
    outlet.state,
    idSuffix + "/3",
    messagePrefix + outlet.name + ".",
    outlet.component,
  ));
}
divChildren.push({ t: "marker", id: "3e" + idSuffix });
```

`resolveOutlet` schaut in die `routing`-Tabelle der Komponente (das `env`) und in `state.route` und gibt die passende Seite zurück: ihren view, ihren State, ihren Namen und ihre Komponente. Gibt es keine Übereinstimmung, wird zwischen den Markern nichts gerendert.

## Eine vollständige Karte

Nun ein Template, das fast alles benutzt: einen Klassen-Umschalter an der Wurzel, ein Bild mit zwei dynamischen Attributen, eine Überschrift, einen null-sicheren Default, eine Liste mit keys und einem Klick-Event und eine Bedingung mit einem Button und einer Alternative.

::demo card open=module

Lies das generierte `render` in Stücken. Zuerst die Wurzel, am Ende der Funktion:

```ts
const articleAttrs = {};
setAttr(articleAttrs, "class", joinClasses(["card", (state.featured ? "featured" : "")]));
nodes.push({
  t: "el",
  id: "0" + idSuffix,
  tag: "article",
  attrs: articleAttrs,
  events: {},
  children: articleChildren,
});
```

Der Klassen-Umschalter `featured` ist dynamisch, also hat das `article` die id `"0"`. Die statische Klasse `card` ist der erste Eintrag der Liste. Das Bild ist das erste Kind:

```ts
const imgAttrs = { "class": "card-img" };
setAttr(imgAttrs, "src", toAttr(state.image));
setAttr(imgAttrs, "alt", toAttr(state.title));
```

Die statische Klasse steht im Literal, und die beiden dynamischen Attribute folgen. Das `h3` ist bis auf seinen Text statisch, also hat das Element keine id, sein Text aber schon: `"3" + idSuffix`. Die Zusammenfassung benutzt den null-sicheren Default:

```ts
pChildren.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.summary ?? "No summary")) });
```

Mit `summary: null` ergibt das `No summary`. Dann die Liste. Hier ist der Index im Template nicht benannt, also hat der Allocator `tagIndex` gewählt:

```ts
const tagList = (state.tags) || [];
for (let tagIndex = 0; tagIndex < tagList.length; tagIndex++) {
  const tag = tagList[tagIndex];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "7[" + tagSuffix });
  // line 7: <li.tag>
  const liChildren = [];
  liChildren.push({ t: "text", id: "9" + tagSuffix, text: "" + toText(tag) });
  const liAttrs = { "class": "tag" };
  const liEvents = {
    "click": { id: messagePrefix + "filter", payload: tag },
  };
  ulChildren.push({
    t: "el",
    id: "8" + tagSuffix,
    tag: "li",
    attrs: liAttrs,
    events: liEvents,
    children: liChildren,
  });
  ulChildren.push({ t: "marker", id: "7]" + tagSuffix });
}
```

Jedes `li` hat eine id, die seinen key enthält (`8` und der Suffix `#hot`), weil der Payload von `filter(tag)` Daten sind, die sich ändern können. Das letzte Stück ist die Bedingung, mit einem Button, der ein Event mit zwei Argumenten und ein dynamisches `disabled` hat:

```ts
const buttonAttrs = { "class": "buy" };
setAttr(buttonAttrs, "disabled", toAttr(state.soldOut));
const buttonEvents = {
  "click": { id: messagePrefix + "buy", payload: [state.id, state.price] },
};
```

Im State der Demo ist `soldOut` `false`, also wird `disabled` nicht geschrieben, und der `price` von 4 steht im Payload als `[9, 4]`. Der Schritt ändert den Preis. Das Ergebnis sind zwei Patches: Die Nachricht des Buttons bekommt den Payload `[9, 5]`, und der Text wird zu `Buy for 5`. Alle anderen Knoten der Karte werden nicht erwähnt. Wie `diff` genau diese beiden findet, ist das Thema der [nächsten Seite](page:compiler-diff).

## Teste dein Verständnis

Du kannst in wenigen Minuten lernen, den generierten Code zu lesen, und es lohnt sich. Wenn eine Seite nicht so aussieht, wie du erwartest, ist der erste Schritt, das Modul einer kleinen Demo mit derselben Form aufzuklappen. Stelle drei Fragen:

1. Hat das Element oder der Text, den ich erwarte, eine `id`? Wenn nicht, kann nie ein Patch dort ankommen.
2. Wird der Ausdruck, den ich geschrieben habe, so übersetzt, wie ich dachte? Achte auf die Klammern und das `?.`.
3. Wird das Attribut mit `toAttr` (einzelner Ausdruck) oder mit `+` (Text mit Platzhaltern) berechnet? Das erste verwirft `false` und `null`, das zweite schreibt immer einen String.

## Was du gelernt hast

- `render` wird in einem festen Muster generiert: zuerst die Kinder, dann die Attribute, dann wird das Element gepusht; ein vnode besteht aus einfachen Daten in drei Arten, `el`, `text` und `marker`.
- Eine `id` gibt es nur an Knoten, die `diff` patchen kann, und an allen Markern. Die ids sind die Knoten-id des Parsers, gefolgt vom Suffix des Listenelements oder des Kind-views.
- Attribute nutzen `setAttr` mit `toAttr` (ein Ausdruck) oder Text-Konkatenation (Text mit Platzhaltern), Klassen nutzen `joinClasses`, Events werden zu Nachrichtenbeschreibungen mit einem Payload.
- Ausdrücke sind vollständig geklammert und null-sicher. `if`, `for` und Embeds sind in Marker gepackt, damit `diff` weiß, wo sie beginnen und enden.

Weiter: [Die Funktion diff](page:compiler-diff).
