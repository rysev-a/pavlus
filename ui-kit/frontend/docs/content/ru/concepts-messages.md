---
summary: Как messages несут информацию и как находят свой компонент. Id messages, payload и поле event, как префикс направляет message дочернему компоненту, как родитель запускает дочерние компоненты и наблюдает за ними, динамические дочерние компоненты, обёртки mapMessage, mapEffects и compose, а также родитель с двумя дочерними компонентами от начала до конца.
---
## Что такое message

Message — это вход вашего приложения. Это обычный объект не более чем с тремя полями:

```ts
interface Message {
  id: string;
  payload?: unknown;
  event?: { type: string; value?: string; checked?: boolean; key?: string };
}
```

- **`id`** говорит, что произошло. Это также имя handler: message `inc` вызывает метод `inc`.
- **`payload`** — данные, которые идут вместе с ним. Вы выбираете их в шаблоне, или их задаёт plugin, например ответ на HTTP-запрос.
- **`event`** — краткое описание события браузера, которое DOM plugin добавляет к messages, приходящим со страницы. В нём есть `type` события, а также `value`, `checked` и `key`, если они есть у цели или у события. Это данные, а не само событие браузера, поэтому message остаётся сериализуемым и его можно записать в лог и воспроизвести.

У messages, которые приходят от других plugins, `event` нет. Таймер отправляет `{ id: "tick" }` или `payload`, который вы ему дали, а завершённый запрос отправляет `{ id: "loaded", payload: { status: 200, data } }`.

## Messages в шаблонах

Шаблон не вызывает функции. Атрибут события называет message. Компилятор превращает его в данные, и `diff` может сравнивать handlers по значению.

::demo message-ids

Посмотрите на раздел `vnodes` демо (раскройте его). Клик по `li` имеет `id: "select"`, а payload — это id пользователя. Клик по кнопке имеет `id: "remove"` и `"stop": true`, потому что был написан модификатор `.stop`. Модификатор `.prevent` работает так же. Это именно те объекты, которые DOM plugin превратит в messages.

Правило для аргументов простое. Без аргумента у message нет payload. С одним аргументом, `select(u.id)`, аргумент и есть payload. С несколькими, `move(a, b)`, payload — массив `[a, b]`. Аргумент — это выражение, вычисляемое на state при рендеринге шаблона, поэтому вы передаёте `u.id`, а не всего пользователя: id маленький и стабильный.

> [!TIP] Кладите идентичность в payload, а новое значение — в event
> Используйте payload для ответа на вопрос *какая вещь* (`remove(note.id)`), а `msg.event.value` — для *того, что набрал пользователь* (`@input=setDraft`). Всё остальное handler читает из state. DOM ему не нужен никогда.

## Handler для message

В компоненте-классе `id` message ищется как имя метода. Handler получает message, state и контекст с двумя функциями и возвращает массив effects:

```ts
select(msg: Message, state: UsersState, ctx: ComponentCtx) {
  return [store.set("selectedId", msg.payload)];
}
```

В контексте есть `send(child, id, payload?)`, который запрашивает effects у дочернего компонента, и `setRoute(location)` для маршрутизации. Обе функции чистые: они только вызывают другие handlers и строят данные. Message без handler не возвращает effects. Имена, которые никогда не бывают messages, и handlers по умолчанию перечислены на странице [Компоненты и состояние](page:concepts-components).

## Messages для дочерних компонентов

Экран часто состоит из частей. Дашборд показывает список пользователей и список задач, и у каждой части свой state и своя логика. В pavlus каждая часть — это **дочерний компонент**, а родитель один раз объявляет своих дочерних, дав каждому имя.

**Одно имя связывает всё.** Имя `users` встречается в трёх местах:

| Где | Что делает имя |
| --- | --- |
| Шаблон родителя | `+Users#users(...)` встраивает view дочернего компонента. `#users` — имя экземпляра. |
| `children` класса родителя | Ключ `users` направляет messages `users.*` дочернему компоненту. |
| State | `state.users` — срез state, который принадлежит дочернему компоненту. |

Правило, которое нужно запомнить: `users` в шаблоне, `users` в `children`, `users` в state.

### Префикс выполняет маршрутизацию

У message для дочернего компонента перед id стоят имя дочернего компонента и точка. Родитель отрезает его и передаёт остальное дальше:

