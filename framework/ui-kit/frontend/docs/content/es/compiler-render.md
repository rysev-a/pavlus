---
summary: Cómo escribe el compilador render(state). Lee el código generado línea por línea, desde un solo párrafo hasta una tarjeta completa: la forma de los vnodes, atributos, clases, eventos, texto, expresiones, condicionales, bucles y views hijas.
---
## Qué es render

`render(state)` es la función que responde a la pregunta "¿cómo se ve la página para este state?". No toca el DOM. Construye y devuelve una lista de objetos simples, los **vnodes**, que describen la página. El plugin del DOM construye a partir de ellos los elementos reales una sola vez, cuando se monta una view. El renderizado en servidor convierte la misma lista en texto HTML. Después del primer render, `diff` toma el relevo (consulta [el pipeline](page:compiler-pipeline)).

`render` se genera a partir del AST, con un patrón fijo: un bloque de código por nodo, en el orden del template. Esta página muestra ese patrón desde el template más pequeño hacia arriba. Cada bloque de código que ves aquí es la salida real del compilador, copiada de una ejecución.

Empieza con una línea.

::demo static-line open=module

Abre el módulo y lee `render` desde arriba.

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

- La función tiene cuatro parámetros. `state` son los datos. `idSuffix`, `messagePrefix` y `env` se usan cuando esta view se embebe en otra; una view de nivel superior los deja con sus valores por defecto.
- `nodes` es el resultado: los vnodes de nivel superior.
- El comentario `// line 1: <p.note>` dice qué línea del template produjo el código que tiene debajo. Se muestran el tag y las clases, para que puedas orientarte en un módulo largo.
- `pChildren` es la lista de hijos del `p`. El texto se mete primero.
- `pAttrs` es el objeto de atributos. La clase `note` es estática, así que se escribe como un literal.
- Por último, el elemento se mete en `nodes`, con los cinco campos que tiene todo vnode de elemento.

Los hijos se escriben antes que el elemento porque JavaScript necesita que el array exista cuando se usa. Esto es cierto para todos los elementos: **primero los hijos, después los atributos, luego el propio elemento**.

## Los tres vnodes

Solo hay tres tipos de vnodes, y cada uno tiene una etiqueta de tipo corta en `t`.

| `t` | Campos | Significado |
| --- | --- | --- |
| `el` | `tag`, `attrs`, `events`, `children`, `id` opcional | un elemento |
| `text` | `text`, `id` opcional | un nodo de texto |
| `marker` | `id` | un nodo de comentario vacío que marca el inicio o el final de un bloque |

Los `attrs` de un elemento son un objeto simple de nombres a cadenas. Los `events` son un objeto simple de nombres de eventos del DOM a descripciones de message `{ id, payload, prevent?, stop? }`. No hay funciones en un vnode: son datos, así que se pueden comparar, registrar en un log, enviar por una red y convertir en texto HTML.

El `id` es el campo interesante, y es opcional. **Un id se escribe solo cuando `diff` puede hacer patch del nodo.** En `static-line` no hay ningún id. En el resto de esta página verás exactamente cuándo aparece uno: en un texto con una expresión, en un elemento con un atributo, clase o payload de evento dinámicos, y en cada marker.

## Anidación y nombres

Los elementos dentro de elementos anidan sus bloques. Cada elemento declara sus propias variables, nombradas según el tag.

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

El `h1` y el `p` se meten ellos mismos en `divChildren`, y al final el `div` se mete en `nodes`. El resultado es el árbol `div > (h1, p)`.

Los nombres vienen de un pequeño asignador (`names.ts`). Parte del tag, `h1Children`, y añade un número solo cuando el nombre ya está en uso en un bloque que está abierto en ese punto: un segundo `li` junto al primero pasa a ser `liChildren2`. Los nombres que JavaScript reserva (`class`, `new`, ...), las palabras que necesita el código generado (`state`, `nodes`, `patches`, ...) y los nombres de los helpers y de las views importadas nunca se usan para variables. Un tag como `my-card` pasa a ser `myCard`. Una variable de bucle se nombra con el nombre de tu variable; si ese nombre está ocupado, se añade un número.

