---
summary: Cómo escribe el compilador `diff(prev, next)`, la función que convierte dos states en una lista corta de patches del DOM. Aprenderás las guardas, las ocho operaciones de patch y el código exacto que se genera para texto, atributos, clases y handlers de eventos.
---
## Para qué sirve diff

Un template de pavlus se compila en dos funciones puras. `render(state)` devuelve todo el template para un state, como objetos simples llamados **vnodes**. `diff(prev, next)` recibe dos states, el viejo y el nuevo, y devuelve una lista de **patches**: objetos simples y pequeños como "cambia el texto del nodo 4 a `Bob`". El plugin del DOM es el único código que los aplica.

La idea es simple: cuando el state cambia, nadie reconstruye la página. El compilador ya sabe qué parte del state lee cada parte del template, así que `diff` solo mira las partes que pueden haber cambiado.

El caso más simple posible es un template que no lee nada.

::demo static open=module

Mira el `diff` generado. Tiene dos líneas: `if (prev === next) return patches;` y `return patches;`. El compilador vio que el template no lee ningún state, así que no hay nada que comparar. Sean cuales sean los dos states, la respuesta es la lista vacía.

## La forma de todo diff

Ahora un template que lee dos campos del state.

::demo text open=module

El primer paso cambia `count`, y `diff` devuelve un patch. El segundo paso cambia los dos campos, y sigue siendo un patch: el texto del párrafo es un nodo, así que un patch lo reemplaza. El tercer paso no cambia nada, y la lista está vacía. Esta es la función generada:

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

Léela línea por línea, porque todo diff tiene la misma forma:

1. `const patches = [];` es la respuesta que se devolverá.
2. `if (prev === next) return patches;` es la salida más barata. A menudo el objeto del state no cambió en absoluto, y la llamada termina aquí.
3. El comentario `// line 1: <p> (reads: name, count)` dice de qué línea del template viene el bloque y de qué partes del state depende.
4. La **guarda** `if (prev.name !== next.name || prev.count !== next.count)` es la comprobación de dependencias. Si no ha cambiado ninguno de los campos que lee el párrafo, se salta todo el bloque.
5. Dentro de la guarda, el texto se calcula dos veces, una desde `prev` y otra desde `next`, con la misma expresión. Solo si las dos cadenas difieren existe un patch.

Dos cosas de ese código merecen un momento. Primero, la guarda compara con `!==`, que es una comparación de referencias y casi no cuesta nada. La comparación de texto de dentro es una comparación de cadenas y ocurre solo cuando la guarda pasa. Segundo, el texto se compara después de construirlo. Si `count` cambia de `2` a `"2"`, la guarda pasa, pero los dos textos son `You have 2 items.`, así que no se produce ningún patch.

## Por qué diff compara states y no árboles

Muchos frameworks construyen un árbol nuevo de nodos en cada actualización y luego comparan el árbol nuevo con el viejo. pavlus no. `diff` recibe los dos **states** y nunca construye un árbol en el camino de la actualización.

- El compilador sabe, en el momento del build, qué nodo lee qué campo. Una comparación de árboles tiene que descubrirlo de nuevo en tiempo de ejecución, nodo por nodo.
- Un campo que ningún template lee es gratis. En la demo siguiente el state tiene un campo `theme`, pero el template solo lee `name`.

::demo other-field open=module

La guarda es `prev.name !== next.name`. Un cambio de `theme` nunca entra en el bloque, así que la respuesta es `[]` sin comparar una sola cadena.

- `render` no se llama en una actualización. Solo cuando aparece una pieza nueva (una rama de un `if`, un elemento nuevo de un `for`) se hace render de esa pieza, y solo de esa pieza.
- El resultado son datos simples. Puedes llamar a `diff` en un test, imprimir los patches o enviarlos por una conexión. Nada necesita un navegador.

## De dónde vienen las guardas

El compilador calcula, para cada nodo, el conjunto de **nombres libres** que lee: los campos raíz del state y las variables de los bucles que lo contienen. Este es el *conjunto de dependencias*. Puedes verlo en la sección del AST de cada demo (*reads: name*) y en el comentario `(reads: ...)` del código generado.

