---
summary: Cómo se compilan `if`, `for` y las views hijas embebidas. Aprenderás qué son los markers, cómo un índice de rama decide entre "diff dentro" y "clear e insert", cómo las listas con key se convierten en patches insert, remove y move, y cómo los embeds y `+outlet` pasan props a las views hijas.
---
## Los cambios de estructura necesitan otro tipo de patch

La página anterior mostró patches que cambian un nodo existente: `text`, `attr`, `rmAttr` y `handler`. Bastan mientras la forma de la página siga igual. Pero un `if` puede mostrar un párrafo u ocultarlo, un `for` puede crecer o encogerse, y una view hija embebida puede ser reemplazada por otra. Para esos cambios la página necesita cuatro operaciones más: `insert`, `clear`, `remove` y `move`. Todas trabajan sobre **rangos de hermanos**, y los rangos se marcan en el DOM con **markers**.

Un marker es un nodo de comentario vacío. El compilador pone uno antes y uno después de cada `if`, de cada `for` y de cada embed dinámico, y uno antes y uno después de cada elemento de un `for`. Los markers tienen ids, así que un patch puede decir "todo lo que hay entre el marker `0s` y el marker `0e`". Un nodo de comentario no tiene salida visible, y no necesita un elemento envoltorio, así que el HTML que escribes sigue siendo el que escribiste.

## if y else

Este es el `if` más pequeño.

::demo if-else open=module

El primer paso invierte `loggedIn`, y la respuesta son dos patches: `clear` e `insert`. El segundo paso mantiene el valor, y la respuesta es la lista vacía. El patch `insert` lleva los vnodes nuevos, que la demo muestra solo como un número (`1 vnodes`). Este es el `diff` generado, abreviado a la parte que importa:

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

La idea clave es el **índice de rama**. El compilador convierte la cadena `if / else if / else` en un solo número: `0` para la primera rama, `1` para la segunda, y así sucesivamente. Calcula ese número para `prev` y para `next`, con las mismas condiciones en ambos lados.

- Si los dos números son iguales, se muestra la misma rama en ambos lados. Entonces el compilador hace diff **dentro** de la rama, exactamente como con cualquier otro nodo.
- Si los números difieren, la rama vieja se elimina con un `clear` entre los dos markers, y la rama nueva se renderiza desde `next` y se inserta antes del marker final. No se intenta convertir una rama en la otra.

La segunda regla es una decisión de diseño. Dos ramas son dos templates distintos, así que compararlos nodo por nodo sería más lento que reemplazarlos y no daría un mejor resultado. La primera regla es lo que hace barato un `if` cuando no cambia de rama.

## Un if sin else

Cuando no hay `else`, el caso "no se muestra nada" tiene su propio número, `-1`. Por eso el código tiene dos comprobaciones: `prevBranch !== -1` para el `clear`, y `nextBranch !== -1` para el `insert`.

::demo if-alone open=module

Lee los cuatro pasos como una tabla de lo que le puede pasar a un solo `if`:

- De oculto a visible: un `insert`, y ningún `clear`, porque no hay nada que eliminar.
- De visible a visible, con un valor nuevo: ningún cambio de estructura. El índice de rama es `0` en ambos lados, así que el compilador hace diff dentro de la rama y sale un único patch `text`.
- De visible a oculto: un `clear`, y ningún `insert`.
- De oculto a oculto: nada. La guarda pasa solo si `error` cambió, y aquí no cambió.

Una condición no se compara como un valor. Que `error` pase de `"Oops"` a `"Again"` cambia el campo, pero el índice de rama sigue siendo `0`, y eso es lo que decide.

## Cadenas y qué pasa dentro de una rama

La mayoría de los templates reales tienen una cadena. Esta es la clásica pantalla de cargando, fallido y listo.

::demo if-chain

Para tres ramas el índice se calcula con una cadena de condiciones, escrita como expresiones condicionales anidadas:

```ts
      const prevBranch = (prev.status === "loading") ? 0 : (prev.status === "failed") ? 1 : 2;
      const nextBranch = (next.status === "loading") ? 0 : (next.status === "failed") ? 1 : 2;
```

