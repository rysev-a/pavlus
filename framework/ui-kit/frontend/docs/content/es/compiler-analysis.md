---
summary: Cómo el compilador averigua qué parte del state lee cada nodo, y cómo esa única respuesta decide qué nodos reciben un id, qué comparaciones se escriben en diff y qué nodos se saltan por completo.
---
## La pregunta que responde el análisis

Un template es una función del state. Cuando el state cambia, normalmente la mayor parte de la página sigue igual. Para actualizar la página de forma barata, `diff` debe saber rápidamente qué nodos pueden verse afectados. El compilador responde a esto una vez, en el momento del build, para cada nodo: **¿qué campos del state lee este nodo?**

Esta respuesta es el **conjunto de dependencias** del nodo. Lo calcula un módulo pequeño, `analyze.ts`, a partir del AST. El conjunto se usa de tres maneras:

- Un nodo con un conjunto **vacío** nunca puede cambiar. No recibe `id` ni código en `diff`.
- Un nodo con un conjunto no vacío recibe una **guarda** en `diff`: el código que maneja el nodo se ejecuta solo si cambió alguno de los campos del conjunto.
- El conjunto de un padre contiene los conjuntos de todos sus hijos, así que una guarda en un padre puede saltarse de una vez un subárbol entero.

Empieza con el caso más pequeño. La demo abre la sección del AST; la columna `reads:` es el conjunto de dependencias.

::demo basic open=ast

El elemento y su texto leen ambos `name`. El paso uno cambia `name`, y la respuesta es un patch `text`. El paso dos cambia un campo que el template no lee (`n`), y la respuesta es una lista vacía: la primera línea de `diff` que menciona `name` es falsa, y la función retorna de inmediato.

## Identificadores libres de una expresión

La base del análisis es una función que toma una expresión y recoge sus **identificadores libres**: los nombres que vienen de fuera de la expresión, es decir, del state (o de un bucle que la contiene). Recorre el árbol de la expresión y registra solo los identificadores:

- Un literal (`1`, `"x"`, `true`) no lee nada.
- Un identificador (`count`) lee su nombre.
- Un acceso a miembro (`user.profile.name`) lee el identificador de la raíz de la cadena: `user`. Los nombres `profile` y `name` son propiedades, no campos del state.
- Un índice (`items[index]`) lee ambos lados: `items` e `index`.
- Una llamada (`fmt(count, unit)`) lee el callee y cada argumento: `fmt`, `count` y `unit`.
- Las expresiones unarias, binarias, condicionales y de array leen todo lo que tienen dentro.

::demo members open=ast

Mira el primer párrafo. Muestra `user.profile.name` y `user.role`, y su dependencia es solo `user`. El segundo lee `index` e `items`. El tercero lee también la función `fmt`: si una función se guarda en el state, reemplazarla cuenta como un cambio.

> [!NOTE] La unidad de cambio es un campo de nivel superior
> El compilador sigue `user`, no `user.profile.name`. Compara `prev.user !== next.user`, una sola comprobación sobre la referencia. Si reemplazas el objeto `user` completo, se examina cada nodo que lee cualquier parte de `user`. El paso siguiente, comparar el texto calculado, descubre entonces que no cambió nada visible, y no se escribe ningún patch. Así que el coste de una dependencia gruesa son unas pocas comparaciones, nunca una página incorrecta.

## Qué lee cada tipo de nodo

La función `nodeDeps` devuelve el conjunto de dependencias de un nodo. Sus reglas siguen los tipos de nodo.

| Nodo | Lee |
| --- | --- |
| text | los identificadores de sus partes |
| element | los valores de sus atributos, las condiciones de sus alternancias de clase, los argumentos de sus eventos y todo lo que leen sus hijos |
| if | el test de cada rama y todo lo que contienen las ramas |
| for | la expresión de la lista, más lo que lee el cuerpo, menos las variables del bucle |
| embed | la expresión dinámica de la view, cada valor de prop y cada spread |
| outlet | todo (consulta el final de esta página) |

El resultado de un nodo se recuerda, así que volver a preguntar no cuesta nada. Como un elemento incluye a sus hijos, la raíz del template siempre tiene el conjunto más grande: la unión de todo el árbol.

## Nodos estáticos

Un nodo cuyo conjunto está vacío es **estático**. El compilador hace tres cosas con él.

