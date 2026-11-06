---
summary: Pon valores vivos en un template con {expression}. Aprende dónde se permiten los huecos, el pequeño lenguaje de expresiones que hay dentro, qué no está soportado y exactamente cómo los valores se convierten en texto y atributos.
---
## Un hueco en el texto

Un template que siempre dice lo mismo no es muy útil. Para mostrar un valor del state, pon una **expression** entre llaves. Las llaves y lo que contienen se llaman una *interpolación*, o un hueco: el compilador deja un hueco en el texto y lo rellena con el valor cada vez que se renderiza el template.

El caso más simple es un solo nombre. `name` no es texto, es el campo `name` del state.

::demo hello

Mira los dos pasos. Cuando `name` cambia de Ann a Bob, `diff` devuelve un patch que reemplaza el texto. Cuando `name` "cambia" al mismo valor, `diff` no devuelve nada: el compilador generó una comprobación que compara el texto antiguo con el nuevo y solo emite un patch cuando difieren.

Todo lo que hay entre `{` y `}` lo analiza el propio pavlus. **No** es JavaScript ejecutado con `eval`: es un lenguaje pequeño y puro con su propio parser, y el compilador lo traduce a JavaScript simple. El resto de esta página describe ese lenguaje.

## Dónde se permiten los huecos

Un hueco puede estar en tres lugares:

- en el texto: después de un tag (`p Hello, {name}`) y en las líneas de texto con `|`;
- en un valor de atributo entre comillas: `title="Open {user.name}"`;
- como valor completo de un atributo: `alt={user.name}` o `src=user.avatar`.

Los toggles de clase (`class:late=order.late`), los argumentos de `@event`, las condiciones de `if`, las listas de `for` y los props de componentes también aceptan una expression. Se describen en sus propias páginas.

::demo in-attributes

En la segunda línea, `src=user.avatar` no tiene llaves ni comillas. Un valor sin adornos es una expression y termina en el primer espacio, así que debe ser una sola "palabra" (sin espacios). Cuando necesites espacios dentro de la expression, enciérrala entre llaves: `alt={user.name}`. Ambas formas significan lo mismo.

> [!NOTE] Las comillas deciden qué es un valor
> `alt="user.name"` es el texto literal `user.name`. `alt=user.name` y `alt={user.name}` leen el state. `alt="{user.name}"` también lee el state, y hay una pequeña diferencia descrita en la sección sobre valores de atributo más abajo.

## Nombres y acceso a miembros

Una palabra sola en una expression es un **nombre**. Se busca en el state que pasas a `render` o, dentro de un bucle `for`, también puede ser la variable del bucle (consulta [condicionales y bucles](page:syntax-control-flow)). Un punto lee una propiedad de un valor.

::demo members

Phone y zip no están en el state en absoluto, y nada se rompió. Cada punto en pavlus es **seguro frente a null**: `user.phone.number` se compila a `((state.user)?.phone)?.number`, así que si cualquier paso del camino es `null` o `undefined`, toda la expression es `undefined`, y `undefined` se renderiza como nada. Nunca tienes que escribir una guarda como `user && user.phone && user.phone.number`.

La expression `?.` también se acepta, y significa lo mismo que `.`:

```pavlus
p {user?.name} is the same as {user.name}
```

Gracias a esto, un template nunca lanza un error porque el state esté incompleto. Eso es útil mientras los datos todavía se están cargando. También significa que un error tipográfico en el nombre de un campo no falla de forma ruidosa: se renderiza como texto vacío. Si un valor no aparece, revisa primero la ortografía.

> [!TIP] Las lecturas se registran por el nombre raíz
> El compilador registra qué nombres lee una expression. `user.address.city` lee `user`. Cuando `diff` compara dos states, primero pregunta "¿es `prev.user` el mismo objeto que `next.user`?" Si lo es, se omite todo el nodo. Si es un objeto nuevo, el texto se recalcula y se compara, y solo se produce un patch si el resultado difiere. Por eso debes reemplazar los objetos en el state en lugar de cambiarlos en el sitio.

## Literales

Una expression puede contener valores literales.

| Tipo | Ejemplos | Notas |
| --- | --- | --- |
| número | `0`, `42`, `3.14`, `.5`, `1e3` | siempre un número de JavaScript |
| cadena | `"text"`, `'text'` | ambos estilos de comillas; `\n`, `\t` y `\r` son escapes, `\x` para cualquier otra `x` es simplemente `x` |
| booleano | `true`, `false` | |
| vacío | `null`, `undefined` | palabras, como en JavaScript |
| array | `[1, 2, 3]`, `[a, b]` | los elementos son expressions |

