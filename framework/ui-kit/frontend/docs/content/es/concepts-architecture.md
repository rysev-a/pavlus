---
summary: El flujo de datos completo de una aplicación pavlus, desde un evento hasta un DOM con patches aplicados. Qué te da el código puro, cómo se ven los effects como datos, qué pueden y qué no pueden hacer los plugins, en qué orden se ejecutan los messages y cómo probar un handler con asserts simples.
---
## Un solo bucle

Toda aplicación pavlus es el mismo bucle. Ocurre algo, se crea un message, tu código puro convierte el message en effects, los plugins ejecutan los effects y el nuevo state se muestra en la pantalla. Este es el camino completo, con el nombre de la parte que hace cada paso.

```text
 DOM event / HTTP reply / timer tick / socket frame / location change
        |
        |  a plugin turns it into a message
        v
 { id, payload, event }                           message: plain data
        |
        |  core: createApp puts it in the queue
        v
 handler(message, state)  ->  Effect[]            your code: pure
        |
        |  core: each effect goes to plugins[effect.plugin]
        v
 store.handle(set ...)    http.handle(request)    plugins: all side effects
        |                       |
        |                       |  later: ctx.dispatch(reply message)
        v                       +-------------------> back to the queue
 store: state replaced by a new object
        |
        |  core: state !== previous state  ->  onState(next) on every plugin
        v
 dom.onState:  view.diff(prev, next)  ->  Patch[]
        |
        v
 the dom plugin changes the real DOM
```

Todo lo que está en el lado izquierdo de este dibujo es un dato o una función pura. Todo lo que toca el mundo es un plugin. El core, `createApp`, es el bucle delgado entre ambos. Su código fuente tiene unas cien líneas y no depende del DOM.

¿Por qué esta forma? Separa la parte de un programa que cambia a menudo y es difícil de acertar (qué debe ocurrir cuando el usuario hace X) de la parte que cambia poco y se puede escribir una sola vez (cómo adjuntar un listener, cómo llamar a `fetch`). La primera parte se convierte en funciones normales sobre datos normales, así que es fácil de leer, probar y reutilizar.

## Qué te da ser "puro"

Una función **pura** depende solo de sus argumentos y no cambia nada fuera de sí misma. Tus handlers tienen la firma `(message, state, ctx) => Effect[]`. Como son puros:

- **Puedes probarlos sin navegador.** La entrada son dos valores planos, y la salida es una lista de valores planos. Los comparas con `assert`. Hay un ejemplo completo al final de esta página.
- **Puedes ejecutarlos en un servidor.** Sin DOM, los mismos componentes se renderizan a una cadena. La página [Renderizado en servidor](page:concepts-ssr) usa esto.
- **Puedes repetir una sesión.** Graba los messages, aliméntalos a una app nueva y obtendrás el mismo state. El core incluso te da un hook, `onStep(message, effects)`, que se llama por cada message procesado.
- **Puedes ver qué pasó.** Un effect es un objeto que puedes imprimir, registrar y comparar. Un callback no.

Pavlus **no** comprueba la pureza. La documentación la llama responsabilidad del autor. Un handler que llama a `Math.random()` o lee `Date.now()` funcionará, y hará que la aplicación sea difícil de probar. La regla general es pedírselo a un plugin. Un número aleatorio o la hora es un effect cuya respuesta vuelve como un message.

## Los effects son datos planos

Un effect es un objeto con al menos dos campos: `plugin`, el nombre del plugin que lo maneja, y `type`, qué hacer. Los demás campos son asunto del plugin. Aquí hay algunos reales, de los plugins incluidos. Los escribes con el *effector* de cada plugin, un pequeño objeto constructor, pero el resultado es exactamente el objeto mostrado.

```ts
{ plugin: "store", type: "set", path: "count", value: 1 }
{ plugin: "store", type: "merge", path: "user", value: { name: "Ann" } }
{ plugin: "http", type: "request", id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }
{ plugin: "time", type: "setTimeout", id: "search", ms: 300, replyTo: "searchFire", payload: "ann" }
{ plugin: "router", type: "navigate", url: "/users" }
{ plugin: "logger", type: "log", level: "info", message: "user removed", data: { id: 3 } }
{ plugin: "dom", type: "focus", selector: "#name" }
```

Dos cosas a notar. Primero, los effects que necesitan una respuesta dicen **con qué message responder**: `onSuccess: "loaded"`, `replyTo: "searchFire"`. La respuesta llega después como un message, `{ id: "loaded", payload: ... }`, y pasa por el mismo bucle. Tu código nunca espera. Segundo, un effect con un `id` (`http`, `time`, `ws`) reemplaza a uno en ejecución con el mismo id. Así se escriben "gana la última petición" y un debounce sin ningún state en tu código.

