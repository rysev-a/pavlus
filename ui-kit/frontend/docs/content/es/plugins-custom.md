---
summary: Escribe un plugin paso a paso, desde un plugin de título de tres líneas hasta un plugin de almacenamiento que responde con un message y un plugin de viewport que limpia tras de sí. Aprende las reglas, cómo probar un plugin con un contexto falso y cuándo no escribir uno.
---
## El plugin más pequeño

Un plugin es un objeto con un `name` y una función `handle`. Eso es todo lo que el framework necesita. Este es un plugin que establece el título de la pestaña del navegador:

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export const titlePlugin: Plugin = {
  name: "title",
  handle(effect) {
    document.title = String(effect.text);
  },
};
```

Lo registras junto con los demás:

```ts
createApp({
  app: shell,
  plugins: [createStorePlugin(initialState), createDomPlugin(), titlePlugin],
  mount: "#app",
});
```

Y un handler pide un título devolviendo un effect para él:

```ts
count(msg: Message): Effect[] {
  return [{ plugin: "title", type: "set", text: `${msg.payload} left` }];
}
```

Este es todo el camino. El handler sigue siendo puro: devuelve datos. El core encuentra el plugin cuyo `name` es `"title"` y llama a `handle(effect, ctx)`. La línea con `document.title` es la única línea impura de toda la aplicación, y vive en un lugar donde es fácil de encontrar.

Funciona, pero todavía no es bueno. `effect.text` es `unknown`, así que necesitamos `String(...)`. Un error tipográfico en el handler (`txt` en lugar de `text`) no es un error de compilación. Y `document` es un global, que un test tiene que falsear. Los siguientes pasos arreglan estas tres cosas.

## Tipa el effect y entrega un effector

Dale al plugin el tipo de sus effects. Un effect es una unión de objetos con `plugin` y `type`; `Plugin<E>` recibe esa unión. Luego el effector: un objeto pequeño de funciones que construyen los effects. Por último, recibe el mundo exterior, aquí el document, como parámetro con un valor por defecto.

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type TitleEffect = { plugin: "title"; type: "set"; text: string };

export const titleEffector = {
  set: (text: string): TitleEffect => ({ plugin: "title", type: "set", text }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect> {
  return {
    name: "title",
    handle(effect) {
      doc.title = effect.text;
    },
  };
}
```

Léelo desde arriba.

- `TitleEffect` es la forma de los datos. `plugin: "title"` y `type: "set"` son tipos literales, así que el effect no se puede confundir con un effect de otro plugin. Si más tarde añades un segundo effect, haz que el tipo sea una unión: `type TitleEffect = SetTitle | ResetTitle`, y `handle` puede hacer un switch sobre `effect.type`.
- `titleEffector.set(text)` devuelve exactamente el objeto de la primera versión, con tipos. El handler ahora lee `title.set(...)` y un campo equivocado es un error de compilación.
- `createTitlePlugin(doc)` es una factory. El valor por defecto es el `document` global, que se resuelve cuando se llama a la factory, así que en un servidor donde no hay `document` simplemente no creas este plugin. Un test pasa un document de jsdom o cualquier objeto con un campo `title`.
- El tipo de retorno es `Plugin<TitleEffect>`. Dentro de `handle`, `effect.text` es un `string`.

Un handler ahora se parece a los incluidos:

```ts
import { titleEffector as title } from "./title.ts";

count(msg: Message): Effect[] {
  return [title.set(`${msg.payload} left`)];
}
```

> [!NOTE] Dos formas de tipar un effect
> Los plugins del ui-kit escriben `interface RandomEffect extends Effect`, que acepta cualquier campo extra. Los plugins del framework usan una unión de tipos de objeto exactos, que es más estricta: un campo que no existe es un error. Ambos se pueden asignar a `Effect`, así que ambos se pueden devolver desde un handler. Usa la forma estricta para un plugin con varios effects.

## Un plugin que responde

El plugin de título nunca responde. La mayoría de los plugins sí: el trabajo lleva tiempo, o puede fallar. La regla es la misma que para los incluidos. El effect nombra los messages con los que responder, y el plugin llama a `ctx.dispatch`.

Escribamos un plugin para `localStorage`. Tiene dos effects: `load` lee una clave y responde con el valor, `save` lo escribe. Un valor se guarda como JSON.

