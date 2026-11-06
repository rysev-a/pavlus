---
summary: Как компилятор пишет render(state). Прочитайте сгенерированный код строка за строкой, от одного абзаца до целой карточки: форма vnode, атрибуты, классы, события, текст, выражения, условия, циклы и дочерние view.
---
## Что такое render

`render(state)` — это функция, которая отвечает на вопрос «как выглядит страница для этого state?». Она не трогает DOM. Она строит и возвращает список обычных объектов, **vnodes**, которые описывают страницу. Plugin для DOM один раз строит из них настоящие элементы, когда view монтируется. Серверный рендеринг превращает тот же список в текст HTML. После первого render дальше работает `diff` (см. [конвейер](page:compiler-pipeline)).

`render` генерируется из AST по фиксированному шаблону: один блок кода на каждый узел, в порядке шаблона. Эта страница показывает этот паттерн от самого маленького шаблона вверх. Каждый блок кода, который вы здесь видите, — настоящий результат компилятора, скопированный из запуска.

Начнём с одной строки.

::demo static-line open=module

Откройте модуль и прочитайте `render` сверху.

```ts
function render(state, idSuffix = "", messagePrefix = "", env) {
  const nodes = [];
  // line 1: <p.note>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Hello" });
  const pAttrs = { "class": "note" };
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
  return nodes;
}
```

- У функции четыре параметра. `state` — это данные. `idSuffix`, `messagePrefix` и `env` используются, когда это view встроено (embed) в другое; view верхнего уровня оставляет их значения по умолчанию.
- `nodes` — это результат: vnodes верхнего уровня.
- Комментарий `// line 1: <p.note>` говорит, какая строка шаблона произвела код под ним. Показаны тег и классы, чтобы вы могли ориентироваться в длинном модуле.
- `pChildren` — это список дочерних узлов `p`. Текст добавляется первым.
- `pAttrs` — это объект атрибутов. Класс `note` статичен, поэтому записан литералом.
- Последним в `nodes` добавляется элемент, с пятью полями, которые есть у каждого vnode элемента.

Дочерние узлы пишутся раньше элемента, потому что JavaScript нужно, чтобы массив существовал, когда он используется. Это верно для каждого элемента: **сначала дочерние узлы, затем атрибуты, затем сам элемент**.

## Три vnode

Есть только три вида vnode, и у каждого есть короткий тег типа в `t`.

| `t` | Поля | Значение |
| --- | --- | --- |
| `el` | `tag`, `attrs`, `events`, `children`, необязательный `id` | элемент |
| `text` | `text`, необязательный `id` | текстовый узел |
| `marker` | `id` | пустой узел-комментарий, отмечающий начало или конец блока |

`attrs` элемента — это обычный объект из имён в строки. `events` — обычный объект из имён DOM-событий в описания message `{ id, payload, prevent?, stop? }`. В vnode нет функций: это данные, поэтому их можно сравнивать, логировать, отправлять по сети и превращать в текст HTML.

`id` — самое интересное поле, и оно необязательно. **Id пишется только тогда, когда `diff` может патчить узел.** В `static-line` id нет вообще. На остальной части страницы вы увидите, когда именно он появляется: для текста с выражением, для элемента с динамическим атрибутом, классом или payload события и для каждого маркера.

## Вложенность и имена

Элементы внутри элементов вкладывают свои блоки. Каждый элемент объявляет собственные переменные, названные по тегу.

::demo nesting open=module

```ts
// line 1: <div>
const divChildren = [];
// line 2: <h1>
const h1Children = [];
h1Children.push({ t: "text", text: "Title" });
const h1Attrs = {};
divChildren.push({
  t: "el",
  tag: "h1",
  attrs: h1Attrs,
  events: {},
  children: h1Children,
});
// line 3: <p>
const pChildren = [];
pChildren.push({ t: "text", text: "Text" });
const pAttrs = {};
divChildren.push({
  t: "el",
  tag: "p",
  attrs: pAttrs,
  events: {},
  children: pChildren,
});
const divAttrs = {};
nodes.push({
  t: "el",
  tag: "div",
  attrs: divAttrs,
  events: {},
  children: divChildren,
});
```

