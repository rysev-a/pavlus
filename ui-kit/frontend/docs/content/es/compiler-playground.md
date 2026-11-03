---
summary: Un playground editable que ejecuta el compilador real en tu navegador. Cambia un template y un state, y mira el HTML, el módulo generado y lo que lee cada nodo. Siete experimentos te muestran qué cambiar y qué observar.
---
## Pruébalo

Abajo hay dos cuadros de texto: un template a la izquierda y un state, escrito como JSON, a la derecha. El botón **Compile and run** envía ambos al compilador real, en tu navegador, y muestra el resultado debajo de los cuadros. No se envía nada a un servidor. **Reset** recupera el ejemplo con el que empezaste.

::playground

La primera vez, pulsa **Compile and run** sin cambiar nada. El ejemplo inicial tiene un encabezado, una frase con un condicional dentro del texto, una lista con key y una alternancia de clase, y un `if` con un `else`. Después sigue leyendo para saber qué significan las secciones de la salida, y prueba los experimentos de abajo.

## Qué ves después de Compile and run

La salida tiene las mismas secciones que las demos de las otras páginas de esta sección:

- **Template** y **State**: lo que compilaste y el JSON que se parseó.
- **Result (HTML of render(state))**: el HTML que devolvió `render` para tu state. Aquí no se muestran los markers.
- **Generated module**: el texto completo del módulo que devolvió `compileTemplate`, abierto por defecto.
- **AST and what each node reads**: una línea por nodo, con los nombres raíz del state de los que depende. Es el conjunto de dependencias con el que se hacen las guardas de `diff`. Está abierto por defecto.
- **The vnodes render(state) returns**: los datos en bruto, plegados. Ábrelo para ver los ids y los markers.

Si el template tiene un error, ves **The compiler stopped:** y el mensaje, con el nombre de archivo `playground.pavlus` y la línea y la columna. Si el state no es JSON válido, ves **The state is not valid JSON:** y el mensaje del parser.

> [!NOTE] Lo que el playground no puede hacer
> Ejecuta `render` una vez, para el state que le das. No tiene un segundo state, así que aquí no hay lista de patches: para ver patches, usa las demos de las páginas anteriores a esta, o llama a `diff` en un test como se muestra en [la página de herramientas](page:compiler-tooling). Aun así puedes leer la función `diff` en el módulo generado, y eso es lo que hacen los experimentos de abajo. Los imports, los embeds `+{expr}` y `+outlet` necesitan views y componentes que JSON no puede transportar, así que aquí se detienen con un error.

## Siete experimentos

Para cada experimento, pega el template en el cuadro de la izquierda, el state en el cuadro de la derecha y pulsa **Compile and run**.

### 1. Un template que no lee nada

```pavlus
p Hello, world
```

```json
{}
```

Abre el módulo generado y ve a `diff`. Solo tiene `if (prev === next) return patches;` y `return patches;`. No hay línea de import, porque no hace falta ningún helper, y los vnodes no tienen campos `id`. Nada de este template puede cambiar nunca, así que el compilador no escribió nada para él.

### 2. Leer un campo

```pavlus
p Hello, {name}
```

```json
{ "name": "Ann", "theme": "light" }
```

El AST dice *reads: name*, y la guarda de `diff` compara `prev.name !== next.name`. El campo `theme` está en el state y nunca se menciona en el módulo. Ahora cambia el template a `p Hello, {name}, theme {theme}` y compila de nuevo: la guarda crece en una comparación, y el texto también.

### 3. Un padre y un hijo con las mismas dependencias

```pavlus
p(title=text) {text}
```

```json
{ "text": "Hi" }
```

Busca la guarda `if (prev.text !== next.text)`. Dentro ves el atributo `title` y también el texto. El comentario `// line 1: text` no tiene un `if` propio, porque la guarda del párrafo ya lo cubre. Cambia el atributo a `title=other` y compila de nuevo: ahora el texto tiene su propia guarda.

### 4. El índice de rama

```pavlus
if n > 1
  p many
else if n === 1
  p one
else
  p none
```

```json
{ "n": 1 }
```