1. Message `users.select` приходит к родителю.
2. Родитель ищет собственный handler с именем `users.select` (подробнее о нём ниже).
3. Id начинается с `users.`, а `users` — дочерний компонент, поэтому родитель вызывает дочерний компонент с message `select` и со срезом state дочернего компонента, `state.users`.
4. Дочерний компонент отвечает effects. Затем на выходе эти effects изменяются. `store.set("selectedId", 2)` становится `store.set("users.selectedId", 2)`, потому что путь в store помещается под `key` дочернего компонента. Id ответа, такой как `onSuccess: "loaded"`, становится `"users.loaded"`, поэтому ответ возвращается тому же дочернему компоненту.

Поля, которые несут id ответа, — это `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` и `onChange`. Plugin, который использует эти имена, получает маршрутизацию бесплатно.

Обратное направление тоже автоматическое. События в шаблоне дочернего компонента отправляются с префиксом: клик в `Users` с `@click=select(u.id)` приходит к родителю как `users.select`. Код дочернего компонента никогда не пишет префикс и никогда не знает своего имени. **Дочерний компонент не видит родителя.** Он видит только свой state и `props`, которые родитель решил ему дать.

### Родитель запускает дочерний компонент

Родителю часто нужно при старте запустить работу в дочерних компонентах. `ctx.send(name, id, payload?)` возвращает effects дочернего компонента для message, отправленного ему. Он ничего не отправляет. Он вызывает handler дочернего компонента с нужным state и префиксом и отдаёт effects, поэтому вы возвращаете их из собственного handler:

```ts
mounted(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
  return [...send("users", "load"), ...send("tasks", "load")];
}
```

Effects уже переписаны для дочернего компонента: `set` для `status` становится `set` для `users.status`, а id ответа HTTP — `users.loaded`. Если имя не принадлежит дочернему компоненту, `send` выбрасывает `no child "name" to send "id" to`.

### Родитель наблюдает за дочерним компонентом

Перед тем как message передаётся дочернему компоненту, запускается **собственный** handler родителя для того же id. Поэтому родитель может наблюдать за тем, что происходит в его дочерних компонентах, с помощью метода с полным id в кавычках:

```ts
"users.select"(msg: Message, state: DashboardState) {
  const user = state.users.items.find((u) => u.id === msg.payload);
  return [store.set("selectedName", user ? user.name : "")];
}
```

Для одного message запускаются оба handlers. Effects родителя идут в списке первыми, затем effects дочернего компонента. Если message не доходит ни до кого (нет ни собственного handler, ни дочернего компонента), компонент возвращается к значениям по умолчанию, например к превращению `navigate` в effect router.

Наблюдение односторонне. Дочерний компонент никогда не узнаёт, что родитель посмотрел. Если родителю нужно *изменить* дочерний компонент, он делает это через state дочернего компонента в store или отправляя message с помощью `send`.

## Дочерний компонент, выбираемый по state

Иногда дочерний компонент не фиксирован. Страница показывает список или таблицу, и посетитель может переключаться. Дочерний компонент может быть **значением в state**. В шаблоне динамический embed `+{expr}#name(...)` рендерит тот компонент, который вернёт выражение. В классе `select` выбирает тот же компонент для messages вместо `component`:

```ts
children: Children<PageState> = {
  users: { select: (state) => state.usersComponent, key: "users" },
};
```

```pavlus
div.page
  +{usersComponent}#users(...users filter=filter)
```

Когда значение в `state.usersComponent` меняется, старый DOM удаляется, а новый шаблон рендерится с нуля. Когда оно остаётся прежним, запускается только `diff` дочернего компонента. Если `select` возвращает `null` или `undefined`, в этот момент дочернего компонента нет: его messages игнорируются, а `ctx.send` к нему не возвращает effects.

Обратите внимание, что state дочернего компонента — это срез `state.users`, и он переживает замену. Message, который заменяет компонент, должен также сбросить срез. Кроме того, компонент в state — не JSON, поэтому сериализованная история его не покажет. Никогда не делайте `store.set` по пути *внутри* значения-компонента, потому что store скопирует экземпляр класса как обычный объект и потеряет его прототип.

## Обёртки: mapMessage, mapEffects, compose

В конечном счёте компоненты — это функции, `(message, state) => Effect[]`, поэтому их можно оборачивать. Обёртки возвращают обычные функции, которые тоже являются компонентами. Они экспортируются из главного пакета.

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

