---
summary: Muestra un bloque solo cuando se cumple una condición con if / else if / else, y repite un bloque para cada elemento de una lista con for. Aprende por qué importan las keys, cómo reacciona el diff y cómo construir una lista filtrada.
---
## Elegir lo que hay en la página

Hasta ahora cada línea de un template estaba siempre presente. Las páginas reales necesitan dos capacidades más: mostrar un bloque *solo cuando* algo es verdadero, y mostrar un bloque *una vez por cada elemento* de una lista. pavlus tiene una palabra clave para cada una: `if` y `for`. No son elementos. No producen ningún tag propio. Solo deciden cuáles de sus hijos existen.

Ambos toman como cuerpo las líneas indentadas debajo de ellos, de la misma manera que un elemento.

## if

La condición más simple es `if` seguido de una [expression](page:syntax-expressions). Cuando el valor es truthy, el cuerpo se renderiza; cuando no lo es, el cuerpo no está en absoluto.

::demo if-simple

Mira los dos pasos. Cuando `loggedIn` pasa de `true` a `false`, `diff` devuelve un patch, `clear`, que quita todo lo que hay entre dos marcadores llamados `0s` y `0e`. Cuando vuelve a `true`, `diff` devuelve un patch `insert` con un `p` recién renderizado.

Los marcadores son nodos de comentario invisibles que el compilador añade alrededor de cada `if` y cada `for`. Permiten que un patch diga "reemplaza lo que hay entre estos dos puntos" sin saber qué hay allí. Nunca aparecen en el HTML de la demo, pero están en los vnodes, y los verás en los patches de esta página.

Se acepta dos puntos al final y no significan nada: `if loggedIn:` es lo mismo que `if loggedIn`.

> [!NOTE] Truthiness
> La condición sigue las reglas de JavaScript: `0`, `""`, `null`, `undefined`, `false` y `NaN` son falsy. Un array vacío es truthy, así que para comprobar "tiene elementos" escribe `if items.length`.

## else y else if

Una línea `else if` o `else` continúa el `if` que tiene encima. Deben estar a la misma indentación que el `if`, justo después de su cuerpo.

::demo if-else

El primer paso reemplaza todo el saludo por el mensaje de inicio de sesión: la rama cambió, así que el contenido entre los marcadores se reemplaza. El segundo paso mantiene la misma rama, y solo se actualiza el texto de dentro. El compilador distingue estas dos situaciones, y nunca vuelve a renderizar una rama que sigue igual.

Las ramas se prueban en orden, y gana la primera condición truthy. La rama `else` no tiene condición y debe ser la última.

::demo else-if open=module

Abre el módulo y busca `prevBranch` y `nextBranch`. Para cada uno de los dos states, el código generado calcula *el número de la rama* que se muestra (aquí de 0 a 3, o -1 si no hay `else` y nada coincide):

```ts
const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "error") ? 1 : ((prev.items)?.length === 0) ? 2 : 3;
const nextBranch = (next.status === "loading") ? 0 : (next.status === "error") ? 1 : ((next.items)?.length === 0) ? 2 : 3;
```

Si los dos números difieren, la rama se reemplaza: un `clear` entre los marcadores, y luego un `insert` de la nueva rama renderizada desde cero. Si son iguales, solo se parchean los cambios dentro de esa rama. El paso "items 2 → 5" hace exactamente eso: un patch `text`, nada más.

Un error que el parser te informa es un `else` sin nada que continuar:

```pavlus-invalid
p First
else
  p Second
```

```text
`else` without matching `if` (line 2, col 1)
```

El mismo error aparece cuando un segundo `else` sigue a un `else`, o cuando un `else if` sigue a un `else`. Una línea entre el `if` y su `else` también rompe la cadena.

Un `if` dentro de un elemento es simplemente un hijo de él, y los otros hijos del elemento se quedan donde están:

::demo if-inside

Cuando `subtitle` se convierte en una cadena no vacía, hay un único patch `insert` en el lugar del `if`, entre el encabezado y el pie. Los marcadores son la razón por la que cae en la posición correcta.

## for

`for` repite su cuerpo para cada elemento de una lista. La cabecera tiene la forma `for item in list`: un nombre para el elemento actual, la palabra `in` y una expression que da la lista.

::demo for-simple