1. En `render` escribe el vnode sin `id`, ya que ningún patch lo nombrará nunca (la única excepción es un texto como `{null}`: es una expresión, así que recibe un id, aunque nunca pueda cambiar).
2. En `diff` no escribe nada. La función que maneja un nodo empieza con una comprobación para exactamente este caso: sin dependencias, nada que hacer.
3. Como el conjunto del padre es la unión de los de sus hijos, un hijo estático no añade nada a la guarda del padre.

::demo static-mix open=ast

Solo el último párrafo, y el `div` que lo contiene, leen `visits`. El título y el párrafo atenuado muestran `reads: —`. Compáralo con el `diff` generado para este template:

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

El `h3` y el primer `p` no aparecen. Ni siquiera se escribe un comentario para ellos. En una página con un diseño estático grande y unos pocos puntos dinámicos, el trabajo de `diff` depende solo de los puntos dinámicos.

## La guarda

Para un nodo con un conjunto no vacío, el generador de código escribe el comentario `// line N: <tag> (reads: a, b)` y, debajo, un `if` que compara cada campo del conjunto entre `prev` y `next`:

```ts
if (prev.url !== next.url || prev.active !== next.active || prev.title !== next.title) {
```

La comparación es `!==`, la identidad del valor. Para un número o una cadena es una comparación de valores. Para un objeto o un array es una comparación de referencias. Esto es barato, y es la razón por la que el state debe actualizarse creando objetos nuevos.

La guarda es **gruesa** a propósito. Dice "algo que lee este nodo ha cambiado", no "este atributo cambió". Dentro de la guarda, el compilador calcula cada atributo, cada payload de evento y cada texto tanto para `prev` como para `next`, y escribe un patch solo si los dos resultados difieren. Dos niveles de comprobaciones trabajan juntos: la guarda barata se salta la mayoría de los nodos, y la comparación exacta de los resultados decide qué entra realmente en la lista de patches.

::demo parts open=ast

Un elemento lee cinco campos: `url`, `active`, `title`, `id` y `label`. En el paso uno solo cambia `id`. La guarda se abre, y `diff` comprueba cada parte: el `href` es igual, el título es igual, la clase es igual. Solo el payload del evento es distinto, así que el único patch es `handler`. En el paso dos cambian tanto `title` como `label`, y hay dos patches: el atributo `title` y el texto. Fíjate en que el `href` y la clase se examinan (la guarda se abrió por `title`) pero no dan ningún patch.

Otra mirada a la misma idea con un árbol de hermanos. Cada párrafo tiene su propia guarda, así que un cambio en un campo toca un párrafo.

::demo two-fields open=ast

En el paso uno solo cambia `body`. Se entra en la `section`, la guarda del `h2` es falsa, la de `body` es verdadera, la de `author` es falsa. Resultado: un patch. En el paso dos cambian `title` y `author` y `body` no, así que hay dos patches y el párrafo del medio se salta.

## La misma guarda dos veces se escribe una

A menudo un hijo lee exactamente los campos que lee su padre. Entonces la guarda propia del hijo es redundante: la guarda del padre ya demuestra que algo que lee ha cambiado. El compilador lo detecta (el conjunto del hijo es igual al del padre) y no repite la comprobación. Sigue escribiendo el comentario del nodo, pero no el `if`.

::demo same-deps open=ast

Aquí el `button` lee `label` a través de su atributo, su evento y su texto. El nodo de texto lee también `label`. Este es el `diff` generado:

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

Hay un solo `if (prev.label !== next.label)`. El texto, marcado con `// line 1: text`, no tiene guarda propia, porque la guarda del botón es la misma comprobación. Los patches llegan en el orden atributos, evento, hijos.

Una guarda no se elimina cuando el conjunto del hijo es más pequeño que el del padre, aunque sea por un solo campo. En el ejemplo siguiente, el `footer` lee solo `count`, pero su padre lee cuatro campos, así que el footer conserva su propia guarda.

::demo nested open=ast

El `div.panel` lee `body`, `count`, `open` y `title`. La alternancia de clase `class:open=open` se evalúa dentro de la guarda del `div`, directamente, sin guarda propia: pertenece al elemento. Cada hijo de debajo tiene una guarda propia. El `if` lee `open` y `body`. En el primer paso solo cambia `count`, y el resultado es un patch de texto. En el segundo solo cambia `body`, y el patch va al texto de dentro de la rama abierta.

El código generado muestra cómo están organizados los atributos propios del elemento y sus hijos:

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

