---
summary: Реальные проблемы и их решения. Ошибки шаблонов с точными сообщениями, частые ошибки (кавычки, отсутствующие key, мутации, handlers, которые ничего не возвращают), проблемы настройки и развёртывания, отладка с помощью logger и компилятора и список частых вопросов.
---
## Как читать проблему

Проблемы в приложении pavlus приходят из трёх мест, и каждая проявляется по-своему.

- **Шаблон не компилируется.** Ошибка приходит во время сборки от plugin Vite, с путём к файлу и позицией: `(line 3, col 5)`. Строки и столбцы начинаются с 1.
- **Приложение выбрасывает ошибку во время выполнения.** Сообщение начинается с `pavlus:` (или `pavlus/dom:`, `pavlus/ssr:`, `pavlus/ws:`) и говорит, что не так и, в большинстве случаев, что делать. Оно в консоли браузера.
- **Ничего не происходит.** Нет вообще никакого сообщения. Это самые трудные случаи, и большая часть этой страницы посвящена им. Правило, которое нужно запомнить: message, которое никто не обрабатывает, — не ошибка, а пустой список effects.

Если вы потерялись, пройдите по этому списку по порядку. Он находит почти каждое «ничего не происходит».

1. Откройте консоль. Есть ли там ошибка `pavlus:`?
2. Правильно ли имя message? Логируйте каждый шаг (см. «Отладка» ниже) и ищите ожидаемое message.
3. Вернул ли handler ожидаемый effect?
4. Зарегистрирован ли plugin для этого effect в `createApp({ plugins })`?
5. Изменился ли state? В разработке смотрите на `pavlus.store.getState()`.
6. Читает ли шаблон это поле? Узел, который не читает поле, никогда не меняется при изменении этого поля.

## Ошибки шаблонов

Компилятор останавливается на первой ошибке. Это настоящие сообщения, полученные прогоном шаблонов через `compileTemplate`. Vite показывает их с путём к файлу впереди.