La indentación, los saltos de línea y la regla "una llamada que no cabe en 100 columnas lleva un argumento por línea" vienen de un pequeño `Writer`. Por eso la larga llamada a `setAttr` de la demo `classes` más abajo se parte en varias líneas, y las cortas no.

## Atributos estáticos y clases

Los atributos con un valor fijo se escriben directamente en el objeto de atributos, en un solo literal.

::demo static-attrs open=module

```ts
const aAttrs = { "id": "go", "href": "/home", "target": "_blank", "hidden": "", "class": "btn big" };
```

Fíjate en el orden: primero `id` (el `#go` del selector es un atributo como cualquier otro, y el parser lo pone primero), luego los atributos en el orden del código fuente, y `class` al final. Las dos clases `.btn.big` se fusionan en una sola cadena. Un atributo booleano como `hidden` tiene el valor `""`, que es como HTML dice "presente". Aquí nada es dinámico, así que el elemento no tiene id, y los helpers no se importan en absoluto.

## Texto e interpolación

El texto con huecos se construye con `+`. Cada hueco pasa por `toText`, que convierte `null`, `undefined` y `false` en una cadena vacía.

::demo interpolation open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "Hello, " + toText(state.name) + "! You have " + toText(state.count) + " new messages." });
```

Las partes del texto, en orden: la cadena `"Hello, "`, la expresión `name`, la cadena `"! You have "`, la expresión `count` y la cadena `" new messages."`. Las cadenas se escriben como literales de cadena JSON; las expresiones se envuelven con `toText`.

El texto tiene un `id`, `"1" + idSuffix`. El `1` es el id de nodo del parser. El `idSuffix` está vacío en una view de nivel superior; es lo que hace único un id cuando la view se embebe o se repite en un bucle. Si un nodo de texto no tiene ninguna expresión, no tiene id.

Cuando la primera parte es una expresión, el código empieza con una cadena vacía: `"" + toText(state.name)`. Esto es solo por uniformidad: `toText` ya devuelve una cadena, y la cadena vacía mantiene todos los textos interpolados con la misma forma `"" + ...`.

## Atributos dinámicos

Un atributo cuyo valor tiene una expresión se calcula con `setAttr` y uno de dos conversores.

::demo dynamic-attrs open=module

```ts
const aAttrs = {};
setAttr(aAttrs, "href", toAttr(state.url));
setAttr(aAttrs, "title", "Open " + toText(state.name));
setAttr(aAttrs, "data-id", toAttr(state.id));
setAttr(aAttrs, "hidden", toAttr(state.gone));
```

- Un valor que es una sola expresión (`href=url`) pasa por `toAttr`. `null`, `undefined` y `false` significan "no escribas este atributo en absoluto". `true` significa un atributo sin valor (una cadena vacía). Cualquier otra cosa se convierte en cadena: `data-id=id` con `id: 0` da `"0"`, porque `0` es un valor como cualquier otro.
- Un valor que mezcla texto y expresiones (`title="Open {name}"`) se construye como texto. Siempre es una cadena, así que siempre se escribe.
- `setAttr(attrs, name, value)` escribe el atributo salvo que el valor sea `null`.

En el HTML de la demo no hay `hidden`, porque `gone` es `false`. El elemento tiene un `id` (`"0" + idSuffix`), porque `diff` puede tener algo que decir sobre él. El paso de la demo pone `url` a null, y `diff` responde `rmAttr`: el atributo se elimina.

## Alternancias de clase

Una clase que depende del state es una entrada del tipo `class:name=condition`. Junto con las clases estáticas y un atributo `class=` opcional, forma un valor, calculado por `joinClasses`.

::demo classes open=module

```ts
setAttr(liAttrs, "class", 
  joinClasses(["item", (state.active ? "active" : ""), ((state.state === "done") ? "done" : ""), toAttr(state.extra)]),
);
```

La lista tiene, en orden: las clases estáticas (`.item`, unidas en una cadena), una entrada por alternancia (`(condition ? "name" : "")`) y el atributo `class=` si lo hay. `joinClasses` descarta las entradas vacías y une el resto con espacios, así que el HTML es `class="item active wide"`. Si no queda nada, devuelve `null` y `setAttr` no escribe nada.

El paso muestra `state` cambiando de `open` a `done`. La nueva lista de clases es `item active done wide`, y el patch es un único `attr` para todo el valor de class, no uno por cada nombre de clase. La expresión de la segunda alternancia usa llaves (`class:done={state === "done"}`), porque tiene espacios; consulta [el parseo](page:compiler-parser).

## Elementos void

HTML tiene elementos que nunca tienen contenido: `input`, `br`, `img` y unos pocos más. El parser no permite hijos debajo de ellos, y el compilador no escribe ninguno. El vnode sigue teniendo una lista `children`, y está vacía.

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

Cuando los vnodes se convierten en HTML, `toHtml` conoce la misma lista de tags void y escribe `<br>` sin etiqueta de cierre. En el plugin del DOM, `document.createElement("br")` simplemente no recibe hijos. Aquí solo el `input` tiene un id, porque su atributo `value` lee el state.

## Eventos

Un evento no es una función en el vnode. Es una descripción de message: el id de un message y un payload. La aplicación recibe el message cuando el usuario hace click; el template nunca contiene lógica.

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

- El id del message es `messagePrefix + "save"`. Una view de nivel superior tiene el prefijo vacío, así que el message es `save`. Una view embebida tiene como prefijo el nombre de la instancia, así que un `save` en un hijo `+Form#editor` es `editor.save`.
- Sin argumentos da `payload: undefined`. Un argumento da su valor, y varios argumentos dan un array.
- Los modificadores `.prevent` y `.stop` se convierten en las flags `prevent: true` y `stop: true` de la descripción. El plugin del DOM las lee cuando llega el evento.