Un detalle sutil: cuando solo cambia `count`, la guarda del `div` es verdadera, así que la clase se calcula para los dos lados. Sale igual, y no se hace ningún patch. Los atributos de un elemento se vuelven a comprobar siempre que cambia algo por debajo de él. Eso cuesta dos pequeños cálculos de cadenas, a cambio de una regla simple: la guarda de un nodo cubre el nodo y todo lo que tiene dentro.

## Las variables de bucle se eliminan

Dentro de un `for`, los nombres del elemento y del índice no vienen del state. Existen solo dentro del bucle. Por eso el análisis las **elimina** del conjunto del bucle. Lo que queda es lo que el bucle necesita del exterior.

::demo loop open=ast

Lee la columna `reads:` de abajo hacia arriba. El texto lee `item` y `prefix`. El `li` lee lo mismo, ya que su alternancia de clase lee `item.hot`. El `for` lee `items` (la lista) y `prefix`, pero no `item`: la variable de bucle se elimina. El `ul` de arriba es igual que el `for`.

Ahora el código generado. El bucle se compara con la ayuda del helper `diffKeyedList`, que decide qué insertar, quitar y mover según las keys. Para los elementos que existen en ambos lados, llama a la función `common(prevIndex, nextIndex)`. En ella, la variable de bucle ya no es un nombre del state, sino una variable local que tiene un valor para `prev` y uno para `next`, y la guarda del `li` los compara:

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

La expresión de key (`key item.id`) también pertenece al bucle. Puede usar la variable de bucle; lo que lea del exterior se queda en el conjunto.

En la demo, el paso uno reemplaza un solo elemento de la lista: el elemento con `id` 1 recibe `hot: true`. Solo se hace patch del `li` de ese elemento, con el id `2#1` (nodo 2, key 1). La demo construye también un objeto nuevo para el segundo elemento, así que su guarda también se abre, pero su clase y su texto salen iguales y no da ningún patch. El paso dos cambia `prefix`, que leen todos los elementos, así que se recalcula el texto de cada elemento, y aquí se hace patch del único elemento.

La variable de índice funciona del mismo modo.

::demo loop-index open=ast

El texto lee `n` y `row`, y el bucle lee solo `rows`. El índice participa en la guarda del `li` (`prevIndex !== nextIndex`). Importa en un bucle con key: un elemento conserva su key cuando se mueve, pero recibe un índice nuevo. En el paso, la lista `a, b` pasa a ser `b, a`. El primer patch mueve el elemento `a` al final. Los otros dos patches cambian los números: `b` es ahora `0. b` y `a` es ahora `1. a`.

> [!WARNING] Una variable de bucle oculta un campo del state con el mismo nombre
> Dentro del bucle, el nombre `name` significa la variable de bucle y no el campo `name` del state. El análisis la elimina del conjunto del bucle, como debe, así que no es posible leer el `name` externo dentro del bucle. Elige nombres de bucle que no choquen con tu state: `user in users`, no `name in names` cuando `name` también es un campo.

::demo shadow open=ast

El primer párrafo lee el campo `name` del state. El bucle lee solo `names`, y el span de dentro lee la variable de bucle `name`, que es local. Los dos `name` son cosas distintas que tienen la misma ortografía.

## Condicionales

Un `if` lee los tests de todas sus ramas y todo lo que contienen las ramas. Un cambio en los tests puede cambiar la rama; un cambio dentro de la rama cambia solo su contenido. El generador de código escribe los dos casos y los separa.

::demo branches open=ast

El `if` lee `user` y `guest`. Mira el `diff` generado:

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

El compilador convierte la cadena de tests en un número, el **índice de rama**, para ambos states (`-1` significa "ninguna rama" cuando no hay `else`). Si el número cambió, reemplaza el contenido entre los dos marcadores. Si no, mira solo dentro de esa rama, y solo las ramas que tienen algo que mirar reciben código (aquí, solo la rama 0). En la demo, el paso uno es la misma rama (el nombre cambió de Ann a Bob) y da un patch `text`. El paso dos cambia la rama, y da un `clear` y un `insert`.

Un `if` donde nada en las ramas es dinámico sigue leyendo sus tests. Una rama que no lee nada no aporta nada al conjunto del `if`.

## Views hijas

Un embed lee sus props. Las props son expresiones, y el análisis las recoge igual que en cualquier otro sitio. Un spread (`...extra`) lee la expresión que hay después de los puntos.

::demo embed open=ast

