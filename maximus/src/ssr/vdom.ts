/**
 * A minimal virtual DOM for the server: just the part of the DOM API that the
 * `dom` module (html templates, bindings, control flow) touches, so the SAME
 * component code runs without jsdom. It is not a general DOM: no events, no
 * layout, no selectors beyond `tag`, `#id`, `.class` and `[attr]`.
 *
 * Properties that reflect to attributes in browsers (`value`, `checked`,
 * `disabled`, `className`, ...) are reflected here too, so `.value=${x}`
 * bindings end up in the serialised HTML.
 *
 * @module
 */
import { parseFragment } from "./parse.ts";

export const ELEMENT = 1;
export const TEXT = 3;
export const COMMENT = 8;
export const FRAGMENT = 11;
export const DOCUMENT = 9;

export class VNode {
  parentNode: VNode | null = null;
  nextSibling: VNode | null = null;
  previousSibling: VNode | null = null;
  firstChild: VNode | null = null;
  lastChild: VNode | null = null;
  readonly nodeType: number;
  readonly ownerDocument: VDocument;
  constructor(nodeType: number, ownerDocument: VDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
  }

  get childNodes(): VNode[] {
    const out: VNode[] = [];
    for (let n = this.firstChild; n !== null; n = n.nextSibling) out.push(n);
    return out;
  }
  get parentElement(): VNode | null {
    return this.parentNode !== null && this.parentNode.nodeType === ELEMENT
      ? this.parentNode
      : null;
  }
  get isConnected(): boolean {
    let n: VNode = this;
    while (n.parentNode !== null) n = n.parentNode;
    return n.nodeType === DOCUMENT || n === this.ownerDocument.documentElement;
  }
  hasChildNodes(): boolean {
    return this.firstChild !== null;
  }
  contains(other: VNode | null): boolean {
    for (let n = other; n !== null; n = n.parentNode)
      if (n === this) return true;
    return false;
  }

  private unlink(): void {
    const p = this.parentNode;
    if (p === null) return;
    if (this.previousSibling)
      this.previousSibling.nextSibling = this.nextSibling;
    else p.firstChild = this.nextSibling;
    if (this.nextSibling)
      this.nextSibling.previousSibling = this.previousSibling;
    else p.lastChild = this.previousSibling;
    this.parentNode = this.nextSibling = this.previousSibling = null;
  }

