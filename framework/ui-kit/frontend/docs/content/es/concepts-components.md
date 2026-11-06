---
summary: Cómo funciona un componente. Componentes de función y de clase, el único árbol de state y cómo lo alcanza store.set, cómo lee el template el state, el campo view, props, los messages mounted, enter y leave, por qué la instancia es compartida y las reglas para los nombres de handlers. Termina con un componente todo completo.
---
## Qué es un componente

Un componente en pavlus es una pieza de lógica que responde a messages. Dado un message y el state actual, devuelve una lista de effects. También puede tener una **view**: el template compilado que muestra el state. No se necesita nada más. No hay un método render, ni una clase de ciclo de vida, ni hooks.

Un componente toma una de dos formas. Puede ser **una función**:

```ts
import { type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";

interface CounterState {
  count: number;
}

export const counter = (msg: Message, state: CounterState) => {
  switch (msg.id) {
    case "inc":
      return [store.set("count", state.count + 1)];
    case "dec":
      return [store.set("count", state.count - 1)];
    default:
      return [];
  }
};
```

O puede ser **una instancia de una clase que extiende `Component`**. Cada método es el handler del message con el mismo nombre, así que el `switch` desaparece:

```ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./counter.pavlus";

interface CounterState {
  count: number;
}

class Counter extends Component<CounterState> {
  view = view;

  inc(_msg: Message, state: CounterState) {
    return [store.set("count", state.count + 1)];
  }

  dec(_msg: Message, state: CounterState) {
    return [store.set("count", state.count - 1)];
  }
}

export const counter = new Counter();
```

Ambas formas hacen el mismo trabajo, y `createApp({ app })` acepta cualquiera de las dos. La diferencia es lo que puede contener la forma de clase. Una función no tiene `view`, así que no se puede renderizar con `createApp({ mount })`: el core lanza `mount needs an app that is a component with a view`. Tampoco tiene `children` ni `routing`. Usa una función para lógica pequeña y pura y para wrappers, y una clase para todo lo que se muestra en la pantalla.

Una clase debe **pasarse como instancia**. `createApp({ app: Counter })` lanza un error que dice `Counter is a class: pass an instance (new Counter()), not the class`. Un objeto plano con métodos, o una clase que no extiende `Component`, también se rechaza, y el error dice qué escribir.

## El árbol de state

La aplicación tiene **un solo state**: un objeto plano, guardado por el plugin store. Todos los componentes leen de él y ninguno tiene una copia privada. Una aplicación pequeña mantiene todos los campos arriba. Una más grande los agrupa en ramas, como `state.users` y `state.tasks`, una rama por cada componente hijo.

El state es un árbol de datos planos. Puede contener cadenas, números, arrays y objetos. Debe ser fácil de imprimir y de comparar. La única excepción es un valor de componente: un embed `+{expr}` (consulta [Mensajes y componentes hijos](page:concepts-messages)) puede leer un componente del state, pero entonces el state ya no es JSON.

Un handler nunca cambia el state. Devuelve un effect, y el plugin store construye un nuevo objeto de state. Veamos qué pueden hacer los effects del store. Cada uno tiene un `path`, escrito como una cadena con puntos (`"user.name"`) o como un array (`["items", 3, "done"]`). Un número en un path de array indexa un array.

| Effect | Builder | Qué hace el store |
| --- | --- | --- |
| `set` | `store.set(path, value)` | Pone `value` en `path` y crea los padres que falten. |
| `merge` | `store.merge(path, object)` | Mezcla de forma superficial los campos de `object` en el objeto que está en `path`. |
| `remove` | `store.remove(path)` | Borra el campo. Un elemento de array se quita con splice. |
| `undo` | `store.undo(steps?)` | Revierte los últimos `steps` cambios (uno por defecto). |
| `restoreTo` | `store.restoreTo(timestamp)` | Revierte cada cambio registrado después de esa hora. |