No hay literales de objeto (`{ a: 1 }`), ni expresiones regulares, ni cadenas de plantilla con acento grave.

Las cadenas son útiles para el valor alternativo de un operador o para el texto de una rama de un ternario, como verás más abajo. Las llaves dentro de una cadena no terminan el hueco: `{"}"}` es un hueco que imprime una llave de cierre.

## Acceso por índice y llamadas

Los corchetes leen un elemento por posición o por clave. El índice es una expression, así que puede venir del state. Como un punto, un índice es seguro frente a null.

::demo indexing

Una llamada tiene la forma `callee(arguments)`. El callee puede ser un nombre o un miembro, así que puedes llamar a métodos de valores que están en el state. Así das formato a un valor en el template:

::demo calls

`{missing.toUpperCase()}` está vacío, no es un error: una llamada también es segura frente a null, y llamar a algo que es `undefined` da `undefined`. Esto oculta errores, igual que el punto, así que úsalo con conocimiento.

El código generado para la llamada es `((state.tags)?.join)?.(", ")`: el método sigue llamándose sobre `state.tags`, así que `this` es correcto.

A una función solo se llega a través del state o a través de un valor en el state. Un template no tiene globales: `Math.round(x)` lee un campo del state llamado `Math`. Si necesitas un valor calculado, calcúlalo en el handler que cambia el state y guarda el resultado en el state (`total`, `visibleItems`, `label`).

> [!WARNING] El encadenamiento opcional es solo para propiedades
> `?.` solo se acepta antes de un nombre de propiedad. `items?.[0]` y `callback?.()` son errores: `Expected property name`. No los necesitas, porque `items[0]` y `callback()` ya son seguros frente a null.

## Operadores

Estos operadores están soportados, de mayor a menor precedencia:

| Operadores | Significado |
| --- | --- |
| `.` `[ ]` `( )` | miembro, índice, llamada |
| `!` `-` `+` (antes de un valor) | not, negar, convertir a número |
| `*` `/` `%` | multiplicar, dividir, resto |
| `+` `-` | sumar (o unir cadenas), restar |
| `<` `>` `<=` `>=` | comparar |
| `==` `!=` `===` `!==` | igual, distinto, estrictamente igual, estrictamente distinto |
| `&&` | y: el primer valor falsy, o el último valor |
| a double bar | o: el primer valor truthy, o el último valor |
| `??` | nullish: el lado derecho solo cuando el izquierdo es `null` o `undefined` |
| `a ? b : c` | ternario, el más bajo |

Las palabras "double bar" representan dos barras verticales, `||`. Un paréntesis `( )` agrupa, como en la aritmética.

::demo operators

Fíjate en estas líneas de la demo:

- `{qty > 1 && "many"}` es `"many"` aquí. Si `qty` fuera 1, el valor sería `false`, que se renderiza como nada: una forma corta de "muestra este texto solo cuando".
- `{qty >= 3 || "few"}` es `true` aquí, y `true` se renderiza como el texto `true`. El resultado de una comparación es un booleano, así que `||` es una herramienta de valor alternativo para valores, no para condiciones. Cuando quieras texto, usa un ternario.
- `{label ?? "no label"}` reemplaza `null`.

La diferencia entre `??` y la barra doble importa para valores como `0`. La barra doble reemplaza todos los valores falsy, `??` solo reemplaza `null` y `undefined`:

::demo nullish

Con `count` igual a `0`, la primera línea recurre a `none` y la segunda muestra el `0`. Usa `??` cuando cero o una cadena vacía sean un valor real.

Dos cosas difieren de JavaScript, así que ten cuidado si copias una expression de tu código. Primero, no hay operadores a nivel de bits, ni `**`, ni `typeof`, `in`, `new`, ni asignación (`=`, `++`), ni operador coma. Segundo, `??` es un operador normal que se puede mezclar con `&&` y `||` sin paréntesis. Se une con menos fuerza que `||`: `a ?? b || c` significa `a ?? (b || c)`.

::demo precedence

En caso de duda, añade paréntesis. No cuestan nada en el código generado, porque el compilador escribe sus propios paréntesis alrededor de cada operación de todos modos.

## El ternario: elegir un valor

`condition ? a : b` elige uno de dos valores. Los ternarios se anidan hacia la derecha, así que una cadena se lee como `else if`:

::demo ternary

En el segundo paso el recuento pasa de 2 a 9: cambian ambas líneas. En el primer paso (de 1 a 2) solo cambia la primera línea, porque `few` sigue siendo `few`. El compilador compara el texto final de cada línea, no las entradas.

