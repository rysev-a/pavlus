---
summary: Un template es un árbol indentado de elementos. Aprende a escribir tags, clases, ids, texto y atributos, desde un párrafo de una línea hasta una pequeña tarjeta.
---
## El template más pequeño

Un template de pavlus es un archivo de texto, normalmente llamado `algo.pavlus`. Cada línea es una sola cosa: un elemento, un trozo de texto o una palabra clave. La **indentación** dice qué está dentro de qué, como en Python o YAML. No hay tags de cierre ni llaves alrededor de los bloques.

El template útil más pequeño es una línea: el nombre de un tag seguido de su texto.

::demo hello

La demo de arriba la compila el compilador real, ahora mismo, en tu navegador. Ves el template, el HTML que produjo `render` y, más abajo, el módulo que generó el compilador. Abre las secciones plegadas cuando tengas curiosidad; el resto de esta página solo usa las dos primeras.

> [!TIP] Espacios, no tabuladores
> Indenta con dos espacios. Una línea indentada más que la anterior se convierte en su hija; una línea indentada menos termina el bloque.

## Clases e ids

Después del nombre del tag puedes añadir clases con un punto y un id con una almohadilla, en el mismo orden en que escribirías un selector de CSS. El nombre del tag se puede omitir: `.card` significa `div.card`.

::demo selectors

Varias clases se encadenan: `a.btn.btn-primary`. Sin tag el elemento es un `div`, así que `#app` es `<div id="app">`.

## Texto

El texto después del tag, en la misma línea, es el primer hijo del elemento. Para contenido más largo o mezclado, pon el texto en líneas propias que empiecen con una barra vertical `|`. Cada línea con `|` es un nodo de texto, y el texto puede contener `{expressions}` (consulta la página siguiente).

::demo text-lines

Una línea que empieza con `//` es un comentario. Nunca llega a la salida.

## Atributos

Los atributos van entre paréntesis después del tag, separados por espacios. Un valor puede ser una cadena entre comillas, un literal de tipo número o una expression.

::demo attributes

- `type="button"` es una cadena simple.
- `disabled` sin valor es un atributo booleano: está presente, y significa *true*.
- `href=url` no tiene comillas, así que `url` es **una expression**: lee el campo `url` del state.
- `title="Open {name}"` es una cadena con un hueco; el compilador la convierte en una concatenación.

> [!NOTE] Las comillas deciden qué es un valor
> `class="x"` es el texto `x`. `class=x` es el campo `x` del state. Este es el primer error más común, y el compilador no puede avisar de él, porque ambas formas son válidas.

## Activar y desactivar una clase

Una clase estática se escribe con un punto. Una clase que depende del state se escribe como un atributo llamado `class:name`, con una condición como valor. La clase está en el elemento cuando la condición es verdadera.

::demo class-toggle

Fíjate en el segundo paso de la demo: solo se aplica un patch al atributo `class`, nada más. Cómo sabe el compilador qué debe parchear es el tema de la [sección del compilador](page:compiler-diff).

## Todo junto

Aquí tienes una pequeña tarjeta que usa todo lo de esta página. Léela desde arriba: el `div` exterior, un encabezado con un id, un párrafo y luego un botón con varios atributos.

::demo card open=ast

La sección AST muestra, para cada nodo, la parte del state que lee. Los nodos con *reads: none* nunca pueden cambiar, así que el `diff` generado los omite por completo.

## Lo que aprendiste

- Una línea es un elemento: `tag.class#id(attr=value) text`.
- La indentación es el anidamiento. Un `|` inicial crea una línea de texto. `//` crea un comentario.
- Los valores entre comillas son texto, los valores sin comillas son expressions, `class:name=cond` activa o desactiva una clase.

Siguiente: [expresiones e interpolación](page:syntax-expressions).