```ts storage.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type StorageEffect =
  | {
      plugin: "storage";
      type: "load";
      key: string;
      onSuccess: string;
      onError: string;
    }
  | {
      plugin: "storage";
      type: "save";
      key: string;
      value: unknown;
      onError?: string;
    };

export const storageEffector = {
  load: (key: string, onSuccess: string, onError: string): StorageEffect => ({
    plugin: "storage",
    type: "load",
    key,
    onSuccess,
    onError,
  }),
  save: (key: string, value: unknown, onError?: string): StorageEffect => ({
    plugin: "storage",
    type: "save",
    key,
    value,
    ...(onError !== undefined && { onError }),
  }),
};

export interface StorageOptions {
  /** Defaults to `localStorage`; replace it in tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export function createStoragePlugin(
  opts: StorageOptions = {},
): Plugin<StorageEffect> {
  return {
    name: "storage",
    handle(effect, ctx) {
      const storage = opts.storage ?? localStorage;
      try {
        if (effect.type === "load") {
          const text = storage.getItem(effect.key);
          ctx.dispatch({
            id: effect.onSuccess,
            payload: text === null ? null : JSON.parse(text),
          });
        } else {
          storage.setItem(effect.key, JSON.stringify(effect.value));
        }
      } catch (error) {
        if (effect.onError) {
          ctx.dispatch({ id: effect.onError, payload: String(error) });
        }
      }
    },
  };
}
```

Lo que merece la pena notar:

- **Nombres de respuesta.** `load` tiene `onSuccess` y `onError`, los nombres estándar. Un componente hijo recibe su prefijo de message delante de estos campos, así que la respuesta encuentra el camino de vuelta al hijo. Un campo llamado `onDone` no recibiría prefijo, y la respuesta iría a la raíz. Usa `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` u `onChange`.
- **El fallo es un message.** El `try`/`catch` convierte una excepción (un almacenamiento bloqueado, un valor que no es JSON) en el message `onError` con el motivo. La aplicación decide qué hacer. No se lanza nada al core. Para `save`, `onError` es opcional: si nadie lo pidió, el error se descarta.
- **El mundo es una opción.** `storage` tiene por defecto el `localStorage` global, que se lee cuando se maneja el effect, y un test pasa un objeto simple con `getItem` y `setItem`.
- **La respuesta puede ser síncrona.** `ctx.dispatch` dentro de `handle` es seguro. El core pone el message en cola y lo procesa después del actual, así que el handler que pidió el `load` ya terminó.
- **Una clave que falta no es un error.** `getItem` devuelve `null`, y la respuesta es `null`. El handler decide qué significa eso.

El código que lo usa son dos handlers, uno que pide y otro que recibe:

```ts
load(): Effect[] {
  return [storage.load("todos", "loaded", "loadFailed")];
}

loaded(msg: Message): Effect[] {
  const items = Array.isArray(msg.payload) ? msg.payload : [];
  return [store.set("items", items)];
}
```

El flujo es el ciclo de siempre. `load` devuelve un effect de `storage`; el plugin lee la clave y despacha `{ id: "loaded", payload: [...] }`; en el turno siguiente, `loaded` guarda el valor. Sin promesas, sin callbacks y sin state fuera del store.

## Probar un plugin con un contexto falso

Un plugin recibe un contexto, y un contexto son tres funciones. Un test puede construir uno en cuatro líneas:

```ts storage.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import { createStoragePlugin, storageEffector as storage } from "./storage.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("storage loads, saves and reports errors", () => {
  const data: Record<string, string> = { a: '{"n":1}', bad: "{oops" };
  const plugin = createStoragePlugin({
    storage: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value),
    },
  });
  const { ctx, sent } = fakeContext();
  plugin.handle(storage.load("a", "ok", "failed"), ctx);
  plugin.handle(storage.load("missing", "ok", "failed"), ctx);
  plugin.handle(storage.load("bad", "ok", "failed"), ctx);
  plugin.handle(storage.save("b", [1, 2]), ctx);
  expect(sent).toEqual([
    { id: "ok", payload: { n: 1 } },
    { id: "ok", payload: null },
    { id: "failed", payload: expect.stringContaining("SyntaxError") },
  ]);
  expect(data.b).toBe("[1,2]");
});
```

El test pasa un `storage` falso hecho con un objeto simple, llama a `handle` con effects construidos por el effector y compara lo que se despachó con una lista. Comprueba los tres casos que importan: un valor que existe, una clave que falta y un valor que no es JSON. No hay aplicación, ni almacenamiento del navegador, ni librería de mocks.

Otros dos tipos de test son útiles, y ambos caben en unas pocas líneas:

```ts title.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type PluginContext,
} from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { createTitlePlugin, titleEffector as title } from "./title.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the title plugin sets document.title", () => {
  const { ctx } = fakeContext();
  createTitlePlugin(document).handle(title.set("3 left"), ctx);
  expect(document.title).toBe("3 left");
});

test("a handler asks for a title, the app performs it", () => {
  const app = createApp({
    app: (message: Message): Effect[] =>
      message.id === "count" ? [title.set(`${message.payload} left`)] : [],
    plugins: [createStorePlugin({}), createTitlePlugin(document)],
  });
  app.dispatch({ id: "count", payload: 2 });
  expect(document.title).toBe("2 left");
});
```