Una dependencia es siempre la **raíz** de una expresión. `{user.name}` depende de `user`, no de `user.name`, y `{items[page]}` depende de `items` y `page`.

::demo member open=module

En el paso, `user` es un objeto nuevo con el mismo `name`. La guarda `prev.user !== next.user` pasa, el texto se construye de nuevo, las cadenas son iguales y el resultado es `[]`. La guarda es barata y gruesa; la comparación de cadenas de dentro es exacta.

> [!WARNING] El state debe ser inmutable
> `diff` confía en `!==`. Si cambias `state.user.name` en el sitio, `prev.user` y `next.user` son el mismo objeto, la guarda falla y no se produce ningún patch. Dale siempre una identidad nueva a un valor que cambió: construye un objeto nuevo o un array nuevo. El plugin store lo hace por ti.

## Las operaciones de patch

Un patch es un objeto con un campo `op`. Hay ocho tipos. Los cuatro primeros cambian un nodo existente, los cuatro últimos cambian la estructura.

| Operación | Campos | Significado |
| --- | --- | --- |
| `text` | `id`, `text` | Establece el contenido de texto del nodo `id`. |
| `attr` | `id`, `name`, `value` | Establece el atributo `name` del elemento `id`. |
| `rmAttr` | `id`, `name` | Elimina el atributo `name` del elemento `id`. |
| `handler` | `id`, `event`, `msg` | Reemplaza el message que envía el evento `event` del elemento `id`. |
| `insert` | `before`, `nodes` | Crea los vnodes `nodes` y los inserta antes del nodo existente `before`. |
| `clear` | `from`, `to` | Elimina todo lo que hay estrictamente entre los markers `from` y `to`. |
| `remove` | `from`, `to` | Elimina el rango de hermanos de `from` a `to`, ambos incluidos. |
| `move` | `from`, `to`, `before` | Mueve el rango de hermanos de `from` a `to` para que quede antes del nodo `before`. |

Esta página trata de los cuatro primeros. Los otros cuatro son el tema de [la página siguiente](page:compiler-control-flow), porque pertenecen a `if`, `for` y los embeds.

Cada `id` es una cadena. Solo se puede hacer patch de un nodo si tiene un id, así que el compilador le da un id a un nodo **solo cuando un patch puede apuntar a él**: un nodo de texto que tiene `{expressions}`, un elemento que tiene un atributo dinámico, una alternancia de clase o un evento con argumentos. Un nodo estático no tiene ningún id. El plugin del DOM mantiene un mapa de id a nodo del DOM, que se llena mientras construye los nodos, y aplica un patch buscando el id. Si un id es desconocido, lanza `pavlus/dom: unknown node id`.

Un id es el número del nodo en el template (el parser cuenta los nodos en orden de lectura) seguido del **sufijo** de la instancia. Un template de nivel superior tiene el sufijo `""`, así que sus ids se ven como `"1"`. El sufijo es más largo dentro de un elemento de `for` o de un hijo embebido, y así es como el mismo template puede aparecer muchas veces en una página sin que dos nodos compartan un id.

## Patches de texto

Ya has visto el patch `text`. Cuando un template tiene varios nodos de texto, cada uno tiene su propio id y su propia guarda, así que un cambio toca solo el nodo que lo lee.

::demo guards open=module

El `div` lee `title` y `author`, así que su guarda es la unión de las de sus hijos. Dentro, `h2` y `p` tienen cada uno una guarda propia. La línea estática `Static line` no lee nada y no tiene ningún código en `diff`. El cuarto paso pasa un `title` que es la cadena `"1"` y luego el número `1`: la guarda pasa, el texto es `"1"` en los dos lados, y no sale ningún patch.

Esta es la parte del código generado que muestra la anidación:

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

La guarda exterior es solo un atajo: cuando no cambió ningún campo, una comprobación sustituye a dos. Un hijo cuyas dependencias son las mismas que las de su padre no recibe una guarda propia, porque la comprobación del padre ya lo cubre. Puedes verlo en la demo siguiente, donde un elemento y su texto leen ambos el campo `text`.

::demo redundant open=module

El atributo `title` y el texto están los dos dentro de una guarda, `if (prev.text !== next.text)`. El comentario `// line 1: text` no tiene un `if` propio.