- `mapMessage(inner, f)` меняет вход. `f` получает message и state и возвращает message или `null`, чтобы отбросить его. Здесь `bump` обрабатывается как `inc`, а `drop` игнорируется.
- `mapEffects(inner, f)` меняет выход. `f` получает effects, message и state и возвращает effects, которые нужно использовать. Используйте её, чтобы фильтровать, добавлять или переписывать effects.
- `compose(a, b, ...)` запускает все компоненты на одном и том же message и склеивает их effects. `twice` выше возвращает effect `set` два раза.
- `namespace(prefix, child, { key, props })` — примитив, на котором держится `children`. Проходят только id, начинающиеся с `c.`, дочерний компонент видит остаток, а его пути `store` и id ответов переписываются. Если `inc` делает `store.set("n", state.n + 1)`, то для `{ id: "c.inc" }` и state `{ k: { n: 5 } }` результатом будет `store.set("k.n", 6)`.
- `withLogging(inner, label)` ставит effect `logger` с уровнем `debug` перед effects. Для `inc` с одним effect он выглядит как `[counter] inc -> 1 effect(s)`, а в данных лежат payload и список effects в виде `plugin.type`.

Поскольку это функции от функций, они сочетаются друг с другом и с классами: `compose` принимает экземпляр класса и функцию в одном вызове.

## Родитель с двумя дочерними компонентами, от начала до конца

Теперь вся картина целиком. В дашборде есть поле фильтра, список пользователей и список задач. Список пользователей читает фильтр как prop. Родитель загружает оба списка при старте и отмечает, когда пользователи пришли и какой пользователь выбран.

Список пользователей — это шаблон и компонент. Шаблон читает поля state дочернего компонента и prop `filter`:

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

Список задач устроен так же, только с чекбоксом:

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

Родитель объявляет обоих дочерних в `children` и встраивает обоих в свой шаблон. Демо ниже использует именно эти шаблоны дочерних компонентов. Его три шага меняют по одному срезу за раз. Посмотрите на id patches: `3/2#2` означает узел 3 шаблона дочернего компонента внутри embed с id 2 родителя, для элемента списка с key 2. У каждого дочернего компонента свои id, поэтому patches никогда не конфликтуют.

::demo dashboard

Шаблон родителя (тот, что в демо) сохранён как `dashboard.pavlus`. Он следует правилу имени: `#users` и `#tasks` — это ключи `children` и поля state. Spread `...users` передаёт срез дочернего компонента, а `filter=filter` добавляет поле ввода. События поля ввода принадлежат родителю и не имеют префикса, а события внутри дочерних компонентов выходят как `users.select` и `tasks.toggle`.

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

С фальшивым HTTP plugin, который отвечает сразу, прогон, message за message, выглядит так:

```text
mounted       -> store.set, http.request, http.request
users.loaded  -> store.set, store.set, store.set
tasks.loaded  -> store.set
```

Message `mounted` обрабатывается родителем. Он возвращает `set` для `users.status` и два запроса, уже с префиксами для своих дочерних компонентов. Затем два ответа приходят как `users.loaded` и `tasks.loaded`, каждый в свой ход. Для `users.loaded` первым запускается собственный handler родителя, один `set` для `usersLoaded`, а затем `loaded` дочернего компонента добавляет ещё два. Все три effects `set` относятся к одному шагу. Ни один дочерний компонент не знает о другом.

> [!WARNING] Держите три имени одинаковыми
> Если ключ в `children` — `users`, а шаблон говорит `#user`, клик приходит как `user.select`, дочернего компонента с таким именем нет, и message ничего не делает. Ошибки нет, потому что message, который никто не обрабатывает, — не ошибка. Когда дочерний компонент кажется мёртвым, сначала сравните три имени.

## Что вы узнали

- Message — это `{ id, payload?, event? }`. Шаблон создаёт id и payload, DOM plugin добавляет `event`, а один аргумент — это payload, тогда как несколько образуют массив.
- Одно и то же имя связывает embed в шаблоне (`#users`), ключ `children` и срез state. Префикс `users.` направляет message дочернему компоненту, который видит его без префикса.
- Effects дочернего компонента переписываются на выходе: пути store получают `key`, id ответов получают префикс. Дочерний компонент никогда не видит своего родителя.
- Родитель запускает дочерний компонент через `ctx.send` и наблюдает за ним через handler в кавычках, например `"users.select"`, который запускается раньше дочернего. Дочерний компонент, выбранный через `select`, который возвращает `null`, игнорируется.
- `mapMessage`, `mapEffects`, `compose`, `namespace` и `withLogging` оборачивают компоненты и возвращают функции.

Дальше: [Маршрутизация](page:concepts-routing).