El segundo test arranca el core real con el plugin de título real: un handler devuelve el effect, y el título del document cambia. Úsalo para un plugin que usa una aplicación. Usa el contexto falso para el plugin solo.

## Un plugin que limpia

`title` y `storage` no guardan nada. Un plugin que registra un listener, un temporizador o un socket posee algo, y debe devolverlo. El core llama a `dispose()` cuando se hace dispose de la aplicación, en el orden inverso al registro.

Este es un plugin que informa del tamaño de la ventana. El effect `listen` inicia un listener de `resize`, `stop` lo elimina.

```ts viewport.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type ViewportEffect =
  | { plugin: "viewport"; type: "listen"; onChange: string }
  | { plugin: "viewport"; type: "stop" };

export const viewportEffector = {
  listen: (onChange: string): ViewportEffect => ({
    plugin: "viewport",
    type: "listen",
    onChange,
  }),
  stop: (): ViewportEffect => ({ plugin: "viewport", type: "stop" }),
};

export function createViewportPlugin(
  win: Window = window,
): Plugin<ViewportEffect> {
  let stop: (() => void) | undefined;
  const size = () => ({ width: win.innerWidth, height: win.innerHeight });

  return {
    name: "viewport",
    handle(effect, ctx) {
      stop?.();
      stop = undefined;
      if (effect.type === "stop") return;
      const report = () =>
        ctx.dispatch({ id: effect.onChange, payload: size() });
      win.addEventListener("resize", report);
      stop = () => win.removeEventListener("resize", report);
      report();
    },
    dispose() {
      stop?.();
    },
  };
}
```

Hay tres puntos que sacar de él.

1. El plugin guarda la forma de deshacer su propio trabajo, `stop`, en una variable de la factory. Esa variable es el state privado del plugin. El código de la aplicación nunca la ve.
2. Cada `handle` llama primero a `stop?.()`. Escuchar de nuevo **reemplaza** el listener anterior, como hace el plugin router. Sin eso, dos effects `listen` darían dos informes por un solo resize.
3. `dispose` elimina el listener. Sin él, un test que crea y hace dispose de diez aplicaciones filtra diez listeners.

El test lo maneja con la window real de jsdom:

```ts viewport.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import {
  createViewportPlugin,
  viewportEffector as viewport,
} from "./viewport.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the viewport plugin reports the size, and stops when disposed", () => {
  const { ctx, sent } = fakeContext();
  const plugin = createViewportPlugin(window);
  plugin.handle(viewport.listen("resized"), ctx);
  expect(sent).toEqual([
    { id: "resized", payload: { width: 1024, height: 768 } },
  ]);

  Object.assign(window, { innerWidth: 500 });
  window.dispatchEvent(new Event("resize"));
  expect(sent.at(-1)).toEqual({
    id: "resized",
    payload: { width: 500, height: 768 },
  });

  plugin.dispose?.();
  window.dispatchEvent(new Event("resize"));
  expect(sent).toHaveLength(2);
});
```

Usa el mismo patrón para cualquier cosa con identidad. Un plugin que envuelve una librería de gráficos guardaría un mapa de id a gráfico, reemplazaría un gráfico cuando se dibuja el mismo id otra vez y los destruiría todos en `dispose`.

## Leer uno real: random

El ui-kit tiene un plugin lo bastante corto como para leerlo de una vez. Un handler no puede llamar a `Math.random()`, porque el mismo message daría effects distintos. Así que le pide un número a un plugin y lo recibe como un message:

```ts random.ts
import type { Effect, Plugin } from "@service-laboratory/pavlus";

/**
 * The application is pure: it cannot call `Math.random()`. It asks this plugin
 * for a number and gets it back as a message, like an HTTP answer.
 */
export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  /** The answer is an integer from 0 up to, not including, `max`. */
  max: number;
  /** The id of the message that carries the answer as its payload. */
  replyTo: string;
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({
    plugin: "random",
    type: "int",
    max,
    replyTo,
  }),
};

export function createRandomPlugin(
  random: () => number = Math.random,
): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({
        id: effect.replyTo,
        payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)),
      });
    },
  };
}
```

- `RandomEffect` extiende `Effect`, así que se permiten campos extra. `max` es cuántos valores se quieren, `replyTo` es el message que lleva la respuesta.
- `randomEffector.int(max, replyTo)` es la única forma en que la aplicación construye el effect.
- `createRandomPlugin(random)` recibe la fuente de aleatoriedad como parámetro, con `Math.random` por defecto. Esta es la costura para los tests: pasa `() => 0` o `() => 0.999999` y la respuesta es conocida.
- `handle` hace una sola cosa y responde con `ctx.dispatch`. El `Math.min` mantiene la respuesta por debajo de `max` incluso si una fuente personalizada devuelve exactamente 1.

