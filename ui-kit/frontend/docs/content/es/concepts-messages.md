---
summary: Cómo los messages llevan información y cómo encuentran su componente. Ids de message, payloads y el campo event, cómo un prefijo enruta un message a un hijo, cómo un padre inicia y observa a sus hijos, hijos dinámicos, los wrappers mapMessage, mapEffects y compose, y un padre con dos hijos de principio a fin.
---
## Qué es un message

Un message es la entrada de tu aplicación. Es un objeto plano con hasta tres campos:

```ts
interface Message {
  id: string;
  payload?: unknown;
  event?: { type: string; value?: string; checked?: boolean; key?: string };
}
```

- **`id`** dice lo que pasó. También es el nombre del handler: el message `inc` llama al método `inc`.
- **`payload`** son los datos que lo acompañan. Lo eliges en el template, o lo pone un plugin, por ejemplo la respuesta de una petición HTTP.
- **`event`** es un breve resumen del evento del navegador, añadido por el plugin DOM a los messages que vienen de la página. Tiene el `type` del evento, y `value`, `checked` y `key` cuando el objetivo o el evento los tienen. Es un dato, no el evento del navegador en sí, así que un message sigue siendo serializable y se puede registrar y repetir.

Los messages que vienen de otros plugins no tienen `event`. Un temporizador envía `{ id: "tick" }` o el `payload` que le diste, y una petición terminada envía `{ id: "loaded", payload: { status: 200, data } }`.

## Messages en los templates

Un template no llama a funciones. Un atributo de evento nombra un message. El compilador lo convierte en datos, y `diff` puede comparar handlers por valor.

::demo message-ids

Mira la sección `vnodes` de la demo (ábrela). El clic en el `li` tiene `id: "select"` y el payload es el id del usuario. El clic en el botón tiene `id: "remove"` y `"stop": true`, porque se escribió el modificador `.stop`. El modificador `.prevent` funciona de la misma manera. Estos son los objetos exactos que el plugin DOM convertirá en messages.

La regla para los argumentos es simple. Sin argumento, el message no tiene payload. Con un argumento, `select(u.id)`, el argumento es el payload. Con varios, `move(a, b)`, el payload es un array `[a, b]`. El argumento es una expression que se evalúa sobre el state cuando se renderiza el template, y por eso pasas `u.id` y no el usuario completo: el id es pequeño y estable.

> [!TIP] Pon la identidad en el payload, el valor nuevo en el event
> Usa el payload para *qué cosa* (`remove(note.id)`) y `msg.event.value` para *lo que escribió el usuario* (`@input=setDraft`). Un handler lee entonces el state para todo lo demás. Nunca necesita el DOM.

## El handler de un message

En un componente de clase, el `id` del message se busca como nombre de método. El handler recibe el message, el state y un contexto con dos funciones, y devuelve un array de effects:

```ts
select(msg: Message, state: UsersState, ctx: ComponentCtx) {
  return [store.set("selectedId", msg.payload)];
}
```

El contexto tiene `send(child, id, payload?)`, que pide a un hijo sus effects, y `setRoute(location)`, para el enrutamiento. Ambas son puras: solo llaman a otros handlers y construyen datos. Un message sin handler no devuelve effects. Los nombres que nunca son messages, y los handlers por defecto, se listan en [Componentes y estado](page:concepts-components).

## Messages para los hijos

Una pantalla suele estar hecha de partes. Un dashboard muestra una lista de usuarios y una lista de tareas, y cada parte tiene su propio state y su propia lógica. En pavlus cada parte es un **componente hijo**, y el padre declara sus hijos una sola vez, con un nombre para cada uno.

**Un solo nombre lo une todo.** El nombre `users` aparece en tres lugares:

| Dónde | Qué hace el nombre |
| --- | --- |
| El template del padre | `+Users#users(...)` embebe la view del hijo. `#users` es el nombre de la instancia. |
| Los `children` de la clase padre | La clave `users` enruta los messages `users.*` al componente hijo. |
| El state | `state.users` es la porción de state que pertenece al hijo. |