El store cambia solo la rama del path. Los objetos de otras ramas conservan su identidad, así que un template que lee `state.tasks` no ve ningún cambio cuando se hace `set` de `state.users.status`. Escribir el mismo valor otra vez no cambia nada y no se registra. Cada cambio guarda su propio inverso, y así funciona `undo` sin snapshots.

## Cómo llega el state al template

Un template no recibe props ni un contexto. Lee **el objeto state**. Un identificador en una expression es un campo del state, o una variable de bucle. En `p Hello, {user.name}` la palabra `user` es `state.user`.

::demo state-and-template

La demo muestra ambos lados. El template lee dos campos, `user` y `unread`. Cuando `unread` pasa de 3 a 4, el `diff` compilado devuelve un patch `text` para el párrafo. Esta es toda la relación entre un componente y su template: **los handlers escriben el state, el template lo lee.** Ninguno llama al otro.

Esto da forma a cómo diseñas el state. El template puede hacer cosas pequeñas con expressions: comparar, sumar, comprobar si algo está vacío, llamar a métodos como `includes`. No puede ejecutar código arbitrario, porque las expressions son un subconjunto pequeño y puro de JavaScript. Todo lo que necesite un cálculo real, como un recuento de tareas abiertas, una copia ordenada o una fecha con formato, se calcula en el handler y se guarda como un campo. El ejemplo todo del final de la página hace esto con `left`.

## La view

El campo `view` contiene el template del componente, que es el export por defecto de un archivo `.pavlus`:

```ts
import view from "./todos.pavlus";

class Todos extends Component<TodoState> {
  view = view;
}
```

Una view es `{ render, diff, meta }`: dos funciones puras, generadas por el compilador. `createApp({ app, mount })` renderiza `app.view` en el elemento `mount`, y el plugin DOM lo mantiene actualizado. La view de un componente hijo se coloca en el template de un padre con un embed (`+Child#name`). Un componente sin view está bien: es solo lógica, por ejemplo un hijo con el que un padre habla pero que no muestra.

`viewOf(component)` devuelve la view cerrada sobre su componente. Eso es lo que permite que `+outlet` y los hijos embebidos encuentren el `routing` y los `children` del componente. Rara vez la llamas tú mismo, porque `mount` y el helper de test `mountView` lo hacen por ti.

## Props

Un padre puede dar a un hijo **entradas de solo lectura** mediante `props`. Es una función del state del padre a un objeto, y el objeto se mezcla en el state del hijo:

```ts
children: Children<DashboardState> = {
  users: {
    component: users,
    key: "users",
    props: (state) => ({ filter: state.filter }),
  },
};
```

El hijo ve `{ ...state.users, filter }`. En sus handlers y en su template, `filter` es simplemente un campo. Dos reglas importan. Los props se mezclan **después** de la porción propia del hijo, así que un prop gana frente a un campo con el mismo nombre. Y un prop es solo una entrada: el hijo no debe escribirlo. Un `store.set("filter", ...)` en el hijo escribiría `users.filter` en el state del padre, que es otro lugar. La página [Mensajes y componentes hijos](page:concepts-messages) muestra toda la conexión.

## Ciclo de vida: mounted, enter y leave

Pavlus no tiene métodos de ciclo de vida. Hay **messages**, como cualquier otro evento, que el framework envía en tres momentos. Un componente los maneja con métodos del mismo nombre, y devuelve effects.

| Message | Cuándo se envía | Quién lo recibe |
| --- | --- | --- |
| `mounted` | Una vez, después de que la aplicación esté en el DOM. Es el primer message de una app creada con `mount`. | El componente raíz. Para una view montada con el effect `dom.mount` eliges el message con su opción `onMounted`. |
| `enter` | Un hijo enrutado pasó a estar activo, o cambió la propia ruta de una página hoja (por ejemplo de `/items/5` a `/items/7`). El payload es la ruta del hijo. | El hijo enrutado, como `enter`. |
| `leave` | Un hijo enrutado deja de estar activo. El payload es la ruta que tenía. | El hijo enrutado, como `leave`. |