`h1` и `p` добавляют себя в `divChildren`, а в конце `div` добавляет себя в `nodes`. Результат — дерево `div > (h1, p)`.

Имена приходят от небольшого аллокатора (`names.ts`). Он начинает с тега, `h1Children`, и добавляет число, только когда имя уже занято в блоке, открытом в этой точке: второй `li` рядом с первым становится `liChildren2`. Имена, которые зарезервированы в JavaScript (`class`, `new`, ...), слова, нужные сгенерированному коду (`state`, `nodes`, `patches`, ...), и имена хелперов и импортированных view никогда не используются для переменных. Тег вроде `my-card` становится `myCard`. Переменная цикла называется по вашей переменной; если это имя занято, добавляется число.

Отступы, переносы строк и правило «вызов, который не помещается в 100 колонок, получает по одному аргументу на строку» приходят от небольшого `Writer`. Поэтому длинный вызов `setAttr` в демо `classes` ниже разбит на строки, а короткие нет.

## Статические атрибуты и классы

Атрибуты с фиксированным значением записываются прямо в объект атрибутов, одним литералом.

::demo static-attrs open=module

```ts
const aAttrs = { "id": "go", "href": "/home", "target": "_blank", "hidden": "", "class": "btn big" };
```

Посмотрите на порядок: сначала `id` (`#go` из селектора — такой же атрибут, как любой другой, и парсер ставит его первым), затем атрибуты в порядке исходника, и `class` последним. Два класса `.btn.big` объединены в одну строку. У булева атрибута вроде `hidden` значение `""`, так HTML говорит «присутствует». Здесь нет ничего динамического, поэтому у элемента нет id, а хелперы вообще не импортируются.

## Текст и интерполяция

Текст с дырками строится через `+`. Каждая дырка проходит через `toText`, которая превращает `null`, `undefined` и `false` в пустую строку.

