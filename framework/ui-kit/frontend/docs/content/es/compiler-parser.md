---
summary: Cómo el parser convierte las líneas y la indentación de un template en un AST tipado. Conoce cada tipo de nodo con sus campos reales, cómo se parsean las expresiones, cómo se asignan los ids de nodo y cómo los errores indican una línea y una columna.
---
## Qué hace el parser

El parser es la primera etapa del compilador. Toma el texto de un template y devuelve un **árbol**, el AST (árbol de sintaxis abstracta). No ejecuta nada, no conoce tu state y no escribe nada de JavaScript. Solo responde a la pregunta "¿qué dice este texto?" y falla con un mensaje claro cuando el texto no dice nada con sentido.

La función es `parse(source)` y el resultado tiene esta forma:

```ts
interface TemplateAst {
  imports: { local: string; from: string }[];
  nodes: Node[];
}
```

`imports` son las líneas `import` del principio. `nodes` son los nodos de nivel superior del template. Un nodo es de uno de seis tipos: `element`, `text`, `if`, `for`, `embed` y `outlet`. Todo lo que está por debajo del nivel superior cuelga de un `element`, de una rama de `if` o de un `for`.

El template interesante más pequeño es un elemento con una interpolación. La demo muestra su AST en el formato que usa este sitio (una línea por nodo, con el id del nodo y lo que lee).

::demo ids-small open=ast

Hay dos nodos: el elemento `p` con el id de nodo `#0`, y un nodo de texto `#1` dentro de él. El objeto real detrás de este listado se ve así (la salida del parser, formateada para leerla):

```json
{
  "imports": [],
  "nodes": [
    {
      "type": "element",
      "nid": 0,
      "tag": "p",
      "classes": [],
      "toggles": [],
      "attrs": [],
      "events": [],
      "children": [
        {
          "type": "text",
          "nid": 1,
          "line": 1,
          "parts": ["Hello, ", { "k": "id", "name": "name" }]
        }
      ],
      "pos": { "line": 1, "col": 1 }
    }
  ]
}
```

Conviene tener presentes dos detalles. Un nodo de texto es una lista de **partes**: una parte es una cadena simple o un objeto de expresión (`k` es el tipo de expresión). Y el texto en línea de `p Hello, {name}` no es una propiedad del elemento: el parser lo convierte en un nodo hijo real. A partir de aquí el compilador solo ve un árbol de nodos.

## Líneas e indentación

El parser trabaja línea por línea. Primero prepara las líneas:

1. Divide el código fuente en los saltos de línea y se salta las líneas vacías.
2. Un tabulador en la indentación es un error: `Tabs are not allowed, use spaces`.
3. Una línea que empieza con `//` se descarta. En las demás líneas, un `// comment` al final se corta, pero solo cuando el `//` va después de un espacio y fuera de comillas, paréntesis y llaves. Por eso `href="http://example.com"` es seguro.
4. Cada línea que queda recuerda su número, su indentación (la cantidad de espacios iniciales) y su texto sin espacios en los extremos.

Después construye el árbol con una **pila de padres abiertos**. Por cada línea, el parser quita de la pila todos los padres que no tienen menos indentación que la línea. Lo que queda arriba es el padre de la línea. La línea se añade a los hijos de ese padre, y después se mete ella misma en la pila.

::demo indent open=ast

En este template `li Two` tiene un hijo `b`, porque `b bold` tiene más indentación que `li Two`. La línea `p After` tiene la indentación de `ul`, así que todo hasta `li Two` y `b bold` sale de la pila, y `p` pasa a ser el siguiente nodo de nivel superior.

Dos reglas mantienen el árbol honesto.

- **Todos los hijos de un padre deben usar la misma indentación.** El primer hijo fija la indentación, y cualquier hermano posterior con otra indentación da `Inconsistent indentation`. Cuántos espacios uses depende de ti (dos es la convención); cuántos más que el padre no está fijado. Lo que importa es que los hermanos coincidan.
- **Algunas líneas son hojas.** Un elemento void (`br`, `img`, `input` y el resto de los tags void de HTML), una línea de texto, un embed y un outlet no pueden tener hijos. Un hijo debajo de ellos da `This line cannot have children`.

```pavlus-invalid bad-indent.pavlus
div
  p one
    span child of one
   p two
```

```text
bad-indent.pavlus: Inconsistent indentation (line 4, col 1)
```