## Patches de atributos

Un atributo cuyo valor es una expresión, o una cadena con `{holes}`, puede cambiar. Para cada uno de esos atributos el compilador escribe las mismas cuatro líneas: calcular el valor en ambos lados, comparar, y meter `attr` o `rmAttr`.

::demo attributes open=module

Los tres pasos cambian `url`, `name` y ambos. Este es el código de los dos atributos:

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

El helper del runtime `toAttr` convierte un valor del state en un valor de atributo. `null`, `undefined` y `false` pasan a ser `null`, que significa "sin atributo". `true` pasa a ser la cadena vacía, que es como HTML escribe un atributo booleano. Todo lo demás pasa a ser su cadena. Una cadena con huecos, como `"Open {name}"`, siempre es una cadena, así que para ella la rama `null` nunca puede ejecutarse; el compilador escribe el mismo código para todos los atributos porque así el generador sigue siendo simple.

La demo siguiente muestra los tres resultados: el atributo se elimina, se establece con un valor vacío y se establece con un texto.

::demo attribute-removed open=module

- `locked` pasa de `true` a `false`: `toAttr(false)` es `null`, así que el patch es `rmAttr`.
- `locked` pasa de `false` a `true`: el valor es la cadena vacía, así que el patch es `attr` con `value: ""`, y el botón vuelve a estar deshabilitado.
- `hint` pasa de `null` a un texto, y vuelve: `attr`, luego `rmAttr`.
- `hint` pasa de un texto a la cadena vacía `""`. Eso no es `null`, así que el atributo se queda con un valor vacío. Solo `null`, `undefined` y `false` eliminan un atributo.

## Patches de clases

Una clase es un atributo como cualquier otro, con una diferencia: un template puede construirla desde tres fuentes, las clases estáticas (`li.item`), las alternancias (`class:active=cond`) y un atributo `class`. Cuando una de ellas es dinámica, el compilador las une todas con el helper `joinClasses`, y compara el resultado completo.

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

Así que una alternancia no añade ni quita un nombre de clase. Reemplaza todo el atributo `class` con la nueva cadena completa, `item` o `item active done`. Es simple y seguro: el DOM nunca tiene una lista de clases que el template no conozca. El precio es que una clase que añadas a mano con JavaScript se sobrescribe en el siguiente cambio. En pavlus, el template es el dueño del atributo.

`joinClasses` devuelve `null` cuando no queda ninguna clase, por ejemplo cuando un template solo tiene alternancias y todas están apagadas.

::demo class-removed

Cuando `on` pasa a ser `false`, la lista de clases está vacía, el helper devuelve `null` y el patch es `rmAttr` para `class`.

## Patches de handlers de eventos

En pavlus un handler de evento no es una función. `@click=pick(id)` son **datos**: el message `{ id: "pick", payload: id }`. Eso tiene una consecuencia para `diff`: los handlers se pueden comparar por valor, y un handler que no cambió no cuesta nada.

Un handler solo puede cambiar si tiene argumentos. `@click=save` es el mismo message en todos los states, así que el compilador lo trata como estático y nunca lo menciona en `diff`.

::demo static-handler

Con un argumento, el payload es parte del state, y el compilador compara los payloads.

::demo handler open=module

```ts
    const prevClickPayload = prev.id;
    const nextClickPayload = next.id;
    if (!(prevClickPayload === nextClickPayload)) {
      patches.push({ op: "handler", id: "0" + idSuffix, event: "click", msg: { id: messagePrefix + "pick", payload: nextClickPayload } });
    }
```

El patch `handler` lleva el message nuevo completo. El plugin del DOM no añade un listener nuevo: tiene un listener por elemento y evento, y ese listener siempre lee el último message. Así que un patch `handler` solo reemplaza un valor en un mapa, y un click que ocurra después del patch envía el nuevo payload.

Con varios argumentos el payload es un array, así que el compilador usa el helper `sameValues`, que trata dos arrays con los mismos elementos como iguales. Un array nuevo con los mismos elementos no es un cambio. Los modificadores `.prevent` y `.stop` se convierten en `prevent: true` y `stop: true` en el message.