Lo usa el botón aleatorio de la página Theming. El handler pide, y otro handler recibe la respuesta:

```ts
"theming.random"(): Effect[] {
  return [randomEffector.int(allThemes().length, "randomPicked")];
}

randomPicked(msg: Message, state: AppState): Effect[] {
  const pick = allThemes()[msg.payload as number];
  return pick
    ? this._choose(withTheme(state.look, pick.palette, pick.mode))
    : [];
}
```

y el test del ui-kit lo comprueba con una fuente de aleatoriedad fija:

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
const plugin = createRandomPlugin(() => 0.999999);
plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
createRandomPlugin(() => 0).handle(
  randomEffector.int(100, "randomPicked"),
  ctx,
);
expect(sent).toEqual([
  { id: "randomPicked", payload: 99 },
  { id: "randomPicked", payload: 0 },
]);
```

Fíjate en que el test solo necesita `dispatch`, así que el contexto falso es `{ dispatch }`. Los otros tres plugins del ui-kit (theme, source, docs) se describen en [la referencia de plugins](page:plugins-reference).

## Las reglas

1. **Un plugin tiene un nombre y una familia de effects.** Ponle el nombre del mundo con el que habla (`storage`, `viewport`, `title`), no de la funcionalidad que lo usa.
2. **No decidas, haz.** Un plugin ejecuta un effect. No lee el state de la aplicación para elegir qué hacer. Todo lo que necesita va en el effect. `ctx.getState()` existe porque el plugin dom debe renderizar, pero un plugin que ramifica según el state ha sacado lógica de la aplicación del core puro, donde no se puede probar con una función simple.
3. **Responde con `ctx.dispatch`, con un id de message del effect.** No devuelvas un valor desde `handle`, no guardes un callback para que la aplicación lo llame y no nombres el message en el plugin. El effect decide quién recibe la respuesta.
4. **Usa los nombres de respuesta estándar**, para que los hijos reciban su prefijo.
5. **Los fallos esperados son messages.** Captúralos y despacha `onError`. Deja que un bug (un effect con una forma equivocada) lance una excepción. Recuerda que el core no ve un error dentro de una promesa o de un callback de temporizador: captúralo tú.
6. **Recibe el mundo como una opción.** `fetch`, `storage`, `window`, `document`, un reloj, una fuente aleatoria. Usa el global por defecto, resuelto cuando se maneja el effect o se llama a la factory.
7. **Posee tus recursos y libéralos.** Guarda listeners, temporizadores y sockets en la factory, haz las operaciones reemplazables por id y limpia en `dispose`.
8. **Entrega un effector.** Para una librería, exporta una interfaz para el effector y una constante anotada con ella, porque JSR exige un tipo explícito en cada constante exportada, y la interfaz es un buen lugar para los comentarios de documentación.

> [!WARNING] No mutes el state desde un plugin
> Un plugin no tiene forma de cambiar el state, y no debería buscar una. Solo el plugin `store` lo cambia, en respuesta a un effect `store.set` que devolvió tu handler. Si un plugin tiene un resultado que compartir, despacha un message, y un handler lo convierte en `store.set`.

## Cuándo no escribir un plugin

Un plugin es para el mundo exterior. Si el trabajo es un cálculo, un plugin es el lugar equivocado, y una función es más simple. Usa esta tabla antes de empezar:

| Quieres | Usa |
| --- | --- |
| Dar formato a una fecha, ordenar una lista, calcular un total | Una función pura a la que llama un handler |
| Mantener un valor derivado del state (una lista filtrada) | Calcúlalo en el handler, guárdalo con `store.set` |
| Llamar a una API | El plugin `http` |
| Esperar, repetir, hacer debounce | El plugin `time` |
| Dar foco a un input | `dom.focus` |
| Cambiar la URL | El plugin `router` |
| Mostrar u ocultar algo, alternar una clase | Una condición en el template, dirigida por el state |
| Reglas de negocio, validación | Un handler |
| Leer una API del navegador, un almacenamiento, un dispositivo, una librería de terceros con efectos secundarios | Un plugin |

Si te descubres poniendo un `if` sobre datos de la aplicación dentro de `handle`, ese código pertenece a un handler.

## Lo que aprendiste

- Un plugin es `{ name, handle }`. Tipa sus effects como una unión, constrúyelos con un effector y recibe el mundo exterior como una opción.
- Para responder, el effect nombra los messages de respuesta con los campos estándar, y el plugin llama a `ctx.dispatch`. Los fallos son messages.
- Un plugin que posee un recurso guarda la forma de deshacerlo y lo libera en `dispose`. Pruébalo con un contexto falso de tres funciones.
- No decidas en un plugin, no toques el state y no escribas un plugin para algo que una función puede hacer.

Siguiente: [Guía: una aplicación completa](page:guide-todo-app).