El parser lee la línea 4 (`   p two`, tres espacios). Su padre es `div`, cuyos hijos usan una indentación de 2, así que la línea se rechaza. El error siempre apunta a la columna 1, porque el problema es la indentación como un todo.

## ¿Qué tipo de línea es esta?

Una vez resuelta la indentación, el parser mira el principio de la línea y decide qué es. Las comprobaciones se ejecutan en este orden, y gana la primera que coincide.

| La línea empieza con | Es | Nodo |
| --- | --- | --- |
| `import Name from "path"` | un import (solo al principio del archivo) | una entrada de `imports` |
| `if expr` | un condicional | `IfNode` |
| `else if expr` o `else` | la rama siguiente del `if` anterior | una rama nueva en ese `IfNode` |
| `for item in list` | un bucle | `ForNode` |
| el carácter de barra vertical y un espacio | una línea de texto | `TextNode` |
| `{` | una línea de texto que empieza con una expresión | `TextNode` |
| `+outlet` | el hijo de la ruta | `OutletNode` |
| `+` | una view hija | `EmbedNode` |
| cualquier otra cosa | un elemento | `ElementNode` |

Los dos puntos finales de `if x:` y `for a in b:` son opcionales y se ignoran. `else` tiene que ir después de un `if` o de un `else if` que esté en el mismo nivel; si no, obtienes ``` `else` without matching `if` ```.

## Elementos

Una línea de elemento tiene esta forma: un tag opcional, cualquier número de `.class` y `#id`, unos `(attributes)` opcionales y después texto en línea opcional. El tag es `div` por defecto. Vamos a parsear una línea que usa la mayoría de las piezas.

::demo selector-attrs open=ast

El AST muestra solo las dependencias, así que aquí está el nodo real, con las partes largas recortadas:

```json
{
  "type": "element",
  "nid": 0,
  "tag": "a",
  "classes": ["btn"],
  "toggles": [{ "name": "on", "test": { "k": "id", "name": "open" } }],
  "attrs": [
    { "name": "id", "value": ["go"] },
    { "name": "href", "value": [{ "k": "id", "name": "url" }] },
    { "name": "disabled", "value": null }
  ],
  "events": [
    {
      "name": "click",
      "msg": "save",
      "args": [{ "k": "id", "name": "id" }, { "k": "lit", "value": 2 }],
      "prevent": true,
      "stop": false
    }
  ],
  "children": [{ "type": "text", "nid": 1, "line": 1, "parts": ["Go"] }],
  "pos": { "line": 1, "col": 1 }
}
```

Cada pieza de la línea cae en su propio campo:

- `.btn` va a `classes`. `#go` se guarda como un atributo normal llamado `id` (se añade primero, antes de los atributos entre paréntesis).
- `class:on=open` va a `toggles`: un nombre de clase y una condición. No es un atributo.
- `@click.prevent=save(id, 2)` va a `events`. La parte que sigue a `@` es el nombre del evento del DOM, con los modificadores (`prevent`, `stop`) convertidos en flags. La expresión debe ser un id de message como `save`, `users.remove` o una llamada a uno; sus argumentos son expresiones. Cualquier otra cosa es un error: `Event handler must be a message id like `save` or `remove(item)``.
- `href=url` es un atributo cuyo valor es una lista con una expresión. `disabled` sin valor tiene `value: null`: un atributo booleano.

El valor de un atributo es siempre una lista de partes, como un nodo de texto. Un valor entre comillas sin llaves, como `"go"`, es una lista con una cadena. Así distingue el compilador un atributo estático (solo cadenas) de uno dinámico (tiene una expresión). Esta diferencia decide mucho más adelante.

### Tres tipos de valor de atributo

El valor de un atributo se puede escribir de tres maneras, y el parser lee cada una de forma distinta.

- **Entre comillas**: `title="Open {name}"`. El texto entre las comillas se divide en cadenas y `{expressions}`, exactamente igual que una línea de texto.
- **Entre llaves**: `hidden={count === 0}`. Todo lo que hay entre las llaves es una expresión, así que puede contener espacios.
- **Sin nada**: `href=url`. El valor termina en el primer espacio, coma o `)` de cierre que no esté dentro de corchetes o comillas. Se parsea como una expresión.

La forma sin nada es donde ocurre el primer error más común. Una expresión con espacios necesita llaves:

```pavlus-invalid bare.pavlus
ul
  for link in links
    a(class:current=link.href === page) {link.label}
```

