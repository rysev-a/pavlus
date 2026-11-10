# svg plugin

The template language cannot express SVG, so this plugin renders SVG from data. A tree of plain
`SvgNode`s (`{tag, attrs?, children?, text?, on?, key?}`) is validated against a whitelist, then
built in the SVG namespace; `update` diffs against the last tree and patches only what changed.

| effect     | fields                                                  | reply                                               |
| ---------- | ------------------------------------------------------- | --------------------------------------------------- |
| `mount`    | `target`, `tree` (root `svg`), `onMounted?`, `onError?` | `onMounted`                                         |
| `update`   | `target`, `tree`, `onError?`                            | -                                                   |
| `unmount`  | `target`                                                | -                                                   |
| `measure`  | `target`, `selector?`, `onSuccess`, `onError?`          | `onSuccess` `{x,y,width,height}` (getBBox)          |
| `toString` | `tree`, `onSuccess`, `onError?`                         | `onSuccess` SVG markup string (pure, no DOM needed) |

`target` is a selector or an element. If it is already an `<svg>`, the tree is rendered into it; otherwise a new `<svg>` is created inside it.

## Building trees (`svg/h.ts`)

```ts
import { svgEffector as svg } from "@pavlus/client/plugins/svg";
import {
  root,
  g,
  circle,
  rect,
  text,
} from "@pavlus/client/plugins/svg/h";

const view = (s: State) =>
  root(
    { viewBox: "0 0 200 100" },
    rect({ width: 200, height: 100, fill: "#eee" }),
    ...s.points.map((p) =>
      circle({
        key: p.id,
        cx: p.x,
        cy: p.y,
        r: 6,
        fill: p.hot ? "tomato" : "steelblue",
        on: { click: { id: "pick", payload: p.id } },
      }),
    ),
    text({ x: 4, y: 12 }, `${s.points.length} points`),
  );

const app: AppFn<State> = (msg, s) => {
  if (msg.id === "boot") return [svg.mount("#chart", view(s), "mounted")];
  if (msg.id === "pick") {
    const { x, y } = msg.payload as { x: number; y: number }; // click position in viewBox space
    return [svg.update("#chart", view(s))];
  }
  return [];
};
```

`svg(tag, attrs, ...children)` is the generic builder; `root rect circle line path g text` (and `ellipse polyline polygon defs tspan use title`) are shortcuts.
`key` and `on` inside `attrs` become node fields; string/number children become the node's `text` (rendered before child elements); `false`/`null` children are skipped and arrays flattened.

## Events

`on: { click: { id, payload?, prevent?, stop? } }` dispatches `{ id, payload, event: {type, key?} }`. For mouse and pointer events the
position in the root's viewBox space is merged into the payload: object payloads get `x`,`y` added, no payload becomes `{x, y}`,
other payloads become `{ payload, x, y }`. Allowed events: click, dblclick, contextmenu, mouse*, pointer*, wheel, keydown, keyup, focus, blur.

## Safety

Only whitelisted tags (shapes, text, gradients, clip/mask/marker/filter primitives, `use`, `a`, `image`, `title`, `desc`) and attributes are accepted.
Rejected with `onError` `{code:"invalid", message}` (nothing is rendered): `script`, `foreignObject`, `style`, animation tags, any unknown tag/attribute,
`on*` attributes, `javascript:`/`vbscript:`/non-image `data:` hrefs (also with hidden whitespace/control characters), `<use>` hrefs that are not `#fragments`,
`url(...)` values pointing anywhere but `#fragments`, unsafe `style` values, non-finite numbers, duplicate sibling keys, trees deeper than 200.
Text and attribute values are only ever set through DOM APIs (or escaped in `toString`), never parsed as markup.

## Notes

- Keyed children (`key`) are matched by key and moved; unkeyed children are matched by position and tag.
- `measure` needs a rendered browser SVG; elsewhere (jsdom) it replies `unsupported`.
- Without a DOM, `mount/update/measure` reply `unsupported` (silent without `onError`); `toString` always works.
- `dispose()` unmounts everything and detaches all listeners.