::demo interpolation open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "Hello, " + toText(state.name) + "! You have " + toText(state.count) + " new messages." });
```

Части текста по порядку: строка `"Hello, "`, выражение `name`, строка `"! You have "`, выражение `count` и строка `" new messages."`. Строки записаны как строковые литералы JSON; выражения обёрнуты в `toText`.

У текста есть `id`, `"1" + idSuffix`. `1` — это id узла от парсера. `idSuffix` для view верхнего уровня пуст; именно он делает id уникальным, когда view встроено (embed) или повторяется в цикле. Если в текстовом узле нет выражения, у него нет id.

Когда первая часть — выражение, код начинается с пустой строки: `"" + toText(state.name)`. Это сделано только для единообразия: `toText` уже возвращает строку, а пустая строка сохраняет у каждого текста с интерполяцией одну и ту же форму `"" + ...`.

## Динамические атрибуты

Атрибут, в значении которого есть выражение, вычисляется через `setAttr` и один из двух конвертеров.

::demo dynamic-attrs open=module

```ts
const aAttrs = {};
setAttr(aAttrs, "href", toAttr(state.url));
setAttr(aAttrs, "title", "Open " + toText(state.name));
setAttr(aAttrs, "data-id", toAttr(state.id));
setAttr(aAttrs, "hidden", toAttr(state.gone));
```

- Значение, которое является одним выражением (`href=url`), проходит через `toAttr`. `null`, `undefined` и `false` означают «не писать этот атрибут вообще». `true` означает голый атрибут (пустая строка). Всё остальное превращается в строку: `data-id=id` при `id: 0` даёт `"0"`, потому что `0` — такое же значение, как любое другое.
- Значение, смешивающее текст и выражения (`title="Open {name}"`), строится как текст. Это всегда строка, поэтому оно всегда записывается.
- `setAttr(attrs, name, value)` записывает атрибут, если значение не `null`.

В HTML демо нет `hidden`, потому что `gone` равно `false`. У элемента есть `id` (`"0" + idSuffix`), потому что `diff` может что-то о нём сказать. Шаг демо делает `url` равным null, и `diff` отвечает `rmAttr`: атрибут удаляется.

## Переключатели классов

Класс, зависящий от state, — это запись вида `class:name=condition`. Вместе со статическими классами и необязательным атрибутом `class=` он образует одно значение, вычисляемое через `joinClasses`.

::demo classes open=module

```ts
setAttr(liAttrs, "class", 
  joinClasses(["item", (state.active ? "active" : ""), ((state.state === "done") ? "done" : ""), toAttr(state.extra)]),
);
```

В списке по порядку: статические классы (`.item`, объединённые в одну строку), по одной записи на каждый переключатель (`(condition ? "name" : "")`) и атрибут `class=`, если он есть. `joinClasses` отбрасывает пустые записи и объединяет остальные пробелами, поэтому HTML — `class="item active wide"`. Если ничего не осталось, она возвращает `null`, и `setAttr` ничего не пишет.

Шаг показывает, как `state` меняется с `open` на `done`. Новый список классов — `item active done wide`, а patch — один `attr` для всего значения класса, а не по одному на каждое имя класса. Выражение второго переключателя использует фигурные скобки (`class:done={state === "done"}`), потому что в нём есть пробелы; см. [разбор](page:compiler-parser).

## Void-элементы

В HTML есть элементы, у которых никогда не бывает содержимого: `input`, `br`, `img` и ещё несколько. Парсер не разрешает дочерние узлы под ними, и компилятор их не пишет. У vnode всё равно есть список `children`, и он пуст.

::demo voids open=module

```ts
// line 3: <br>
const brChildren = [];
const brAttrs = {};
formChildren.push({
  t: "el",
  tag: "br",
  attrs: brAttrs,
  events: {},
  children: brChildren,
});
```

Когда vnodes превращаются в HTML, `toHtml` знает тот же список void-тегов и пишет `<br>` без закрывающего тега. В plugin для DOM `document.createElement("br")` просто не получает дочерних узлов. Здесь id есть только у `input`, потому что его атрибут `value` читает state.

## События

Событие в vnode — это не функция. Это описание message: id message и payload. Приложение получает message, когда пользователь кликает; в шаблоне никогда нет логики.

::demo events open=module

```ts
const buttonEvents = {
  "click": { id: messagePrefix + "save", payload: undefined },
};
...
const buttonEvents2 = {
  "click": { id: messagePrefix + "remove", payload: state.id },
};
...
const buttonEvents3 = {
  "click": { id: messagePrefix + "move", payload: [state.id, 1] },
};
...
const aEvents = {
  "click": { id: messagePrefix + "open", payload: undefined, prevent: true, stop: true },
};
```

- Id message — это `messagePrefix + "save"`. У view верхнего уровня префикс пуст, поэтому message — `save`. У встроенного (embed) view префикс — имя экземпляра, поэтому `save` в дочернем `+Form#editor` — это `editor.save`.
- Нет аргумента — `payload: undefined`. Один аргумент даёт своё значение, а несколько аргументов дают массив.
- Модификаторы `.prevent` и `.stop` становятся флагами `prevent: true` и `stop: true` в описании. Plugin для DOM читает их, когда приходит событие.

Посмотрите, у каких кнопок есть `id`. У первой, `@click=save`, его нет: её описание никогда не меняется. Вторая и третья читают `state.id`, поэтому у них есть id (`"3"` и `"5"`), и `diff` может перепривязать их payload. В шаге `id` меняется с 4 на 5: два patch `handler`, по одному на каждую кнопку, с новым payload. Слушатели не затрагиваются.

## Выражения

Все выражения переводит одна функция с одним случаем на каждый вид узла в AST выражений. Перевод следует двум правилам. **Каждое составное выражение обёрнуто в круглые скобки**, поэтому порядок вычисления никогда не зависит от приоритета в напечатанном тексте. И **каждый доступ к полю null-safe**.

| В шаблоне | В сгенерированном коде |
| --- | --- |
| `count` | `state.count` |
| `user.name` | `(state.user)?.name` |
| `rows[i].title` | `((state.rows)?.[state.i])?.title` |
| `format(price)` | `(state.format)?.(state.price)` |
| `!done` | `(!(state.done))` |
| `-n` | `(-(state.n))` |
| `a + b * 2` | `(state.a + (state.b * 2))` |
| `ok ? "yes" : "no"` | `(state.ok ? "yes" : "no")` |
| `name ?? "anonymous"` | `(state.name ?? "anonymous")` |
| `["a", n]` | `["a", state.n]` |
| `null`, `1`, `"x"` | `null`, `1`, `"x"` |

