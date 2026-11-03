---
summary: Todos los plugins incluidos en un solo lugar - dom, store, http, router, time, logger y ws - con todos sus effects, campos y los messages que devuelven, más los cuatro plugins del ui-kit como ejemplos de plugins específicos de una aplicación.
---
## Siete plugins, una tabla al final

Siete plugins vienen con el framework. Registras los que necesitas en `createApp({ plugins })`, y los demás no cuestan nada. Esta página describe cada uno: para qué sirve, cada effect que maneja con sus campos, un uso corto en un handler y el message que vuelve. La última sección es una tabla de todos los effects, para consultar rápido.

Todos los ejemplos usan el alias corto del effector, como en [Cómo funcionan los plugins](page:plugins-overview):

```ts
import {
  domEffector as dom,
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
  wsEffector as ws,
} from "@service-laboratory/pavlus/plugins";
```

Cada plugin se crea con una función llamada `createXPlugin(options)`, y cada opción existe para que un test pueda reemplazar el mundo exterior. Las opciones también se listan al final de la página.

## store

**Para:** guardar el state de la aplicación y un historial de cada cambio. Es el único plugin al que el core pide el state: el handler recibe el valor del store, y cuando cambia, se avisa a los demás plugins.

```ts
const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
plugin.getState();
plugin.history;
```

| Effect | Campos | Significado |
| --- | --- | --- |
| `set` | `path`, `value` | Establece el valor en `path`, creando los padres que falten. Una ruta raíz (un string vacío) reemplaza todo el state. |
| `merge` | `path`, `value` | Mezcla de forma superficial un objeto en el objeto de `path`. |
| `remove` | `path` | Elimina un valor. Si es un elemento de un array, el array se acorta. |
| `undo` | `steps?` | Revierte los últimos `steps` (por defecto 1) cambios registrados. |
| `restoreTo` | `timestamp` | Revierte todos los cambios registrados después de `timestamp`. |

Un **path** es un string con puntos (`"user.name"`, `"todos.0.done"`) o un array (`["todos", 0, "done"]`). Los segmentos numéricos indexan arrays.

```ts
rename(msg: Message): Effect[] {
  return [
    store.set("user.name", String(msg.payload)),
    store.merge("user", { edited: true }),
    store.remove("todos.1"),
  ];
}
```

**Vuelve:** nada. El resultado de un effect de `store` es el nuevo state, que ven el siguiente message y los templates.

El state es **inmutable**. Cada cambio construye objetos nuevos a lo largo del path y deja el resto idéntico, así que `diff` puede saltarse las ramas intactas con un solo `===`. Establecer un valor al que ya tiene no cambia nada y no registra nada. Nunca mutes el state en su sitio: ni el store ni `diff` pueden verlo.

Cada cambio se registra con un `restoreEffect`, el effect que devuelve el state anterior. `undo` y `restoreTo` los aplican sin registrar nada. El historial conserva los últimos 1000 cambios (`maxHistory`).

## dom

**Para:** es el único código que toca el DOM. Renderiza views compiladas, aplica los patches que devuelve `diff` y posee todos los listeners de eventos. Los eventos vuelven como messages.

La raíz de tu aplicación la monta `createApp({ mount })`. Los effects de abajo son para todo lo demás: una segunda view en otro lugar, un modal, un panel.

| Effect | Campos | Significado |
| --- | --- | --- |
| `mount` | `target`, `view`, `onMounted?` | Renderiza `view` en `target` (un selector CSS o un elemento) con el state actual. |
| `unmount` | `target` | Elimina lo que se montó en `target`, con sus listeners. |
| `focus` | `selector` | Da el foco al primer elemento que coincide. |
| `blur` | `selector` | Quita el foco al primer elemento que coincide. |

```ts
open(): Effect[] {
  return [dom.mount("#panel", panelView, { onMounted: "panelMounted" })];
}

panelMounted(): Effect[] {
  return [dom.focus("input.filter")];
}
```

`view` es un template compilado (`import panelView from "./panel.pavlus"`), o `viewOf(component)` para un componente cuyo template tiene un `+outlet` o hijos.

**Vuelve:**

| Cuándo | Message |
| --- | --- |
| La view está en el DOM y se dio `onMounted` | `{ id: onMounted }` |
| El usuario dispara un evento enlazado en un template, como `@click=save(item)` | `{ id, payload, event }` |

Para los eventos, `id` es el id de message del template (con el prefijo de los hijos embebidos), `payload` es el argumento del handler y `event` es una instantánea simple: `{ type, value?, checked?, key? }`. `value` y `checked` vienen del target del evento, `key` de los eventos de teclado. `@submit.prevent` y `.stop` llaman a `preventDefault()` y `stopPropagation()` antes de enviar el message.