La regla a recordar es: `users` en el template, `users` en `children`, `users` en el state.

### El prefijo hace el enrutamiento

Un message para un hijo lleva el nombre del hijo y un punto delante de su id. El padre lo quita y pasa el resto:

1. El message `users.select` llega al padre.
2. El padre busca un handler propio llamado `users.select` (más sobre esto abajo).
3. El id empieza con `users.`, y `users` es un hijo, así que el padre llama al hijo con el message `select`, y con la porción de state del hijo, `state.users`.
4. El hijo responde con effects. Sus effects se modifican entonces al salir. Un `store.set("selectedId", 2)` se convierte en `store.set("users.selectedId", 2)`, porque el path del store se coloca bajo la `key` del hijo. Un id de respuesta como `onSuccess: "loaded"` se convierte en `"users.loaded"`, de modo que la respuesta vuelve al mismo hijo.

Los campos que llevan un id de respuesta son `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` y `onChange`. Un plugin que use estos nombres obtiene el enrutamiento gratis.

La otra dirección también es automática. Los eventos del template del hijo se envían con el prefijo: el clic en `Users` que dice `@click=select(u.id)` llega al padre como `users.select`. El código del hijo nunca escribe el prefijo y nunca conoce su propio nombre. **El hijo no ve al padre.** Solo ve su propio state, más los `props` que el padre eligió darle.

### El padre inicia a un hijo

Un padre a menudo tiene que iniciar trabajo en sus hijos cuando arranca. `ctx.send(name, id, payload?)` devuelve los effects del hijo para un message enviado a él. No despacha nada. Llama al handler del hijo, con el state y el prefijo correctos, y devuelve los effects, así que los devuelves desde tu propio handler:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

Los effects ya se han reescrito para el hijo: un `set` de `status` es un `set` de `users.status`, y el id de respuesta HTTP es `users.loaded`. Si el nombre no es un hijo, `send` lanza `no child "name" to send "id" to`.

### El padre observa a un hijo

Antes de que un message se pase a un hijo, se ejecuta el handler **propio** del padre para el mismo id. Así un padre puede observar lo que ocurre en sus hijos, mediante un método con el id completo, entre comillas:

```ts
"users.select"(msg: Message, state: DashboardState) {
  const user = state.users.items.find((u) => u.id === msg.payload);
  return [store.set("selectedName", user ? user.name : "")];
}
```

Ambos handlers se ejecutan para un mismo message. Los effects del padre van primero en la lista, y los del hijo los siguen. Cuando el message no llega a ninguno (ni handler propio ni hijo), el componente recurre a los valores por defecto, como convertir `navigate` en un effect del router.

La observación es unidireccional. El hijo nunca sabe que el padre miró. Si el padre tiene que *cambiar* al hijo, lo hace a través del state del hijo en el store, o enviando un message con `send`.

## Un hijo elegido por el state

A veces el hijo no es fijo. Una página muestra una lista o una tabla, y el visitante puede cambiar. Un hijo puede ser un **valor en el state**. En el template, un embed dinámico `+{expr}#name(...)` renderiza el componente que dé la expression. En la clase, `select` elige el mismo componente para los messages, en lugar de `component`:

```ts
children: Children<PageState> = {
  users: { select: (state) => state.usersComponent, key: "users" },
};
```

```pavlus
div.page
  +{usersComponent}#users(...users filter=filter)
```

Cuando el valor en `state.usersComponent` cambia, el DOM antiguo se quita y el nuevo template se renderiza desde cero. Cuando sigue igual, solo se ejecuta el `diff` del hijo. Si `select` devuelve `null` o `undefined`, en ese momento no hay hijo: sus messages se ignoran, y `ctx.send` hacia él no devuelve effects.

Ten en cuenta que el state del hijo es la porción `state.users`, y sobrevive a un cambio. El message que cambia el componente también debería reiniciar la porción. Además, un componente en el state no es JSON, así que un historial serializado no lo mostrará. Nunca hagas `store.set` de un path *dentro* de un valor de componente, porque el store copiaría una instancia de clase como un objeto plano y perdería su prototipo.

