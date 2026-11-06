// "Copy as pavlus code": a .pavlus template per page and a handlers skeleton
// (state, one method per event, effects for the actions). Best effort: the
// template is exact for the elements that map to markup; the data-heavy widgets
// (table filter and paging, charts) get a note where the handler has to compute
// something. The tests compile every generated template with `compileToView`.
import { HELPERS, parseInitial, splitTemplate } from "./bind.ts";
import { walk } from "./chain.ts";
import { layoutOf } from "./grid.ts";
import { columnsOf } from "./stage.ts";
import {
  type Action,
  allElements,
  type El,
  type EventName,
  isIdent,
  type Model,
  type Page,
  type Section,
} from "./model.ts";

export interface GenFile {
  name: string;
  text: string;
}

const noState = (s: string): string => s.replace(/(?<![\w.])state\./g, "");
const tplText = (s: string): string =>
  splitTemplate(s)
    .map((p) =>
      typeof p === "string" ? p.replace(/\{/g, "\\{") : `{${noState(p.expr)}}`,
    )
    .join("");
const attrText = (s: string): string => tplText(s).replace(/"/g, "'");
const exprT = (s: string): string => noState(s.trim()) || "null";
const pageFile = (p: Page): string =>
  `${p.slug === "/" ? "home" : p.slug.slice(1).replace(/\W+/g, "-")}.pavlus`;
const ident = (s: string): string => s.replace(/\W/g, "_");
const csv = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const msgName = (el: El, ev: EventName): string => `${el.id}_${ev}`;

function ev(el: El, name: EventName, attr: string, args = ""): string {
  return (el.events[name]?.length ?? 0) > 0
    ? ` ${attr}=${msgName(el, name)}${args ? `(${args})` : ""}`
    : "";
}

/** the lines of one element (indented by the caller) */
function elementLines(el: El): string[] {
  const p = el.props;
  const bind = el.bind ? noState(el.bind) : "";
  const click = ev(el, "click", "@click");
  const hover = ev(el, "hover", "@mouseenter");
  switch (el.type) {
    case "heading":
      return [
        `h${p.level || 2}.vb-h(${(click + hover).trim()}) ${tplText(p.text)}`.replace(
          "()",
          "",
        ),
      ];
    case "text":
      return [
        `p.vb-p${click || hover ? `(${(click + hover).trim()})` : ""} ${tplText(p.text)}`,
      ];
    case "button":
      return [
        `button.ui-button.ui-button-${p.variant === "outline" ? "outline" : p.variant === "secondary" ? "secondary" : p.variant === "destructive" ? "destructive" : "default"}(type="button"${p.disabled ? ` disabled={${exprT(p.disabled)}}` : ""}${click}${hover}${ev(el, "focus", "@focus")}${ev(el, "blur", "@blur")}) ${tplText(p.text)}`,
      ];
    case "link":
      return [
        `a.vb-link(href="#"${click ? click.replace("@click=", " @click.prevent=") : ""}${hover}) ${tplText(p.text)}`,
      ];
    case "image":
      return [
        `img.vb-img(src="${attrText(p.src)}" alt="${attrText(p.alt)}"${click}${hover})`,
      ];
    case "badge":
      return [
        `span.ui-badge.ui-badge-${p.variant || "default"}(${(click + hover).trim()}) ${tplText(p.text)}`.replace(
          "()",
          "",
        ),
      ];
    case "progress":
      return [
        `div.vb-progress`,
        `  p ${tplText(p.label)}`,
        `  div.ui-progress`,
        `    div.ui-progress-bar(style="width: {${exprT(p.value || "0")}}%")`,
      ];
    case "card":
      return [
        `div.ui-card(${(click + hover).trim()})`.replace("()", ""),
        `  div.ui-card-content`,
        `    h3 ${tplText(p.title)}`,
        `    p ${tplText(p.text)}`,
      ];
    case "kpi":
      return [
        `div.ui-card`,
        `  div.ui-card-content`,
        `    p ${tplText(p.label)}`,
        `    strong ${tplText(p.value)}`,
        `    small ${tplText(p.delta)}`,
      ];
    case "input":
      return [
        `label.vb-field`,
        `  span ${tplText(p.label)}`,
        `  input.ui-input(type="${p.type || "text"}" placeholder="${attrText(p.placeholder)}"${bind ? ` value=${bind}` : ""}${ev(el, "input", "@input")}${ev(el, "change", "@change")}${ev(el, "focus", "@focus")}${ev(el, "blur", "@blur")}${ev(el, "enter", "@keydown")})`,
      ];
    case "textarea":
      return [
        `label.vb-field`,
        `  span ${tplText(p.label)}`,
        `  textarea.ui-textarea(placeholder="${attrText(p.placeholder)}"${bind ? ` value=${bind}` : ""}${ev(el, "input", "@input")}${ev(el, "change", "@change")})`,
      ];
    case "select":
      return [
        `label.vb-field`,
        `  span ${tplText(p.label)}`,
        `  select.ui-select(${ev(el, "change", "@change").trim()})`,
        ...csv(p.options).map(
          (o) =>
            `    option(value="${attrText(o)}"${bind ? ` selected={${bind} === "${attrText(o)}"}` : ""}) ${tplText(o)}`,
        ),
      ];
    case "checkbox":
      return [
        `label.vb-check`,
        `  input(type="checkbox"${bind ? ` checked={${bind}}` : ""}${ev(el, "change", "@change")})`,
        `  span ${tplText(p.label)}`,
      ];
    case "list":
      return [
        `ul.vb-list`,
        `  for item, index in ${exprT(p.source)} key index`,
        `    li${ev(el, "click", "@click", "item, index")}`,
        `      span ${tplText(p.itemText || "{item}")}`,
        ...(p.removable === "yes"
          ? [
              `      button.ui-button.ui-button-outline.ui-button-sm(type="button" @click=${msgName(el, "remove")}(item, index)) Remove`,
            ]
          : []),
      ];
    case "table": {
      const cols = columnsOf(p.columns ?? "");
      return [
        `// filter / sort / paging of "${p.filter || "-"}": compute the visible rows in the handler`,
        `table.vb-table`,
        ...(cols.length
          ? [`  thead`, `    tr`, ...cols.map((c) => `      th ${c.label}`)]
          : []),
        `  tbody`,
        `    for row, index in ${exprT(p.source)} key index`,
        `      tr${ev(el, "click", "@click", "row, index")}`,
        ...(cols.length
          ? cols.map((c) => `        td {row.${c.key.replace(/\W/g, "")}}`)
          : [`        td {row}`]),
        ...csv(p.rowActions).map(
          (a) =>
            `        td\n          button.ui-button.ui-button-outline.ui-button-sm(type="button" @click=${msgName(el, "rowAction")}(row, index, ${jsString(a)})) ${a}`,
        ),
      ];
    }
    case "repeater":
      return [
        `div.vb-cards`,
        `  for item, index in ${exprT(p.source)} key index`,
        `    div.ui-card${ev(el, "click", "@click", "item, index")}`,
        `      div.ui-card-content`,
        `        h3 ${tplText(p.title)}`,
        `        p ${tplText(p.text)}`,
        ...(p.footer ? [`        small ${tplText(p.footer)}`] : []),
      ];
    case "chart":
      return [
        `// chart "${p.kind}" of ${p.source}: draw it with the svg plugin into this element`,
        `div#chart-${ident(el.id)}.vb-chart(role="img" aria-label="${attrText(p.title)}")`,
      ];
    case "tabs": {
      const labels = csv(p.tabs);
      const panels = p.panels.split("|").map((x) => x.trim());
      return [
        `div.vb-tabs`,
        ...labels.map(
          (l, i) =>
            `  button.vb-tab(type="button" @click=${msgName(el, "change")}("${attrText(l)}")) ${tplText(l)}${i < 0 ? "" : ""}`,
        ),
        ...labels.flatMap((l, i) => [
          `  if ${bind || "null"} === "${attrText(l)}"`,
          `    p ${tplText(panels[i] ?? "")}`,
        ]),
      ];
    }
    case "accordion": {
      const titles = csv(p.titles);
      const panels = p.panels.split("|").map((x) => x.trim());
      return [
        `div.vb-accordion`,
        ...titles.flatMap((t, i) => [
          `  button.vb-acc(type="button" @click=${msgName(el, "change")}("${attrText(t)}")) ${tplText(t)}`,
          `  if ${bind || "null"} === "${attrText(t)}"`,
          `    p ${tplText(panels[i] ?? "")}`,
        ]),
      ];
    }
    case "modal":
      return [
        `if ${bind || "false"}`,
        `  div.vb-modal(role="dialog")`,
        `    h3 ${tplText(p.title)}`,
        `    p ${tplText(p.text)}`,
        `    button.ui-button.ui-button-default(type="button" @click=${msgName(el, "close")}) ${tplText(p.closeLabel || "Close")}`,
      ];
    case "form": {
      const errs = noState(p.errorsKey || `${bind || "form"}Errors`);
      return [
        `form.vb-form(@submit.prevent=${msgName(el, "submit")})`,
        `  h3 ${tplText(p.title)}`,
        ...el.fields.flatMap((f) => [
          `  label.vb-field`,
          `    span ${tplText(f.label)}`,
          f.type === "textarea"
            ? `    textarea.ui-textarea(value=${bind}.${f.name} @input=${el.id}_field("${f.name}"))`
            : f.type === "checkbox"
              ? `    input(type="checkbox" checked={${bind}.${f.name}} @change=${el.id}_field("${f.name}"))`
              : `    input.ui-input(type="${f.type === "select" ? "text" : f.type}" value=${bind}.${f.name} @input=${el.id}_field("${f.name}"))`,
          `    if ${errs}.${f.name}`,
          `      small.vb-error {${errs}.${f.name}}`,
        ]),
        `  button.ui-button.ui-button-default(type="submit") ${tplText(p.submitLabel || "Send")}`,
      ];
    }
  }
}

function sectionLines(s: Section): string[] {
  const layout = layoutOf(s, "desktop");
  const out = [
    `section.vb-sec(data-bg="${s.bg}" data-pad="${s.pad}")`,
    `  div.vb-grid`,
  ];
  for (const el of s.elements) {
    const r = layout[el.id];
    if (!r) continue;
    const body = elementLines(el);
    const open = `    div.vb-cell(style="grid-column: ${r.x + 1} / span ${r.w}; grid-row: ${r.y + 1} / span ${r.h}")`;
    if (el.visible.trim()) {
      out.push(open.replace("div.vb-cell", "div.vb-cell"));
      out.push(`      if ${exprT(el.visible)}`);
      out.push(...body.map((l) => `        ${l}`));
    } else {
      out.push(open);
      out.push(...body.map((l) => `      ${l}`));
    }
  }
  return out;
}

export function pageTemplate(p: Page): string {
  return [
    `// ${p.name} (${p.slug})`,
    `div.vb-page`,
    ...p.sections.flatMap((s) => sectionLines(s).map((l) => `  ${l}`)),
    "",
  ].join("\n");
}

// ---- handlers ----

const jsString = (s: string): string => JSON.stringify(s);
/** `Hi {a.b}` -> a JS template literal */
function jsTemplate(s: string): string {
  const parts = splitTemplate(s).map((p) =>
    typeof p === "string"
      ? p.replace(/[`\\$]/g, "\\$&")
      : "${" + js(p.expr) + "}",
  );
  return "`" + parts.join("") + "`";
}
function js(expr: string): string {
  return expr
    .replace(/(?<![=!<>])==(?!=)/g, "===")
    .replace(/!=(?!=)/g, "!==")
    .replace(/(?<![\w.])event\./g, "event?.");
}

function actionLines(
  a: Action,
  id: string,
  path: string,
  pad: string,
): string[] {
  // an action with a condition is in the list only when the condition is true
  if (a.when?.trim()) {
    const { when: _when, ...rest } = a;
    return [
      `${pad}...(${js(a.when)} ? [`,
      ...actionLines(rest, id, path, `${pad}  `),
      `${pad}] : []),`,
    ];
  }
  const key = a.key ? jsString(a.key) : '""';
  switch (a.t) {
    case "set":
      return [`${pad}store.set(${key}, ${js(a.value || "null")}),`];
    case "toggle":
      return [`${pad}store.set(${key}, !state.${a.key}),`];
    case "push":
      return [
        `${pad}store.set(${key}, [...(state.${a.key} ?? []), ${js(a.value || "null")}]),`,
      ];
    case "remove":
      return [
        `${pad}store.set(${key}, (state.${a.key} ?? []).filter((_: unknown, i: number) => i !== ${js(a.index || "index")})),`,
      ];
    case "notice":
      return [`${pad}store.set("notice", ${jsTemplate(a.text ?? "")}),`];
    case "navigate":
      return [`${pad}router.navigate(${jsTemplate(a.url ?? "/")}),`];
    case "http":
      return [
        ...(a.loadingKey
          ? [`${pad}store.set(${jsString(a.loadingKey)}, true),`]
          : []),
        `${pad}http.request({`,
        `${pad}  id: ${jsString(`${id}${path}`)},`,
        `${pad}  method: ${jsString(a.method || "GET")},`,
        `${pad}  url: ${jsTemplate(a.url ?? "")},`,
        ...(a.headers
          ? [
              `${pad}  headers: ${JSON.stringify(
                Object.fromEntries(
                  a.headers
                    .split(/\n|;/)
                    .filter((l) => l.includes(":"))
                    .map((l) => [
                      l.slice(0, l.indexOf(":")).trim(),
                      l.slice(l.indexOf(":") + 1).trim(),
                    ]),
                ),
              )},`,
            ]
          : []),
        ...(a.body ? [`${pad}  body: ${js(a.body)},`] : []),
        `${pad}  onSuccess: ${jsString(`${id}${path}_ok`)},`,
        `${pad}  onError: ${jsString(`${id}${path}_err`)},`,
        `${pad}}),`,
      ];
  }
}

function replyMethods(a: Action, id: string, path: string): string[] {
  if (a.t !== "http") return [];
  const ok = [
    ...(a.loadingKey
      ? [`      store.set(${jsString(a.loadingKey)}, false),`]
      : []),
    ...(a.okKey
      ? [
          `      store.set(${jsString(a.okKey)}, ${a.okPath ? `(msg.payload as any).data?.${a.okPath}` : "(msg.payload as any).data"}),`,
        ]
      : []),
    ...(a.then ?? []).flatMap((x, i) =>
      actionLines(x, id, `${path}t${i}`, "      "),
    ),
  ];
  const err = [
    ...(a.loadingKey
      ? [`      store.set(${jsString(a.loadingKey)}, false),`]
      : []),
    ...(a.errKey
      ? [
          `      store.set(${jsString(a.errKey)}, { message: (msg.payload as any).error, status: (msg.payload as any).status }),`,
        ]
      : []),
    ...(a.catch ?? []).flatMap((x, i) =>
      actionLines(x, id, `${path}c${i}`, "      "),
    ),
  ];
  return [
    `  ${ident(id + path)}_ok(msg: Message, state: State): Effect[] {`,
    `    void state;`,
    `    return [`,
    ...ok,
    `    ];`,
    `  }`,
    `  ${ident(id + path)}_err(msg: Message, state: State): Effect[] {`,
    `    void state;`,
    `    return [`,
    ...err,
    `    ];`,
    `  }`,
    ...(a.then ?? []).flatMap((x, i) => replyMethods(x, id, `${path}t${i}`)),
    ...(a.catch ?? []).flatMap((x, i) => replyMethods(x, id, `${path}c${i}`)),
  ];
}

export function handlersFile(m: Model): string {
  const initial = Object.fromEntries(
    m.keys.map((k) => [k.key, parseInitial(k).value]),
  );
  const used = new Set<string>();
  const out: string[] = [
    `// Generated by the Visual Builder: "${m.name}". A skeleton: check the TODO notes.`,
    `import { Component, type Effect, type Message } from "@pavlus/frontend";`,
    `import { httpEffector as http, routerEffector as router, storeEffector as store } from "@pavlus/frontend/plugins";`,
    `import view from "./home.pavlus";`,
    ``,
    `export const initial = ${JSON.stringify({ ...initial, notice: "" }, null, 2)};`,
    `export type State = typeof initial & Record<string, any>;`,
    ``,
    `export class App extends Component<State> {`,
    `  view = view;`,
  ];
  for (const el of allElements(m)) {
    for (const [event, chain] of Object.entries(el.events) as [
      EventName,
      Action[],
    ][]) {
      if (!chain.length) continue;
      const name = msgName(el, event);
      out.push(
        `  ${name}(msg: Message, state: State): Effect[] {`,
        `    const event = msg.event;`,
        `    const row: any = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;`,
        `    const item = row;`,
        `    const index: number = Array.isArray(msg.payload) ? (msg.payload[1] as number) : 0;`,
        `    void [event, row, item, index];`,
        `    return [`,
      );
      chain.forEach((a, i) =>
        out.push(...actionLines(a, name, String(i), "      ")),
      );
      out.push(`    ];`, `  }`);
      chain.forEach((a, i) => out.push(...replyMethods(a, name, String(i))));
      walk(chain, (a) => {
        for (const f of [a.value, a.index, a.body])
          for (const n of Object.keys(HELPERS))
            if (f && new RegExp(`\\b${n}\\(`).test(f)) used.add(n);
      });
    }
    if (el.type === "form" && el.bind) {
      out.push(
        `  ${el.id}_field(msg: Message, state: State): Effect[] {`,
        `    const name = msg.payload as string;`,
        `    return [store.set(${jsString(el.bind)}, { ...(state.${el.bind} ?? {}), [name]: msg.event?.value ?? msg.event?.checked })];`,
        `  }`,
        `  ${msgName(el, "submit")}${el.events.submit?.length ? "_validate" : ""}(msg: Message, state: State): Effect[] {`,
        `    // TODO: validate state.${el.bind} (${el.fields.map((f) => f.name + (f.required === "yes" ? "*" : "")).join(", ")}) and write the errors`,
        `    void [msg, state];`,
        `    return [];`,
        `  }`,
      );
    }
  }
  out.push(`}`, ``, `export const page = new App();`);
  if (used.size)
    out.push(
      ``,
      `// TODO: the expressions use the builder helpers ${[...used].join(", ")}; compute those fields in the handlers.`,
    );
  return out.join("\n") + "\n";
}

export function generate(m: Model): GenFile[] {
  const files: GenFile[] = m.pages.map((p) => ({
    name: pageFile(p),
    text: pageTemplate(p),
  }));
  files.push({ name: "app.ts", text: handlersFile(m) });
  return files;
}

export function generatedText(m: Model): string {
  return generate(m)
    .map((f) => `// ==== ${f.name} ====\n${f.text}`)
    .join("\n");
}

export { isIdent };