  insertBefore<T extends VNode>(node: T, ref: VNode | null): T {
    if (ref !== null && ref.parentNode !== this)
      throw new Error(
        "NotFoundError: the reference node is not a child of this node",
      );
    if (node.nodeType === FRAGMENT) {
      let c = node.firstChild;
      while (c !== null) {
        const next: VNode | null = c.nextSibling;
        this.insertBefore(c, ref);
        c = next;
      }
      return node;
    }
    if (node === ref) return node;
    if (node.contains(this)) throw new Error("HierarchyRequestError: cycle");
    node.unlink();
    node.parentNode = this;
    const prev = ref === null ? this.lastChild : ref.previousSibling;
    node.previousSibling = prev;
    node.nextSibling = ref;
    if (prev) prev.nextSibling = node;
    else this.firstChild = node;
    if (ref) ref.previousSibling = node;
    else this.lastChild = node;
    return node;
  }
  appendChild<T extends VNode>(node: T): T {
    return this.insertBefore(node, null);
  }
  removeChild<T extends VNode>(node: T): T {
    if (node.parentNode !== this)
      throw new Error("NotFoundError: the node is not a child of this node");
    node.unlink();
    return node;
  }
  replaceChild(node: VNode, old: VNode): VNode {
    this.insertBefore(node, old);
    this.removeChild(old);
    return old;
  }
  append(...nodes: Array<VNode | string>): void {
    for (const n of nodes)
      this.appendChild(
        typeof n === "string" ? this.ownerDocument.createTextNode(n) : n,
      );
  }
  remove(): void {
    this.unlink();
  }
  get textContent(): string | null {
    return null;
  }
  set textContent(v: string | null) {
    while (this.firstChild !== null) this.removeChild(this.firstChild);
    if (v !== null && v !== "")
      this.appendChild(this.ownerDocument.createTextNode(v));
  }
  cloneNode(deep = false): VNode {
    const c = this.shallow();
    if (deep)
      for (let n = this.firstChild; n !== null; n = n.nextSibling)
        c.appendChild(n.cloneNode(true));
    return c;
  }
  protected shallow(): VNode {
    return new VNode(this.nodeType, this.ownerDocument);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

function collectText(n: VNode): string {
  let s = "";
  for (let c = n.firstChild; c !== null; c = c.nextSibling)
    s +=
      c.nodeType === TEXT
        ? (c as VText).data
        : c.nodeType === ELEMENT
          ? collectText(c)
          : "";
  return s;
}

export class VText extends VNode {
  data: string;
  constructor(doc: VDocument, data: string) {
    super(TEXT, doc);
    this.data = data;
  }
  get nodeValue(): string {
    return this.data;
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string | null) {
    this.data = v ?? "";
  }
  protected shallow(): VNode {
    return new VText(this.ownerDocument, this.data);
  }
}

export class VComment extends VNode {
  data: string;
  constructor(doc: VDocument, data: string) {
    super(COMMENT, doc);
    this.data = data;
  }
  get nodeValue(): string {
    return this.data;
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string | null) {
    this.data = v ?? "";
  }
  protected shallow(): VNode {
    return new VComment(this.ownerDocument, this.data);
  }
}

export class VFragment extends VNode {
  constructor(doc: VDocument) {
    super(FRAGMENT, doc);
  }
  get textContent(): string {
    return collectText(this);
  }
  set textContent(v: string | null) {
    super.textContent = v;
  }
  get children(): VElement[] {
    return this.childNodes.filter((n): n is VElement => n.nodeType === ELEMENT);
  }
  protected shallow(): VNode {
    return new VFragment(this.ownerDocument);
  }
  querySelector(sel: string): VElement | null {
    return queryAll(this, sel, true)[0] ?? null;
  }
  querySelectorAll(sel: string): VElement[] {
    return queryAll(this, sel, false);
  }
}

class VClassList {
  private el: VElement;
  constructor(el: VElement) {
    this.el = el;
  }
  private tokens(): string[] {
    return (this.el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }
  add(...names: string[]): void {
    const t = this.tokens();
    for (const n of names) if (!t.includes(n)) t.push(n);
    this.el.setAttribute("class", t.join(" "));
  }
  remove(...names: string[]): void {
    const t = this.tokens().filter((x) => !names.includes(x));
    if (t.length === 0) this.el.removeAttribute("class");
    else this.el.setAttribute("class", t.join(" "));
  }
  contains(name: string): boolean {
    return this.tokens().includes(name);
  }
}

class VStyle {
  private el: VElement;
  constructor(el: VElement) {
    this.el = el;
  }
  private decls(): Map<string, string> {
    const m = new Map<string, string>();
    for (const d of (this.el.getAttribute("style") ?? "").split(";")) {
      const i = d.indexOf(":");
      if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return m;
  }
  private write(m: Map<string, string>): void {
    if (m.size === 0) this.el.removeAttribute("style");
    else
      this.el.setAttribute(
        "style",
        [...m].map(([k, v]) => `${k}: ${v}`).join("; ") + ";",
      );
  }
  setProperty(name: string, value: string): void {
    const m = this.decls();
    m.set(name, value);
    this.write(m);
  }
  removeProperty(name: string): string {
    const m = this.decls();
    const old = m.get(name) ?? "";
    m.delete(name);
    this.write(m);
    return old;
  }
  getPropertyValue(name: string): string {
    return this.decls().get(name) ?? "";
  }
}

export class VElement extends VNode {
  readonly attrs = new Map<string, string>();
  /** Set by the server renderer on the root element of a template instance. */
  mx: { seq: number; hash: string } | null = null;
  /** `select.value` assigned by a binding; resolved against the options at serialisation. */
  selectValue: string | undefined;
  private cl: VClassList | null = null;
  private st: VStyle | null = null;
  readonly localName: string;
  readonly svg: boolean;
  constructor(doc: VDocument, localName: string, svg = false) {
    super(ELEMENT, doc);
    this.localName = localName;
    this.svg = svg;
  }
  get tagName(): string {
    return this.svg ? this.localName : this.localName.toUpperCase();
  }
  get nodeName(): string {
    return this.tagName;
  }
  get classList(): VClassList {
    return (this.cl ??= new VClassList(this));
  }
  get style(): VStyle {
    return (this.st ??= new VStyle(this));
  }
  get attributes(): Array<{ name: string; value: string }> {
    return [...this.attrs].map(([name, value]) => ({ name, value }));
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(this.svg ? name : name.toLowerCase()) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(this.svg ? name : name.toLowerCase(), String(value));
  }
  removeAttribute(name: string): void {
    this.attrs.delete(this.svg ? name : name.toLowerCase());
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(this.svg ? name : name.toLowerCase());
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.hasAttribute(name);
    if (on) {
      if (!this.hasAttribute(name)) this.setAttribute(name, "");
    } else this.removeAttribute(name);
    return on;
  }
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  get textContent(): string {
    return collectText(this);
  }
  set textContent(v: string | null) {
    super.textContent = v;
  }
  get children(): VElement[] {
    return this.childNodes.filter((n): n is VElement => n.nodeType === ELEMENT);
  }
  get innerHTML(): string {
    return serializeChildren(this);
  }
  set innerHTML(markup: string) {
    while (this.firstChild !== null) this.removeChild(this.firstChild);
    const target =
      this.localName === "template"
        ? (this as unknown as VTemplate).content
        : this;
    parseFragment(markup, this.ownerDocument, target, this.svg);
  }
  focus(): void {}
  blur(): void {}
  click(): void {}
  querySelector(sel: string): VElement | null {
    return queryAll(this, sel, true)[0] ?? null;
  }
  querySelectorAll(sel: string): VElement[] {
    return queryAll(this, sel, false);
  }
  protected shallow(): VNode {
    const c = new VElement(this.ownerDocument, this.localName, this.svg);
    for (const [k, v] of this.attrs) c.attrs.set(k, v);
    c.selectValue = this.selectValue;
    return c;
  }
}

export class VTemplate extends VElement {
  readonly content: VFragment;
  constructor(doc: VDocument) {
    super(doc, "template");
    this.content = new VFragment(doc);
  }
  protected shallow(): VNode {
    const c = new VTemplate(this.ownerDocument);
    for (const [k, v] of this.attrs) c.attrs.set(k, v);
    return c;
  }
  cloneNode(deep = false): VNode {
    const c = super.cloneNode(deep) as VTemplate;
    if (deep)
      for (let n = this.content.firstChild; n !== null; n = n.nextSibling)
        c.content.appendChild(n.cloneNode(true));
    return c;
  }
}

// string properties reflected to attributes
const STR_PROPS: Record<string, string> = {
  id: "id",
  className: "class",
  title: "title",
  name: "name",
  type: "type",
  href: "href",
  src: "src",
  placeholder: "placeholder",
  alt: "alt",
  htmlFor: "for",
  lang: "lang",
  dir: "dir",
  role: "role",
  rel: "rel",
  target: "target",
  action: "action",
  method: "method",
  accept: "accept",
  autocomplete: "autocomplete",
  min: "min",
  max: "max",
  step: "step",
  pattern: "pattern",
  tabIndex: "tabindex",
  maxLength: "maxlength",
  minLength: "minlength",
};
const BOOL_PROPS: Record<string, string> = {
  checked: "checked",
  disabled: "disabled",
  selected: "selected",
  hidden: "hidden",
  readOnly: "readonly",
  required: "required",
  multiple: "multiple",
  autofocus: "autofocus",
  open: "open",
};
for (const [prop, attr] of Object.entries(STR_PROPS)) {
  if (prop === "id") continue; // read-only getter above is replaced below
  Object.defineProperty(VElement.prototype, prop, {
    configurable: true,
    get(this: VElement) {
      return this.getAttribute(attr) ?? "";
    },
    set(this: VElement, v: unknown) {
      if (v == null) this.removeAttribute(attr);
      else this.setAttribute(attr, String(v));
    },
  });
}
Object.defineProperty(VElement.prototype, "id", {
  configurable: true,
  get(this: VElement) {
    return this.getAttribute("id") ?? "";
  },
  set(this: VElement, v: unknown) {
    this.setAttribute("id", String(v));
  },
});
for (const [prop, attr] of Object.entries(BOOL_PROPS)) {
  Object.defineProperty(VElement.prototype, prop, {
    configurable: true,
    get(this: VElement) {
      return this.hasAttribute(attr);
    },
    set(this: VElement, v: unknown) {
      this.toggleAttribute(attr, !!v);
    },
  });
}
Object.defineProperty(VElement.prototype, "value", {
  configurable: true,
  get(this: VElement) {
    if (this.localName === "textarea") return collectText(this);
    if (this.localName === "select") return this.selectValue ?? "";
    return this.getAttribute("value") ?? "";
  },
  set(this: VElement, v: unknown) {
    const s = v == null ? "" : String(v);
    if (this.localName === "textarea") this.textContent = s;
    else if (this.localName === "select") this.selectValue = s;
    else this.setAttribute("value", s);
  },
});

export class VDocument extends VNode {
  readonly documentElement: VElement;
  readonly head: VElement;
  readonly body: VElement;
  constructor() {
    super(DOCUMENT, undefined as unknown as VDocument);
    (this as { ownerDocument: VDocument }).ownerDocument = this;
    this.documentElement = new VElement(this, "html");
    this.head = new VElement(this, "head");
    this.body = new VElement(this, "body");
    this.documentElement.append(this.head, this.body);
    this.appendChild(this.documentElement);
  }
  createElement(name: string): VElement {
    const lower = name.toLowerCase();
    return lower === "template"
      ? new VTemplate(this)
      : new VElement(this, lower);
  }
  createElementNS(ns: string | null, name: string): VElement {
    return ns === "http://www.w3.org/2000/svg"
      ? new VElement(this, name, true)
      : this.createElement(name);
  }
  createTextNode(data: string): VText {
    return new VText(this, String(data));
  }
  createComment(data: string): VComment {
    return new VComment(this, String(data));
  }
  createDocumentFragment(): VFragment {
    return new VFragment(this);
  }
  createTreeWalker(
    root: VNode,
    whatToShow = 0xffffffff,
  ): { nextNode(): VNode | null } {
    let cur: VNode = root;
    return {
      nextNode(): VNode | null {
        for (;;) {
          let next: VNode | null = cur.firstChild;
          if (next === null) {
            let n: VNode | null = cur;
            while (n !== null && n !== root && n.nextSibling === null)
              n = n.parentNode;
            next = n === null || n === root ? null : n.nextSibling;
          }
          if (next === null) return null;
          cur = next;
          if (whatToShow & (1 << (cur.nodeType - 1))) return cur;
        }
      },
    };
  }
  querySelector(sel: string): VElement | null {
    return queryAll(this, sel, true)[0] ?? null;
  }
  querySelectorAll(sel: string): VElement[] {
    return queryAll(this, sel, false);
  }
  getElementById(id: string): VElement | null {
    return this.querySelector("#" + id);
  }
  get defaultView(): null {
    return null;
  }
  get textContent(): null {
    return null;
  }
  protected shallow(): VNode {
    return new VDocument();
  }
}

// ----------------------------------------------------------------- selectors

type Test = (e: VElement) => boolean;

function compileSelector(sel: string): Test {
  const tests: Test[] = [];
  const re = /([#.]?)([\w-]+)|\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(sel.trim())) !== null) {
    consumed += m[0].length;
    if (m[3] !== undefined) {
      const name = m[3];
      const val = m[4];
      tests.push((e) =>
        val === undefined ? e.hasAttribute(name) : e.getAttribute(name) === val,
      );
    } else if (m[1] === "#") {
      const id = m[2]!;
      tests.push((e) => e.id === id);
    } else if (m[1] === ".") {
      const c = m[2]!;
      tests.push((e) => e.classList.contains(c));
    } else {
      const t = m[2]!.toLowerCase();
      tests.push((e) => e.localName === t);
    }
  }
  if (consumed !== sel.trim().length || tests.length === 0)
    throw new Error(
      `Maximus ssr: unsupported selector "${sel}" (only tag, #id, .class and [attr] are supported on the server)`,
    );
  return (e) => tests.every((t) => t(e));
}

function queryAll(root: VNode, sel: string, first: boolean): VElement[] {
  const test = compileSelector(sel);
  const out: VElement[] = [];
  const visit = (n: VNode): boolean => {
    for (let c = n.firstChild; c !== null; c = c.nextSibling) {
      if (c.nodeType === ELEMENT) {
        if (test(c as VElement)) {
          out.push(c as VElement);
          if (first) return true;
        }
        if (visit(c)) return true;
      }
    }
    return false;
  };
  visit(root);
  return out;
}

// set by serialize.ts to avoid a cycle at module load
import { serializeChildren } from "./serialize.ts";