El resultado es `<p>one</p>`. En el módulo, busca `nextBranch`: una cadena de condiciones que termina en el número de la rama `else`. Borra el `else` y su línea, y compila de nuevo: ahora la cadena termina en `-1`, el valor de "no se muestra nada". Abre los vnodes: el `if` está envuelto en dos nodos marker, con los ids `0s` y `0e`.

### 5. Bucles con key y sin key

```pavlus
ul
  for item in items key item.id
    li {item.name}
```

```json
{ "items": [{ "id": 7, "name": "Ann" }, { "id": 9, "name": "Bob" }] }
```

Busca la línea que empieza con `const prevItemKeys`. Asigna a cada elemento `String((item)?.id)`. Ahora borra ` key item.id` del template y compila de nuevo: la línea pasa a ser `String(itemIndex)`. Mira los vnodes en las dos versiones: los markers de los elementos se nombran según la key, `1[#7` y `1[#9` en la primera, `1[#0` y `1[#1` en la segunda. Esos nombres son los que usan los patches `remove` y `move`.

### 6. Un evento con argumentos

```pavlus
button(class:on=on @click=pick(id, kind)) Pick
```

```json
{ "on": true, "id": 1, "kind": "a" }
```

El vnode del botón tiene un campo `events` con `"click": { "id": "pick", "payload": [1, "a"] }`: el handler son datos. En `diff`, los dos argumentos se comparan con `sameValues`, y la clase se reconstruye con `joinClasses`. Cambia `@click=pick(id, kind)` por `@click.prevent=pick(id, kind)` y busca `prevent: true`. Cámbialo por `@click=pick` y el handler desaparece de `diff`, porque un handler sin argumentos no puede cambiar. El botón conserva su `id`, porque su clase todavía puede cambiar.

### 7. Errores

Rompe el template a propósito. Quita la llave de cierre:

```pavlus-invalid
p Hello, {name
```

La salida se reemplaza por el mensaje `playground.pavlus: Unclosed { (line 1, col 8)`. Vuelve a poner la llave, y ahora escribe una línea con un `if` y sin condición:

```pavlus
if
  p one
```

Esto no es un error. El resultado es `<if><p>one</p></if>`, un elemento llamado `if`. Es un recordatorio de que la salida es la mejor forma de descubrir qué entendió el compilador.

## Qué mirar en el módulo

Cuando abras el módulo generado de cualquier template, recórrelo en este orden:

1. La **línea de import** te dice qué helpers necesita el template. Una línea más larga significa más características.
2. **`meta`** lista los hijos embebidos e indica si hay un outlet.
3. En **`render`**, sigue los comentarios `// line N: ...`. Cada uno es una línea de tu template. Las variables se nombran según ella: `liChildren` son los hijos de un `li`, `userList` es la lista de un `for user in ...`.
4. En **`render`**, mira qué nodos tienen un `id`. Solo lo tienen los nodos a los que se puede hacer patch.
5. En **`diff`**, busca los comentarios `(reads: ...)`. La línea de debajo de cada uno es una guarda.
6. En **`diff`**, busca las llamadas a `patches.push`. Cada una es una de las ocho operaciones de patch, y sus campos son lo que recibe el plugin del DOM.
7. Fíjate en **`idSuffix`** y **`messagePrefix`**. Están en cada id y en cada message, de modo que un template puede usarse dentro de un bucle o dentro de otro template.

## Lo que aprendiste

- El playground ejecuta `compileTemplate` y `render` en tu navegador. Muestra el HTML, el módulo y el conjunto de dependencias de cada nodo, y no tiene lista de patches.
- Cambiar una sola cosa cada vez y comparar el módulo antes y después es la forma más rápida de aprender el compilador.
- Un template que no lee nada obtiene un `diff` vacío; un nodo que comparte las dependencias de su padre comparte su guarda; una key cambia cómo se nombran los elementos.
- Un error tipográfico puede compilar igualmente. Lee el resultado, no solo la ausencia de un error.

Siguiente: [Arquitectura: código puro y efectos](page:concepts-architecture).
