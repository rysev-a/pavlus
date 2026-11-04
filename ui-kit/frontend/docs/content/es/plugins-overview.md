---
summary: El código de la aplicación solo devuelve effects, datos simples que describen lo que debe ocurrir. Los plugins lo hacen. Aprende el contrato del plugin, cómo viajan los effects y las respuestas, en qué orden ocurren las cosas, cómo se manejan los errores y cómo probar un plugin.
---
## Código puro, plugins sucios

En una aplicación pavlus, el código que escribes nunca toca el mundo exterior. Un handler no llama a `fetch`, no lee el reloj, no escribe en `localStorage` y no cambia el DOM. Recibe un message y el state y **devuelve una lista de effects**. Un effect es un objeto simple que describe algo que debe ocurrir.

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

Hacer la cosa es trabajo de un **plugin**. Un plugin es un objeto con un nombre y una función. El core conecta ambos: envía cada effect al plugin cuyo nombre es `effect.plugin`.

```text
DOM event / HTTP reply / timer tick / WS frame
        |  plugins turn the outside world into messages
        v
  core:   app(message, state) -> effects[]        pure, deterministic
        |  effects are plain data: { plugin: "http", type: "request", ... }
        v
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

La imagen es un ciclo. El mundo produce un **message** (un clic, una respuesta, un tick). El código puro convierte el message en **effects**. Los plugins ejecutan los effects, y cuando algo ocurre más tarde, envían un message nuevo. Tu código es solo el paso intermedio, y el paso intermedio es una función que puedes llamar en un test sin ningún navegador.

Incluso un clic es un message. Un evento de template no es una función, es un dato. La demo muestra el vnode que recibe el botón:

::demo event-as-data open=vnodes

El `events.click` del vnode es `{ id: "remove", payload: 3 }`. El plugin dom posee el listener real. Cuando ocurre el clic, envía el message `{ id: "remove", payload: 3, event: { type: "click" } }` a la aplicación. El campo `event` es una pequeña copia en datos simples del evento del DOM, con `value`, `checked` y `key` donde tienen sentido.

## El contrato del plugin

Esta es toda la interfaz de un plugin. Es un tipo de `src/core/types.ts`, y el paquete principal lo exporta como `Plugin`:

```ts
export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
```

Solo dos miembros son obligatorios: `name` y `handle`.

- `name` es el string al que se refiere `effect.plugin`. Debe ser único en una aplicación.
- `handle(effect, ctx)` se llama para cada effect dirigido a este plugin. El primer parámetro es el effect; el genérico `E` es el tipo de los effects que acepta este plugin, normalmente una unión sobre `type`.
- `init(ctx)` se ejecuta una vez cuando se crea la aplicación. Un plugin que necesita recordar el contexto (el plugin dom lo guarda para despachar eventos) lo guarda aquí.
- `onState(state, ctx)` se ejecuta después de que el state cambió. El plugin dom vuelve a renderizar en él.
- `dispose()` se ejecuta cuando se hace dispose de la aplicación, y limpia: listeners, temporizadores, sockets.

El segundo tipo es el contexto que recibe cada hook:

```ts
export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}
```

`dispatch` es la única forma en que un plugin habla con tu código. `getState` existe, y el plugin dom lo necesita para renderizar. `dispatchEffect` es para herramientas de desarrollo y tests. Un plugin normal usa `dispatch` y nada más.

Un message es `{ id, payload?, event? }`. El `id` es el nombre del handler que lo recibirá.

## Los effects son datos

Un effect tiene dos campos obligatorios, `plugin` y `type`. Todo lo demás depende del plugin. `plugin` elige el plugin; `type` elige qué hacer dentro de él. El plugin store tiene `set`, `merge` y `remove`; el plugin http tiene `request` y `cancel`.

Como un effect es un dato, se siguen tres cosas buenas.

1. **Los tests no necesitan mocks.** Para probar un handler, llámalo y compara la lista que devuelve con la lista que esperas.
2. **Los effects se pueden grabar, reproducir y mostrar.** La opción `onStep` de `createApp` recibe cada message con sus effects; el logger y las herramientas de desarrollo la usan.
3. **Nada ocurre por accidente.** Devolver un effect no es hacerlo. Un handler al que se llama diez veces en un test no ejecuta nada.

### Effectors

Puedes escribir un effect a mano, pero cada plugin incluye un **effector**: un objeto pequeño de funciones que construyen exactamente ese objeto, con tipos. Un campo equivocado es entonces un error de compilación, y un handler se lee como una frase.

```ts
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";