En los handlers usas los effectors, porque están tipados y se leen bien:

```ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";

interface SearchState {
  query: string;
  status: "idle" | "loading";
  results: string[];
}

export class Search extends Component<SearchState> {
  type(msg: Message) {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      time.setTimeout("search", 300, "fire", query),
    ];
  }

  fire(msg: Message) {
    return [
      store.set("status", "loading"),
      http.request({
        id: "search",
        url: `/api/search?q=${msg.payload}`,
        onSuccess: "found",
        onError: "failed",
      }),
    ];
  }

  found(msg: Message) {
    const reply = msg.payload as { data: string[] };
    return [store.set("status", "idle"), store.set("results", reply.data)];
  }

  failed() {
    return [store.set("status", "idle"), store.set("results", [])];
  }
}
```

Esto es una búsqueda con debounce completa. Cada pulsación de tecla reinicia el temporizador con el mismo id, así que solo se envía la última consulta. Si se envía una consulta nueva mientras una petición está en curso, el mismo id cancela la petición antigua. El componente no tiene temporizadores, ni `AbortController`, ni campos mutables.

## Del state a los patches

Los últimos pasos del bucle pertenecen al compilador. Cuando el store ha reemplazado el state, el plugin DOM llama a la función `diff(prev, next)` de la view montada. Devuelve **patches**: también datos planos, una de ocho operaciones (`text`, `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`). El plugin DOM es el único código que convierte patches en llamadas al DOM.

::demo state-to-patches

Mira los dos pasos de la demo. En el primero solo cambia `status`, así que el único patch es el insert del párrafo "Loading...". La lista no se toca. En el segundo cambian `status` e `items`: el párrafo se limpia y se insertan dos elementos de lista. Un nodo que lee solo campos sin cambios no produce nada en absoluto. El compilador calcula qué campos lee cada nodo, así que `diff` puede saltarse un subárbol con una sola comprobación `===`.

> [!WARNING] La inmutabilidad es parte del contrato
> El core decide que un state cambió comparando la identidad del objeto (`next !== state`), y `diff` compara los campos de la misma manera. El plugin store reemplaza los objetos de state y comparte las ramas que no cambiaron, así que ambas comprobaciones son baratas y correctas. Si mutaras el state en el sitio, ningún plugin sería notificado y no se haría ningún patch.

## El orden de las cosas

El core procesa los messages estrictamente de uno en uno. Todas estas reglas están en `createApp`, y puedes confiar en ellas.

1. **Una cola.** `dispatch(message)` pone el message en una cola. Si el bucle ya se está ejecutando, la llamada vuelve de inmediato y el message se maneja después en la misma ejecución, cuando termine el message actual.
2. **Effects en orden.** Para un message, los effects se entregan a sus plugins en el orden en que tu handler los devolvió.
3. **Las respuestas se encolan.** Un plugin puede llamar a `ctx.dispatch` mientras maneja un effect, incluso de inmediato. La respuesta espera en la cola detrás del message actual. Un handler nunca ve una respuesta a su propio effect durante el mismo message.
4. **Una notificación por message.** Cuando todos los effects de un message se han ejecutado, el core lee el state una vez. Si es un objeto distinto al de antes del message, cada plugin que tenga `onState` es llamado una vez con el state final. Tres effects `set` causan un render, no tres.
5. **Una válvula de seguridad.** Si se procesan más de `maxMessagesPerTick` messages (10 000 por defecto) en una ejecución, la cola se vacía y se lanza un error. Significa que los messages se causan unos a otros en un ciclo.
6. **Errores.** Una excepción en un handler o en `plugin.handle` se propaga fuera de `dispatch`. Un effect para un plugin que no está registrado lanza `pavlus: no plugin "x" for effect "y"`. Dos plugins con el mismo nombre lanzan error cuando arranca la app.
7. **Apagado.** `dispose()` destruye los plugins en orden inverso al de registro, y los messages posteriores se ignoran.

El state que reciben los handlers viene del primer plugin que tiene un método `getState()`, que es el store. Puedes pasar `getState` tú mismo en las opciones, por ejemplo en un test.

## Qué pueden y qué no pueden hacer los plugins

Un plugin es un objeto: `{ name, init?, handle(effect, ctx), onState?, dispose? }`. El core le da un contexto con tres funciones: `dispatch(message)`, `getState()` y `dispatchEffect(effect)`.

Un plugin **puede**:

