---
summary: Construye un contador que funciona y luego una pequeña lista de notas con un input, desde una carpeta vacía. Después sigue un clic a través del framework, message por message, y mira los patches que produce.
---
## Lo que vas a construir

Vas a construir dos programas pequeños. El primero es un contador: un párrafo y un botón. El segundo es una lista de notas con un input de texto. Juntos usan todas las partes de una aplicación pavlus: un template, una clase de componente con handlers, un store para el state y un plugin DOM que muestra el resultado y escucha los eventos.

Al final seguirás un solo clic a través del framework, un message a la vez, y verás exactamente qué cambia en la página.

Necesitas Node.js y un gestor de paquetes. El código es TypeScript, pero nada de lo que sigue requiere más que tipos básicos.

## Prepara el proyecto

Un proyecto pavlus es un proyecto normal de [Vite](https://vite.dev) con un plugin adicional. El plugin compila cada archivo `.pavlus` a JavaScript cuando lo importas. Empieza con un `package.json`. El framework es el paquete `@service-laboratory/pavlus`.

```json package.json
{
  "name": "counter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@service-laboratory/pavlus": "*"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "^8.3.5"
  }
}
```

La configuración de Vite añade el plugin de pavlus. Tiene un único ajuste opcional, `runtime`, que cambia de dónde importan los templates compilados sus pequeñas funciones auxiliares. No lo necesitas ahora.

```ts vite.config.ts
import { pavlus } from "@service-laboratory/pavlus/vite";

export default { plugins: [pavlus()] };
```

La página es un elemento vacío que la aplicación rellenará, y un script.

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

TypeScript necesita saber qué devuelve `import view from "./counter.pavlus"`. Un archivo de declaración lo resuelve. El framework lo incluye.

```ts env.d.ts
/// <reference types="@service-laboratory/pavlus/env" />
```

## El primer template

Crea `counter.pavlus`. Un template es un árbol indentado de elementos. `{count}` es una expression que lee el campo `count` del state. `@click=inc` indica que un clic en el botón envía el message con el id `inc`.

```pavlus counter.pavlus
div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me
```

Fíjate en lo que no está aquí. No hay ninguna función que se ejecute al hacer clic. El template solo nombra un message. Lo que ocurre con ese message se decide en otro sitio, en código que puedes probar por separado.

## El componente

Crea `counter.ts`. Un componente es una clase que extiende `Component`. Su campo `view` es el template. Cada otro método es el **handler** del message con el mismo nombre, así que el método `inc` maneja el message `inc`.

Un handler recibe el message y el state actual. Devuelve una lista de effects. Este devuelve un solo effect, construido con el helper `store.set` del plugin store: "pon el campo `count` en el valor anterior más uno".

```ts counter.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./counter.pavlus";

export interface CounterState {
  count: number;
}

export class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }
}

export const counter = new Counter();
```

> [!TIP] Anota los parámetros
> TypeScript no infiere los tipos de los parámetros de los métodos de una clase. Escribe tú mismo `msg: Message` y el tipo de tu state. El primer parámetro suele quedar sin usar, así que llámalo `_msg`.

## Inicia la aplicación

Crea `main.ts`. `createApp` conecta el componente con sus plugins. Ahora necesitas dos plugins. El plugin **store** guarda el state y empieza con el objeto que le des. El plugin **DOM** renderiza las views y convierte los eventos del navegador en messages. La opción `mount` nombra el elemento donde se renderiza.

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { counter, type CounterState } from "./counter.ts";

createApp<CounterState>({
  app: counter,
  plugins: [createStorePlugin<CounterState>({ count: 0 }), createDomPlugin()],
  mount: "#app",
});
```

Ejecuta `npx vite`, abre la dirección que imprime y haz clic en el botón. El número sube. Aquí tienes el mismo template como demo en vivo, con los dos patches que devuelve el `diff` del compilador para los dos primeros clics:

::demo counter

Cada clic produce exactamente un patch, de tipo `text`. Nombra el nodo por su id y da el texto nuevo. Nada más en la página se toca, porque nada más lee `count`.

> [!NOTE] De dónde viene el state
> El primer state es el objeto que pasas a `createStorePlugin`. Todo campo que lea un template debe estar en él, o el template leerá `undefined`. El store guarda un objeto plano, y los handlers nunca lo cambian. Devuelven effects `set` y el store crea un objeto nuevo.

## Sigue un clic

Ahora el recorrido prometido. Esto es todo lo que ocurre, en orden, desde el clic hasta el texto cambiado. Cada línea es un paso real de `createApp`.

1. **Inicio.** `createApp` inicializa los plugins, renderiza la view en `#app` y despacha el message `{ id: "mounted" }`. El contador no tiene un handler `mounted`, así que no devuelve effects.
2. **El clic.** El plugin DOM puso un listener en el botón. Lee el message que el template dio a este botón, `{ id: "inc" }`, añade un resumen del evento del navegador y despacha `{ id: "inc", event: { type: "click", value: "" } }`. El `value` es la propiedad value del botón, una cadena vacía.
3. **La cola.** El core pone el message en su cola. Los messages se procesan de uno en uno.
4. **El handler.** El core llama a tu código con el message y el state actual `{ count: 0 }`. El método `inc` devuelve `[{ plugin: "store", type: "set", path: "count", value: 1 }]`.
5. **El effect.** El core entrega ese effect al plugin nombrado en él, `store`. El store construye un nuevo state `{ count: 1 }`.
6. **El state cambió.** El core lee el state de nuevo. Es un objeto distinto, así que todos los plugins reciben `onState(next)`.
7. **El diff.** El plugin DOM llama a `diff(prev, next)` de la view. El resultado es un patch, `{ op: "text", id: "2", text: "Clicked 1 times" }`, y el plugin pone ese texto en el nodo con el id `2`.

Toda la cadena es dato plano en el medio: un message, una lista de effects, una lista de patches. Puedes imprimir cualquiera de ellos.

## Una lista con un input

El segundo programa necesita más del lenguaje. Tiene un input de texto, un formulario que añade una nota y una lista con un botón para quitar cada nota. También necesita más state: el texto que se está escribiendo, las notas y un contador que da un id a cada nota.

::demo notes-list

Guarda este template como `notes.pavlus` (la demo muestra su código). Léelo desde arriba. `input(value=draft ... @input=setDraft)` muestra el campo `draft` y envía `setDraft` en cada pulsación de tecla. `form(@submit.prevent=add)` envía `add` cuando se envía el formulario, y `.prevent` evita que el navegador recargue la página. El bucle `for note in notes key note.id` repite el `li`, y el `key` permite a `diff` distinguir qué nota es cuál cuando cambia la lista. `@click=remove(note.id)` envía el message `remove` con el id de la nota como **payload**.

El componente sigue al template, un handler por message:

```ts notes.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./notes.pavlus";

export interface Note {
  id: number;
  text: string;
}

export interface NotesState {
  draft: string;
  notes: Note[];
  nextId: number;
}

export class Notes extends Component<NotesState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  add(_msg: Message, state: NotesState) {
    const text = state.draft.trim();
    if (text === "") return [];
    return [
      store.set("notes", [...state.notes, { id: state.nextId, text }]),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
    ];
  }

  remove(msg: Message, state: NotesState) {
    return [
      store.set(
        "notes",
        state.notes.filter((note) => note.id !== msg.payload),
      ),
    ];
  }
}

export const notes = new Notes();
```

Tres cosas merecen una mirada más de cerca:

- `setDraft` lee `msg.event?.value`. El plugin DOM adjunta `event` a cada message que viene de la página, y para un input `value` es el texto que contiene ahora.
- `add` devuelve tres effects. Se aplican en este orden. Cuando el texto está vacío devuelve una lista vacía, que significa "no debe pasar nada".
- `remove` lee el id de `msg.payload`. El template escribió `remove(note.id)`, y un argumento se convierte en el payload.

El `main.ts` es el mismo de antes, con `app: notes` y el state inicial `{ draft: "", notes: [], nextId: 1 }`.

## Qué hacen una pulsación y un envío

Con el programa de notas en marcha, los mismos siete pasos se repiten para cada message, pero los patches son más ricos. Los tres pasos de la demo de arriba los muestran.

- **Escribir.** El message es `{ id: "setDraft", event: { type: "input", value: "Call Ann" } }`. El handler devuelve un `set` para `draft`. El único patch es un patch `attr` para el `value` del input. La lista y el contador no se tocan.
- **Enviar.** El message es `{ id: "add", event: { type: "submit" } }`. Se ejecutan tres effects `set`, en orden, y después se avisa una vez a los plugins del nuevo state. Los patches: el `value` del input vuelve a una cadena vacía, un `insert` añade la nota nueva y un patch `text` actualiza el contador.
- **Quitar.** El message es `{ id: "remove", payload: 1, event: { type: "click", value: "" } }`. Un patch `remove` saca la nota, y el contador cambia.

Los patches los produce `diff` solo a partir del state. El componente nunca dice "inserta un nodo". Dice cómo debe ser el state, y el template compilado calcula los cambios del DOM.

> [!WARNING] Nunca cambies el state en el sitio
> No escribas `state.notes.push(note)` en un handler. El store te da el state actual para leerlo. `diff` decide que algo cambió comparando con `===`, así que un array mutado parece no haber cambiado y la pantalla no se actualizaría. Devuelve siempre un array nuevo, como hace `add` con `[...state.notes, ...]`.

## Lo que aprendiste

- Un proyecto pavlus es un proyecto de Vite con el plugin `pavlus()`, un `index.html`, un `env.d.ts`, un template, una clase de componente y una llamada a `createApp`.
- Un template nombra messages (`@click=inc`). Una clase de componente los maneja con un método por message, y devuelve effects como `store.set(path, value)`.
- `createApp` recibe un componente y plugins. El store guarda el state, el plugin DOM muestra la view y notifica los eventos como messages con un campo `event`.
- Un clic es: message, handler, effects, store, nuevo state, `diff`, patches, DOM. Las partes del medio son datos planos que puedes imprimir.
- Los handlers nunca deben mutar el state. Devuelven valores nuevos.

Siguiente: [Elementos, texto y atributos](page:syntax-elements).