`onMounted` no es uno de los siete campos de respuesta a los que un hijo pone prefijo, así que el message llega con el nombre que escribiste.

El plugin hace dos cosas más. Cada vez que el state cambia, ejecuta `view.diff(previous, state)` para cada view montada y aplica los patches; nunca envías un effect de actualización. Y cuando el target contiene un render de servidor, `mount` hidrata el markup en lugar de construirlo (mira [Renderizado en servidor](page:concepts-ssr)).

Un nodo recibe **un** listener por tipo de evento durante toda su vida. Cuando cambia el message de un handler, el plugin solo cambia el message guardado. Los campos de formulario se escriben como propiedades (`value`, `checked`, `selected`) y también como atributos, porque después de que el usuario escribe, solo la propiedad cambia lo que se muestra.

## http

**Para:** peticiones. Cada petición tiene un **id**, y el id es también como se cancela: iniciar una petición con el id de una en curso cancela la anterior. "Gana la última petición" no necesita state en la aplicación.

| Effect | Campos | Significado |
| --- | --- | --- |
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | Envía una petición. |
| `cancel` | `id` | Cancela la petición en curso `id`. |

`method` es `GET` salvo que indiques otro. Un `body` string se envía tal cual; cualquier otra cosa se envía como JSON, y se añade `content-type: application/json` salvo que pongas uno. `responseType` es `"json"` (por defecto) o `"text"`. Un cuerpo que no es JSON válido da `data: null`.

```ts
search(msg: Message): Effect[] {
  return [
    http.request({
      id: "search",
      url: `/api/users?q=${msg.payload}`,
      onSuccess: "found",
      onError: "searchFailed",
    }),
  ];
}

save(msg: Message): Effect[] {
  return [
    http.request({
      id: "save",
      method: "POST",
      url: "/api/users",
      body: { name: msg.payload },
      onSuccess: "saved",
      onError: "saveFailed",
    }),
  ];
}
```

**Vuelve:**

| Cuándo | Message |
| --- | --- |
| Una respuesta 2xx | `{ id: onSuccess, payload: { status, data } }` |
| Cualquier otro status | `{ id: onError, payload: { status, error: statusText, data } }` |
| Un fallo de red | `{ id: onError, payload: { error: message } }` |
| Cancelada o reemplazada | nada |

Estos son los payloads reales para un `fetch` falso que responde 200, 404 y un fallo de red:

```json
[
  { "id": "ok", "payload": { "status": 200, "data": [1] } },
  { "id": "err", "payload": { "status": 404, "error": "Not Found", "data": { "m": 1 } } },
  { "id": "err", "payload": { "error": "offline" } }
]
```

> [!WARNING] Una petición cancelada es silenciosa
> Una petición cancelada nunca produce un message, ni siquiera un error, y la respuesta de una petición reemplazada que aún llega se ignora. Si muestras un indicador de carga, no esperes a `onError` para ocultarlo tras un `cancel`: ocúltalo tú, en el handler que cancela.

El plugin tiene `pending()`, los ids en curso, y `settled()`, una promesa que se resuelve cuando no hay nada en curso (se usa para el renderizado en servidor).

## router

**Para:** la URL y el historial. La aplicación conoce la ubicación como messages y la cambia con effects; nunca lee `window.location`.

| Effect | Campos | Significado |
| --- | --- | --- |
| `listen` | `onChange` | Empieza a informar. Responde de inmediato con la ubicación actual. |
| `navigate` | `url`, `replace?`, `absolute?` | Va a `url`. Desde un hijo con routing, una url es relativa a la base del hijo salvo que se indique `absolute`. |
| `back` | ninguno | `history.back()` |
| `forward` | ninguno | `history.forward()` |

```ts
init(): Effect[] {
  return [router.listen("route.changed")];
}

login(): Effect[] {
  return [router.navigate("/login", { replace: true })];
}
```

**Vuelve:** `{ id: onChange, payload: { path, search, hash } }`. En `https://example.com/users?page=2#top` el payload es:

```json
{ "path": "/users", "search": "?page=2", "hash": "#top" }
```

Se envía cuando se maneja `listen`, después de cada `navigate` (el plugin despacha él mismo un `popstate`, porque `pushState` no dispara ningún evento) y cuando el usuario va atrás o adelante. Llamar a `listen` otra vez reemplaza el listener. `navigate` informa solo cuando hay un `listen` activo.

El plugin no analiza la URL más allá de estas tres partes. Hacer coincidir routes es trabajo de una tabla `routing`, mira [Enrutamiento](page:concepts-routing). Bajo una ruta base, pasa a `createRouterPlugin({ window })` una window que oculte la base.

## time