Mira qué botones tienen un `id`. El primero, `@click=save`, no tiene ninguno: su descripción nunca cambia. El segundo y el tercero leen `state.id`, así que tienen ids (`"3"` y `"5"`), y `diff` puede volver a enlazar sus payloads. En el paso, `id` cambia de 4 a 5: dos patches `handler`, uno por cada botón, con el nuevo payload. Los listeners no se tocan.

## Expresiones

Todas las expresiones las traduce una sola función con un caso por cada tipo de nodo del AST de expresiones. La traducción sigue dos reglas. **Toda expresión compuesta se envuelve entre paréntesis**, así que el orden de evaluación nunca depende de la precedencia del texto impreso. Y **todo acceso a miembro es null-safe**.

| En el template | En el código generado |
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

Dentro de un bucle, las variables de bucle son variables locales y se escriben sin `state.`.

::demo operators open=module

```ts
pChildren4.push({ t: "text", id: "7" + idSuffix, text: "" + toText((((state.x > 0) && (state.y < 10)) || state.z)) });
pChildren6.push({ t: "text", id: "11" + idSuffix, text: "" + toText(((state.count === 1) ? "item" : "items")) });
```

Los operadores se copian tal cual: `===` sigue siendo `===`, `??` sigue siendo `??`. El lenguaje de templates elige un subconjunto seguro de JavaScript y luego lo usa tal como es.

La demo siguiente muestra lo que hace la null-safety. El state tiene `user: null`, un `rows` vacío y una función `format`. Nada lanza un error.