Dentro del cuerpo, `name` es el elemento actual. Es una *variable de bucle*: existe solo dentro del bucle, y oculta un campo del state con el mismo nombre, si lo hay. El cuerpo puede tener cualquier número de líneas y cualquier estructura.

Si también necesitas la posición, nómbrala después de una coma:

::demo for-index

`i` cuenta desde 0. Aquí `{i + 1}` hace un número legible para personas. El índice es un valor de expression normal como cualquier otro.

### Listas vacías o ausentes

Una lista vacía no renderiza nada. Una lista que es `null` o `undefined` es lo mismo que una vacía, así que un state que todavía se está cargando no rompe la página.

::demo for-missing

El primer paso de la siguiente demo añade un nombre a una lista vacía. El `ul` se queda y el nuevo `li` se inserta entre los marcadores del bucle:

::demo for-empty

Si quieres mostrar un mensaje en lugar de una lista vacía, pon el bucle en una rama de un `if`:

::demo for-if-else

Cuando una lista no es un array, el resultado depende de su forma: una cadena se lee letra por letra, y un objeto sin `length` no renderiza nada. Mantén las listas reales en el state.

> [!WARNING] Palabras que parecen palabras clave
> Solo `for x in list` es un bucle. Una línea como `for x of list` no coincide, y el parser lee `for` como el nombre del tag de un elemento: obtienes `<for>` en la página y ningún error. Lo mismo ocurre con un `if` solo, sin nada detrás. Si un bucle no aparece, revisa la palabra `in`.

## Por qué importan las keys

Una lista cambia con el tiempo: se añaden, se quitan y se reordenan elementos. Cuando `diff` compara la lista antigua con la nueva, tiene que decidir qué elemento antiguo corresponde a cuál nuevo. Esa decisión se toma con una **key**.

La key se añade a la cabecera, después de la lista: `for task in tasks key task.id`. Es una expression evaluada para cada elemento, y debe ser única en la lista y seguir siendo la misma para la misma cosa. Un id de tus datos es perfecto.

::demo keyed-reorder

Lee cada paso.

1. El último elemento pasa al principio. `diff` devuelve dos patches `move`: mueve nodos existentes del DOM. No crea, borra ni reescribe ningún texto, así que se conserva todo lo que vive en esos nodos (un input con foco, una selección de texto, una animación en curso). El algoritmo es simple, no mínimo: para llevar el último elemento al principio mueve los otros dos detrás de él, y el resultado es el mismo orden.
2. Se quita el primer elemento: un patch `remove` solo para ese elemento.
3. Un elemento nuevo al final: un patch `insert`.
4. Cambia el título del elemento 2: un patch `text`. El id del nodo de texto es `3#2`: el id del template, un `#` y la key.

Ahora la misma lista **sin** key:

::demo unkeyed-reorder

Sin `key`, la key de cada elemento es su **posición**. El elemento 0 sigue siendo el elemento 0 sea cual sea su contenido. Así que cuando el último elemento pasa al principio, `diff` ve tres elementos cuyo texto cambió, y reescribe tres textos (`3#0`, `3#1`, `3#2`). Cuando se quita el primer elemento, quita el *último* nodo y reescribe el resto, porque los elementos se han identificado por posición.

Para una lista de texto simple esto da un resultado correcto, solo que con más trabajo. Para una lista con state en el DOM, como inputs o un vídeo en reproducción, da un resultado equivocado: el texto escrito se queda en el primer input, pero los datos del primer elemento ahora pertenecen al segundo.

> [!TIP] Regla práctica
> Si los elementos pueden añadirse, quitarse o reordenarse, o si guardan algún state, da al bucle una key de tus datos. Usa el índice solo para una lista que nunca cambia.

Las keys se comparan como texto (`String(key)`), así que `1` y `"1"` son la misma key. Deben ser únicas: si dos elementos dan la misma key, `diff` lanza `pavlus: duplicate key 1`. El primer `render` de una lista así no lo comprueba, pero el primer `diff` sí, así que el error aparece cuando la lista cambia.

La key puede ser cualquier expression, por ejemplo la unión de dos campos:

::demo key-expression

## Bucles dentro de bucles

Los bucles se anidan. Cada uno tiene su propia variable, y el cuerpo interior ve las variables de ambos.

::demo nested

El bucle exterior tiene como key el nombre del grupo, el interior el propio elemento. `group.name` se usa dentro del cuerpo interior. En el paso, aparece un elemento nuevo en un grupo y `diff` produce un patch `insert` para él. Los ids de los marcadores, como `4e#Veg`, llevan la key del elemento exterior, así que los dos grupos nunca se mezclan.