Para un trozo entero de la página que aparece o desaparece, usa `if`, no un ternario. Un ternario produce un *valor*; `if` produce *nodos*.

## Arrays

Un literal de array crea un array. Sirve sobre todo para alimentar un método o para elegir un valor por índice.

::demo arrays

## Truthiness

Donde se espera una condición (`?:`, `&&`, `||`, `!`, `if`, `class:name=...`), pavlus usa las reglas de JavaScript, porque el código generado es JavaScript. Estos valores son **falsy**: `false`, `0`, `""`, `null`, `undefined` y `NaN`. Todo lo demás es truthy.

::demo truthiness

Dos de las líneas sorprenden a quienes vienen de otros lenguajes. Un array vacío es truthy, así que `if items` es verdadero para una lista vacía; escribe `if items.length` para preguntar si hay algo dentro. Y la cadena `"0"` es truthy.

## Cómo se escriben los valores como texto

Un hueco en el texto llama a un helper llamado `toText`. Esta es su definición completa, del runtime:

```ts
export function toText(value: unknown): string {
  return value == null || value === false ? "" : String(value);
}
```

Así que `null`, `undefined` y `false` se convierten en la cadena vacía. Todo lo demás se convierte con `String(...)`.

::demo text-values

Esto es deliberado. Hace que `{cond && "text"}` funcione como "muestra el texto cuando la condición se cumple", y hace invisibles los datos que faltan. Fíjate en tres resultados que pueden sorprenderte:

- `0` se muestra como `0`. Normalmente es lo que quieres para un recuento.
- `true` se muestra como la palabra `true`.
- Un objeto no tiene un texto útil: se convierte en `[object Object]`, y un array se convierte en sus elementos unidos por comas. Si ves alguno de los dos, estás imprimiendo un valor completo donde querías un campo.

## Cómo se escriben los valores como atributos

Un atributo es distinto del texto, porque un atributo puede estar *ausente*. El helper es `toAttr`:

```ts
export function toAttr(value: unknown): string | null {
  if (value == null || value === false) return null;
  return value === true ? "" : String(value);
}
```

- `null`, `undefined` y `false` significan **ningún atributo**. El atributo no se renderiza, y cuando estaba antes, `diff` lo quita con un patch `rmAttr`.
- `true` significa un atributo con valor vacío, como `disabled=""`. Así se activa un atributo booleano.
- Todo lo demás es el valor como cadena, incluidos `0` y la cadena vacía.

::demo attr-values

Lee la salida y los tres pasos. `checked={on}` se convirtió en `checked=""`. `disabled=off` está ausente porque `off` es `false`. `title="{note}"` está ausente mientras `note` es `null`, luego el paso lo añade, y el último paso lo quita. `data-count=count` conserva el `0`.

Un atributo sin valor, como `disabled` en `button(disabled)`, no es una expression en absoluto: es el atributo vacío fijo.

### Un hueco, o una cadena con un hueco

Si el valor entre comillas es **solo** un hueco, `title="{note}"`, el compilador lo trata exactamente como `title={note}` y usa `toAttr`. Si el valor tiene otro texto alrededor del hueco, `title="Note: {note}"`, el valor completo es una cadena hecha uniendo piezas, y cada hueco dentro usa `toText`. Una cadena nunca está ausente.

::demo attr-strings

La primera línea no tiene `title` mientras `note` es `null`. La segunda línea tiene `title="Note: "`. Elige la primera forma cuando "sin valor" deba quitar el atributo, y la segunda cuando quieras un prefijo.

Para mostrar u ocultar un atributo con una condición, usa un ternario que devuelva `null`:

::demo ternary-attr

Aquí `data-state` está ausente porque `busy` es false, y `aria-pressed` tiene el texto `"true"` o `"false"`. Esta es también la forma correcta de escribir un atributo que lee una regla de CSS como `[data-state="busy"]`: un booleano `true` sería un valor vacío y no coincidiría.

## Cómo se compila una cadena interpolada

Toma un template con tres huecos y abre el módulo que genera el compilador para él:

::demo compiled open=module

En `render` el texto se construye uniendo las piezas con `+`: las piezas literales son cadenas de JavaScript, cada hueco se envuelve en `toText(...)`. Esta es la línea que escribió el compilador para el template de arriba:

```ts
text: "" + toText((state.user)?.name) + " wrote " + toText(state.count) + " " + toText(((state.count === 1) ? "post" : "posts"))
```

