---
summary: Divide una página en templates y júntalos con import y +Name. Aprende props, nombres de instancia y prefijos de message, embeds dinámicos con +{expr}, hijos que no renderizan nada y la línea +outlet para páginas enrutadas.
---
## Un template, muchos archivos

Una página crece. Un encabezado, una tarjeta, una fila de tabla y un campo de formulario quieren escribirse una vez y usarse en muchos lugares. En pavlus cada archivo `.pavlus` es un template, y un template puede **embeber** otro. El template embebido se llama *child view* (o simplemente hijo), y el que lo embebe es su padre.

Embeber lleva dos pasos: **importas** el hijo al principio del archivo, y lo **usas** con una línea que empieza con un signo más.

::demo badge

La primera línea, `import Badge from "./badge.pavlus"`, trae al hijo con el nombre local `Badge`. La línea `+Badge#status(label=text)` lo renderiza en ese lugar. `label=text` pasa un **prop**: dentro de `badge.pavlus` (aquí: `span.badge {label}`) el state tiene un campo `label`, y su valor es el `text` del padre.

El hijo no ve nada más. No conoce el state de su padre, solo los props que se le dieron. Esto es lo que hace reutilizable a un hijo: sus entradas se listan en el lugar donde se usa.

Mira el paso: cuando `text` cambia, sale un patch `text`, con el id `1/2`. Los ids de los nodos propios del hijo reciben un sufijo (`/2`) de la línea que lo embebe, para que dos instancias de un mismo hijo nunca produzcan el mismo id.

## La línea import

```pavlus
import Card from "./card.pavlus"
import UserList from "../users/view.pavlus"

section
  +Card#intro(title="Welcome")
```

Todas las líneas `import` van primero, antes de cualquier elemento, en la columna 0. El nombre debe empezar con una letra mayúscula. Estos son los errores que informa el parser:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
```

La letra mayúscula es como el template distingue un componente de un tag: `+Card` solo puede ser un componente importado. `String`, `Array`, `Map`, `Set` y `Error` se rechazan porque el código generado los usa por su cuenta.

La ruta se escribe tal como la resolverá tu bundler. El compilador copia la línea en el módulo generado como un import normal de ES (`import Badge from "./badge.pavlus";`, abre el módulo de la demo de arriba para verlo), y el plugin de Vite compila el archivo importado de la misma manera. Un hijo es un módulo con un `render` y un `diff`, como todo template.

Si usas un nombre que no está importado, recibes un mensaje que dice qué hacer:

```text
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 2, col 4)
```

## La línea embed: +Name#id(props)

La sintaxis completa de un embed es:

```text
+Name#instance(prop=value other="text {x}" flag ...spread)
```

- `Name` es el nombre importado.
- `#instance` es el **nombre de la instancia**. Es opcional para un embed estático. Sin él, el nombre es el nombre importado con la primera letra en minúscula: `+UserCard` es `userCard`.
- Los paréntesis con props son opcionales.
- No puede seguir nada más en la línea, y un embed no puede tener líneas hijas. Texto después de él da `Unexpected "x" after component`, y una línea indentada debajo da `This line cannot have children`.

El nombre de la instancia hace tres trabajos. Pone prefijo a los **messages** del hijo (ver más abajo). Es la clave del hijo en la tabla `children` de la lógica (ver el final de la página). Y es lo que el compilador lista en `meta.embeds` del módulo.

## Props

Un prop se escribe de la misma manera que un atributo, y tiene las mismas formas de valor. La diferencia es lo que le pasa: no se pone en el HTML, se convierte en un campo del state del hijo.

::demo props

Lee los tres embeds:

| Valor | Ejemplo | Lo que recibe el hijo |
| --- | --- | --- |
| texto entre comillas | `kind="static"` | la cadena |
| texto con huecos | `kind="user {user.id}"` | una cadena, con `toText` para cada hueco |
| una expression | `label=user.name`, `count=items.length` | el valor mismo, conservando su tipo |
| un nombre solo | `active` | `true` |
| un spread | `...user` | todos los campos del objeto |

El **tipo se conserva** para una expression: `count=items.length` da al hijo un número, y `label=user.items` le daría el array mismo, no un texto. Una cadena con huecos y otro texto es siempre una cadena. Un prop entre comillas que es solo un hueco, `kind="{x}"`, es lo mismo que `kind=x`: se conserva el tipo.

Los props se escriben en orden, y el último gana: en el tercer embed `...user` trae `label` ("From spread") y `count=0` reemplaza un `count` que el spread pudiera tener. Un prop que no se da es `undefined`, y por eso el título del tercer chip empieza con `: `: falta `kind`, y `toText(undefined)` es vacío.