class Users extends Component<UsersState> {
  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
      log.info("loading users"),
    ];
  }
}
```

Un effector no hace nada por sí solo. `store.set("status", "loading")` devuelve el objeto mostrado al principio de esta página, y nada más. En un test comparas el resultado de un handler con las mismas llamadas al effector:

```ts
expect(toHandler(users)({ id: "load" }, state)).toEqual([
  store.set("status", "loading"),
  http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
  log.info("loading users"),
]);
```

Cada plugin incluido tiene su effector. El alias corto habitual está en la segunda columna.

| Plugin | Effector (alias) |
| --- | --- |
| store | `storeEffector` como `store` |
| dom | `domEffector` como `dom` |
| http | `httpEffector` como `http` |
| ws | `wsEffector` como `ws` |
| time | `timeEffector` como `time` |
| logger | `loggerEffector` como `log` |
| router | `routerEffector` como `router` |

Puedes importarlos desde el punto de entrada de un plugin (`@service-laboratory/pavlus/plugins/store`) o desde el barrel `@service-laboratory/pavlus/plugins`. Importar el barrel no ejecuta código, y el bundler conserva solo lo que usas.

## Registrar plugins

Los plugins se listan al crear la aplicación:

```ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";

createApp({
  app: dashboard,
  plugins: [createStorePlugin(initialState), createDomPlugin(), createHttpPlugin()],
  mount: "#app",
});
```

- `app` es una función, o una instancia de una clase que extiende `Component`.
- Todo plugin tiene un `name`, y un effect va al plugin cuyo nombre es igual a `effect.plugin`.
- Dos plugins con el mismo nombre son un error al arrancar: `pavlus: duplicate plugin "store"`.
- Un effect para un plugin que no está en la lista es un error cuando se ejecuta: `pavlus: no plugin "nope" for effect "x"`. Esto es lo primero que debes comprobar cuando algo lanza un error después de añadir un effect nuevo.
- El state viene del primer plugin que tiene un método `getState()`, que es el plugin store. Sin él, los handlers reciben `undefined` como state.
- `mount` necesita el plugin dom y una `app` con una `view`.
- `init` es un message que se despacha una vez que todos los plugins están listos, después de `mount`.

No registras un plugin por cada tipo de effect, sino uno por *familia* de effects: todos los effects de `http` van a un único objeto plugin que guarda la tabla de peticiones en curso.

## Los messages vuelven

La mayoría de los plugins responden más tarde: una respuesta, un temporizador, un frame. El effect lleva el **id del message con el que responder**, y el plugin llama a `ctx.dispatch` cuando tiene el resultado.

```ts
http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })
// later, the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

Los campos de respuesta tienen nombres convencionales: `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` y `onChange`. Los nombres importan, por los componentes. Un componente hijo se monta bajo un prefijo de message (`users`). El hijo escribe `onSuccess: "loaded"`, y el framework pone el prefijo delante de exactamente estos siete campos, así que la respuesta encuentra el camino de vuelta al hijo como `users.loaded`. Así se ve el effect de un hijo después de salir del hijo:

```json
[
  { "plugin": "time", "type": "setTimeout", "id": "t", "ms": 10, "replyTo": "kid.tick" },
  { "plugin": "q", "type": "q", "onDone": "done", "onSuccess": "kid.ok" }
]
```

Mira el segundo effect. Un campo que tiene otro nombre, aquí `onDone`, no se cambia, y su message iría a la raíz, no al hijo. Así que un plugin que quiera funcionar dentro de componentes debe usar los nombres estándar.

## Quién posee qué

- El plugin **store** posee el state de la aplicación. Después de cada message, si el state cambió, el core llama a `onState(state)` en cada plugin que lo define.
- Cada plugin posee su **state mutable privado**: el plugin dom sus listeners, http sus peticiones en curso, time sus temporizadores, ws sus sockets. Tu código nunca lo ve, y nunca necesita limpiarlo.
- Todo lo que tiene un **id** (una petición http, un temporizador, una conexión) se reemplaza cuando se vuelve a usar el mismo id, y se puede cancelar con ese id. Un debounce o "gana la última petición" no necesita state en la aplicación: inicia el mismo id otra vez.

## Orden, ciclo de vida y bucles

Los messages se procesan **estrictamente uno a la vez**. Para un message, el core llama a la aplicación, ejecuta los effects en el orden en que se devolvieron y, después, si el state cambió, llama a `onState` en cada plugin. Un message que un plugin despacha mientras maneja un effect no se procesa de inmediato. Espera en una cola y se ejecuta cuando termina el message actual.

Un test lo hace concreto. El plugin `echo` responde de inmediato, y aun así las respuestas llegan después de ambos effects:

```ts overview.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
} from "@service-laboratory/pavlus";
import {
  createStorePlugin,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";

const echo: Plugin = {
  name: "echo",
  handle(effect, ctx) {
    ctx.dispatch({ id: "echoed", payload: effect.text });
  },
};

test("effects run in order, replies wait for the next turn", () => {
  const seen: string[] = [];
  const app = createApp({
    app: (message: Message): Effect[] => {
      seen.push(message.id);
      return message.id === "start"
        ? [
            { plugin: "echo", type: "say", text: "a" },
            { plugin: "echo", type: "say", text: "b" },
          ]
        : [];
    },
    plugins: [createStorePlugin({}), echo],
  });
  app.dispatch({ id: "start" });
  expect(seen).toEqual(["start", "echoed", "echoed"]);
});
```

