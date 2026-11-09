---
summary: Una hoja de referencia compacta de todo el lenguaje de templates de pavlus en tablas, los mensajes de error reales del compilador, los errores más comunes y tres ejemplos más grandes (un formulario, una tabla con filtros, un panel con pestañas).
---
## Cómo usar esta página

Esta página es una referencia. Repite, de forma breve, lo que explican paso a paso las cuatro páginas anteriores: [elementos](page:syntax-elements), [expresiones](page:syntax-expressions), [eventos](page:syntax-events), [condicionales y bucles](page:syntax-control-flow) y [componentes](page:syntax-components). Léelas primero si alguna fila de abajo no te queda clara. Vuelve aquí cuando necesites comprobar cómo se escribe algo.

Un template es un archivo de texto. Se compila a un módulo con dos funciones puras: `render(state)` devuelve los vnodes, y `diff(prev, next)` devuelve la lista de patches entre dos estados. Todo lo que sigue describe lo que puedes escribir en el archivo.

## Líneas

Cada línea no vacía es una cosa. La indentación (solo espacios) anida una línea dentro de la línea de arriba.

| Escribes | Es | Notas |
| --- | --- | --- |
| `tag.class#id(attrs) text` | un elemento | puedes omitir cualquier parte, salvo la primera entre tag, class o id |
| `.card`, `#app` | un `div` | el tag es `div` por defecto |
| una línea que empieza con una barra vertical, y luego texto | una línea de texto | un nodo de texto; se permiten huecos |
| `{expr} more text` | una línea de texto | una línea que empieza con `{` también es texto |
| `// note` | un comentario | se descarta; un `// note` al final, después de un espacio, también se descarta |
| `if expr` | inicio de una condición | los dos puntos del final son opcionales |
| `else if expr`, `else` | las ramas siguientes | deben ir después de un `if` con la misma indentación |
| `for item in list` | un bucle | `for item, i in list key expr` añade el índice y una key |
| `import Name from "path"` | importa un hijo | solo al principio; el nombre empieza con mayúscula |
| `+Name#id(props)` | embebe un hijo importado | `#id` es opcional |
| `+{expr}#id(props)` | embebe una view que es un valor | `#id` es obligatorio |
| `+outlet` | el hijo de la ruta | no admite nada después |