## Wrappers: mapMessage, mapEffects, compose

Los componentes son funciones al final, `(message, state) => Effect[]`, así que puedes envolverlos. Los wrappers devuelven funciones simples, que también son componentes. Se exportan desde el paquete principal.

```ts
import {
  compose,
  mapEffects,
  mapMessage,
  namespace,
  toHandler,
  withLogging,
} from "@service-laboratory/pavlus";

const counter = toHandler(new Counter());

const renamed = mapMessage(counter, (msg) =>
  msg.id === "bump" ? { ...msg, id: "inc" } : msg.id === "drop" ? null : msg,
);

const quiet = mapEffects(counter, (effects) =>
  effects.filter((effect) => effect.plugin !== "logger"),
);

const twice = compose(counter, counter);

const nested = namespace("c", counter, { key: "k" });

const logged = withLogging(counter, "counter");
```

- `mapMessage(inner, f)` cambia la entrada. `f` recibe el message y el state y devuelve un message, o `null` para descartarlo. Aquí `bump` se maneja como `inc`, y `drop` se ignora.
- `mapEffects(inner, f)` cambia la salida. `f` recibe los effects, el message y el state, y devuelve los effects que se usarán. Úsalo para filtrar, añadir o reescribir effects.
- `compose(a, b, ...)` ejecuta todos sobre el mismo message y concatena sus effects. `twice` arriba devuelve el effect `set` dos veces.
- `namespace(prefix, child, { key, props })` es la primitiva detrás de `children`. Solo pasan los ids que empiezan con `c.`, el hijo ve el resto, y sus paths de `store` y sus ids de respuesta se reescriben. Si `inc` hace `store.set("n", state.n + 1)`, entonces para `{ id: "c.inc" }` y el state `{ k: { n: 5 } }` el resultado es `store.set("k.n", 6)`.
- `withLogging(inner, label)` pone un effect `logger` con nivel `debug` antes de los effects. Para `inc` con un effect se lee `[counter] inc -> 1 effect(s)`, y los datos contienen el payload y la lista de los effects como `plugin.type`.

Como son funciones de funciones, se combinan entre sí y con las clases: `compose` acepta una instancia de clase y una función en la misma llamada.

## Un padre con dos hijos, de principio a fin

Ahora el cuadro completo. Un dashboard tiene un input de filtro, una lista de usuarios y una lista de tareas. La lista de usuarios lee el filtro como un prop. El padre carga ambas listas cuando arranca, y anota cuándo llegan los usuarios y qué usuario está seleccionado.

La lista de usuarios es un template y un componente. El template lee los campos del state del hijo, y el prop `filter`:

```pavlus users.pavlus
ul.users
  for u in items key u.id
    if !filter || u.name.includes(filter)
      li(class:selected={u.id === selectedId} @click=select(u.id)) {u.name}
```

```ts users.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./users.pavlus";

export interface User {
  id: number;
  name: string;
}

export interface UsersState {
  status: "idle" | "loading" | "failed";
  items: User[];
  selectedId: number;
  filter?: string;
}

export class Users extends Component<UsersState> {
  view = view;

  load() {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: User[] };
    return [store.set("items", reply.data), store.set("status", "idle")];
  }

  failed() {
    return [store.set("status", "failed")];
  }

  select(msg: Message) {
    return [store.set("selectedId", msg.payload)];
  }
}

export const users = new Users();
```

La lista de tareas es la misma idea, con un checkbox:

```pavlus tasks.pavlus
ul.tasks
  for t in items key t.id
    li(class:done=t.done)
      input(type="checkbox" checked=t.done @change=toggle(t.id))
      span {t.title}
```

```ts tasks.ts
import { Component, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./tasks.pavlus";

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export interface TasksState {
  items: Task[];
}

export class Tasks extends Component<TasksState> {
  view = view;

  load() {
    return [
      http.request({
        id: "tasks",
        url: "/api/tasks",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message) {
    const reply = msg.payload as { data: Task[] };
    return [store.set("items", reply.data)];
  }

  toggle(msg: Message, state: TasksState) {
    const items = state.items.map((t) =>
      t.id === msg.payload ? { ...t, done: !t.done } : t,
    );
    return [store.set("items", items)];
  }
}

export const tasks = new Tasks();
```