Внутри цикла переменные цикла — локальные переменные и записываются без `state.`.

::demo operators open=module

```ts
pChildren4.push({ t: "text", id: "7" + idSuffix, text: "" + toText((((state.x > 0) && (state.y < 10)) || state.z)) });
pChildren6.push({ t: "text", id: "11" + idSuffix, text: "" + toText(((state.count === 1) ? "item" : "items")) });
```

Операторы копируются как есть: `===` остаётся `===`, `??` остаётся `??`. Язык шаблонов выбирает безопасное подмножество JavaScript и затем использует его как есть.

Следующее демо показывает, что делает null-safety. В state `user: null`, пустой `rows` и функция `format`. Ничего не выбрасывает исключение.

::demo access open=module

```ts
pChildren.push({ t: "text", id: "1" + idSuffix, text: "" + toText(((state.user)?.address)?.city) });
pChildren2.push({ t: "text", id: "3" + idSuffix, text: "" + toText(((state.rows)?.[state.i])?.title) });
pChildren3.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.format)?.(state.price)) });
```

В обычном JavaScript `state.user.address.city` выбросил бы ошибку, когда `user` равен `null`. Здесь каждый `?.` останавливает цепочку на первом недостающем звене и даёт `undefined`, а `toText` превращает это в пустую строку. В HTML первые два абзаца пустые, для вызова — `$3`, а для литерала `null` — ничего. Шаблон не может упасть из-за того, что данные ещё не пришли. Поэтому шаблон можно писать без защит `if user` перед каждым чтением.

> [!NOTE] Вызовы тоже необязательны
> `format(price)` переводится в `(state.format)?.(state.price)`. Если `format` отсутствует, результат — `undefined`, и снова без ошибки. Функция получает значения как аргументы; она должна быть чистой, потому что `diff` вызывает её и для `prev`, и для `next`.

## Условия

`if` рендерится как обычная цепочка `if` в JavaScript, с маркером с каждой стороны.

::demo if-else open=module

```ts
// line 1: if
nodes.push({ t: "marker", id: "0s" + idSuffix });
if (state.loading) {
  // line 2: <p>
  const pChildren = [];
  pChildren.push({ t: "text", text: "Loading" });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
} else {
  // line 4: <p>
  const pChildren = [];
  pChildren.push({ t: "text", id: "4" + idSuffix, text: "Loaded " + toText(state.count) });
  const pAttrs = {};
  nodes.push({
    t: "el",
    tag: "p",
    attrs: pAttrs,
    events: {},
    children: pChildren,
  });
}
nodes.push({ t: "marker", id: "0e" + idSuffix });
```

Строится только та ветка, которая истинна. Два маркера присутствуют всегда: `0s` — это начало (id узла `0` и буква `s`), `0e` — конец. В DOM это пустые узлы-комментарии. Когда ветка меняется, `diff` удаляет всё между двумя маркерами и вставляет новую ветку перед конечным маркером. Без маркеров не было бы места, чтобы сказать «здесь живёт блок», когда блок пуст.

Каждая ветка — это отдельный блок, поэтому аллокатор переиспользует имена (`pChildren` встречается в обеих) без числа. Они никогда не встречаются.

## Циклы

`for` — это цикл `for` в JavaScript с маркером до и после всего списка и маркером до и после каждого элемента.

::demo for-loop open=module

```ts
// line 2: for tag, i
ulChildren.push({ t: "marker", id: "1s" + idSuffix });
const tagList = (state.tags) || [];
for (let i = 0; i < tagList.length; i++) {
  const tag = tagList[i];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "1[" + tagSuffix });
  // line 3: <li>
  const liChildren = [];
  liChildren.push({ t: "text", id: "3" + tagSuffix, text: "" + toText(i) + ": " + toText(tag) });
  ...
  ulChildren.push({ t: "marker", id: "1]" + tagSuffix });
}
ulChildren.push({ t: "marker", id: "1e" + idSuffix });
```