::demo access open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "" + toText(((state.user)?.address)?.city) });
pChildren2.push({ t: "text", id: "3" + idSuffix, text: "" + toText(((state.rows)?.[state.i])?.title) });
pChildren3.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.format)?.(state.price)) });
```

En JavaScript normal, `state.user.address.city` lanzaría un error cuando `user` es `null`. Aquí, cada `?.` detiene la cadena en la primera pieza que falta y da `undefined`, y `toText` lo convierte en una cadena vacía. El HTML tiene párrafos vacíos para los dos primeros, `$3` para la llamada, y nada para el literal `null`. Un template no puede romperse porque los datos aún no han llegado. Por eso un template se puede escribir sin guardas `if user` delante de cada lectura.

> [!NOTE] Las llamadas también son opcionales
> `format(price)` se traduce a `(state.format)?.(state.price)`. Si falta `format`, el resultado es `undefined`, otra vez sin error. La función recibe los valores como argumentos; debería ser pura, porque `diff` la llama tanto para `prev` como para `next`.

## Condicionales

Un `if` se renderiza como una cadena `if` normal de JavaScript, con un marker a cada lado.

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

Solo se construye la rama que es verdadera. Los dos markers siempre están: `0s` es el inicio (el id de nodo `0` y la letra `s`), `0e` es el final. Son nodos de comentario vacíos en el DOM. Cuando la rama cambia, `diff` elimina todo lo que hay entre los dos markers e inserta la rama nueva antes del marker final. Sin markers, no habría lugar donde decir "aquí vive el bloque" cuando el bloque está vacío.

Cada rama es un bloque propio, así que el asignador reutiliza los nombres (`pChildren` aparece en ambas) sin número. Nunca se encuentran.

## Bucles

Un `for` es un bucle `for` de JavaScript con un marker antes y después de toda la lista, y un marker antes y después de cada elemento.

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

- `(state.tags) || []` convierte una lista que falta en una lista vacía.
- La key es `String(...)` de la expresión de la key. Aquí es `key tag`, así que la key es el propio tag. Sin `key`, la key es el índice, escrito como `String(i)`.
- Cada elemento tiene su propio sufijo, `idSuffix + "#" + key`. Todos los ids de dentro del elemento terminan con él: el texto es `"3" + tagSuffix`, por ejemplo `3#a`. El mismo nodo de texto en dos elementos tiene dos ids distintos. La key lo hace estable: si un elemento se mueve, sus ids van con él.
- Los markers de inicio y final de un elemento son `"1["` y `"1]"` seguidos del sufijo. Los markers permiten a `diff` mover o eliminar un elemento entero como un solo rango de hermanos.

El índice y el elemento tienen los nombres que diste en el template. Si omites el índice, el asignador inventa `tagIndex`, que puedes ver en la demo `card` más abajo.

## Views hijas

Un embed se convierte en una llamada al `render` del hijo, y el resultado se expande dentro de los hijos del padre.

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

Los cuatro argumentos, en orden, son el `state` del hijo (las props, como un objeto), el sufijo de id, el prefijo de message y el entorno. El objeto de props conserva el tipo de una prop de una sola expresión (`count: state.n` es un número si `n` es un número), y construye una cadena para una prop con texto y huecos (`label="Hi {name}"`). El sufijo se extiende con `/1`, el id de nodo del embed, para que los ids del hijo no se encuentren con los del padre. El prefijo se extiende con `one.`, el nombre de la instancia. El último argumento es el componente que hay detrás de la instancia, que encuentra el helper `childEnv`; el hijo lo necesita sobre todo para un `+outlet`.

Una prop sin valor (`strong`) es `true`. Una entrada spread (`...extra`) se convierte en `...(state.extra)` dentro del objeto de props.

Un **embed dinámico**, `+{expr}#name`, es una view que viene del state. Se comprueba en tiempo de ejecución, así que recibe markers, como un condicional:

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

`asView` acepta una view, o un objeto de componente que tenga una `view`, o `null` para "nada". El resto es la misma llamada, envuelta en un `if`.

