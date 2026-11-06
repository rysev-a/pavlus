---
summary: Conecta clics, escritura y envíos de formularios con tu código. Aprende la sintaxis @event=message(args), los payloads, los modificadores prevent y stop, cómo un message obtiene su id y qué contiene realmente el template compilado.
---
## Los eventos son datos

Una página que solo muestra valores es un documento. Para hacerla interactiva, el template debe decir "cuando el usuario haga esto, avisa a la aplicación". En pavlus esto se hace con un **enlace de evento**, y lo que se envía no es una función. Es un *message*: un pequeño dato plano con un id y un payload opcional.

Un enlace de evento es un atributo cuyo nombre empieza con `@`. La parte después de la `@` es el evento del DOM (`click`, `input`, `submit`, `keydown`, ...). El valor es el id del message que se envía.

::demo click open=vnodes

Mira los vnodes: el elemento button en el resultado de `render` contiene `events: { click: { id: "save" } }`. No hay ninguna función. El template no sabe qué hace `save`. Solo dice qué message significa el clic. Tu aplicación tiene un handler para `save` y decide qué cambiar en el state.

Este diseño tiene una razón. Un nodo virtual que es solo datos se puede comparar, registrar, grabar y repetir. El template sigue siendo una función pura del state, y toda la lógica queda en un solo lugar, en los componentes, donde es fácil de probar.

## Enviar un valor con el message

La mayoría de los eventos necesitan decir *cuál* cosa recibió el clic. El enlace puede parecer una llamada con **argumentos**. Los argumentos son [expresiones](page:syntax-expressions) normales, evaluadas sobre el state cuando se renderiza el template. El resultado viaja con el message como su **payload**.

::demo payload open=vnodes

El botón Remove lleva `{ id: "remove", payload: 1 }`: el valor de `item.id` en el momento del render. Cuando el usuario hace clic, el handler de `remove` recibe ese payload y sabe qué item borrar.

Mira el primer paso. Cuando `item.id` cambia de 1 a 2, `diff` devuelve un patch con la operación `handler`:

```text
{"op":"handler","id":"3","event":"click","msg":{"id":"remove","payload":2}}
```

El listener ya está en el elemento real del DOM. El patch solo reemplaza el message que enviará el listener. En el segundo paso cambia el título, el payload no, y el único patch es el de texto.

### Varios argumentos

Con un argumento, el payload es ese valor. Con dos o más, el payload es un **array** con ellos, en orden.

::demo several-args

El payload aquí es `[5, "up", 1]`. Sin argumentos, o con paréntesis vacíos, no hay payload en absoluto, así que `@click=save` y `@click=save()` son lo mismo.

::demo empty-parens

> [!NOTE] Un valor o un array
> La forma del payload depende de cuántos argumentos escribiste: un argumento da ese valor, dos o más dan un array. Si planeas añadir un segundo argumento más tarde, recuerda que el handler tendrá que cambiar de `msg.payload` a `msg.payload[0]`. Muchos autores envían un solo valor, o un solo objeto construido en el state, por esta razón.

## Qué se puede escribir como handler

La parte antes de los paréntesis es un **id de message**. Es un nombre, o nombres unidos por puntos:

::demo dotted

Aquí el id es `users.open`. Un id con puntos sirve para agrupar messages, y es lo que hace funcionar el prefijo de los componentes (ver más abajo).

El compilador acepta solo un nombre, o una cadena de nombres, opcionalmente seguida de una llamada. Cualquier otra cosa es un error:

```pavlus-invalid
button(@click=ready ? start : stop) Go
```

Este falla en el parser de atributos: `Unexpected "?" in attributes (line 1, col 21)`, porque un valor sin adornos termina en el primer espacio. Envuelto entre llaves llega a la siguiente comprobación, con este mensaje:

```pavlus-invalid
button(@click={ready ? start : stop}) Go
```