Los elementos void (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`) no pueden tener líneas hijas.

El texto se une: dos líneas de texto seguidas, o el texto en línea de un elemento seguido de una línea de texto, se separan con un salto de línea, que HTML muestra como un espacio.

::demo comments

## Atributos

Los atributos van entre paréntesis después del tag, separados por espacios o comas. Los nombres pueden contener letras, dígitos, `_`, `-`, `:`, `.` y `@`.

| Escribes | Significado |
| --- | --- |
| `disabled` | un atributo booleano, presente con un valor vacío |
| `type="button"` | una cadena fija |
| `title="Open {name}"` | una cadena con huecos; cada hueco sigue las reglas del texto |
| `href=url`, `value=user.name` | una expresión, una sola palabra sin espacios |
| `title={a + " " + b}` | una expresión con espacios, entre llaves |
| `title="{note}"` | lo mismo que `title={note}`: un solo hueco |
| `class:on=cond` | añade la clase `on` cuando `cond` es truthy |
| `class="a b"` | clases, unidas con las de `.a` y las de `class:` |
| `@click=save` | binding de evento, message `save` |
| `@click.prevent.stop=save(item.id)` | lo mismo, con modificadores y un payload |
| `\{` y `\}` | una llave literal en el texto o en un valor entre comillas |

Un valor de `class:name` o de `@event` debe ser una expresión: `class:on` sin valor es un error.

## Valores en el texto y en los atributos

El mismo valor se renderiza de forma distinta en el texto y en un atributo.

| Valor | En el texto `{v}` | En un atributo `a=v` |
| --- | --- | --- |
| `null`, `undefined` | nada | no hay atributo |
| `false` | nada | no hay atributo |
| `true` | la palabra `true` | el atributo con un valor vacío |
| `0` | `0` | `a="0"` |
| la cadena vacía | nada | `a=""` |
| un número o una cadena | su texto | su texto |
| un array | los elementos unidos por comas | lo mismo |
| un objeto | `[object Object]` | lo mismo |

En una cadena con varias partes, como `title="Note: {v}"`, cada hueco sigue la columna del texto, y el atributo siempre está presente.

## Expresiones

Todo lo que va dentro de `{ }`, y cada valor de atributo sin comillas, se parsea como una expresión.

| Grupo | Soportado |
| --- | --- |
| literales | números (`1`, `.5`, `1e3`), cadenas (`"a"`, `'a'`), `true`, `false`, `null`, `undefined`, arrays `[a, b]` |
| nombres | un campo del state, o una variable de bucle |
| miembro | `a.b`, `a?.b` (ambos null-safe) |
| índice | `a[expr]` (null-safe) |
| llamada | `f(x, y)`, `a.b(x)` (null-safe) |
| unarios | `!a`, `-a`, `+a` |
| aritmética | `*` `/` `%` y después `+` `-` |
| comparación | `<` `>` `<=` `>=` y después `==` `!=` `===` `!==` |
| lógica | `&&`, después la barra doble, después `??` |
| ternario | `a ? b : c`, se anida hacia la derecha |
| agrupación | `( )` |

No soportado: literales de objeto, template strings, expresiones regulares, asignación, `++`, `typeof`, `in`, `new`, `**`, operadores bit a bit, el operador coma, `?.[ ]` y `?.( )`. Las funciones flecha sí existen, pero solo con cuerpo de expresión (`x => x.on`). Los nombres se buscan solo en el state: no hay globales.

La truthiness es la de JavaScript: `false`, `0`, `""`, `null`, `undefined` y `NaN` son falsy; un array vacío y un objeto vacío son truthy.

## Eventos

| Parte | Significado |
| --- | --- |
| `@click` | el nombre del evento del DOM (cualquier evento que el elemento pueda lanzar) |
| `=save` | el id del message; se permiten puntos: `users.open` |
| `(a, b)` | argumentos; ninguno significa sin payload, uno es el payload, varios forman un array |
| `.prevent` | `preventDefault()` antes de enviar el message |
| `.stop` | `stopPropagation()` antes de enviar el message |

El message que llega a la aplicación es `{ id, payload, event }`, donde `event` es `{ type, value?, checked?, key? }`. Los messages que envía un hijo embebido llevan el nombre de la instancia delante del id (`row.toggle`). Un modificador desconocido se ignora, y cuando el mismo evento se enlaza dos veces, gana el último binding.

## Componentes

| Escribes | Significado |
| --- | --- |
| `import Card from "./card.pavlus"` | deja `Card` disponible |
| `+Card` | lo embebe, con el nombre de instancia `card` |
| `+Card#intro(title="Hi")` | nombre de instancia explícito, una prop fija |
| `+Card(title=post.title count=3 active)` | las props con expresión conservan su tipo; un nombre solo es `true` |
| `+Card(...post)` | expande los campos de un objeto; las props posteriores ganan |
| `+{view}#slot(...)` | una view o un componente que viene del state; `null` no renderiza nada |
| `+outlet` | la página elegida por la tabla `routing` del componente |

El hijo ve solo sus props como su state. El nombre de la instancia da prefijo a sus messages, da prefijo a los ids de sus nodos y, en la lógica, es la key en `children`.

## Qué puede devolver `diff`

Los patches son datos simples. Estos son todos.

| `op` | Campos | Se produce cuando |
| --- | --- | --- |
| `text` | `id`, `text` | cambió el texto de un nodo |
| `attr` | `id`, `name`, `value` | un atributo recibió un valor nuevo |
| `rmAttr` | `id`, `name` | un atributo pasó a ser `null` o `false` |
| `handler` | `id`, `event`, `msg` | cambió el message de un binding |
| `insert` | `before`, `nodes` | apareció una rama, un elemento o un hijo |
| `clear` | `from`, `to` | se elimina todo lo que hay entre dos marcadores |
| `remove` | `from`, `to` | se elimina un elemento con key junto con sus marcadores |
| `move` | `from`, `to`, `before` | un elemento con key cambió de lugar |

## Los errores que reporta el compilador

Todos los mensajes terminan con la línea y la columna. Cuando al compilador se le da un nombre de archivo, como hace el plugin de Vite, el mensaje empieza con él: `page.pavlus: Empty expression (line 1, col 4)`. Estos son mensajes reales, cada uno de un template que lo provoca.

```text
Tabs are not allowed, use spaces (line 1, col 1)
Inconsistent indentation (line 3, col 1)
This line cannot have children (line 2, col 1)
Cannot parse line "%x" (line 1, col 1)
Unexpected "!" (line 1, col 2)
Unclosed ( (line 1, col 2)
Unterminated string (line 1, col 5)
Unexpected "=" in attributes (line 1, col 5)
Unexpected "?" in attributes (line 1, col 7)
Unexpected "/" (line 1, col 5)
Unclosed { (line 1, col 1)
Empty expression (line 1, col 4)
Expected ":" (line 1, col 9)
Expected property name (line 1, col 7)
Unexpected "b" (line 1, col 6)
Unexpected character "=" (line 1, col 6)
"@click" needs an expression value (line 1, col 8)
"class:on" needs an expression value (line 1, col 4)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
`...spread` is only allowed in component props (+Name(...)) (line 1, col 3)
```

Los mensajes de componentes:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 1, col 2)
Unexpected "x" after component (line 2, col 8)
Instance name must be an identifier (line 2, col 6)
"data-x" is not a valid prop name (line 2, col 7)
A dynamic component needs an instance name: +{expr}#name(...) (line 1, col 7)
`+outlet` takes nothing after it (line 1, col 8)
Expected a component name or {expression} after + (line 1, col 2)
```

Dos errores no los encuentra el compilador sino que aparecen en tiempo de ejecución: `pavlus: duplicate key 1` (dos elementos de un bucle tienen la misma key; lo lanza `diff`), y `pavlus: +{...} needs a view or a component with a view`.

Una nota sobre la columna de `Unclosed {`: se cuenta desde el inicio del texto de la línea, no desde el inicio de la línea, así que puede ser menor de lo que esperas. El número de línea es correcto.

## Errores comunes

Estos son los errores que más comete la gente. Los primeros no dan ningún error, y por eso son los más caros.

- **Las comillas deciden el significado.** `class="x"` es el texto `x`; `class=x` lee el campo `x` del state. `target=_blank` lee un campo llamado `_blank`, no encuentra nada y descarta el atributo. Escribe `target="_blank"`.
- **El texto necesita una barra vertical.** Una línea con solo palabras es un elemento: `Hello world` es `<Hello>world</Hello>`. El texto en su propia línea empieza con `|`.
- **Un bucle necesita la palabra `in`.** `for x of xs` se lee como un elemento llamado `for`. Obtienes `<for>` en la página y ningún error.
- **El cero se muestra.** `{count && "items"}` renderiza `0` cuando `count` es `0`, porque `0` es un valor, no la nada. Usa `{count > 0 && "items"}` o un ternario.
- **Un array vacío es truthy.** `if items` es verdadero para `[]`. Escribe `if items.length`.
- **Un valor sin comillas termina en un espacio.** `title=a + b` y `class:on=a === b` fallan con `Unexpected "=" in attributes` o `Unexpected "?" in attributes`. Envuelve la expresión: `title={a + b}`.
- **Un valor sin comillas es una expresión.** `href=/docs` falla con `Unexpected "/"`. Pon las rutas entre comillas: `href="/docs"`.
- **Una comilla doble dentro de un valor entre comillas dobles** conserva su barra invertida. Usa comillas simples alrededor del valor.
- **Optional chaining.** `a?.[0]` y `f?.()` son errores. El índice y la llamada ya son null-safe.
- **Los errores tipográficos son silenciosos.** Un nombre de campo equivocado se renderiza como texto vacío, y un message sin handler no hace nada.
- **Keys.** Sin `key`, la posición es la key, y una lista reordenada se reescribe. Las keys duplicadas lanzan un error en `diff`, no en el primer `render`.
- **Varios argumentos cambian el payload.** `@click=pick(id)` envía el valor; `@click=pick(id, kind)` envía un array. El handler debe coincidir.
- **El template no llama a los handlers.** `@click=save(item)` no llama a nada: construye el message `save` con el payload.
- **Los imports primero.** Las líneas `import` al principio, y `+Name` necesita un import correspondiente. Para una view que viene del state, usa `+{name}#id`.
- **Los elementos void no tienen hijos.** `input`, `br`, `img` y los demás no pueden tener líneas indentadas.

::demo bare-words

::demo loop-typo

::demo unquoted-target

Las tres demos de arriba muestran los errores silenciosos: una línea de texto que se convirtió en `<Hello>`, un bucle que se convirtió en `<for>`, y un enlace al que le falta el `target` en la primera línea.

## Todo junto: un formulario

Un formulario de registro que usa eventos con modificadores, alternancias con `class:`, condicionales para los errores, atributos booleanos y un ternario para el texto del botón.

::demo form

El state contiene todo lo que necesita la página: los valores, un mapa de `errors` y las flags `busy` y `done`. Los handlers de tu componente lo cambian, y el template solo describe cada situación.

- **Aparecen errores de validación.** El input del nombre recibe la clase `invalid` (`attr`), y los dos mensajes de error se insertan en el lugar de su `if`. El campo del email, que no tiene error, no se toca.
- **Se escribe el nombre.** Se actualizan el valor del input, la clase y el error de ese campo. El error de los términos se queda.
- **Envío.** Tres patches sobre un botón: aparecen `disabled` y `class` y cambia el texto. `disabled={busy}` es `false` antes y `true` después, así que el atributo se añade y se quita; `toAttr(true)` es un valor vacío.
- **Listo.** El botón se restaura y se inserta el message `success`.

El `@submit.prevent=submit` del formulario evita que el navegador recargue la página. El handler de `submit` lee los valores del state, porque cada input copió allí su valor con `@input`.

## Todo junto: una tabla con filtros

Una tabla de usuarios con botones de filtro, un cuadro de búsqueda y acciones por fila. La lista que muestra la tabla es `visible`, calculada por el componente a partir de los datos completos, el filtro y la consulta. Un template no puede filtrar ni contar por sí mismo, así que lo hace el handler y el template muestra el resultado.

::demo table

- **Filtro: paused.** Los botones de filtro están en un bucle con key, y la clase `active` pasa de uno a otro. Se eliminan las filas de los otros dos usuarios y se actualiza el texto del pie.
- **Filtro: nobody.** Se elimina la última fila, y el `if` de la fila vacía inserta "No users match".
- **Bob se reanuda.** La fila conserva su lugar. Se quita su clase `paused`, cambia la etiqueta de su botón y un patch `handler` le da al botón el nuevo payload `[2, "active"]`. Dos argumentos: un array.
- **Orden invertido.** Las filas con key se mueven, no se reescriben.

## Todo junto: un panel con pestañas

Una barra de pestañas construida a partir de datos y un cuerpo que muestra uno de tres paneles. La barra de pestañas es un bucle con key y `class:active`, y el panel es un `if` / `else if` / `else`.

::demo tabs

- Cambiar de pestaña modifica dos botones (una clase y `aria-selected` cada uno, escrito como el texto `"true"` o `"false"` porque ARIA necesita las palabras, no un atributo vacío) y **reemplaza** el cuerpo: la rama cambió, así que `clear` e `insert`.
- Cuando llega un evento nuevo mientras la pestaña de actividad está abierta, la rama es la misma. Solo cambia la lista: un `insert` para el elemento nuevo, porque el bucle usa como key el texto del evento.

Este es todo el lenguaje. Lo demás, como lo que hace el plugin del DOM con los patches, cómo el store cambia el state y cómo se enrutan las páginas, vive en los componentes y los plugins.

## Lo que aprendiste

- Un template son líneas: elementos, líneas de texto, `if` / `for`, imports y embeds. Los atributos llevan clases, eventos y props.
- Los valores siguen reglas fijas: `null`, `undefined` y `false` son nada; `true` es un atributo vacío; `0` y `""` son valores.
- Los errores del compilador son cortos y llevan línea y columna; los errores peligrosos son los que son válidos pero significan otra cosa.
- Las páginas grandes se construyen con las mismas pocas piezas: un state con valores listos para mostrar, condicionales, bucles con key y eventos con payloads.

Siguiente: [el pipeline de compilación](page:compiler-pipeline).