Los nombres de los props deben ser identificadores simples. Un nombre como `data-x` es un error: `"data-x" is not a valid prop name`. Y un spread solo se permite en un componente (`+Name(...x)`); en un elemento es `` `...spread` is only allowed in component props ``.

## ¿Cuándo se actualiza el hijo?

Cada embed recibe su propia guarda en el `diff` del padre. El código generado para un embed con dos props:

```ts
if (prev.noteTitle !== next.noteTitle || prev.noteBody !== next.noteBody) {
  patches.push(...Card.diff(
    { "title": prev.noteTitle, "body": prev.noteBody },
    { "title": next.noteTitle, "body": next.noteBody },
    idSuffix + "/2",
    messagePrefix + "note.",
    childEnv(env, "note", next),
  ));
}
```

El padre construye los props antiguos y los nuevos a partir de sus dos states, y llama al `diff` propio del hijo con ellos. Si ninguno de los nombres leídos por los props cambió, el hijo no se llama en absoluto.

::demo child-diff

En el primer paso cambia el cuerpo y el `diff` de la tarjeta devuelve un patch `text`. En el segundo paso solo cambia el encabezado, y no se mira la tarjeta. Un hijo cuesta tan poco como una parte del template del padre.

## Messages de un hijo

Los eventos de un hijo se envían con el nombre de la instancia como prefijo. Esto se explicó en [la página de eventos](page:syntax-events): el botón `reset` de un contador se convierte en `apples.reset` o `pears.reset`, según la instancia.

::demo two-instances

Dos instancias del mismo `Counter` tienen dos nombres, así que la aplicación puede distinguirlas. En el paso cambia `pears`. El prop `value` cambia, así que sale el patch de texto, y también un patch `handler`, porque el payload de `reset(value)` también ha cambiado. El id en ese patch ya es `pears.reset`:

```text
{"op":"handler","id":"5/1","event":"click","msg":{"id":"pears.reset","payload":6}}
```

El prefijo crece con cada nivel: un hijo de un hijo da `apples.cell.reset`. La identidad dentro de un bucle es otra cosa. El nombre de la instancia es fijo en el template y no puede depender del elemento, así que dentro de un bucle distingues las instancias con el payload:

::demo in-loop

Cada fila envía el message `row.toggle`, con el id de su tarea como payload. El handler `"row.toggle"` del padre recibe ese id. Fíjate en el id del patch de la clase, `0#2/2`: el nodo de la fila (`0`), la key del elemento (`#2`) y el embed (`/2`) aparecen todos en él.

## Embeds dentro de if y for

Un embed es un nodo como cualquier otro. Puede estar dentro de `if`, `else`, `for` u otro elemento. Su posición la deciden las líneas que lo rodean.

::demo in-if

Cuando `open` se vuelve true, el panel se renderiza desde cero y se inserta. Cuando vuelve a false, se limpia. El state del hijo no se queda en el DOM: la próxima vez, se renderiza otra vez a partir de los props.

## Un hijo que no renderiza nada

Un template hijo es un template normal, así que puede no tener nada que mostrar, por ejemplo porque su único nodo es un `if` que es falso. Esto está permitido. El padre guarda un lugar para él, y las otras líneas del padre no se mueven.

::demo empty-child

Sigue los pasos. Al principio no hay ningún aviso en la página, y `After the notice` está en el lugar correcto. Cuando `message` pasa a `Saved`, el `if` del hijo inserta un `p` en el lugar del hijo (fíjate en los ids de los marcadores, que terminan en `/2`). Cuando el mensaje cambia, solo cambia el texto. Cuando queda vacío, el aviso se limpia. El padre no hizo nada especial: todo el trabajo está en el `diff` propio del hijo.

## Embeds dinámicos: +{expr}

A veces el hijo no se conoce cuando escribes el template: una barra de pestañas que muestra una view distinta por pestaña, un widget elegido por el usuario. No puedes importar algo que viene del state, así que pavlus tiene una segunda forma, donde el hijo es el **valor de una expression**:

```pavlus
div.tabs
  +{tab.component}#content(...tab.state)
```

La expression da una view, o un componente que tiene una `view`. Un embed dinámico *debe* tener un nombre de instancia (`#content`), porque no hay un nombre importado del que tomar uno: `+{tab}(x=1)` es un error, `A dynamic component needs an instance name: +{expr}#name(...)`.

Lo que hace la página cuando cambia el valor:

- el valor es **la misma view**: se ejecuta su propio `diff`, como en un embed estático;
- el valor es **otra view**: el contenido antiguo se limpia entre los dos marcadores y la nueva view se renderiza desde cero. Los dos templates nunca se comparan entre sí;
- el valor es `null` o `undefined`: el embed no renderiza nada.