El último número es la rama `else`. Sin un `else` sería `-1`. Ahora mira los cinco pasos:

- `ok → loading` y `loading → failed`: la rama cambia, así que obtienes `clear` e `insert`. El `insert` del segundo paso lleva dos vnodes, el párrafo y el botón.
- `failed, error changes`: la rama es la misma, y solo se hace patch del texto que lee `error`.
- `loading, error changes`: la guarda del `if` pasa, porque lee `error` (la segunda rama lo usa), pero la rama sigue siendo `0`, y la rama `0` es estática. La respuesta es `[]`.
- `ok, items change`: el `for` interior añade un elemento; verás cómo en un momento.

El código para el caso "dentro" tiene un bloque por rama, y cada bloque se ejecuta solo cuando su rama es la que se muestra:

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

Una rama que no tiene nada dinámico no recibe ningún bloque. Por eso un `if` con ramas estáticas, como la primera demo de esta página, no tiene ninguna parte `else` en su `diff`.

## Markers en el render

Los markers los produce `render`, para que el plugin del DOM pueda encontrar los rangos. Dos `if` seguidos muestran cómo se numeran.

::demo if-markers open=vnodes

Abre los vnodes. Cada `if` está rodeado por dos vnodes marker, `{ "t": "marker", "id": "1s" }` y `{ "t": "marker", "id": "1e" }`. El número es el número del nodo `if` en el template, y `s` y `e` significan inicio (start) y final (end). El primer paso inserta antes de `4e`, el marker final del segundo `if`. El segundo paso hace clear desde `1s` hasta `1e`, y solo se toca el primer `if`.

> [!NOTE] Los markers son invisibles
> El HTML que ves en una demo no tiene markers, porque `toHtml` los descarta si no se le pide lo contrario. En el navegador son nodos de comentario vacíos, `<!---->`. Si inspeccionas la página, los verás entre tus elementos.

## Bucles: un rango por elemento

Un `for` es una lista de rangos. Cada elemento tiene su propio marker de inicio y de final, y todo el bucle tiene también un marker de inicio y de final. Los ids de los markers contienen la **key** del elemento, así que un patch puede nombrar exactamente un elemento.

```pavlus
ul.todos
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}
```

La parte de `render` que lo hace es corta:

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

La key se convierte en una cadena. El **sufijo** del elemento es el sufijo del template exterior, más `#` y la key. Cada nodo dentro del elemento recibe su id de este sufijo, así que el segundo `li` de una lista tiene el id `2#2` (nodo 2, key 2) y no el id del primero. Así es también como un bucle dentro de un bucle se mantiene sin ambigüedad: el sufijo interior extiende al exterior.

El marker final de un elemento tiene un id como `1]#2`. Los `[` y `]` en los ids están solo para distinguir los markers de un elemento de `s` y `e`, los markers de toda la lista.

## Listas sin key

Si no escribes ninguna `key`, la key de un elemento es su índice. Es la forma más simple, y es una buena elección cuando una lista solo crece y se encoge por el final.

::demo for-unkeyed

- Añadir un elemento inserta un rango antes del marker final de la lista.
- Quitar el último elemento elimina su rango.
- Quitar el **primer** elemento no elimina el primer rango. Las keys son `0, 1, 2` y luego `0, 1`, así que se va el rango con la key `2`, y los textos de las keys `0` y `1` reciben patches con los nuevos valores. El resultado se ve igual, pero el trabajo es distinto: dos patches `text` y un `remove`.
- Invertir tres elementos hace patch de dos textos. El del medio se quedó igual, así que no cuesta nada.

> [!WARNING] Sin una key, el DOM sigue la posición
> Con un índice como key, los nodos del DOM se quedan en su posición y reciben contenido nuevo. Eso está bien para texto. Pero si un elemento tiene algo que solo conoce el DOM (el foco, el cursor, el texto escrito en un input que el state no guarda), eso se queda en la posición, no con el elemento. Dale una key al bucle siempre que se puedan quitar elementos del medio o reordenarlos.

## Listas con key

Con `key todo.id`, un elemento es el mismo elemento mientras su key sea la misma, esté donde esté en la lista. Ahora el compilador puede decir qué pasó: un elemento se añadió, se eliminó, se movió o cambió.