- ser dueño de datos mutables: listeners, peticiones en curso, temporizadores, sockets, una caché. El código de la aplicación nunca los ve y nunca los limpia.
- llamar a cualquier API externa: el DOM, `fetch`, `setTimeout`, `localStorage`, `console`.
- convertir eventos externos en messages con `ctx.dispatch`, en cualquier momento.
- leer el state con `ctx.getState()` y reaccionar a los cambios en `onState`.
- limpiar en `dispose`.

Un plugin **no debería**:

- cambiar por sí mismo el state de la aplicación. Solo el plugin store cambia el state, y solo a causa de un effect `set`, `merge`, `remove`, `undo` o `restoreTo`.
- contener reglas de negocio. Hace una cosa para una familia de effects. "Qué pasa después de la respuesta" pertenece a un handler.
- lanzar una excepción por un fallo esperado. Una petición fallida o un socket cerrado se notifica como un message (`onError`) para que los handlers puedan tratarlo.

El framework tampoco vigila estas reglas. Las [páginas de plugins](page:plugins-overview) muestran qué hace cada plugin incluido y cómo escribir el tuyo.

## Probar un handler con asserts simples

Como un componente es una función pura, un test unitario no necesita preparación. `toHandler` convierte un componente en una función simple `(message, state) => Effect[]`. Llámala y compara. Este test solo usa la biblioteca estándar:

```ts search.test.ts
import assert from "node:assert/strict";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { toHandler } from "@pavlus/frontend";
import { Search } from "./search.ts";

const search = toHandler(new Search());
const state = { query: "ann", status: "idle" as const, results: [] };

assert.deepEqual(search({ id: "fire", payload: "ann" }, state), [
  store.set("status", "loading"),
  http.request({
    id: "search",
    url: "/api/search?q=ann",
    onSuccess: "found",
    onError: "failed",
  }),
]);

assert.deepEqual(search({ id: "nobody-handles-this" }, state), []);
```

Un message sin handler devuelve una lista vacía, no un error. Comparas con la salida de los propios effectors, así que el test falla si un effect de un plugin cambia de forma, y nunca escribes el objeto a mano.

Para probar varios pasos juntos, ejecuta el core real solo con el plugin store. El plugin `dom` no hace falta, porque lo único que quieres comprobar es el state. La opción `onStep` recoge lo que ocurrió.

```ts flow.test.ts
import assert from "node:assert/strict";
import { createApp, type Plugin } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { Search } from "./search.ts";

const fakeHttp: Plugin = {
  name: "http",
  handle(effect, ctx) {
    ctx.dispatch({
      id: effect.onSuccess as string,
      payload: { status: 200, data: ["Ann Lee", "Anna Fox"] },
    });
  },
};
const fakeTime: Plugin = {
  name: "time",
  handle(effect, ctx) {
    ctx.dispatch({ id: effect.replyTo as string, payload: effect.payload });
  },
};

const store = createStorePlugin({ query: "", status: "idle", results: [] });
const steps: string[] = [];
const app = createApp({
  app: new Search(),
  plugins: [store, fakeHttp, fakeTime],
  onStep: (message) => steps.push(message.id),
});

app.dispatch({ id: "type", event: { type: "input", value: "ann" } });

assert.deepEqual(steps, ["type", "fire", "found"]);
assert.deepEqual(store.getState().results, ["Ann Lee", "Anna Fox"]);
assert.equal(store.getState().status, "idle");
```

Los dos plugins falsos tienen cuatro líneas cada uno. Responden de inmediato, y el test ve toda la cadena: `type`, luego `fire` desde el temporizador, luego `found` desde la petición. Sin reloj, sin red, sin navegador.

Cuando sí quieres comprobar un template en un DOM, `@pavlus/frontend/testing` tiene `mountView(viewOrComponent, initialState)`. Monta una view en un contenedor nuevo sin el core y devuelve el contenedor, los `messages` que la página despachó y un `set(next)` para cambiar el state. Un clic en un botón te da el message para comparar, y `set` muestra el DOM con los patches aplicados.

## Lo que aprendiste

- El bucle es: evento, message, handler, effects, plugins, store, nuevo state, `diff`, patches, DOM. Los messages, los effects y los patches son todos datos planos.
- Los handlers puros se pueden probar con `assert`, ejecutar en un servidor y repetir. La pureza es una convención que el framework no hace cumplir.
- Los messages se ejecutan de uno en uno. Los effects se ejecutan en el orden devuelto, las respuestas esperan en la cola y los plugins reciben el aviso del state una vez por message.
- Los plugins son dueños de todos los efectos secundarios y de los datos mutables que necesitan. Responden con messages, y solo el store cambia el state.
- Puedes probar un handler directamente con `toHandler`, o un flujo completo con `createApp`, el store y pequeños plugins falsos.

Siguiente: [Componentes y estado](page:concepts-components).