Un `+outlet` se renderiza de forma parecida, con markers y una búsqueda en tiempo de ejecución del hijo de la ruta:

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

`resolveOutlet` mira la tabla `routing` del componente (el `env`) y `state.route`, y devuelve la página que coincide: su view, su state, su nombre y su componente. Si no hay coincidencia, no se renderiza nada entre los markers.

## Una tarjeta completa

Ahora un template que usa casi todo: una alternancia de clase en la raíz, una imagen con dos atributos dinámicos, un encabezado, un valor por defecto null-safe, una lista con key con un evento click, y un condicional con un botón y una alternativa.

::demo card open=module

Lee el `render` generado por partes. Primero la raíz, al final de la función:

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

La alternancia de clase `featured` es dinámica, así que el `article` tiene el id `"0"`. La clase estática `card` es la primera entrada de la lista. La imagen es el primer hijo:

```ts
const imgAttrs = { "class": "card-img" };
setAttr(imgAttrs, "src", toAttr(state.image));
setAttr(imgAttrs, "alt", toAttr(state.title));
```

La clase estática está en el literal, y los dos atributos dinámicos van después. El `h3` es estático salvo por su texto, así que el elemento no tiene id pero su texto sí: `"3" + idSuffix`. El resumen usa el valor por defecto null-safe:

```ts
pChildren.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.summary ?? "No summary")) });
```

Con `summary: null`, esto es `No summary`. Después la lista. En esta el índice no se nombra en el template, así que el asignador eligió `tagIndex`:

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

Cada `li` tiene un id que incluye su key (`8` y el sufijo `#hot`), porque el payload de `filter(tag)` son datos que pueden cambiar. La última pieza es el condicional, con un botón que tiene un evento con dos argumentos y un `disabled` dinámico:

```ts
const buttonAttrs = { "class": "buy" };
setAttr(buttonAttrs, "disabled", toAttr(state.soldOut));
const buttonEvents = {
  "click": { id: messagePrefix + "buy", payload: [state.id, state.price] },
};
```

En el state de la demo `soldOut` es `false`, así que `disabled` no se escribe, y el `price` de 4 está en el payload como `[9, 4]`. El paso cambia el precio. El resultado tiene dos patches: el message del botón recibe el payload `[9, 5]`, y el texto pasa a ser `Buy for 5`. Los demás nodos de la tarjeta no se mencionan. Cómo encuentra `diff` exactamente estos dos es el tema de [la página siguiente](page:compiler-diff).

## Comprueba lo que has entendido

Puedes aprender a leer el código generado en pocos minutos, y vale la pena. Cuando una página no se ve como esperas, el primer paso es desplegar el módulo de una demo pequeña que tenga la misma forma. Hazte tres preguntas:

1. ¿Tiene un `id` el elemento o texto que espero? Si no, ningún patch podrá alcanzarlo nunca.
2. ¿Se tradujo la expresión que escribí como pensaba? Busca los paréntesis y los `?.`.
3. ¿Se calcula el atributo con `toAttr` (una sola expresión) o con `+` (texto con huecos)? El primero descarta `false` y `null`, y el segundo siempre escribe una cadena.

## Lo que aprendiste

- `render` se genera con un patrón fijo: primero los hijos, luego los atributos, luego se mete el elemento; un vnode son datos simples de tres tipos, `el`, `text` y `marker`.
- Un `id` existe solo en los nodos a los que `diff` puede hacer patch, y en todos los markers. Los ids son el id de nodo del parser, seguido del sufijo del elemento de lista o de la view hija.
- Los atributos usan `setAttr` con `toAttr` (una expresión) o concatenación de texto (texto con huecos), las clases usan `joinClasses`, los eventos se convierten en descripciones de message con un payload.
- Las expresiones llevan todos los paréntesis y son null-safe. `if`, `for` y los embeds se envuelven en markers para que `diff` sepa dónde empiezan y terminan.

Siguiente: [La función diff](page:compiler-diff).