::demo for-keyed

Cada tipo de cambio da su propio tipo de patch:

- `append D`, `insert D in the middle`: `insert`, con `before` apuntando al marker de inicio del elemento que debe seguirle (o al marker final de la lista).
- `remove A`, `remove B`: `remove`, desde el marker de inicio hasta el marker final del elemento, ambos incluidos. El patch `remove` elimina también los markers. Esto es distinto de `clear`, que conserva los markers.
- `swap A and B`: un único `move`.
- `B done`: ningún cambio de estructura. Solo se hace patch del atributo del elemento que cambió, con el id de ese elemento.
- `all replaced`: dos `remove` y dos `insert`. Fíjate en el orden. Los inserts se hacen desde el final de la lista hacia su inicio.
- `nothing changed`: la demo pasa un array nuevo con los mismos tres objetos. La guarda del bucle pasa, porque los arrays son dos objetos, pero cada elemento es el mismo objeto en ambos lados, así que `common` no encuentra nada de lo que hacer patch.

## Cómo se reconcilian las listas

El código generado no decide qué insertar, mover o eliminar. Llama a un helper del runtime, `diffKeyedList`, y le da cuatro funciones pequeñas, una para cada caso. Esta es la llamada, del módulo generado:

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

El helper trabaja en tres pasadas:

1. **Remove.** Se elimina cada key de `prev` que no está en `next`. Las keys que se quedan se anotan en el orden que tienen en el DOM.
2. **Insert y move, desde el final.** El helper recorre `next` desde el último elemento hasta el primero. Para cada elemento conoce el elemento que debe seguirle, así que conoce el marker antes del cual insertar o mover. Una key nueva da `insert`. Una key vieja que no está ya delante de su seguidor da `move`. Recorrer desde el final es lo que garantiza que el marker al que se refiere un patch exista cuando se aplica el patch.
3. **Common.** Para cada key presente en ambos lados, `common(prevIndex, nextIndex)` hace diff del contenido del elemento. El código dentro de `common` es el diff normal del cuerpo del bucle, con `prevTodo` y `nextTodo` como el elemento en los dos lados.

La función `insert` renderiza el elemento nuevo solo desde el lado `next`. La función `common` es donde se vuelven a usar las guardas de la página anterior, con el elemento como raíz de la dependencia.

El método es simple, y no es el mínimo. Mover un elemento muy lejos puede costar varios moves, porque cada elemento que pasa se comprueba contra su seguidor.

::demo for-moves

- Mover el primer elemento al final cuesta un `move`.
- Mover el último elemento al principio cuesta tres: el helper mueve `c`, luego `b`, luego `a`, en lugar de mover solo `d`.
- Invertir cuatro elementos cuesta tres moves.

Es una concesión deliberada. El algoritmo es pequeño y predecible, y en la práctica la mayoría de los cambios en una lista son altas al final, bajas y algún intercambio ocasional. Un script de edición más corto necesitaría una subsecuencia creciente más larga, que es más código para un caso poco frecuente. Si reordenas a menudo listas muy largas, este es el lugar donde mirar en el código generado.

## La variable de índice

Un bucle puede nombrar el índice: `for item, i in items`. El índice forma parte del conjunto de dependencias del cuerpo del bucle, porque puede cambiar cuando un elemento se mueve.

::demo for-index open=module

Quitar el primer elemento elimina su rango, y después se hace patch de los dos elementos restantes: sus números pasaron de `2.` y `3.` a `1.` y `2.`. El elemento en sí no cambió, pero se llama a `common` para él con un índice nuevo, y la guarda `prevIndex !== nextIndex || prevItem !== nextItem` lo deja pasar.

## Listas vacías y listas que faltan

La expresión de la lista se evalúa como `(items) || []`. Un state donde `items` falta, es `null` o `undefined` equivale a una lista vacía. Eso es una característica, pero fíjate en lo que significa para otras condiciones.

::demo for-empty