Los hooks también tienen un orden fijo. El test siguiente registra cada llamada. `init` se llama en el orden del array, antes que nada más; el effect del store se aplica antes que el effect para `x`; `onState` llega después de todos los effects del message, una vez por plugin; y `dispose` se ejecuta en el orden **inverso**, así que un plugin que depende de uno anterior se detiene primero.

```ts
test("the hooks run in a fixed order", () => {
  const calls: string[] = [];
  const spy = (name: string): Plugin => ({
    name,
    init: () => void calls.push(`${name}.init`),
    handle: (effect) => void calls.push(`${name}.handle:${effect.type}`),
    onState: (state) =>
      void calls.push(`${name}.onState:${JSON.stringify(state)}`),
    dispose: () => void calls.push(`${name}.dispose`),
  });
  const app = createApp({
    app: () => [store.set("n", 1), { plugin: "x", type: "hello" }],
    plugins: [createStorePlugin({ n: 0 }), spy("x"), spy("y")],
  });
  app.dispatch({ id: "go" });
  app.dispose();
  expect(calls).toEqual([
    "x.init",
    "y.init",
    "x.handle:hello",
    'x.onState:{"n":1}',
    'y.onState:{"n":1}',
    "y.dispose",
    "x.dispose",
  ]);
});
```

Un bucle de messages (un handler que responde a un message provocando el mismo message otra vez) se detiene tras `maxMessagesPerTick` messages en un turno, 10 000 por defecto:

```text
pavlus: more than 50 messages in one tick (message loop?)
```

(El número del mensaje de error es el límite que se estableció. Aquí fue 50, establecido con la opción `maxMessagesPerTick` de `createApp`.)

## Errores

Hay dos tipos de fallo, y se manejan de forma distinta.

**Los fallos esperados son messages.** Una petición que falla, un socket que se cierra, un archivo que no se encuentra: no son excepciones. El plugin despacha un message de error (`onError`) y tu código decide qué mostrar. Una petición que se canceló o se reemplazó no envía nada.

**Los bugs lanzan excepciones.** Si `handle` lanza, la excepción sale de `app.dispatch`. El resto de los effects de ese message se omiten, y los cambios de state que ya se aplicaron se quedan. La aplicación en sí no se rompe: el siguiente `dispatch` funciona.

Hay dos casos fáciles de pasar por alto:

- Un error dentro de un callback de promesa o de un callback de temporizador de un plugin nunca llega al core, porque el core ya no está en la pila. Un plugin debe capturar sus propios errores asíncronos y convertirlos en un message de error. Todos los plugins incluidos lo hacen.
- Un handler que no devuelve un array es un error del componente, con el nombre del message: `pavlus: handler "add" must return an array of effects`.

## Probar un plugin

Cada plugin incluido recibe el mundo exterior como una opción. El plugin http recibe `fetch`, el plugin time un reloj, el plugin ws una fábrica de sockets, el logger un sink, el router una `window`, el plugin dom un `document`. Un test pasa un falso, y no hace falta ninguna librería de mocks.

Puedes probar un plugin sin una aplicación. Crea un contexto falso que grabe los messages, llama a `handle` y comprueba qué se despachó:

```ts
test("a plugin is tested with a fake context", () => {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  echo.handle({ plugin: "echo", type: "say", text: "hi" }, ctx);
  expect(sent).toEqual([{ id: "echoed", payload: "hi" }]);
});
```

Un tercer nivel es un test de toda la aplicación con plugins reales y mundos exteriores falsos. La [guía](page:guide-todo-app) lo hace para una lista de tareas.

> [!TIP] Prefiere probar el handler
> La mayor parte de tu lógica está en handlers, y un handler es una función pura. Pruébalo llamando a `toHandler(component)(message, state)`. Solo necesitas un test de plugin cuando escribes un plugin, y entonces prueba lo que el plugin hace con un effect.

## Lo que aprendiste

- Un handler devuelve effects, objetos simples `{ plugin, type, ... }`. Los effectors los construyen, con tipos. Un plugin es `{ name, handle }` más `init`, `onState` y `dispose` opcionales.
- Los plugins responden con `ctx.dispatch`. El effect nombra los messages de respuesta con `replyTo`, `onSuccess`, `onError` y los demás campos estándar, y un componente hijo recupera el prefijo.
- Los messages se ejecutan uno a la vez, los effects en orden, y un message de un plugin espera al siguiente turno. Se hace dispose de los plugins en orden inverso.
- Los fallos esperados son messages, los bugs lanzan excepciones. Un test de plugin solo necesita un contexto falso.

Siguiente: [Plugins incluidos](page:plugins-reference).