```text
bare.pavlus: Unexpected "=" in attributes (line 3, col 31)
```

El valor sin nada `link.href` terminó en el espacio, y el parser encontró entonces `===` cuando esperaba un nombre de atributo. La solución son las llaves: `class:current={link.href === page}`.

## Líneas de texto, uniones y escapes

Una línea que empieza con `|` es un nodo de texto. El parser quita la barra vertical y un espacio después de ella. Una línea de texto puede tener expresiones entre llaves, y una barra invertida antes de una llave la conserva como carácter literal.

::demo escapes open=ast

La línea de comentario desapareció, y también el comentario final después de `Home`, aunque la URL entre comillas conservó su `//`. En el párrafo, `\{` y `\}` se convirtieron en llaves normales, y `{n}` se convirtió en una expresión.

Cuando dos nodos de texto van seguidos, el parser pone un salto de línea delante del segundo. En HTML un salto de línea entre palabras se muestra como un espacio, así que dos líneas se leen como un solo párrafo, como en el lenguaje de templates pug.

::demo text-join open=ast

El segundo nodo de texto tiene las partes `"\n"`, `"two "` y la expresión `x`. Puedes ver el salto de línea en el HTML: `one` y `two 2` están en líneas distintas del código fuente. La misma regla une el texto en línea de un elemento (`p Hello`) con una línea `|` que va debajo.

## Condicionales y bucles

Una línea `if` inicia un `IfNode`. El nodo tiene una lista de `branches`. Cada rama tiene un `test` (una expresión, o `null` para `else`) y sus `children`. Las líneas `else if` y `else` no crean nodos propios: añaden una rama al nodo `if` que tienen justo antes.

::demo if-chain open=ast

La vista del AST imprime un nodo por cada `if`, y debajo los grupos `then`, `else if` y `else`. Los ids de nodo muestran algo que conviene recordar: el `if` es `#0`, los tres elementos `p` y sus textos son del `#1` al `#6`, y las ramas en sí no tienen ids. Una rama no es un nodo.

Los campos reales del nodo, sin los hijos:

```json
{
  "type": "if",
  "nid": 0,
  "line": 1,
  "branches": [
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "loading" } }, "children": [] },
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "error" } }, "children": [] },
    { "test": null, "children": [] }
  ]
}
```

Una línea `for` tiene más partes: un nombre de elemento, un nombre de índice opcional, la expresión de la lista y una expresión `key` opcional.

::demo for-index open=ast

```json
{
  "type": "for",
  "nid": 0,
  "line": 1,
  "item": "u",
  "index": "i",
  "of": { "k": "id", "name": "users" },
  "key": { "k": "member", "obj": { "k": "id", "name": "u" }, "prop": "id" },
  "children": []
}
```

El parser divide `users key u.id` en la palabra `key`. La key es lo que usa el bucle para distinguir los elementos cuando la lista cambia; sin ella, la posición en la lista es la key. Los nombres `u` e `i` solo son visibles dentro del bucle. La página siguiente, [análisis de dependencias](page:compiler-analysis), muestra cómo lo usa el compilador.

## Views hijas y el outlet

Una línea `import` le da un nombre a otro template. Una línea que empieza con `+` lo coloca. El nombre antes de `#` es el **nombre de instancia**: da prefijo a los messages del hijo y es la key de su state.

::demo embeds open=ast

```json
{
  "type": "embed",
  "nid": 1,
  "component": "Badge",
  "dynamic": null,
  "name": "first",
  "props": [
    { "name": "label", "value": ["Hi ", { "k": "id", "name": "name" }] },
    { "name": "strong", "value": null }
  ],
  "pos": { "line": 4, "col": 3 }
}
```

La vista del AST muestra los dos embeds sin sus props, pero las dependencias muestran la diferencia: `+Badge#first` lee `name`, y `+Badge#second(...extra)` lee `extra`, porque una entrada spread (`{ "spread": expr }`) también es una prop. Una prop sin valor (`strong`) significa `true`.

El parser comprueba estas reglas, porque el compilador no puede esquivarlas:

- Las líneas `import` solo se permiten al principio del archivo, con indentación 0, antes de cualquier nodo.
- El nombre importado debe empezar con mayúscula y no debe ser uno de `String`, `Array`, `Map`, `Set` o `Error`, que usa el propio código generado.
- `+Name` necesita un import correspondiente: `"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state`.
- Un embed dinámico, `+{expr}`, no tiene un nombre del que derivar un nombre de instancia, así que necesita uno: `+{view}#page`.
- `+outlet` no admite nada después. Se convierte en un `OutletNode` con solo `nid` y `line`.