- `[] → [x, y]`: dos patches `insert`, el de `y` primero porque el helper recorre desde el final, y un `clear` para el párrafo "Nothing here".
- `[x, y] → []`: dos `remove` y un `insert` del párrafo.
- `[] → undefined`: el bucle ve una lista vacía en ambos lados. La condición `items.length === 0` es `(items)?.length === 0`, que es `undefined === 0`, que es falso, así que se hace clear del párrafo. Si quieres el párrafo también para una lista que falta, escribe la condición como `!items || items.length === 0`.

> [!DANGER] Las keys deben ser únicas
> Dos elementos con la misma key hacen que `diffKeyedList` lance un error, y el mensaje nombra la key: `pavlus: duplicate key 1`. Una key que falta da la key `undefined` para todos los elementos, y el error es `pavlus: duplicate key undefined`. El error viene de `diff`. `render` no comprueba las keys, así que una página puede hacer render una vez y fallar en la primera actualización. Usa un valor que sea único en la lista y que no cambie para el mismo elemento, como un id del servidor.

## Bucles dentro de bucles

Los bucles se anidan, y cada nivel extiende el sufijo. La lista interior de un grupo vive entre markers con la key del grupo en sus ids.

::demo for-nested

El insert se dirige a `6e#g2`, el marker final de la lista de miembros del grupo con la key `g2`. El primer grupo no se toca: es el mismo objeto en `prev` y `next`, así que su guarda falla de inmediato. El segundo grupo es un objeto nuevo que comparte sus otros campos, que es como se actualiza un state inmutable.

## Embeds: una view hija en tu template

Un **embed** pone otro template compilado dentro de este. Un embed estático nombra un template importado, un nombre de instancia después de `#`, y props entre paréntesis.

```pavlus
import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role hot=admin)
```

El template importado es un template normal. Para esta página es:

```pavlus
span.badge(class:hot=hot) {label}
```

El hijo no lee el state de su padre. Recibe un objeto, y `label=role` significa que el objeto tiene un campo `label` cuyo valor es el `role` del padre.

::demo embed-static open=module

Un embed no es un patch especial. El compilador escribe una llamada al propio `diff` del hijo, con las props de `prev` y las props de `next`, y mete los patches en la misma lista:

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

Tres argumentos después de los states dicen quién es el hijo:

- **El sufijo** `idSuffix + "/3"` hace únicos los ids del hijo. `3` es el número del nodo embed en el padre. En la demo el texto del hijo tiene el id `1/3`: el nodo 1 del hijo, dentro del embed 3 del padre.
- **El prefijo** `messagePrefix + "badge."` se pone delante de cada id de message que envía el hijo. Un click en el hijo envía `badge.something`, así que el componente padre puede enrutar el message al hijo correcto.
- **El entorno** `childEnv(env, "badge", next)` encuentra el componente que hay detrás de la instancia, si lo hay. Un hijo que tiene su propio `+outlet` lo necesita.

La guarda lista las props que se leen, y solo esas. Si cambia el `name` del padre, ni siquiera se llama al badge. Si una prop se escribe sin ningún state, como `label="Fixed"`, es estática. Un embed que no lee nada se salta por completo.

Los embeds se usan a menudo dentro de un bucle. Aquí hay uno dentro de un bucle con key:

::demo embed-in-loop open=module

Los ids de los patches son `0#2/4` y `1#2/4`. Cada uno es el número de un nodo del hijo (`0` o `1`) seguido de su sufijo `#2/4`: el elemento con la key `2`, y luego el embed, que es el nodo `4` del padre. Para esto sirve el sufijo. Dos badges pueden tener el mismo template y nunca compartir un id.

Una prop spread, `+Row#row(...item selected=flag)`, copia todos los campos de `item` a las props y luego añade `selected`. Las props se escriben en orden, así que gana la última.

## Embeds dinámicos

A veces el hijo no se conoce cuando se escribe el template. Un **embed dinámico**, `+{expr}#name(props)`, toma la view del state: el valor de la expresión es un template compilado, o un objeto de componente que tiene una `view`. El nombre de la instancia es obligatorio, porque el compilador no puede adivinarlo.

```pavlus
section.panel
  h2 {title}
  +{panel}#panel(items=items)
```

Como el hijo puede ser un template distinto en cada lado, el compilador tiene que manejar tres casos. El helper `asView` devuelve la view que hay detrás de un valor, o `null` para `null` y `undefined`.