```text
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

El mismo mensaje se muestra para `@click=items[0]` y para una llamada de una llamada, `a.b(1)(2)`. Un enlace sin ningún valor, `button(@click)`, dice `"@click" needs an expression value`.

## Modificadores: prevent y stop

El navegador hace algunas cosas por sí mismo. Un clic en un enlace sigue el enlace. Un envío de un formulario recarga la página. Un clic también sube (bubbling) hasta los padres del elemento, y sus handlers también se ejecutan. A menudo quieres desactivar eso.

Puedes hacerlo con **modificadores**, escritos después del nombre del evento, separados por puntos:

| Modificador | Qué hace |
| --- | --- |
| `.prevent` | llama a `preventDefault()` sobre el evento del DOM: no se sigue el enlace, no se envía el formulario |
| `.stop` | llama a `stopPropagation()`: los listeners de los padres no ven el evento |

Se pueden combinar, en cualquier orden: `@click.prevent.stop=openHelp`.

::demo modifiers open=vnodes

Mira los vnodes. Los modificadores no son parte del nombre del evento. Son dos banderas en el message, `prevent: true` y `stop: true`. El plugin DOM las lee cuando ocurre el evento, llama al método del DOM y solo entonces envía el message. Así que aquí la página también sigue siendo solo datos.

Un modificador que el compilador no conoce se ignora en silencio: `@click.foo=save` es lo mismo que `@click=save`. Revisa la ortografía de `.prevent` cuando un formulario siga recargando la página.

> [!WARNING] Varios enlaces para el mismo evento
> Un elemento puede tener muchos eventos distintos (`@input`, `@keydown`, `@focus`), pero solo un enlace por nombre de evento. Si escribes `@click` dos veces en el mismo elemento, gana el último y el primero se descarta sin error.

::demo many-events

## Qué recibe el handler

Cuando el usuario hace clic, el plugin DOM envía a tu aplicación un objeto message con tres campos:

| Campo | Valor |
| --- | --- |
| `id` | el id del message, con el prefijo de los componentes embebidos delante |
| `payload` | el payload del template, o `undefined` |
| `event` | una pequeña instantánea del evento del DOM |

La instantánea, `msg.event`, es el único lugar donde el navegador se filtra a tu lógica, y es pequeña a propósito: `type` (el nombre del evento), `value` (el `value` del elemento, cuando es una cadena), `checked` (para checkboxes) y `key` (para eventos de teclado). Esto basta para formularios.

Un componente es una clase. **Cada método es un handler para el message con el mismo nombre.** Un handler es puro: recibe el message y el state actual, y devuelve una lista de effects, por ejemplo "pon este path en el store".

```ts todo.ts
import {
  Component,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./todo.pavlus";

interface State {
  text: string;
  tasks: { id: number; title: string }[];
}

class Todo extends Component<State> {
  view = view;

  setText(msg: Message) {
    return [store.set("text", msg.event?.value ?? "")];
  }

  remove(msg: Message, state: State) {
    return [
      store.set(
        "tasks",
        state.tasks.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}
```

El template de este componente tiene `input(value=text @input=setText)` y `button(@click=remove(task.id))`. Los nombres coinciden con los nombres de los métodos. Un message sin método no es un error: no pasa nada y no se devuelven effects. Esto hace silencioso un error tipográfico en un id de message, así que prueba tu página haciendo clic.

El state que se muestra en el input es solo una semilla. El navegador conserva lo que el usuario escribió. El handler de `@input` lo copia al state, y el state mantiene actualizado el resto de la aplicación.

## Eventos en bucles

Los eventos dentro de un bucle `for` son el caso más común. El payload es lo que dice al handler qué item recibió el clic.

::demo in-loop open=vnodes

Cada tarea tiene su propio par de botones, y el payload de cada uno es el `id` de su tarea: 10 para la primera y 20 para la segunda. Hay un solo handler para `toggle`, no una función por fila, y funciona para cualquier número de filas. El `.stop` en el segundo botón evita que el clic llegue al elemento de la lista, si el elemento tuviera un handler propio.

¿Por qué es `task.id` y no la posición de la tarea en la lista? Cuando la lista cambia, las posiciones cambian, pero los ids no. Un message que lleva el id siempre significa la misma tarea. Consulta también la [página siguiente](page:syntax-control-flow) sobre `key`.

## De dónde saca el prefijo el id del message

Cuando un template se embebe en otro con `+Name#instance`, el template embebido es un archivo aparte con sus propios messages: dice `@click=pick(id)` y no sabe quién lo usará. El padre da a cada instancia embebida un **nombre**, y el compilador pone ese nombre, y un punto, delante de cada id de message que sale de ella.

::demo with-component open=vnodes

El template `Row` envía `pick`. Las dos instancias se llaman `first` y `second`, así que los messages son `first.pick` y `second.pick`. El botón `Reset` pertenece al padre y no tiene prefijo. El módulo generado muestra cómo funciona:

```ts
ulChildren.push(...Row.render(
  { "id": 1, "label": "One" },
  idSuffix + "/1",
  messagePrefix + "first.",
  childEnv(env, "first", state),
));
```

Cada view compilada tiene un parámetro `messagePrefix`. Una view de nivel superior recibe uno vacío. Un embed pasa `messagePrefix + "first."`, y cada evento se escribe como `id: messagePrefix + "pick"`. Si `Row` embebiera algo por su cuenta, el prefijo crecería con un nombre más: `first.cell.pick`. El hijo no necesita saber nada de sus padres, así que el mismo template se puede colocar en cualquier parte.

Si no escribes `#name`, el nombre es el nombre importado con la primera letra en minúscula:

::demo default-name

El primer embed envía `userCard.open`, el segundo, con `#admin`, envía `admin.open`. Usa un nombre explícito para cualquier template que embebas más de una vez, para poder distinguir los messages de las instancias.

Del lado de la aplicación, el prefijo es lo que se usa para enviar messages al componente hijo correcto, y para darle al padre una forma de vigilar los messages de sus hijos con un handler de nombre entre comillas, como `"first.pick"(msg) { ... }`. Esto se describe en [componentes](page:concepts-components) y [mensajes](page:concepts-messages).

## Qué permanece igual y qué cambia

Compara dos cosas que viste en esta página. Un enlace sin argumentos (`@click=save`) no tiene `id` en su elemento en el vnode, porque nada en él puede cambiar nunca, así que `diff` nunca necesita encontrarlo.

::demo static-event

Cuando `busy` cambia, solo se produce el patch de la clase. No se mira el enlace del evento. Un enlace con argumentos es distinto: el compilador recuerda el id del elemento y, cuando `diff` encuentra un payload distinto, emite un patch `handler`. Un nodo cuyos enlaces, atributos y texto no pueden cambiar no cuesta nada en el momento de la actualización.

## Todo junto

Una pequeña lista con un input, usando lo que viste. El template es el siguiente, y puedes probar la misma forma en el [playground](page:compiler-playground):

```pavlus
section.todo
  form(@submit.prevent=add)
    input(type="text" placeholder="New task" value=text @input=setText)
    button(type="submit") Add
  ul
    for task in tasks key task.id
      li(class:done=task.done)
        input(type="checkbox" checked={task.done} @change=toggle(task.id))
        span {task.title}
        button(type="button" @click.stop=remove(task.id)) x
```

Lee los eventos desde arriba:

- `@submit.prevent=add` evita que el navegador recargue la página, y luego envía `add`. El handler lee el texto del state, porque `@input=setText` lo ha ido copiando allí con cada tecla.
- `@input=setText` envía `setText` con `msg.event.value`.
- `@change=toggle(task.id)` envía `toggle` con el id de la tarea. El handler también puede leer `msg.event.checked`.
- `@click.stop=remove(task.id)` envía `remove` con el id y evita que el clic suba por los padres.

Hay cuatro ids de message y tres payloads, y ni una sola función en el template.

## Lo que aprendiste

- `@event=name(args)` envía un message, no una función. Un argumento es el payload, varios argumentos forman un array, ninguno no da payload.
- `.prevent` y `.stop` son banderas en el message; el plugin DOM las aplica y luego envía el message.
- Un handler es un método de componente con el nombre del id del message; recibe `msg.id`, `msg.payload` y un pequeño `msg.event` (`type`, `value`, `checked`, `key`).
- Un template embebido envía sus messages con el nombre de la instancia como prefijo: `first.pick`.
- Cuando un payload cambia, `diff` devuelve un patch `handler`; un enlace sin argumentos nunca recibe un patch.

Siguiente: [condicionales y bucles](page:syntax-control-flow).