::demo handler-many open=module

El primer paso cambia solo `kind`, y el segundo paso cambia solo `title`. Fíjate en cómo cada cambio corresponde exactamente a un tipo de patch: `kind` está en el payload del handler, `title` está en el texto y `url` está en un atributo. El tercer paso cambia `url` e `id` y produce dos patches, un `attr` y un `handler`.

El prefijo `messagePrefix` está vacío en un template de nivel superior. Para un template embebido como hijo, es el nombre de la instancia más un punto, que es como un message de un hijo encuentra el camino hasta el handler correcto. Los embeds se explican en [la página siguiente](page:compiler-control-flow).

## Cómo aplica los patches el plugin del DOM

Cuando cambia el state de la aplicación, el plugin del DOM llama a `view.diff(oldState, newState)` para cada view montada y aplica la lista en orden. Para las cuatro operaciones de esta página, el trabajo es una búsqueda y una llamada al DOM:

- `text` establece el `textContent` del nodo.
- `attr` llama a `setAttribute`. Para `value`, `checked` y `selected` también establece la propiedad viva, porque en los campos de formulario el atributo solo da el valor inicial.
- `rmAttr` llama a `removeAttribute`.
- `handler` reemplaza el message que envía el listener del elemento.

Los patches se aplican en el orden en que los devolvió `diff`. Ese orden importa para los patches estructurales de la página siguiente, y es estable: el código de `diff` sigue el orden del template.

## Un ejemplo más grande

Esta tarjeta de producto tiene una clase construida con dos alternancias, texto con varios campos, un botón con un atributo dinámico, un título y un handler, y un `if` que muestra una insignia. Abre el módulo generado y busca las guardas: una para la tarjeta, y una para cada hijo.

::demo product open=module

Lee los pasos uno por uno y busca la guarda que dejó pasar a cada uno:

- `stock 3 → 2`: la tarjeta, el botón y `<p.stock>` leen `stock`, así que sus guardas pasan. La clase y el atributo `disabled` se calculan de nuevo, pero sus valores son iguales, así que sale un solo patch `text`.
- `stock 1 → 0`: la clase gana `out`, el botón recibe `disabled` y el texto cambia. Tres patches, en el orden del template.
- `price 20 → 15, onSale false → true`: la clase gana `sale`, cambia el texto del precio y el `if` inserta la insignia. El patch `insert` se explica en la página siguiente.
- `another product`: cambian a la vez el nombre, el precio, el `title` del botón y su handler. Los ids `2`, `4` y `8` son números de nodo en orden de lectura.
- `currency only`: la guarda de la tarjeta pasa, la guarda de `<p.price>` pasa, y todo lo demás se salta por su propia guarda.

Toda la función es una lista de bloques independientes. El coste de una llamada es el número de guardas que pasan multiplicado por el tamaño de lo que hay dentro, y no el tamaño del template.

> [!TIP] Lee el código generado
> Cuando falta un patch que esperabas, abre el módulo generado (la sección plegada de cada demo, o el archivo en las DevTools de tu navegador) y busca el bloque de esa línea del template. El comentario muestra lo que lee el bloque, y la guarda muestra qué campos compara. La mayoría de las sorpresas son un campo que no forma parte del conjunto de dependencias, o un valor que se cambió en el sitio.

## Lo que aprendiste

- `diff(prev, next)` compara dos states con guardas generadas (`!==` sobre los campos raíz que lee un nodo) y devuelve patches simples; nunca construye ni compara árboles.
- Un nodo solo puede cambiar si lee state, así que los nodos estáticos no cuestan nada y no reciben id. Los hijos con las mismas dependencias que su padre comparten la guarda del padre.
- `text`, `attr`, `rmAttr` y `handler` cambian un nodo por id. Una alternancia de clase reemplaza todo el atributo `class`, y `null`, `undefined` y `false` eliminan un atributo.
- Los handlers son datos, así que un handler con argumentos se compara por valor, y `@click=save` sin argumentos nunca recibe un patch.
- El state debe ser inmutable: un cambio que mantiene el mismo objeto es invisible para las guardas.

Siguiente: [Compilar if, for y embeds](page:compiler-control-flow).