::demo embed-dynamic open=module

En la demo el state contiene views compiladas reales (impresas como `<view list.pavlus>`). El código tiene tres caminos:

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

- La misma view en ambos lados: se llama al `diff` propio de la view. En el primer paso la view de lista añade un elemento y devuelve un `insert`.
- Otra view: el contenido viejo se elimina con clear entre los markers, y la view nueva se renderiza desde las props de `next` y se inserta. Un diff entre una lista y una tabla no tendría sentido.
- Una view que aparece o desaparece (`null`): solo el `insert`, o solo el `clear`.

Si el valor no es una view ni un componente con una view, `asView` lanza `pavlus: +{...} needs a view or a component with a view`. A diferencia de un embed estático, uno dinámico tiene markers, porque su contenido puede ir y venir.

## La página de la ruta: +outlet

`+outlet` es un embed dinámico cuya view viene del router. Un componente declara una tabla `routing`, y el outlet muestra el hijo que coincide con `state.route`. Consulta [el enrutamiento](page:concepts-routing) para ver la tabla en sí. El template es una línea:

```pavlus
main
  +outlet
```

Su `diff` tiene los mismos tres caminos que un embed dinámico, con dos diferencias:

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

Primero, la guarda es `if (true)`. Lo que muestra el outlet depende de la ruta y del state del hijo de la ruta, y el template no puede nombrar esos campos. Así que el compilador marca el nodo como "puede cambiar siempre que cambie cualquier cosa", y cada padre de un outlet se comprueba en cada actualización. Segundo, la página se reemplaza cuando cambia la view **o el nombre de la instancia**: dos rutas pueden usar el mismo template y seguir siendo dos páginas distintas.

No puedes ejecutar un outlet en una demo de esta página, porque necesita un componente que sea dueño de la tabla de routing. Un template con `+outlet` que se ejecuta sin uno se detiene con este error:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

## Todo junto

Este tablero tiene un encabezado, una cadena `if / else if / else`, un bucle con key y un índice, una alternancia de clase, un evento con un argumento, un embed estático dentro del bucle y un embed dinámico después. El `footer` es una view guardada en el state.

::demo everything

Recorre los pasos y nombra el código que produjo cada patch:

- `loading true → false`: la rama cambia de `0` a `2`. Un `clear` y un `insert` construyen la lista, con todos sus elementos, en un solo patch.
- `card 1 done, card 2 moves up`: un `move`, porque el orden de la lista cambió, y luego los cambios en los elementos: los números (el índice cambió), la `class` de la tarjeta que ahora está hecha, y el badge, una view hija que recibe la nueva prop `hot`. El título de la tarjeta no cambió, así que no recibe un patch.
- `last card removed`: un `remove` y el texto del footer, `1 cards`. El footer es un embed dinámico con la misma view en ambos lados, así que se llama a su propio `diff` con el nuevo recuento.
- `all cards removed`: la rama cambia de `2` a `1`, así que se hace clear de toda la lista y se inserta el párrafo "No cards". No hace falta ningún `remove` para los elementos: el `clear` elimina todo lo que hay entre los markers. El texto del footer cambia a `0 cards`.

## Lo que aprendiste

- Las cadenas `if` se compilan a un índice de rama (`-1` cuando no se muestra nada). El mismo índice significa un diff dentro de la rama; otro índice significa `clear` entre los markers e `insert` de la rama nueva.
- Los markers son nodos de comentario vacíos alrededor de cada `if`, de cada elemento de `for`, de cada bucle y de cada embed dinámico. Los patches de estructura (`insert`, `clear`, `remove`, `move`) trabajan sobre los rangos entre ellos.
- Un `for` se convierte en `diffKeyedList` con cuatro callbacks. Las keys deben ser únicas y estables; sin una key el índice es la key, y el DOM sigue la posición.
- Un embed estático es una llamada al `diff` del hijo con las props de ambos lados, un sufijo de id más largo y un prefijo de message. Un embed dinámico o un outlet reemplaza el contenido cuando cambia la view.

Siguiente: [API, plugin de Vite y errores](page:compiler-tooling).
