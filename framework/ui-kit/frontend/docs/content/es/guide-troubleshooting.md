---
summary: Problemas reales y sus soluciones. Errores de template con los mensajes exactos, los errores comunes (comillas, keys que faltan, mutación, handlers que no devuelven nada), problemas de configuración y despliegue, cómo depurar con el logger y el compilador, y una lista de preguntas frecuentes.
---
## Cómo leer un problema

Los problemas en una aplicación pavlus vienen de tres lugares, y cada uno se muestra de una manera distinta.

- **Un template no compila.** El error llega en tiempo de compilación, desde el plugin de Vite, con la ruta del archivo y una posición: `(line 3, col 5)`. Las líneas y las columnas empiezan en 1.
- **La aplicación lanza una excepción en tiempo de ejecución.** El mensaje empieza con `pavlus:` (o `pavlus/dom:`, `pavlus/ssr:`, `pavlus/ws:`) y dice qué está mal y, la mayoría de las veces, qué hacer. Está en la consola del navegador.
- **No pasa nada.** No hay ningún mensaje. Son los más difíciles, y la mayor parte de esta página trata de ellos. La regla que debes recordar: un message que nadie maneja no es un error, es una lista vacía de effects.

Si te sientes perdido, recorre esta lista en orden. Encuentra casi todos los "no pasa nada".

1. Abre la consola. ¿Hay un error `pavlus:`?
2. ¿Es correcto el nombre del message? Registra cada paso (mira "Depuración" más abajo) y busca el message que esperas.
3. ¿El handler devolvió el effect que esperas?
4. ¿Está registrado en `createApp({ plugins })` el plugin para ese effect?
5. ¿Cambió el state? En desarrollo, mira `pavlus.store.getState()`.
6. ¿El template lee ese campo? Un nodo que no lee un campo nunca cambia cuando cambia el campo.

## Errores de template

El compilador se detiene en el primer error. Estos son los mensajes reales, producidos al pasar los templates por `compileTemplate`. Vite los muestra con la ruta del archivo delante.