## Activar clases dentro de un bucle

El atributo `class:name=condition` de [elementos](page:syntax-elements) funciona igual dentro de un bucle, con la variable del bucle.

::demo class-toggle

Un valor de atributo sin comillas termina en el primer espacio. `task.id === currentId` tiene espacios, así que debe ir entre llaves: `class:current={task.id === currentId}`. Sin ellas el parser se detiene en el primer espacio e informa `Unexpected "=" in attributes`.

Mira los dos pasos. Cuando `currentId` pasa de 2 a 3, se quita la clase de un elemento y se añade la de otro. En el segundo paso el valor de `class` del elemento 2 pasa a ser `done current`: todos los toggles de un elemento se reúnen en un solo atributo `class`, y un patch escribe el valor completo.

## Filtrar con if dentro de for

No hay `filter` en el lenguaje de templates (necesitaría una función flecha). Pero un `if` puede ser el único hijo de un `for`: entonces cada elemento se muestra solo cuando se cumple su condición. Es una buena forma de filtrar una lista corta.

::demo filtered open=ast

Lee el template desde arriba. El input de búsqueda envía `setQuery` en cada tecla. El `for` tiene como key `task.id`. Dentro, el `if` oculta las tareas que no coinciden con la consulta (`!query` hace que una consulta vacía coincida con todo). Después de la lista, un segundo `if` muestra el recuento, o un mensaje cuando nada coincide.

En el primer paso el usuario escribe `es`. `diff` devuelve:

- un patch `attr` para el valor del input;
- dos patches `clear` que vacían el `if` de los elementos 1 y 3, que ya no coinciden: los elementos se quedan en la lista, pero su contenido ha desaparecido;
- un patch `text` para el contador.

En el segundo paso, nada coincide. Se limpia el último elemento que quedaba, y la rama del contador cambia del `else` al mensaje "No task matches".

El contador, `shown`, es un campo normal del state, calculado por el handler de `setQuery` en tu componente. Un template no puede contar los elementos que coinciden, porque solo puede evaluar expressions y no tiene bucles que devuelvan valores. Esta es la división habitual: el handler calcula, el template muestra.

Cuando la lista es larga, filtra en el handler y pasa al template solo lo que es visible. Entonces el bucle tiene solo los elementos que se muestran, y un filtro cambiado es un conjunto de patches `insert` y `remove`:

::demo filtered-visible

Ambos enfoques dan páginas correctas. El primero mantiene todo el trabajo en el template, el segundo mantiene pequeño el DOM.

## Todo junto

Esta bandeja de entrada tiene un estado de carga, un estado de error, una lista, una condición por elemento y un mensaje de vacío. Usa todo lo de esta página.

::demo inbox

Recorre los pasos:

1. **De carga a lista.** La rama cambia de la primera a la tercera, así que se limpia el `p` y se inserta el `ul`. Se renderiza una vez, con ambos correos.
2. **Se lee el correo 2.** Solo dos patches: se quita la clase `unread` del elemento (`rmAttr`), y se limpia el botón `Mark as read`, que está en un `if`. Nada más se toca.
3. **Llega un correo nuevo arriba.** Un patch `insert`, colocado antes del elemento con key 1.
4. **Se borran todos los correos.** Dos patches `remove` y se inserta el mensaje "Nothing here".
5. **Un error.** La tercera rama se reemplaza por la segunda: se limpia la lista y se inserta el mensaje con su botón de reintento.

El template dice cómo se ve la página para cada state. El compilador calcula el conjunto más pequeño de cambios entre dos states cualesquiera, y estos son los patches que viste.

## Lo que aprendiste

- `if`, `else if` y `else` muestran una rama. Una rama distinta significa `clear` e `insert`; la misma rama significa solo los cambios dentro de ella.
- `for item, i in list key expr` repite un cuerpo. Una lista vacía o ausente no renderiza nada.
- Una key identifica un elemento entre dos states. Con key, `diff` mueve, inserta y quita elementos enteros; sin ella, la posición es la key y se reescribe el contenido.
- `if` dentro de `for` filtra, un contador o una lista derivada pertenece al state, y un valor con espacios en un atributo necesita llaves.

Siguiente: [componentes, imports y outlets](page:syntax-components).