::demo dynamic-empty

El último caso es el hijo que no está. El `h2` y el `p` están en su sitio, y no hay nada entre ellos. Si el valor es algo que no es una view (un número, por ejemplo), `render` lanza `pavlus: +{...} needs a view or a component with a view`.

> [!NOTE] Views en el state
> Una view es un objeto que contiene funciones, no JSON. El store lo conserva tal cual, pero una herramienta que guarde o imprima el state no lo mostrará. Cuando necesites un state que puedas serializar, guarda un nombre en el state (`tab: "users"`) y elige con `if` y `else if`, con ambas ramas importadas. La forma `+{expr}` es para los casos en que el conjunto de hijos es abierto.

## +outlet: la página elegida por la ruta

Una aplicación de una sola página tiene un shell (un encabezado, un menú) y, en el medio, la página que elige la dirección. El shell necesita un lugar para "la página". Ese es `+outlet`.

```pavlus
header.shell
  nav
    a(href="/") Home
    a(href="/about") About
main.page
  +outlet
```

`+outlet` no admite nada después: una línea como `+outlet x` es un error. Renderiza el **hijo enrutado** del componente que posee el template. Qué hijo es lo determina la tabla `routing` del componente:

```ts shell.ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { component: dashboard, key: "dashboard", name: "dashboard" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

Un outlet se comporta como un embed dinámico. Cuando la ruta cambia a otra página, la página antigua se limpia entre los marcadores y se renderiza la nueva. Cuando la ruta sigue en la misma página, solo se ejecuta el `diff` de esa página. Sus messages reciben el nombre de la instancia como prefijo, como cualquier hijo: una página registrada como `dashboard` envía `dashboard.something`. Si ninguna entrada coincide con la dirección y no hay una entrada `"*"`, el outlet queda vacío, como un hijo null.

Como la ruta no es un campo que el template pueda ver, el compilador no puede listar los nombres que lee un outlet. Los nodos a su alrededor se comprueban en cada cambio de state, y las páginas de dentro siguen omitiendo lo que no cambió. Por eso el código de `diff` de un template con un outlet dice `reads: the route and the routed child`.

El outlet necesita un componente, no solo un template. Si montas solo la view, `render` lanza este error:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

Por esa razón las demos de esta página no renderizan un outlet. [Enrutamiento](page:concepts-routing) describe todo el mecanismo.

## El lado lógico de un hijo

Todo lo anterior trata de templates. Un template hijo también puede tener un componente con sus propios handlers. El padre lo declara en la tabla `children` de su componente, con el mismo nombre que el template dio a la instancia:

```ts dashboard.ts
class Dashboard extends Component<DashboardState> {
  view = dashboardView;
  children: Children<DashboardState> = {
    users: {
      component: usersList,
      key: "users",
      props: (s) => ({ filter: s.filter }),
    },
  };
}
```

y el template dice `+UsersList#users(...users filter=filter)`. La regla a recordar es: `users` en el template, `users` en `children`, `users` en el state. Un message `users.select` va al handler `select` de `usersList`, con el prefijo quitado. [Componentes](page:concepts-components) cuenta la historia completa.

## Todo junto

Un padre que usa un bucle con key, una condición y dos tipos de hijo. Los templates `Row` y `Panel` son los de las demos de arriba.

```pavlus
import Row from "./row.pavlus"
import Panel from "./panel.pavlus"

section.tasks
  h3 Tasks ({tasks.length})
  ul
    for task in tasks key task.id
      +Row#row(id=task.id title=task.title done=task.done)
  if selected
    +Panel#details(title=selected.title)
  else
    p.muted Select a task
```

Cada message `row` lleva el id de su tarea, y cada message `details` va a la lógica del panel. El template padre no contiene ni un solo handler de eventos propio. Solo decide qué hijos existen y qué recibe cada uno.

## Lo que aprendiste

- `import Name from "./file.pavlus"` arriba, `+Name#id(props)` donde va el hijo; el hijo solo ve sus props.
- Los props son texto entre comillas, texto con huecos, expressions (que conservan su tipo), banderas sin valor o `...spread`; el último prop gana.
- El nombre de la instancia pone prefijo a los messages del hijo (`pears.reset`) y une al hijo con los `children` de su componente.
- `+{expr}#id` renderiza una view que es un valor; un valor `null`, un template vacío y un outlet sin coincidencia renderizan nada.
- `+outlet` renderiza el hijo enrutado del componente que posee el template.

Siguiente: [referencia de sintaxis](page:syntax-reference).