| Escribiste | El mensaje empieza con | La solución |
| --- | --- | --- |
| Un tabulador en la indentación | Tabs are not allowed | Indenta con espacios. Dos es la convención. |
| Una línea indentada 4 bajo un padre y la siguiente 2 | Inconsistent indentation | Cada nivel debe usar el mismo paso. |
| `a(href=url` | Unclosed ( | Cierra la lista de atributos. |
| `p Hello {name` | Unclosed { | Cierra la expresión, o escribe `\{` para una llave literal. |
| `p(title="abc) x` | Unterminated string | Cierra la comilla. |
| `p {items.map(x => x)}` | Unexpected character "=" | Sin funciones flecha. Calcula el valor en el handler. |
| `p {a = 1}` | Unexpected character "=" | Una expresión lee; nunca asigna. |
| Un template literal entre llaves | Unexpected character | Sin template literals. Usa `"a " + b`. |
| `button(@click) Go` | "@click" needs an expression value | Escribe `@click=save`. |
| `button(@click=1+2) Go` | Event handler must be a message id | Un evento es un id de message, opcionalmente con argumentos. |
| Un `else` sin `if` encima | else without matching if | Pon `else` justo después del bloque `if`, con la misma indentación. |
| `+Row#r(a=1)` sin import | "Row" is not imported | Añade la línea `import Row from "..."` al principio. |
| Un `import` debajo del primer elemento | import lines must be at the top of the file | Muévelo. |
| `import row from "..."` | cannot be used as a component name | Un componente empieza con mayúscula. |
| `+outlet(a=1)` | +outlet takes nothing after it | Escribe `+outlet` y nada más. |
| Un hijo bajo una línea de texto (una línea que empieza con el carácter barra vertical) | This line cannot have children | Solo los elementos tienen hijos. |
| `p {}` | Empty expression | Pon algo entre las llaves. |

Y el texto exacto de cada uno, para buscarlo:

```text
Tabs are not allowed, use spaces (line 2, col 1)
Inconsistent indentation (line 3, col 1)
Unclosed ( (line 1, col 2)
Unclosed { (line 1, col 7)
Unterminated string (line 1, col 9)
Unexpected character "=" (line 1, col 16)
Unexpected character "`" (line 1, col 4)
"@click" needs an expression value (line 1, col 8)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
"Row" is not imported. Add `import Row from "..."` or use +{Row} for a component that comes from the state (line 1, col 2)
`import` lines must be at the top of the file (line 2, col 1)
"row" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
`+outlet` takes nothing after it (line 1, col 8)
This line cannot have children (line 2, col 1)
Empty expression (line 1, col 4)
```

Dos templates que parecen incorrectos se aceptan, y eso es un error de quien escribe, no del compilador: `if` sin nada detrás y `for x todos` (sin `in`) no coinciden con las palabras clave, así que cada uno se lee como un **elemento** llamado `if` o `for`. La página muestra `<if>` en el DOM. Si aparece un elemento con un nombre así, revisa la línea.

## Las comillas deciden qué es un valor

Este es el primer error más común. `href="url"` es el texto `url`. `href=url` es el campo `url` del state. Ambos son válidos, así que el compilador no puede avisar.

::demo quotes-text

::demo quotes-expression

La primera demo tiene el link `href="url"`, un string simple, sea cual sea el state. La segunda lee el state: su HTML tiene la dirección, y cuando `url` cambia es un solo patch `attr`. Si un link va a `/url` o un atributo muestra el nombre de un campo, busca llaves que faltan y comillas no deseadas. El texto en un template es lo contrario: `p Hello, name` es el texto `name`, y `p Hello, {name}` lee el campo.

Para mostrar una llave como texto, escápala:

::demo braces

## Un `for` sin `key`

`key` es opcional. Sin ella, el **índice** del elemento es su identidad. La página funciona, pero eliminar un elemento del principio parece un cambio de cada elemento posterior. Compara los patches del mismo cambio, eliminar el primero de tres personas.

::demo keyed

::demo unkeyed

Con `key person.id` el patch es un solo `remove` del bloque de Ann. Sin la key, se elimina el último bloque, y el texto de los dos que quedan se **reescribe** (`Bob` pasa al primer bloque, `Eve` al segundo). Con texto el resultado es el mismo. Con cualquier cosa que tenga vida propia, no: un input en el que el visitante escribió, un foco, un scroll, una animación CSS en marcha se queda en su posición en la lista en lugar de moverse con el elemento. Dale una key a una lista siempre que se puedan insertar, eliminar o reordenar elementos.

## Mutar el state

El `diff` compilado compara con `===`. Si cambias un array en su sitio, el siguiente state contiene el mismo array, la comparación dice "nada cambió", y no se aplica ningún patch. El store tiene la misma regla: `store.set` del mismo valor no registra nada.

::demo mutation

En el primer paso el array se cambió con `push` y se pasó de nuevo. La lista de patches está vacía, aunque el array tiene una tercera persona. En el segundo paso se pasa un array nuevo, y el diff inserta el elemento. En un handler, esto significa:

```ts
// wrong: the same array, the page does not change
state.items.push(todo);
return [store.set("items", state.items)];

// right: a new array
return [store.set("items", [...state.items, todo])];
```

Lo mismo se aplica a los objetos (`{ ...todo, done: true }`) y al `.sort()` de un array (ordena una copia). TypeScript ayuda si declaras el state con campos `readonly` y `ReadonlyArray`.

## Problemas con los handlers

**El handler devuelve algo que no es un array.** Este tiene un mensaje claro:

```text
pavlus: handler "add" must return an array of effects
```

La causa habitual es `return store.set("a", 1)` en lugar de `return [store.set("a", 1)]`. Un handler que no tiene nada que hacer devuelve `[]`.

**No se encuentra el handler.** Este no tiene mensaje. Un clic en `@click=remvoe(todo.id)` envía el message `remvoe`, nadie lo maneja, y el resultado es una lista vacía de effects. Errores tipográficos en el nombre, un handler que es `_private` (los nombres que empiezan con `_` y los miembros `#` nunca son messages): todos dan silencio. Para detectarlo, registra cada paso con la opción `onStep` de `createApp`:

```ts
const app = createApp({
  app: shell,
  plugins,
  onStep: (message, effects) => {
    if (effects.length === 0) console.debug(`${message.id}: no effects`);
  },
});
```

Esta es su salida en un contador que maneja `inc` y al que se envía `incc`:

```text
inc -> 1 effect(s)
incc -> 0 effect(s)  <- nobody handled it?
```

Algunos messages legítimamente no tienen effects (un clic que solo importa en un padre), así que lee la lista, no trates cada línea como un bug.

**El id de un message de un hijo es incorrecto.** Un evento de un hijo embebido como `+Row#row` se envía como `row.select`. El padre lo maneja con un nombre de método entre comillas: `"row.select"(msg) { ... }`. Un handler llamado `select` en el padre nunca lo recibe. Para un hijo anidado los ids se unen: `grid.card.add`.

**`ctx.send` a un hijo que no existe** lanza una excepción: `pavlus: no child "nope" to send "x" to`.

**Una clase en lugar de una instancia.** `createApp({ app: Todos })` se rechaza con `pavlus: Todos is a class: pass an instance (new Todos()), not the class`. Un objeto simple también se rechaza: `pavlus: a component is a function or an instance of a class extending Component, got a plain object (defineComponent is gone: write a class that extends Component)`.

**`store.set` con un path equivocado** no falla. Crea los padres que faltan, así que un error tipográfico (`"itemz"`) crea un campo nuevo, y el template que lee `items` no cambia. Mira el state en la consola, y el historial.

## Errores de configuración y de plugins

Se lanzan cuando la aplicación arranca o cuando se ejecuta un effect. Cada uno nombra su solución.

```text
pavlus: no plugin "http" for effect "request"
pavlus: duplicate plugin "store"
pavlus: `mount` needs the dom plugin (new DomPlugin())
pavlus/dom: target "#nope" not found
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
pavlus/ws: no connection "chat"
pavlus: more than 10000 messages in one tick (message loop?)
```

- **no plugin** significa que un handler devolvió un effect para un plugin que no está en la lista. Regístralo, o escribiste mal el nombre del plugin.
- **target not found** significa que el elemento para `mount` no está en `index.html`, o que el script se ejecutó antes de que estuviera allí. Pon el script al final de `<body>`, o usa `type="module"`, que se difiere.
- **two children named** es una tabla de routing con dos entradas que terminan en el mismo segmento. La página sobre [Enrutamiento](page:concepts-routing) explica `name`.
- **+outlet needs a component** significa que se montó una view con un outlet sin su componente. Monta el componente, no `component.view`.
- **message loop** significa que los handlers se responden unos a otros sin parar. El caso habitual es un message de un plugin (una respuesta) manejado por un handler que envía la petición otra vez.
- **ws: no connection** significa un `send` antes del message `onOpen`, o después de que el socket se cerró.

### Tipos: `Cannot find module './page.pavlus'`

TypeScript no conoce los archivos `*.pavlus`. La declaración está en el framework, y tu proyecto debe incluirla. En `src/env.d.ts`:

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@pavlus/frontend/env" />
```

Sin la línea `pavlus/env`, cada import de un template da este error. Un proyecto con ambas líneas compila sin problemas:

```text
src/app.ts(2,23): error TS2307: Cannot find module './about.pavlus' or its corresponding type declarations.
```

### Imports con `?raw`

A veces quieres el **texto** de un template, no el módulo compilado. El ui-kit lo hace para su pestaña Source: muestra el template, la lógica y los estilos de cada página. El sufijo `?raw` de Vite entrega el archivo como un string, y el plugin de pavlus deja en paz los imports con `?raw`, `?url` e `?inline`:

```ts
import source from "./about.pavlus?raw";
import view from "./about.pavlus";
```

Ejecutado en un test, el primero es el texto, `section.about\n  h1 About\n  p A todo list`, y el segundo es la view con `render`, `diff` y `meta`. Una cosa sale mal. La declaración `pavlus/env` cubre `*.pavlus`, no `*.pavlus?raw`, así que sin `/// <reference types="vite/client" />` TypeScript dice `Cannot find module './about.pavlus?raw'`.

Para una carpeta entera, `import.meta.glob` con las opciones `{ query: "?raw", import: "default" }` devuelve una tabla de loaders perezosos, un chunk por archivo, que es lo que hace el plugin source del ui-kit.

## Un 404 en un host estático

Todo funciona con `npm run dev`, y en el sitio publicado un clic en un link funciona pero una recarga da "404 Not Found". O el sitio está en `/pavlus/` y cada página dice "Page not found".

- **La recarga da un 404.** Un host estático busca un archivo en esa ruta. Una aplicación de una sola página solo tiene `index.html`. Haz que el host responda a cada ruta desconocida con `index.html`. En GitHub Pages, donde no puedes cambiar las reglas, copia `index.html` a `404.html` al compilar; el ui-kit lo hace con un pequeño plugin de Vite. El código está en [Enrutamiento](page:concepts-routing).
- **"Page not found" bajo un prefijo.** El router ve `/pavlus/button`, y ningún patrón coincide con eso. Dale al plugin router una `window` que oculte el prefijo (`windowAt(root)` en el ui-kit) y construye los `href` con ella. Establece también `base` en la configuración de Vite, para que los scripts y estilos se pidan a `/pavlus/assets/...` y no a `/assets/...`.
- **Las imágenes y los iconos dan 404.** En `index.html` usa `%BASE_URL%favicon.svg`, y en el código `import.meta.env.BASE_URL`.

## Depuración

### Registra lo que ocurre

El plugin logger imprime entradas. No sabe lo que pasó, así que se lo pides. `withLogging(component, label)` pide cada message de un componente, y es la forma más rápida de ver lo que hace la aplicación:

```ts
createApp({
  app: withLogging(shell, "shell"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin(), new DomPlugin()],
  mount: "#app",
});
```

Para un message `inc` con el payload 5, el logger recibe esta entrada:

```json
["[counter] inc -> 1 effect(s)", { "payload": 5, "effects": ["store.set"] }]
```

La entrada es una entrada de nivel `debug`. Algunos navegadores ocultan los mensajes `debug` por defecto (en Chrome, cambia la consola al nivel Verbose para verlos). El wrapper añade un effect, así que el plugin logger debe estar registrado, o el core lanza `no plugin "logger"`.

### Explora la aplicación en desarrollo

El ui-kit expone la aplicación y el store, solo en desarrollo:

```ts
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
```

En la consola puedes entonces enviar un message, leer el state y volver atrás en el tiempo, porque el store registra cada cambio con el effect que lo deshace:

```text
pavlus.app.dispatch({ id: "header.toggleSidebar" })
pavlus.store.getState().sidebar
pavlus.store.history.length
pavlus.store.history.at(-1)
```

`store.undo()` y `store.restoreTo(timestamp)` son effects, así que los aplicas como cualquier otro: desde un handler, o mediante las herramientas de desarrollo.

### Mira la salida del compilador

Un template son dos funciones puras, y puedes llamarlas tú mismo. `compileToView` de `@pavlus/frontend/compiler` compila un string y te da `render` y `diff`, sin Vite:

```ts
import { compileToView } from "@pavlus/frontend/compiler";

const view = compileToView("p Hello, {name}");
console.log(JSON.stringify(view.render({ name: "Ann" })));
console.log(JSON.stringify(view.diff({ name: "Ann" }, { name: "Bob" })));
```

La primera línea imprime los **vnodes**, la segunda los **patches**:

```json
[{"t":"el","tag":"p","attrs":{},"events":{},"children":[{"t":"text","id":"1","text":"Hello, Ann"}]}]
[{"op":"text","id":"1","text":"Hello, Bob"}]
```

Los vnodes muestran los atributos reales y los eventos como datos (`events.click` es el message que enviará el clic). Los patches muestran lo que cambiaría en el DOM. Si una lista de patches está vacía cuando esperabas un cambio, o bien el state es el mismo objeto (una mutación) o bien el nodo no lee ese campo. Las demos de estas páginas muestran los mismos datos, y cada demo puede desplegar el AST: la línea `reads: people` bajo un nodo dice qué campos pueden cambiarlo.

Los templates compilados son JavaScript legible, tanto en desarrollo como en el bundle. Abre un módulo `.pavlus` en el panel Sources de DevTools (el archivo se llama algo como `todos.pavlus?import`). Los comentarios `// line 12: <li> (reads: user, selectedId)` dicen de qué línea del template viene un bloque y de qué depende. A propósito no hay source map: DevTools muestra el código generado, que es lo que se ejecuta.

### Prueba la página, no solo el handler

Cuando el bug está en el template, pruébalo con `mountView` de `@pavlus/frontend/testing`, que monta una view en jsdom sin el core. Este es un test para un template de contador:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });
expect(h.root.textContent).toContain("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
```

## Preguntas y respuestas

- **¿Puedo usar una función flecha o un template literal en un template?** No, ambos son errores de compilación. El lenguaje de expresiones es un subconjunto pequeño y puro de JavaScript: paths (seguros frente a null), literales, operadores, el operador condicional, literales de array, acceso por índice (`items[0]`) y llamadas. Una llamada a un método de un valor funciona: `{name.toUpperCase()}` muestra `ANN` para `ann`. Las llamadas también son seguras frente a null, y eso oculta errores tipográficos: `{fmt(name)}` llama al campo `fmt` del state, y cuando no existe ese campo muestra un texto vacío y ningún error. Todo lo que sea más largo que una expresión corta pertenece al handler: calcúlalo allí y guarda el resultado en el state.
- **¿Cómo muestro una lista filtrada u ordenada?** Calcúlala en el handler, guárdala con `store.set` y recorre la lista guardada con un bucle. La [guía](page:guide-todo-app) lo hace para un filtro.
- **¿Dónde pongo el código asíncrono?** En ningún sitio de un handler. Un handler devuelve effects, y un plugin hace el trabajo asíncrono y responde con un message. Para una petición usa `http.request`, para un temporizador `time.setTimeout`.
- **¿Cómo leo lo que escribió el usuario?** `msg.event?.value` para `@input`, `msg.event?.checked` para el `@change` de un checkbox y `msg.event?.key` para los eventos de teclado. El input conserva lo que el usuario escribió; `value=field` solo lo inicializa y sigue los cambios posteriores del campo.
- **¿Por qué mi página muestra un valor vacío en lugar de un error cuando falta un campo?** Los paths en los templates son seguros frente a null. `{user.name}` es un texto vacío cuando `user` es `null`. Los handlers son TypeScript normal y no son seguros frente a null: usa `?.` allí.
- **¿Cómo obtengo la hora o un número aleatorio?** Pídeselo a un plugin. `time.now("stamped")` responde con la hora como un message; un plugin aleatorio son unas pocas líneas, y [Escribir tu propio plugin](page:plugins-custom) lee uno.
- **¿Cómo ejecuto algo cuando arranca la aplicación?** Maneja `mounted` en el componente raíz (se envía cuando la aplicación está en el DOM), o pasa `init: { id: "start" }` a `createApp`. En una página con routing, maneja `enter`.
- **¿Cómo detengo un temporizador cuando salgo de una página?** Maneja `leave` y devuelve `time.cancel(id)`.
- **¿Pueden dos componentes tener un message con el mismo nombre?** Sí. Los hijos tienen su propio espacio de nombres: el `select` de un hijo es `row.select` para su padre. No se permiten dos hermanos con el mismo nombre de instancia.
- **¿Cómo llamo a un handler `users.remove`?** Con un nombre de método entre comillas: `"users.remove"(msg: Message) { ... }`.
- **¿Puede un componente guardar datos en un campo de la clase?** No datos que cambian. La instancia la comparten todos los messages, así que debe estar libre de state mutable. Guarda los datos en el store.
- **¿Puedo dibujar con SVG?** No como elementos. El plugin dom crea elementos sin un espacio de nombres XML, así que una etiqueta `svg` no se dibujaría. El ui-kit usa máscaras CSS para los iconos, y cajas, degradados y emoji para los dibujos.
- **¿Puedo usar pavlus sin Vite?** El compilador es una función simple: `compileTemplate(source)` devuelve el texto de un módulo ES. El plugin de Vite es la integración que existe, y todo lo de estas páginas la da por supuesta.
- **¿Por qué mi primer render está vacío?** Porque `route` es `null` hasta que el plugin router informa. Monta primero, luego `mounted` inicia `router.listen`. Si usas tu propio `mounted`, también tiene que devolver `router.listen("routeChanged")`.
- **¿Funciona el renderizado en servidor con todos los plugins?** No. Dale al servidor sustitutos para los plugins del navegador; mira [Renderizado en servidor](page:concepts-ssr).

## Lo que aprendiste

- Un error de template lleva una línea y una columna. Un error en tiempo de ejecución empieza con `pavlus:` y nombra su solución. Un fallo silencioso casi siempre es un message que nadie maneja o un effect que nadie ejecutó.
- Las comillas hacen texto, sin comillas hacen un campo. Una lista que cambia necesita una `key`. El state nunca se muta.
- `onStep`, `withLogging`, `compileToView` y la consola de desarrollo muestran los messages, los effects, los vnodes y los patches.
- Un host estático necesita un fallback a `index.html`, y un sitio bajo un prefijo necesita una window del router que lo oculte.

Has llegado al final de la documentación. La [visión general](page:overview) lista todas las páginas, y el [Playground en vivo](page:compiler-playground) te permite probar un template propio.