- `(state.tags) || []` превращает отсутствующий список в пустой.
- Key — это `String(...)` выражения key. Здесь это `key tag`, так что key — сам тег. Без `key` ключом служит индекс, записанный как `String(i)`.
- У каждого элемента свой суффикс, `idSuffix + "#" + key`. Им заканчиваются все id внутри элемента: текст — это `"3" + tagSuffix`, например `3#a`. Один и тот же текстовый узел в двух элементах имеет два разных id. Key делает это стабильным: если элемент перемещается, его id идут вместе с ним.
- Начальный и конечный маркер элемента — это `"1["` и `"1]"`, за которыми идёт суффикс. Маркеры позволяют `diff` переместить или удалить весь элемент как один диапазон соседних узлов.

У индекса и элемента имена, которые вы дали в шаблоне. Если вы опустите индекс, аллокатор придумает `tagIndex`, как вы увидите в демо `card` ниже.

## Дочерние view

Embed становится вызовом `render` дочернего компонента, а результат раскрывается в дочерние узлы родителя.

::demo embed open=module

```ts
// line 4: +Badge#one
divChildren.push(...Badge.render(
  { "label": "Hi " + toText(state.name), "count": state.n },
  idSuffix + "/1",
  messagePrefix + "one.",
  childEnv(env, "one", state),
));
```

Четыре аргумента по порядку: `state` дочернего компонента (props в виде объекта), суффикс id, префикс message и окружение. Объект props сохраняет тип prop из одного выражения (`count: state.n` — число, если `n` — число) и строит строку для prop с текстом и дырками (`label="Hi {name}"`). Суффикс дополняется `/1` — id узла embed, чтобы id дочернего компонента не пересекались с id родителя. Префикс дополняется `one.` — именем экземпляра. Последний аргумент — компонент за экземпляром, найденный хелпером `childEnv`; дочернему компоненту он нужен в основном для `+outlet`.

Prop без значения (`strong`) — это `true`. Элемент spread (`...extra`) становится `...(state.extra)` внутри объекта props.

**Динамический embed**, `+{expr}#name`, — это view, которое приходит из state. Он проверяется во время выполнения, поэтому получает маркеры, как условие:

```ts
// line 2: +{...}#view
sectionChildren.push({ t: "marker", id: "1s" + idSuffix });
const viewView = asView(state.page);
if (viewView) {
  sectionChildren.push(...viewView.render(
    { "title": state.title },
    idSuffix + "/1",
    messagePrefix + "view.",
    state.page,
  ));
}
sectionChildren.push({ t: "marker", id: "1e" + idSuffix });
```

`asView` принимает view, или объект компонента, у которого есть `view`, или `null` для «ничего». Остальное — тот же вызов, обёрнутый в `if`.

`+outlet` рендерится похожим образом, с маркерами и поиском дочернего компонента маршрута во время выполнения:

```ts
// line 3: +outlet
divChildren.push({ t: "marker", id: "3s" + idSuffix });
const outlet = resolveOutlet(env, state);
if (outlet) {
  divChildren.push(...outlet.view.render(
    outlet.state,
    idSuffix + "/3",
    messagePrefix + outlet.name + ".",
    outlet.component,
  ));
}
divChildren.push({ t: "marker", id: "3e" + idSuffix });
```

`resolveOutlet` смотрит на таблицу `routing` компонента (`env`) и на `state.route` и возвращает подходящую страницу: её view, её state, её имя и её компонент. Если совпадения нет, между маркерами ничего не рендерится.

## Полная карточка

Теперь шаблон, использующий почти всё: переключатель класса на корне, изображение с двумя динамическими атрибутами, заголовок, null-safe значение по умолчанию, список с key и событием клика, и условие с кнопкой и альтернативой.

::demo card open=module

Прочитайте сгенерированный `render` по частям. Сначала корень, в конце функции:

```ts
const articleAttrs = {};
setAttr(articleAttrs, "class", joinClasses(["card", (state.featured ? "featured" : "")]));
nodes.push({
  t: "el",
  id: "0" + idSuffix,
  tag: "article",
  attrs: articleAttrs,
  events: {},
  children: articleChildren,
});
```