`mounted` es donde una aplicación empieza su trabajo: cargar datos, iniciar temporizadores, escuchar al router. Un padre que embebe hijos los inicia con `ctx.send`:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

`enter` y `leave` pertenecen al enrutamiento. Una página carga sus datos cuando se entra en ella y detiene sus temporizadores cuando se sale:

```ts
class Tasks extends Component<TasksState> {
  enter() {
    return [store.set("status", "loading")];
  }

  leave() {
    return [store.set("status", "idle")];
  }
}
```

Si un componente con `routing` no tiene su propio `mounted`, el de por defecto devuelve `router.listen("routeChanged")`, y el `routeChanged` por defecto llama a `ctx.setRoute`, que guarda la ruta y devuelve los effects `leave` y `enter` para cada hijo enrutado afectado por el cambio. Los hijos más profundos salen primero, y los nuevos entran de arriba hacia abajo. Consulta [Enrutamiento](page:concepts-routing).

> [!NOTE] Todavía no hay hooks de template
> Un template no puede enviar un message cuando sus nodos aparecen o desaparecen. Las notas de diseño lo listan como no construido. Por ahora un padre inicia a un hijo explícitamente con `ctx.send`, y una página enrutada usa `enter`.

## Una instancia, compartida por todos los messages

Un componente se crea una vez, `export const todos = new Todos()`, y luego maneja todos los messages de la aplicación. El core incluso guarda en caché una función handler para cada instancia. Por eso la instancia no debe contener **ningún state mutable**. Si un handler hiciera `this.count++`, el número sobreviviría entre messages, un test no podría predecirlo y en un servidor lo compartirían todas las peticiones. El state pertenece al store, y se pasa como argumento.

```ts
class Bad extends Component<{ n: number }> {
  calls = 0;

  inc(_msg: Message, state: { n: number }) {
    this.calls++;
    return [store.set("n", state.n + this.calls)];
  }
}
```

Compáralo con la versión donde todo lo que cambia está en el state. El handler calcula el nuevo valor solo a partir de sus argumentos.

```ts
class Good extends Component<{ n: number }> {
  inc(_msg: Message, state: { n: number }) {
    return [store.set("n", state.n + 1)];
  }
}
```

La configuración inmutable está bien. `this` en un handler es el componente, así que la configuración en el constructor funciona: `new UsersList(20)` puede guardar un tamaño de página. Una subclase puede sobrescribir un handler y llamar a `super`. Pavlus no prohíbe los campos mutables. Es responsabilidad del autor, como lo es toda la pureza.

## Reglas para nombrar handlers

El core busca un handler por el id del message: el método con ese nombre en la instancia. Estas reglas deciden qué cuenta.

- Un message cuyo id no tiene método recibe una lista vacía de effects, no un error. Un error tipográfico en un template pasa en silencio, así que revisa los nombres.
- Un handler debe devolver un array. De lo contrario el core lanza `handler "x" must return an array of effects`, con el nombre del handler.
- **Nombres que nunca son messages:** `view`, `children`, `routing`, `dispatch`, todo nombre que empiece con `_`, todo miembro `#private` y todo lo que un objeto tiene por defecto (`toString`, `constructor`, `hasOwnProperty`...). Un message con el id `view` o `_left` nunca llama a nada.
- Usa `_name` para los métodos auxiliares que llamas desde los handlers. `this._left(items)` funciona, y un message `_left` nunca puede llegar a él.
- Un handler puede ser un campo de clase con un valor de función. `load: Handler<S> = (msg, state, ctx) => [...]` se encuentra como un método, y da a TypeScript los tipos de los parámetros.
- Un id de message con un punto necesita un nombre de método entre comillas: `"users.remove"(msg) { ... }`. Así es como un padre observa a sus hijos, lo que muestra la página siguiente.

Dos messages tienen un valor por defecto cuando nadie los maneja. Un message cuya última parte es `navigate` (como `navigate` o `header.navigate`) con un payload de tipo cadena se convierte en `router.navigate(url)`. Y en un componente con `routing`, `mounted` y `routeChanged` hacen la conexión con el router. Un handler con el mismo nombre reemplaza el de por defecto.