## Expresiones

Cada `{...}`, cada valor de atributo entre llaves o sin nada y cada condición va a un segundo parser, separado, en `expr.ts`. Maneja un subconjunto pequeño de JavaScript a propósito. Tiene tres pasos: dividir el texto en tokens (números, cadenas, nombres y puntuación), luego subir por los niveles de precedencia, y luego comprobar que no sobra nada.

El resultado es un árbol pequeño. Cada nodo tiene un campo `k` con su tipo:

| `k` | Campos | Se escribe como |
| --- | --- | --- |
| `lit` | `value` | `1`, `"text"`, `true`, `false`, `null`, `undefined` |
| `id` | `name` | `count` |
| `member` | `obj`, `prop` | `user.name` y `user?.name` |
| `index` | `obj`, `index` | `list[0]` |
| `call` | `callee`, `args` | `format(price, "usd")` |
| `unary` | `op`, `arg` | `!done`, `-n`, `+n` |
| `binary` | `op`, `left`, `right` | `a + b`, `a === b`, `x ?? y` |
| `cond` | `test`, `then`, `else` | `ok ? "yes" : "no"` |
| `array` | `items` | `[1, x]` |

Los operadores binarios y su precedencia, de la más laxa a la más estricta: `??`, luego `||`, luego `&&`, luego los operadores de igualdad (`==`, `!=`, `===`, `!==`), luego las comparaciones (`<`, `>`, `<=`, `>=`), luego `+` y `-`, luego `*`, `/` y `%`. Después, el ternario `? :` es más laxo que todos ellos, y los operadores unarios se enlazan con más fuerza. Los paréntesis agrupan como siempre. Así que `a + b * 2` es `a + (b * 2)`.

::demo expressions open=ast

La vista del AST imprime cada expresión a partir de su árbol, con los paréntesis añadidos en `{a + (b * 2)}`: eso es el árbol, no tu texto. Fíjate también en que `user?.name` se imprime como `user.name`. El parser trata `.` y `?.` igual, porque el código generado lee cada miembro con `?.` de todos modos. Un template no puede lanzar "cannot read properties of undefined".

Aquí van algunos árboles reales. El texto de la izquierda es la expresión, el JSON es lo que devuelve `parseExpr`:

```json
{ "k": "binary", "op": "+",
  "left": { "k": "id", "name": "a" },
  "right": { "k": "binary", "op": "*", "left": { "k": "id", "name": "b" }, "right": { "k": "lit", "value": 2 } } }
```

```json
{ "k": "cond",
  "test": { "k": "unary", "op": "!", "arg": { "k": "id", "name": "ok" } },
  "then": { "k": "id", "name": "n" },
  "else": { "k": "unary", "op": "-", "arg": { "k": "lit", "value": 1 } } }
```

La primera es `a + b * 2`, la segunda es `!ok ? n : -1`.

> [!NOTE] Lo que las expresiones no pueden hacer
> No hay asignación, ni template string, ni literal de objeto, ni `typeof`, ni `new` (las funciones flecha sí existen, pero solo con cuerpo de expresión). Cada una de estas cosas da un error claro en el momento del build, por ejemplo `{x = 1}` da `Unexpected character "="`, y "{`a`}" da ``Unexpected character "`"``. Los cambios ocurren enviando un message desde un evento.

## Ids de nodo

Cada nodo recibe un número, su **nid**, cuando el parser lo crea. El contador empieza en 0 para cada template y sube de uno en uno en el orden del documento: un padre antes que sus hijos, un nodo antes que los nodos que tiene debajo. El texto en línea de un elemento recibe el número siguiente justo después del elemento.

Los imports y las ramas no reciben número. Las ramas son parte de un nodo `if`, y los imports no forman parte del árbol.

::demo tree open=ast

Lee los números en el listado. El `section` es `#0`, luego `h2` es `#1` y su texto `#2`. El `if` es `#3` y toma los ids del `#4` al `#9` para todo lo que hay dentro de sus dos ramas. Después del `if` viene el `footer` como `#10`, y su texto como `#11`. Es simplemente un orden en profundidad.