El padre declara ambos hijos, en `children`, y embebe ambos en su template. La demo de abajo usa exactamente estos templates de los hijos. Sus tres pasos cambian una porción cada vez. Mira los ids de los patches: `3/2#2` significa el nodo 3 del template del hijo, dentro del embed con el id 2 del padre, para el elemento de lista con la key 2. Cada hijo tiene sus propios ids, así que los patches nunca chocan.

::demo dashboard

El template del padre (el de la demo) se guarda como `dashboard.pavlus`. Sigue la regla del nombre: `#users` y `#tasks` son las claves de `children` y los campos del state. El spread `...users` pasa la porción del hijo, y `filter=filter` añade el input. Los eventos del input pertenecen al padre y no tienen prefijo, mientras que los eventos dentro de los hijos salen como `users.select` y `tasks.toggle`.

```ts dashboard.ts
import {
  Component,
  type Children,
  type ComponentCtx,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { tasks, type TasksState } from "./tasks.ts";
import { users, type UsersState } from "./users.ts";
import view from "./dashboard.pavlus";

export interface DashboardState {
  filter: string;
  users: UsersState;
  tasks: TasksState;
  selectedName: string;
  usersLoaded: number;
}

export class Dashboard extends Component<DashboardState> {
  view = view;

  children: Children<DashboardState> = {
    users: {
      component: users,
      key: "users",
      props: (state) => ({ filter: state.filter }),
    },
    tasks: { component: tasks, key: "tasks" },
  };

  mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
    return [...send("users", "load"), ...send("tasks", "load")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.event?.value ?? "")];
  }

  "users.select"(msg: Message, state: DashboardState) {
    const user = state.users.items.find((u) => u.id === msg.payload);
    return [store.set("selectedName", user ? user.name : "")];
  }

  "users.loaded"(_msg: Message, state: DashboardState) {
    return [store.set("usersLoaded", state.usersLoaded + 1)];
  }
}

export const dashboard = new Dashboard();
```

Con un plugin HTTP falso que responde de inmediato, la ejecución, message por message, es:

```text
mounted       -> store.set, http.request, http.request
users.loaded  -> store.set, store.set, store.set
tasks.loaded  -> store.set
```

El message `mounted` lo maneja el padre. Devuelve el `set` de `users.status` y las dos peticiones, ya con el prefijo para sus hijos. Luego llegan las dos respuestas como `users.loaded` y `tasks.loaded`, cada una en su propio turno. Para `users.loaded` se ejecuta primero el handler propio del padre, un `set` para `usersLoaded`, y sigue el `loaded` del hijo con dos más. Los tres effects `set` están en el mismo paso. Ningún hijo sabe del otro.

> [!WARNING] Mantén los tres nombres iguales
> Si la clave en `children` es `users` pero el template dice `#user`, el clic llega como `user.select`, ningún hijo tiene ese nombre y el message no hace nada. No hay error, porque un message que nadie maneja no es un error. Cuando un hijo parezca muerto, compara primero los tres nombres.

## Lo que aprendiste

- Un message es `{ id, payload?, event? }`. El template crea el id y el payload, el plugin DOM añade `event`, y un argumento es el payload mientras que varios forman un array.
- El mismo nombre une el embed del template (`#users`), la clave de `children` y la porción del state. El prefijo `users.` enruta un message al hijo, que lo ve sin el prefijo.
- Los effects del hijo se reescriben al salir: los paths del store reciben la `key`, los ids de respuesta reciben el prefijo. El hijo nunca ve a su padre.
- Un padre inicia a un hijo con `ctx.send` y lo observa con un handler entre comillas como `"users.select"`, que se ejecuta antes que el del hijo. Un hijo elegido con `select` que devuelve `null` se ignora.
- `mapMessage`, `mapEffects`, `compose`, `namespace` y `withLogging` envuelven componentes, y devuelven funciones.

Siguiente: [Enrutamiento](page:concepts-routing).