La línea `+Badge#state` lee `status`, así que el padre solo llama a `Badge.diff` cuando cambia `status` (la guarda es `if (prev.status !== next.status)`). El `p` de debajo es estático: no lee nada, y al hijo no se le pregunta por él. También vale lo contrario: el padre no sabe nada de lo que lee el hijo. El `diff` del propio hijo lo decide a partir de su propio análisis, sobre las props que recibe.

## Un outlet lee todo

Un `+outlet` muestra el hijo que selecciona la ruta del componente. Lo que muestra depende de la ruta y de una porción del state que el template no puede nombrar. Por eso el análisis no puede darle una lista de campos. En su lugar le da un marcador especial, la cadena vacía `""`, que significa "siempre".

```pavlus layout.pavlus
div.layout
  h1 {title}
  nav Menu
  +outlet
```

La vista del AST de este template imprime el marcador como `* (an outlet reads everything)`:

```text
el  div.layout                                  #0   reads: * (an outlet reads everything)
  el  h1 {title}                                  #1   reads: title
    text  {title}                                   #2   reads: title
  el  nav Menu                                    #3   reads: — (reads nothing)
    text  Menu                                      #4   reads: — (reads nothing)
  outlet  +outlet                                 #5   reads: * (an outlet reads everything)
```

El marcador sube a todos los padres, ya que un padre incluye los conjuntos de sus hijos. Para un nodo así, la guarda no puede ser una lista de comparaciones, así que el código generado es `if (true) {` y el comentario dice `(reads: the route and the routed child)`. Los hermanos conservan sus guardas propias: el `h1` sigue leyendo solo `title`, y el `nav` sigue siendo estático. Solo el propio outlet y sus ancestros tienen la guarda siempre activa. Esta es otra razón para poner el outlet cerca de la raíz de un layout, y no dentro de una estructura profunda y muy activa.

## Una página más grande

Todo lo de esta página funciona junto en un layout realista: una cabecera con una navegación con key, un mensaje flash condicional, un artículo y un pie. Abre el AST y lee primero la columna `reads:`. Después observa qué parchean los dos pasos.

::demo big open=ast

Algunas cosas que notar en la columna.

- El `main` raíz lee todo lo que necesita la página: `article`, `flash`, `links`, `page` y `site`. Es la unión.
- El `nav` lee `links` y `page`. El `for` de dentro lee los mismos dos, y su variable de bucle `link` ya no está en el conjunto, mientras que `a` y su texto leen `link` (y `page`, por la alternancia de clase).
- El párrafo `p.static` no lee nada. No tiene id, y `diff` no lo menciona.
- El `if flash` lee solo `flash`. El `footer` lee `site`, igual que el `h1`, aunque solo se usa la parte `year`: la unidad es el campo.

El paso uno cambia `page` de `/` a `/about`. Solo se tocan los dos enlaces, y solo su clase: `/` pierde `current` (`rmAttr`) y `/about` la recibe (`attr`). El título de la cabecera, el artículo y el pie no se comparan, porque sus guardas leen otros campos. El paso dos cambia solo `article`: un patch `text`, para el encabezado. Este es el efecto del análisis que puedes ver.

## Límites que conviene conocer

- El análisis sigue nombres, no valores. Una función en el state que lee otra parte del state (un getter, un closure) oculta esa lectura al compilador. Mantén los valores derivados en el state, o pasa las entradas como argumentos: `{total(items)}` lee `total` e `items` y funciona.
- La unidad es el campo de nivel superior y se compara por referencia. Actualiza reemplazando: `{ ...state, user: { ...state.user, name } }`.
- Un nodo cuyo conjunto es grande (la raíz, un layout, un outlet) se examina con frecuencia. Eso no es lento, ya que las comprobaciones de dentro vuelven a ser guardas. Pero es una razón para mantener pequeñas las partes dinámicas y cerca de las hojas.

## Lo que aprendiste

- Cada nodo tiene un conjunto de dependencias: los campos de nivel superior del state que lee, sin las variables de bucle de sus propios bucles.
- Un nodo que no lee nada es estático: sin id en `render`, sin código en `diff`.
- Un nodo que lee algo recibe una guarda que compara esos campos con `!==`. Dentro de la guarda, cada atributo, payload y texto se compara por su propio resultado, así que solo los cambios reales producen patches.
- Una guarda que repite la guarda de su padre no se escribe dos veces. Un outlet lee todo y hace que las guardas que tiene encima sean siempre verdaderas.

Siguiente: [Generación de código: render](page:compiler-render).