Estos números importan para el resto del compilador. El generador de código los escribe en las cadenas que se convierten en ids en los vnodes (`"11"` para el texto del footer) y en los patches. En una lista, el id de un nodo es su nid seguido de `#` y la key del elemento (`"7#1"`), y el id de un nodo de una view hija se extiende con `/` y el nid del embed (`"1/3"`). Dos nodos de un mismo template nunca pueden tener el mismo id, porque sus nids son distintos, y dos copias de un nodo en una lista se distinguen por la key.

> [!TIP] Los ids no son nombres estables
> No guardes un nid ni lo escribas en tu propio código. Añade una línea al principio de un template y todos los números de debajo se mueven en uno. Los números son un acuerdo interno entre `render` y `diff` del mismo módulo compilado.

## Posiciones y errores

El parser guarda las posiciones del código fuente donde se podría reportar un error. Un elemento y un embed tienen un `pos` con `line` y `col` empezando en 1. Los demás nodos tienen un `line`. Los errores llevan los dos números y usan la misma convención en todas las etapas.

```ts
class TemplateError extends Error {
  readonly line: number;
  readonly col: number;
}
```

El mensaje termina con la posición entre paréntesis, por ejemplo `Unclosed { (line 1, col 8)`. Los dos números también están disponibles como `error.line` y `error.col`, de modo que una herramienta como un editor puede subrayar el lugar exacto. `compileTemplate` añade delante el nombre del archivo cuando conoce uno, que es lo que ves en el log del build.

La columna de un error de expresión es exacta: el parser le pasa al parser de expresiones la posición del primer carácter de la expresión, que suma el desplazamiento del token. Una imprecisión que conviene conocer: para `Unclosed {` en el texto, la columna se cuenta desde el inicio del texto después del tag, no desde el inicio de la línea. En el primer ejemplo de abajo la `{` está en la columna 10 de la línea, y el mensaje dice 8. Algunos mensajes reales, de compilar templates incorrectos:

```pavlus-invalid unclosed.pavlus
p Hello, {user.name
```

```text
unclosed.pavlus: Unclosed { (line 1, col 8)
```

```pavlus-invalid expression.pavlus
p Total: {price *}
```

```text
expression.pavlus: Unexpected end of expression (line 1, col 18)
```

```pavlus-invalid branch.pavlus
p one
else
  p two
```

```text
branch.pavlus: `else` without matching `if` (line 2, col 1)
```

```pavlus-invalid event.pavlus
button(@click=a+b) Save
```

```text
event.pavlus: Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

Cada error detiene el parseo en el primer problema. El parser no intenta continuar, así que corrige el primer mensaje y compila de nuevo.

> [!WARNING] Las comillas deciden qué es un valor
> `class="x"` es el texto `x`. `class=x` es el campo `x` del state. Las dos son válidas, así que ninguna es un error. Si una página no muestra nada donde esperas una clase, revisa primero las comillas.

## Un AST, tres lectores

Ya has visto todo lo que produce el parser. Es un árbol simple de objetos simples sin métodos, y tres etapas posteriores leen el mismo árbol: el análisis lo lee para calcular qué lee cada nodo, la generación de `render` lo lee para escribir los vnodes, y la generación de `diff` lo lee para escribir las comparaciones. Como las etapas comparten un árbol, no pueden discrepar sobre lo que significa el template. Mira el panorama general una vez más, con un template que tiene todos los tipos de nodo salvo el embed:

::demo if-chain

El mismo template tiene, en el AST, un `if` con tres ramas. En `render` se convierte en una cadena `if / else if / else` entre dos marcadores. En `diff` se convierte en un cálculo del número de rama para `prev` y para `next`, y un cambio de rama se convierte en un `clear` y un `insert`. El paso de arriba muestra exactamente eso. Los detalles están en las páginas siguientes.

## Lo que aprendiste

- `parse` lee líneas e indentación y las convierte en un árbol de seis tipos de nodo. La indentación fija el padre, y todos los hermanos deben coincidir en ella.
- El texto en línea se convierte en un nodo de texto real; los valores de atributo y el texto son listas de partes (cadenas y expresiones), y así sabe el compilador qué es estático.
- Las expresiones las parsea un parser pequeño aparte en nueve tipos de nodos. `.` y `?.` son lo mismo, y un template solo puede leer.
- Los ids de nodo son el orden de creación en un recorrido en profundidad. Son internos y se convierten en los ids de los vnodes y de los patches.
- Un error es un `TemplateError` con una línea y una columna; el log del build muestra también el nombre del archivo.

Siguiente: [Análisis de dependencias](page:compiler-analysis).