**Para:** el reloj, los timeouts y los intervalos. El código de la aplicación no puede llamar a `Date.now()` ni a `setTimeout`, porque eso lo haría impuro. Se lo pide a este plugin, y la respuesta vuelve como un message. Cada temporizador tiene un **id** y se puede reiniciar o cancelar con él.

| Effect | Campos | Significado |
| --- | --- | --- |
| `now` | `replyTo` | Responde con la hora actual. |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | Envía `replyTo` una vez, tras `ms`. |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | Envía `replyTo` cada `ms`. |
| `cancel` | `id` | Detiene el temporizador `id`. |
| `cancelAll` | ninguno | Detiene todos los temporizadores. |

```ts
typing(msg: Message): Effect[] {
  return [
    store.set("query", msg.event?.value ?? ""),
    time.setTimeout("search", 300, "searchFire", msg.event?.value),
  ];
}

searchFire(msg: Message): Effect[] {
  return [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })];
}
```

Iniciar un temporizador con un id que ya está en marcha **cancela el que estaba en marcha**. El ejemplo es un debounce sin state: mientras el visitante sigue escribiendo, cada tecla reemplaza el temporizador, y `searchFire` llega 300 ms después de la última tecla.

**Vuelve:**

| Effect | Message |
| --- | --- |
| `now` | `{ id: replyTo, payload: <ms since the epoch> }` |
| `setTimeout` | `{ id: replyTo, payload }` una vez; el temporizador se olvida después |
| `setInterval` | `{ id: replyTo, payload }` en cada tick |

Para marcar un documento con la hora, pídela y termina el trabajo cuando llegue la respuesta: `save` devuelve `time.now("save.stamped")`, y `"save.stamped"` guarda `msg.payload`. El mismo registro de messages produce entonces siempre los mismos effects.

## logger

**Para:** la consola. El código de la aplicación es puro, así que incluso el registro es un effect.

| Effect | Campos | Significado |
| --- | --- | --- |
| `log` | `message`, `level?`, `data?` | Escribe una entrada. `level` es `debug`, `info`, `warn` o `error`, por defecto `info`. |

```ts
removed(msg: Message): Effect[] {
  return [log.info("user removed", { id: msg.payload }), log.warn("slow response", 2400)];
}
```

El effector tiene `log.debug`, `log.info`, `log.warn`, `log.error` y `log.log(level, message, data)`. Las entradas van al método correspondiente de `console`, con `data` como segundo argumento cuando existe.

**Vuelve:** nada.

`withLogging(component, label)` del paquete principal envuelve un componente y añade una entrada `debug` por cada message que maneja, con el payload y los plugins y tipos de los effects que devolvió. Añade un effect, así que el plugin logger debe estar registrado.

```ts
createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
```

## ws

**Para:** conexiones WebSocket, por **id**. El plugin guarda los sockets; la aplicación ve messages.

| Effect | Campos | Significado |
| --- | --- | --- |
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | Abre la conexión `id`. |
| `send` | `id`, `data` | Envía por la conexión `id`. Un objeto se envía como JSON, un string tal cual. |
| `close` | `id`, `code?`, `reason?` | Cierra la conexión `id`. |

```ts
join(): Effect[] {
  return [
    ws.connect({ id: "chat", url: "wss://example.com/chat", onOpen: "opened", onMessage: "received", onClose: "closed", onError: "failed" }),
  ];
}

opened(): Effect[] {
  return [ws.send("chat", { text: "hi" })];
}
```

**Vuelve:**

| Cuándo | Message |
| --- | --- |
| La conexión se abre | `{ id: onOpen }` |
| Llega un frame | `{ id: onMessage, payload }`. Un frame de texto que es JSON válido se analiza. |
| La conexión se cierra | `{ id: onClose, payload: { code, reason } }`; el id se olvida |
| Un error | `{ id: onError }` |

Conectar con el id de una conexión abierta cierra primero la anterior, sin un message `onClose`. `send` a un id que no tiene conexión **lanza una excepción** (`pavlus/ws: no connection "chat"`). Envía solo después de `onOpen`, y mantén una bandera `connected` en el state si necesitas saberlo.

## Los effects de un vistazo

Los 24 effects de los siete plugins:

| Plugin | Effect | Campos | Message de vuelta |
| --- | --- | --- | --- |
| store | `set` | `path`, `value` | ninguno |
| store | `merge` | `path`, `value` | ninguno |
| store | `remove` | `path` | ninguno |
| store | `undo` | `steps?` | ninguno |
| store | `restoreTo` | `timestamp` | ninguno |
| dom | `mount` | `target`, `view`, `onMounted?` | `onMounted` |
| dom | `unmount` | `target` | ninguno |
| dom | `focus` | `selector` | ninguno |
| dom | `blur` | `selector` | ninguno |
| http | `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | `onSuccess` o `onError` |
| http | `cancel` | `id` | ninguno |
| router | `listen` | `onChange` | `onChange` |
| router | `navigate` | `url`, `replace?`, `absolute?` | `onChange` del listener |
| router | `back` | ninguno | `onChange` del listener |
| router | `forward` | ninguno | `onChange` del listener |
| time | `now` | `replyTo` | `replyTo` |
| time | `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` una vez |
| time | `setInterval` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` repetidamente |
| time | `cancel` | `id` | ninguno |
| time | `cancelAll` | ninguno | ninguno |
| logger | `log` | `message`, `level?`, `data?` | ninguno |
| ws | `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | los cuatro callbacks |
| ws | `send` | `id`, `data` | ninguno |
| ws | `close` | `id`, `code?`, `reason?` | `onClose` |

Y la opción de cada plugin que reemplaza un test:

| Plugin | Opción | Qué pasar |
| --- | --- | --- |
| store | `now`, `maxHistory` | Un contador para los timestamps. |
| dom | `document` | Un document de jsdom. |
| http | `fetch` | Un `fetch` falso; solo necesita `ok`, `status`, `statusText` y `json()` o `text()`. |
| router | `window` | Una window de jsdom, o un wrapper que oculta una ruta base. |
| time | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | Un reloj falso, o usa `vi.useFakeTimers()`. |
| logger | `sink` | Un objeto con `debug`, `info`, `warn` y `error` que recoge las llamadas. |
| ws | `create` | Una función que devuelve un socket falso. |

## Los plugins propios del ui-kit

El framework no tiene un plugin para `localStorage`, para números aleatorios ni para el elemento `<html>`, porque una aplicación los necesita solo a veces. El ui-kit, el sitio que estás leyendo, tiene cuatro plugins propios. Muestran cómo es un plugin específico de una aplicación. Los cuatro están registrados en su `main.ts`:

```ts main.ts
export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    createDomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});
```

| Plugin | Effect | Campos | Vuelve |
| --- | --- | --- | --- |
| theme | `apply` | `look`, `vars`, `persist` | ninguno |
| random | `int` | `max`, `replyTo` | `{ id: replyTo, payload: n }`, un entero desde 0 hasta `max` sin incluirlo |
| source | `load` | `path`, `onSuccess`, `onError` | `{ id: onSuccess, payload: { path, text } }`, o `{ id: onError, payload: path }` |
| docs | `load` | `slug`, `lang`, `onSuccess`, `onError` | `onSuccess` con la página terminada, o `onError` con el slug |
| docs | `run` | `template`, `state`, `onSuccess` | `onSuccess` con la demo compilada y ejecutada |
| docs | `remember` | `lang` | ninguno |

- **theme** es el único código que toca `<html>` para el aspecto del sitio: la clase `dark` o `light`, las variables CSS, el atributo `data-style` y la elección guardada en `localStorage`. La aplicación calcula las variables con una función pura y devuelve `themeEffector.apply(look)`.
- **random** existe porque un handler no puede llamar a `Math.random()`. La página siguiente, [Escribir tu propio plugin](page:plugins-custom), lo lee línea por línea.
- **source** carga el código fuente de una página para la pestaña Source. Los archivos se empaquetan como chunks raw perezosos con `import.meta.glob` y `query: "?raw"`, y el plugin carga uno cuando se abre la pestaña. La aplicación lo pide, recibe el texto como un message y lo corta en líneas resaltadas con una función pura.
- **docs** es lo que hace funcionar esta documentación. `load` obtiene el Markdown de una página y las demos de esa página, carga el compilador bajo demanda, compila las demos y responde con la página terminada; `run` hace lo mismo para el playground; `remember` guarda el idioma.

Cada uno sigue la misma forma que un plugin incluido: un tipo para el effect, un effector, una función `createXPlugin` con el mundo exterior como parámetro y una respuesta por `ctx.dispatch`.

## Lo que aprendiste

- Siete plugins cubren el DOM, el state, la red, la URL, el tiempo, la consola y los sockets. Cada effect tiene campos fijos, y la mayoría de las respuestas las nombra el propio effect.
- Las cosas con un `id` (peticiones http, temporizadores, conexiones) se reemplazan cuando se vuelve a usar el id y se pueden cancelar. Eso te da debounce y "gana la última" sin state.
- Solo `store` cambia el state. Todos los demás plugins responden con messages, y los fallos esperados también son messages.
- Un plugin específico de una aplicación es un objeto pequeño con la misma forma: un tipo de effect, un effector y un `handle`.

Siguiente: [Escribir tu propio plugin](page:plugins-custom).