## Un ejemplo completo: un componente todo

El último ejemplo junta las partes: una view con un formulario, un filtro y una lista; un state con un draft, items y un contador de tareas abiertas; y handlers que mantienen correcto el campo derivado `left`.

::demo todo

El template lee `draft`, `filter`, `items` y `left`. El checkbox envía `toggle` con el id del item, el botón envía `remove`, y los botones de filtro envían `setFilter` con una cadena. En la demo el primer paso hace toggle del item 1: cambian la clase del `li`, la propiedad `checked` del checkbox y el texto del contador. El segundo paso cambia el filtro, así que cambia la clase de los dos botones de filtro y el item terminado se limpia de la lista.

Este es el componente. Fíjate en que hay un solo lugar, `_left`, que sabe contar, y que todo handler que cambia `items` también devuelve su resultado.

```ts todos.ts
import { Component, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todos.pavlus";

export interface Item {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  draft: string;
  filter: "all" | "open";
  items: Item[];
  nextId: number;
  left: number;
}

export class Todos extends Component<TodoState> {
  view = view;

  setDraft(msg: Message) {
    return [store.set("draft", msg.event?.value ?? "")];
  }

  setFilter(msg: Message) {
    return [store.set("filter", msg.payload)];
  }

  add(_msg: Message, state: TodoState) {
    const text = state.draft.trim();
    if (text === "") return [];
    const items = [...state.items, { id: state.nextId, text, done: false }];
    return [
      store.set("items", items),
      store.set("nextId", state.nextId + 1),
      store.set("draft", ""),
      this._left(items),
    ];
  }

  toggle(msg: Message, state: TodoState) {
    const items = state.items.map((item) =>
      item.id === msg.payload ? { ...item, done: !item.done } : item,
    );
    return [store.set("items", items), this._left(items)];
  }

  remove(msg: Message, state: TodoState) {
    const items = state.items.filter((item) => item.id !== msg.payload);
    return [store.set("items", items), this._left(items)];
  }

  _left(items: Item[]) {
    return store.set("left", items.filter((item) => !item.done).length);
  }
}

export const todos = new Todos();
```

Como el componente es puro, su test es corto y no necesita navegador:

```ts todos.test.ts
import assert from "node:assert/strict";
import { toHandler } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { todos, type TodoState } from "./todos.ts";

const handle = toHandler(todos);
const state: TodoState = {
  draft: "Write docs",
  filter: "all",
  items: [],
  nextId: 1,
  left: 0,
};

assert.deepEqual(handle({ id: "add" }, state), [
  store.set("items", [{ id: 1, text: "Write docs", done: false }]),
  store.set("nextId", 2),
  store.set("draft", ""),
  store.set("left", 1),
]);

assert.deepEqual(handle({ id: "add" }, { ...state, draft: "  " }), []);
assert.deepEqual(handle({ id: "_left" }, state), []);
```

La última línea muestra la regla de nombres en acción: un message no puede alcanzar el helper `_left`.

## Lo que aprendiste

- Un componente es una función o una instancia de una clase que extiende `Component`. En una clase, cada método maneja el message con su nombre. Pasa la instancia, no la clase.
- El state es un árbol en el store. Los handlers devuelven effects `store.set`, `merge` o `remove` con paths, y el template lee el state por nombre.
- `view` es el template compilado, `props` son entradas de solo lectura de un padre, y `mounted`, `enter` y `leave` son messages normales enviados en el momento adecuado.
- La instancia es compartida por todos los messages, así que mantenla libre de state mutable. Calcula los valores derivados en los handlers y guárdalos.
- Nombres que nunca son messages: `view`, `children`, `routing`, `dispatch`, `_private` y `#private`, y lo que todo objeto tiene.

Siguiente: [Mensajes y componentes hijos](page:concepts-messages).
