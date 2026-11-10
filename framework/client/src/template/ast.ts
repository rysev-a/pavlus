/** 1-based source position. */
export interface Pos {
  line: number;
  col: number;
}

/**
 * Expression AST. A template only reads ready data (see
 * framework/docs/philosophy.md): an expression is a literal or a path into
 * the state — `user.name`, `items[0]`. Nothing else; logic lives in code.
 */
export type Expr =
  | { k: "lit"; value: string | number | boolean | null | undefined }
  | { k: "id"; name: string }
  | { k: "member"; obj: Expr; prop: string }
  | { k: "index"; obj: Expr; index: Expr };

/** Text with `{expr}` interpolations: literal strings and expressions. */
export type Part = string | Expr;

export interface Attr {
  name: string;
  /** `null` for a bare boolean attribute (`disabled`). */
  value: Part[] | null;
}

export interface EventBinding {
  /** DOM event name (`click`). */
  name: string;
  /** Message id sent to the application. */
  msg: string;
  /** Arguments; one becomes the payload, several become an array. */
  args: Expr[];
  prevent: boolean;
  stop: boolean;
}

export interface ClassToggle {
  name: string;
  test: Expr;
}

export interface ElementNode {
  type: "element";
  nid: number;
  tag: string;
  classes: string[];
  toggles: ClassToggle[];
  attrs: Attr[];
  events: EventBinding[];
  children: Node[];
  pos: Pos;
}

export interface TextNode {
  type: "text";
  nid: number;
  line: number;
  parts: Part[];
}

export interface IfBranch {
  /** `null` for the `else` branch. */
  test: Expr | null;
  children: Node[];
}

export interface IfNode {
  type: "if";
  nid: number;
  line: number;
  branches: IfBranch[];
}

export interface ForNode {
  type: "for";
  nid: number;
  line: number;
  item: string;
  index: string | null;
  of: Expr;
  key: Expr | null;
  children: Node[];
}

/** A prop passed to an embedded child: `name=expr` or `...expr`. */
export type Prop = { name: string; value: Part[] | null } | { spread: Expr };

/**
 * An embedded child view: `+Name#instance(props)` (static, `Name` imported)
 * or `+{expr}#instance(props)` (dynamic, the view is a value).
 */
export interface EmbedNode {
  type: "embed";
  nid: number;
  /** Imported local name for a static embed. */
  component: string | null;
  /** View (or component) expression for a dynamic embed. */
  dynamic: Expr | null;
  /** Instance name: message prefix and state key of the child. */
  name: string;
  /**
   * The instance key (`key=<expr>`): one scoped child per key — its events
   * carry the key in the id (`row.<key>.star`), and a children entry with
   * `each` slices the child's state to `state[each][key]`. `null` when the
   * embed is a plain single instance.
   */
  key: Expr | null;
  props: Prop[];
  pos: Pos;
}

/** `+outlet`: the routed child selected by the component's `routing`. */
export interface OutletNode {
  type: "outlet";
  nid: number;
  line: number;
}

export type Node =
  | ElementNode
  | TextNode
  | IfNode
  | ForNode
  | EmbedNode
  | OutletNode;

export interface ImportDecl {
  local: string;
  from: string;
}

export interface TemplateAst {
  imports: ImportDecl[];
  nodes: Node[];
}