| You wrote | The message starts with | The fix |
| --- | --- | --- |
| Табуляция в отступе | Tabs are not allowed | Делайте отступы пробелами. Принято по два. |
| Строка с отступом 4 под родителем и следующая с отступом 2 | Inconsistent indentation | Каждый уровень должен использовать один и тот же шаг. |
| `a(href=url` | Unclosed ( | Закройте список атрибутов. |
| `p Hello {name` | Unclosed { | Закройте выражение или напишите `\{` для буквальной скобки. |
| `p(title="abc) x` | Unterminated string | Закройте кавычку. |
| `p {items.map(x => x)}` | Unexpected character "=" | Стрелочных функций нет. Вычислите значение в handler. |
| `p {a = 1}` | Unexpected character "=" | Выражение читает; оно никогда не присваивает. |
| Шаблонная строка в фигурных скобках | Unexpected character | Шаблонных строк нет. Используйте `"a " + b`. |
| `button(@click) Go` | "@click" needs an expression value | Напишите `@click=save`. |
| `button(@click=1+2) Go` | Event handler must be a message id | Событие — это id message, возможно, с аргументами. |
| `else` без `if` выше | else without matching if | Поставьте `else` сразу после блока `if`, на том же отступе. |
| `+Row#r(a=1)` без импорта | "Row" is not imported | Добавьте строку `import Row from "..."` в начале. |
| `import` ниже первого элемента | import lines must be at the top of the file | Перенесите его. |
| `import row from "..."` | cannot be used as a component name | Компонент начинается с заглавной буквы. |
| `+outlet(a=1)` | +outlet takes nothing after it | Напишите `+outlet` и больше ничего. |
| Дочерний элемент под текстовой строкой (строкой, которая начинается с символа вертикальной черты) | This line cannot have children | Дочерние элементы бывают только у элементов. |
| `p {}` | Empty expression | Поместите что-нибудь между скобками. |

И точный текст каждого, для поиска:

```text
Tabs are not allowed, use spaces (line 2, col 1)
Inconsistent indentation (line 3, col 1)
Unclosed ( (line 1, col 2)
Unclosed { (line 1, col 7)
Unterminated string (line 1, col 9)
Unexpected character "=" (line 1, col 16)
Unexpected character "`" (line 1, col 4)
"@click" needs an expression value (line 1, col 8)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
"Row" is not imported. Add `import Row from "..."` or use +{Row} for a component that comes from the state (line 1, col 2)
`import` lines must be at the top of the file (line 2, col 1)
"row" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
`+outlet` takes nothing after it (line 1, col 8)
This line cannot have children (line 2, col 1)
Empty expression (line 1, col 4)
```

Два шаблона, которые выглядят неверно, принимаются, и это ошибка пишущего, а не компилятора: `if` без чего-либо после него и `for x todos` (без `in`) не совпадают с ключевыми словами, поэтому каждый читается как **элемент** с именем `if` или `for`. Страница показывает `<if>` в DOM. Если появляется элемент с таким именем, проверьте строку.

## Кавычки решают, чем является значение

Это самая частая первая ошибка. `href="url"` — это текст `url`. `href=url` — это поле `url` из state. Оба варианта допустимы, поэтому компилятор не может предупредить.

::demo quotes-text

::demo quotes-expression

В первом демо ссылка `href="url"` — простая строка, каким бы ни был state. Второе читает state: в его HTML стоит адрес, а когда `url` меняется, это один patch `attr`. Если ссылка ведёт на `/url` или атрибут показывает имя поля, ищите пропущенные фигурные скобки и лишние кавычки. Текст в шаблоне наоборот: `p Hello, name` — это текст `name`, а `p Hello, {name}` читает поле.

Чтобы показать фигурную скобку как текст, экранируйте её:

::demo braces

## `for` без `key`

`key` необязателен. Без него идентичностью элемента служит его **индекс**. Страница работает, но удаление элемента из начала выглядит как изменение каждого следующего за ним. Сравните patches для одного и того же изменения: удаления первого из трёх человек.

::demo keyed

::demo unkeyed

С `key person.id` patch — единственный `remove` блока Ann. Без key удаляется последний блок, а текст двух оставшихся **переписывается** (`Bob` попадает в первый блок, `Eve` — во второй). На тексте результат один и тот же. На всём, что живёт собственной жизнью, — нет: поле ввода, в которое посетитель что-то набрал, фокус, прокрутка, работающая CSS-анимация остаются на своём месте в списке, а не перемещаются вместе с элементом. Давайте списку key всегда, когда элементы можно вставлять, удалять или переупорядочивать.

## Мутация state

Скомпилированный `diff` сравнивает через `===`. Если вы изменяете массив на месте, следующий state содержит тот же массив, сравнение говорит «ничего не изменилось», и ничего не обновляется. У store то же правило: `store.set` с тем же значением ничего не записывает.

::demo mutation

На первом шаге массив изменили через `push` и передали снова. Список patches пуст, хотя в массиве уже три человека. На втором шаге передан новый массив, и diff вставляет элемент. В handler это означает:

```ts
// wrong: the same array, the page does not change
state.items.push(todo);
return [store.set("items", state.items)];

// right: a new array
return [store.set("items", [...state.items, todo])];
```

То же относится к объектам (`{ ...todo, done: true }`) и к `.sort()` массива (сортируйте копию). TypeScript помогает, если объявить state с полями `readonly` и `ReadonlyArray`.

## Проблемы с handlers

**Handler возвращает не массив.** У этого случая понятное сообщение:

```text
pavlus: handler "add" must return an array of effects
```

Обычная причина — `return store.set("a", 1)` вместо `return [store.set("a", 1)]`. Handler, которому нечего делать, возвращает `[]`.

**Handler не найден.** У этого случая сообщения нет. Клик по `@click=remvoe(todo.id)` отправляет message `remvoe`, его никто не обрабатывает, и результат — пустой список effects. Опечатки в имени, handler с `_private` (имена, начинающиеся с `_`, и члены `#` никогда не бывают messages): всё это даёт тишину. Чтобы это поймать, логируйте каждый шаг опцией `onStep` у `createApp`:

```ts
const app = createApp({
  app: shell,
  plugins,
  onStep: (message, effects) => {
    if (effects.length === 0) console.debug(`${message.id}: no effects`);
  },
});
```

Вот её вывод для счётчика, который обрабатывает `inc` и которому отправили `incc`:

```text
inc -> 1 effect(s)
incc -> 0 effect(s)  <- nobody handled it?
```

У некоторых messages законно нет effects (клик, важный только для родителя), поэтому читайте список, а не считайте каждую строку багом.

**Неверный id message дочернего компонента.** Событие дочернего компонента, встроенного как `+Row#row`, отправляется как `row.select`. Родитель обрабатывает его методом с именем в кавычках: `"row.select"(msg) { ... }`. Handler с именем `select` в родителе его никогда не получит. Для вложенного дочернего компонента id соединяются: `grid.card.add`.

**`ctx.send` к несуществующему дочернему компоненту** выбрасывает ошибку: `pavlus: no child "nope" to send "x" to`.

**Класс вместо экземпляра.** `createApp({ app: Todos })` отклоняется с `pavlus: Todos is a class: pass an instance (new Todos()), not the class`. Обычный объект тоже отклоняется: `pavlus: a component is a function or an instance of a class extending Component, got a plain object (defineComponent is gone: write a class that extends Component)`.

**`store.set` с неверным путём** не падает. Он создаёт недостающие родительские объекты, поэтому опечатка (`"itemz"`) создаёт новое поле, а шаблон, который читает `items`, не меняется. Посмотрите на state в консоли и на историю.

## Ошибки настройки и plugins

Они выбрасываются, когда приложение запускается или когда выполняется effect. Каждая называет своё решение.

```text
pavlus: no plugin "http" for effect "request"
pavlus: duplicate plugin "store"
pavlus: `mount` needs the dom plugin (new DomPlugin())
pavlus/dom: target "#nope" not found
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
pavlus/ws: no connection "chat"
pavlus: more than 10000 messages in one tick (message loop?)
```

- **no plugin** означает, что handler вернул effect для plugin, которого нет в списке. Зарегистрируйте его, или вы неправильно написали имя plugin.
- **target not found** означает, что элемента для `mount` нет в `index.html` или скрипт запустился раньше, чем он появился. Поместите скрипт в конец `<body>` или используйте `type="module"`, который откладывается.
- **two children named** — таблица routing с двумя записями, заканчивающимися одним и тем же сегментом. Страница [Маршрутизация](page:concepts-routing) объясняет `name`.
- **+outlet needs a component** означает, что view с outlet смонтировали без его компонента. Монтируйте компонент, а не `component.view`.
- **message loop** означает, что handlers продолжают отвечать друг другу. Обычный случай — message от plugin (ответ), обработанное handler, который снова отправляет запрос.
- **ws: no connection** означает `send` до message `onOpen` или после закрытия сокета.

### Типы: `Cannot find module './page.pavlus'`

TypeScript не знает файлов `*.pavlus`. Объявление лежит во фреймворке, и ваш проект должен его подключить. В `src/env.d.ts`:

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@pavlus/frontend/env" />
```

Без строки `pavlus/env` каждый импорт шаблона даёт эту ошибку. Проект с обеими строками компилируется чисто:

```text
src/app.ts(2,23): error TS2307: Cannot find module './about.pavlus' or its corresponding type declarations.
```

### Импорты `?raw`

Иногда нужен **текст** шаблона, а не скомпилированный модуль. ui-kit делает это для своей вкладки Source: она показывает шаблон, логику и стили каждой страницы. Суффикс Vite `?raw` отдаёт файл как строку, а plugin pavlus оставляет импорты `?raw`, `?url` и `?inline` в покое:

```ts
import source from "./about.pavlus?raw";
import view from "./about.pavlus";
```

В тесте первый — это текст, `section.about\n  h1 About\n  p A todo list`, а второй — view с `render`, `diff` и `meta`. Одна вещь идёт не так. Объявление `pavlus/env` покрывает `*.pavlus`, а не `*.pavlus?raw`, поэтому без `/// <reference types="vite/client" />` TypeScript говорит `Cannot find module './about.pavlus?raw'`.

Для целой папки `import.meta.glob` с опциями `{ query: "?raw", import: "default" }` возвращает таблицу ленивых загрузчиков, по одному чанку на файл, — именно это делает plugin source в ui-kit.

## 404 на статическом хосте

Всё работает на `npm run dev`, а на опубликованном сайте клик по ссылке работает, но перезагрузка даёт «404 Not Found». Или сайт лежит на `/pavlus/`, и каждая страница говорит «Page not found».

- **Перезагрузка даёт 404.** Статический хост ищет файл по этому пути. В одностраничном приложении есть только `index.html`. Сделайте так, чтобы хост на каждый неизвестный путь отвечал `index.html`. На GitHub Pages, где правила менять нельзя, скопируйте `index.html` в `404.html` во время сборки; ui-kit делает это крошечным plugin для Vite. Код — на странице [Маршрутизация](page:concepts-routing).
- **«Page not found» под префиксом.** Роутер видит `/pavlus/button`, и ни один шаблон ему не подходит. Дайте plugin router `window`, который скрывает префикс (`windowAt(root)` в ui-kit), и стройте с ним `href`. Также задайте `base` в конфигурации Vite, чтобы скрипты и стили запрашивались из `/pavlus/assets/...`, а не из `/assets/...`.
- **Картинки и значки дают 404.** В `index.html` используйте `%BASE_URL%favicon.svg`, а в коде `import.meta.env.BASE_URL`.

## Отладка

### Логируйте происходящее

Plugin logger печатает записи. Он не знает, что произошло, поэтому вы просите его об этом. `withLogging(component, label)` просит записывать каждое message одного компонента, и это самый быстрый способ увидеть, что делает приложение:

```ts
createApp({
  app: withLogging(shell, "shell"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin(), new DomPlugin()],
  mount: "#app",
});
```

Для message `inc` с payload 5 logger получает такую запись:

```json
["[counter] inc -> 1 effect(s)", { "payload": 5, "effects": ["store.set"] }]
```

Запись имеет уровень `debug`. Некоторые браузеры по умолчанию скрывают сообщения `debug` (в Chrome переключите консоль на уровень Verbose, чтобы их увидеть). Обёртка добавляет effect, поэтому plugin logger должен быть зарегистрирован, иначе ядро выбросит `no plugin "logger"`.

### Исследуйте приложение в разработке

ui-kit открывает приложение и store, только в разработке:

```ts
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
```

В консоли вы тогда можете отправить message, прочитать state и вернуться во времени, потому что store записывает каждое изменение вместе с effect, который его отменяет:

```text
pavlus.app.dispatch({ id: "header.toggleSidebar" })
pavlus.store.getState().sidebar
pavlus.store.history.length
pavlus.store.history.at(-1)
```

`store.undo()` и `store.restoreTo(timestamp)` — это effects, поэтому вы применяете их как любые другие: из handler или через инструменты разработчика.

### Посмотрите на вывод компилятора

Шаблон — это две чистые функции, и вы можете вызвать их сами. `compileToView` из `@pavlus/frontend/compiler` компилирует строку и даёт вам `render` и `diff`, без Vite:

```ts
import { compileToView } from "@pavlus/frontend/compiler";

const view = compileToView("p Hello, {name}");
console.log(JSON.stringify(view.render({ name: "Ann" })));
console.log(JSON.stringify(view.diff({ name: "Ann" }, { name: "Bob" })));
```

Первая строка печатает **vnodes**, вторая — **patches**:

```json
[{"t":"el","tag":"p","attrs":{},"events":{},"children":[{"t":"text","id":"1","text":"Hello, Ann"}]}]
[{"op":"text","id":"1","text":"Hello, Bob"}]
```

Vnodes показывают настоящие атрибуты и события как данные (`events.click` — это message, которое отправит клик). Patches показывают, что изменилось бы в DOM. Если список patches пуст, когда вы ожидали изменение, то либо state — тот же объект (мутация), либо узел не читает это поле. Демо на этих страницах показывают те же данные, и каждое демо умеет раскрывать AST: строка `reads: people` под узлом говорит, какие поля могут его изменить.

Скомпилированные шаблоны — читаемый JavaScript, как в разработке, так и в бандле. Откройте модуль `.pavlus` на панели Sources в DevTools (файл называется примерно `todos.pavlus?import`). Комментарии `// line 12: <li> (reads: user, selectedId)` говорят, из какой строки шаблона взят блок и от чего он зависит. Source map намеренно нет: DevTools показывает сгенерированный код, который и выполняется.

### Тестируйте страницу, а не только handler

Когда баг в шаблоне, тестируйте его с `mountView` из `@pavlus/frontend/testing`, который монтирует view в jsdom без ядра. Вот тест для шаблона счётчика:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });
expect(h.root.textContent).toContain("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
```

## Вопросы и ответы

- **Можно ли использовать в шаблоне стрелочную функцию или шаблонную строку?** Нет, обе — ошибки компиляции. Язык выражений — небольшое чистое подмножество JavaScript: пути (с защитой от null), литералы, операторы, условный оператор, литералы массивов, доступ по индексу (`items[0]`) и вызовы. Вызов метода значения работает: `{name.toUpperCase()}` показывает `ANN` для `ann`. Вызовы тоже защищены от null, и это скрывает опечатки: `{fmt(name)}` вызывает поле state `fmt`, а когда такого поля нет, показывает пустой текст и не выдаёт ошибки. Всё, что длиннее короткого выражения, относится к handler: вычислите это там и храните результат в state.
- **Как показать отфильтрованный или отсортированный список?** Вычислите его в handler, сохраните через `store.set` и обходите сохранённый список циклом. [Руководство](page:guide-todo-app) делает это для фильтра.
- **Куда девать асинхронный код?** Никуда в handler. Handler возвращает effects, а plugin выполняет асинхронную работу и отвечает message. Для запроса используйте `http.request`, для таймера `time.setTimeout`.
- **Как прочитать то, что набрал пользователь?** `msg.event?.value` для `@input`, `msg.event?.checked` для `@change` чекбокса и `msg.event?.key` для событий клавиатуры. Поле ввода хранит то, что набрал пользователь; `value=field` только задаёт начальное значение и следует за последующими изменениями поля.
- **Почему моя страница показывает пустое значение вместо ошибки, когда поля нет?** Пути в шаблонах защищены от null. `{user.name}` — пустой текст, когда `user` равен `null`. Handlers — обычный TypeScript и от null не защищены: используйте там `?.`.
- **Как получить время или случайное число?** Попросите plugin. `time.now("stamped")` отвечает временем как message; plugin случайных чисел — несколько строк, и [Свой плагин](page:plugins-custom) разбирает один из них.
- **Как выполнить что-то при запуске приложения?** Обработайте `mounted` в корневом компоненте (оно отправляется, когда приложение попало в DOM) или передайте `init: { id: "start" }` в `createApp`. На странице с маршрутом обрабатывайте `enter`.
- **Как остановить таймер, когда я ухожу со страницы?** Обработайте `leave` и верните `time.cancel(id)`.
- **Могут ли у двух компонентов быть message с одинаковым именем?** Да. У дочерних компонентов свои пространства имён: `select` дочернего компонента для родителя — это `row.select`. Два соседних компонента с одинаковым именем экземпляра не допускаются.
- **Как назвать handler `users.remove`?** Именем метода в кавычках: `"users.remove"(msg: Message) { ... }`.
- **Может ли компонент хранить данные в поле класса?** Не изменяемые данные. Экземпляр общий для всех messages, поэтому в нём не должно быть изменяемого state. Храните данные в store.
- **Можно ли рисовать через SVG?** Не как элементы. Plugin DOM создаёт элементы без пространства имён XML, поэтому тег `svg` не будет нарисован. ui-kit использует маски CSS для значков, а для рисунков — рамки, градиенты и emoji.
- **Можно ли использовать pavlus без Vite?** Компилятор — обычная функция: `compileTemplate(source)` возвращает текст ES-модуля. Plugin для Vite — существующая интеграция, и всё на этих страницах предполагает её.
- **Почему мой первый рендер пуст?** Потому что `route` равен `null`, пока plugin router не сообщит. Сначала монтирование, затем `mounted` запускает `router.listen`. Если вы используете собственный `mounted`, он тоже должен вернуть `router.listen("routeChanged")`.
- **Работает ли серверный рендеринг с каждым plugin?** Нет. Дайте серверу заглушки для plugins браузера; см. [Серверный рендеринг](page:concepts-ssr).

## Что вы узнали

- У ошибки шаблона есть строка и столбец. Ошибка времени выполнения начинается с `pavlus:` и называет своё решение. Тихий сбой — почти всегда message, которое никто не обрабатывает, или effect, который никто не выполняет.
- Кавычки делают текст, без кавычек — поле. Список, который меняется, нуждается в `key`. State никогда не мутируется.
- `onStep`, `withLogging`, `compileToView` и консоль разработки показывают messages, effects, vnodes и patches.
- Статическому хосту нужен fallback на `index.html`, а сайту под префиксом нужно окно router, которое его скрывает.

Вы дошли до конца документации. [Обзор фреймворка](page:overview) перечисляет все страницы, а [Живая песочница](page:compiler-playground) позволяет попробовать собственный шаблон.