Como esta cadena empieza con un hueco, el compilador pone primero `""`, para que el resultado sea siempre una cadena, incluso si el primer hueco es un número. Una cadena que empieza con texto literal, como `Hello, {name}!`, empieza con ese texto.

`diff` construye la misma expression dos veces, una para `prev` y otra para `next`, y compara las dos cadenas. Por eso el patch es una sola operación `text` con el texto nuevo completo, y por eso un texto sin cambios no produce nada. El comentario `(reads: user, count)` en el código generado es la lista de nombres que lee el nodo. La línea `if (prev.user !== next.user || prev.count !== next.count)` que hay debajo es la guarda que omite el trabajo cuando ninguno cambió.

Cada operador se envuelve en paréntesis en la salida, cada acceso a miembro en `?.`, cada llamada en `?.( )`. Nada se evalúa en tiempo de compilación, y nada en tu expression puede salir fuera del state: la función compilada solo ve `state`, los helpers y los valores que construye ella misma.

## Escapar llaves

Una `{` literal en el texto inicia un hueco. Para escribir una llave, pon una barra invertida antes. Una `}` que no cierra un hueco se puede escribir tal cual.

::demo escapes

`\{` y `\}` son los únicos escapes en el texto. Dentro de un valor de atributo entre comillas también funcionan. Las comillas son distintas: dentro de `"..."` no puedes escribir una comilla doble (la barra invertida se queda en el valor), así que usa comillas simples alrededor del valor, `title='He said "hi"'`, o pon la cadena en un hueco.

## Qué no está soportado

El lenguaje es pequeño a propósito. El compilador es más fácil de razonar, cada dependencia de un nodo se puede listar en tiempo de compilación, y un template no puede ejecutar código arbitrario. Esto es lo que probarás primero, y el error real que obtienes.

```pavlus-invalid
p {items.map(x => x.name)}
```

Una función flecha: `Unexpected character "=" (line 1, col 16)`.

```pavlus-invalid
p {`Hello ${name}`}
```

Una cadena de plantilla: `Unexpected character "`" (line 1, col 4)`. Usa `"Hello {name}"` en un atributo, o texto con huecos, en su lugar.

```pavlus-invalid
p {count = 1}
```

Asignación: `Unexpected character "=" (line 1, col 10)`. El template nunca cambia el state. Los eventos lo hacen, enviando messages a tu código.

```pavlus-invalid
p {typeof user}
```

Operadores de JavaScript que no están en la tabla: `Unexpected "user" (line 1, col 11)`. La palabra `typeof` se lee como un nombre, y entonces `user` no tiene ningún operador delante.

```pavlus-invalid
p {a, b}
```

El operador coma: `Unexpected "," (line 1, col 5)`. Las comas solo separan argumentos de llamadas y elementos de arrays.

```pavlus-invalid
p {}
```

Un hueco sin nada dentro: `Empty expression (line 1, col 4)`.

```pavlus-invalid
p {name
```

Un hueco que nunca se cierra: `Unclosed { (line 1, col 1)`.

La respuesta común a todo esto es la misma: haz el trabajo donde cambia el state, en un handler, y guarda en el state un valor listo para mostrar. Un template entonces solo lee valores y elige entre ellos.

## Todo junto

Este resumen de un pedido usa acceso a miembros, una llamada a un método, un ternario, una comparación, `??`, `class:` y un hueco en un atributo.

::demo all-in-one

En el paso, se quita el cliente. Cambian dos cosas, y nada más: el atributo `title` (una cadena con un hueco, así que se recalcula como `Placed by someone`) y el texto del párrafo. El encabezado y el recuento de líneas leen `order`, que no cambió de identidad en el paso, así que sus comprobaciones se omiten con la primera comparación.

Tanto `order.customer?.name ?? 'someone'` como `order.customer.name ?? 'someone'` funcionarían. El `?.` es solo un recordatorio para el lector.

## Lo que aprendiste

- `{expr}` puede estar en el texto, en un valor de atributo entre comillas, o ser el valor completo de un atributo (`alt={x}` o `alt=x`).
- El lenguaje tiene literales, nombres, `.` y `[ ]` (ambos seguros frente a null), llamadas, operadores unarios y binarios, `?:` y arrays. No se asigna nada, y no hay funciones flecha ni cadenas de plantilla.
- `null`, `undefined` y `false` son texto vacío y un atributo ausente; `true` es un atributo vacío; `0` y `""` son valores.
- El compilador convierte una cadena con huecos en `"literal" + toText(expr) + ...` y compara el resultado de `prev` y `next` para decidir un patch.

Siguiente: [eventos y mensajes](page:syntax-events).