Переключатель класса `featured` динамический, поэтому у `article` есть id `"0"`. Статический класс `card` — первая запись списка. Изображение — первый дочерний узел:

```ts
const imgAttrs = { "class": "card-img" };
setAttr(imgAttrs, "src", toAttr(state.image));
setAttr(imgAttrs, "alt", toAttr(state.title));
```

Статический класс находится в литерале, а два динамических атрибута идут следом. `h3` статичен, кроме своего текста, поэтому у элемента нет id, а у его текста есть: `"3" + idSuffix`. Описание использует null-safe значение по умолчанию:

```ts
pChildren.push({ t: "text", id: "5" + idSuffix, text: "" + toText((state.summary ?? "No summary")) });
```

При `summary: null` это `No summary`. Затем список. В этом списке индекс в шаблоне не назван, поэтому аллокатор выбрал `tagIndex`:

```ts
const tagList = (state.tags) || [];
for (let tagIndex = 0; tagIndex < tagList.length; tagIndex++) {
  const tag = tagList[tagIndex];
  const tagKey = String(tag);
  const tagSuffix = idSuffix + "#" + tagKey;
  ulChildren.push({ t: "marker", id: "7[" + tagSuffix });
  // line 7: <li.tag>
  const liChildren = [];
  liChildren.push({ t: "text", id: "9" + tagSuffix, text: "" + toText(tag) });
  const liAttrs = { "class": "tag" };
  const liEvents = {
    "click": { id: messagePrefix + "filter", payload: tag },
  };
  ulChildren.push({
    t: "el",
    id: "8" + tagSuffix,
    tag: "li",
    attrs: liAttrs,
    events: liEvents,
    children: liChildren,
  });
  ulChildren.push({ t: "marker", id: "7]" + tagSuffix });
}
```

У каждого `li` есть id, включающий его key (`8` и суффикс `#hot`), потому что payload `filter(tag)` — это данные, которые могут измениться. Последняя часть — условие, с кнопкой, у которой событие с двумя аргументами и динамический `disabled`:

```ts
const buttonAttrs = { "class": "buy" };
setAttr(buttonAttrs, "disabled", toAttr(state.soldOut));
const buttonEvents = {
  "click": { id: messagePrefix + "buy", payload: [state.id, state.price] },
};
```

В state демо `soldOut` равно `false`, поэтому `disabled` не записывается, а `price`, равный 4, находится в payload как `[9, 4]`. Шаг меняет цену. Результат — два patch: message кнопки получает payload `[9, 5]`, а текст становится `Buy for 5`. Все остальные узлы в карточке не упоминаются. Как `diff` находит именно эти два, — тема [следующей страницы](page:compiler-diff).

## Проверьте своё понимание

Научиться читать сгенерированный код можно за несколько минут, и это стоит того. Когда страница выглядит не так, как вы ожидаете, первый шаг — развернуть модуль небольшого демо с такой же формой. Задайте три вопроса:

1. Есть ли `id` у элемента или текста, которого я жду? Если нет, ни один patch никогда до него не дойдёт.
2. Переведено ли выражение, которое я написал, так, как я думал? Ищите круглые скобки и `?.`.
3. Атрибут вычисляется через `toAttr` (одно выражение) или через `+` (текст с дырками)? Первый отбрасывает `false` и `null`, а второй всегда пишет строку.

## Что вы узнали

- `render` генерируется по фиксированному шаблону: сначала дочерние узлы, затем атрибуты, затем добавляется элемент; vnode — это обычные данные трёх видов, `el`, `text` и `marker`.
- `id` есть только у узлов, которые может патчить `diff`, и у всех маркеров. Id — это id узла от парсера, за которым идёт суффикс элемента списка или дочернего view.
- Атрибуты используют `setAttr` с `toAttr` (одно выражение) или конкатенацию текста (текст с дырками), классы используют `joinClasses`, события становятся описаниями message с payload.
- Выражения полностью заключены в скобки и null-safe. `if`, `for` и embed обёрнуты в маркеры, чтобы `diff` знал, где они начинаются и заканчиваются.

Дальше: [Функция diff](page:compiler-diff).
