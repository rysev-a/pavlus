import type { Plugin, PluginContext } from "../../core/types.ts";

/** A fill/stroke style: a CSS colour string or a gradient defined earlier in the same op list. */
export type CanvasPaint = string | { gradient: string };

export type GradientStop = { offset: number; color: string };

/**
 * One drawing instruction, as plain data. The plugin interprets these with a
 * fixed `switch`; nothing is ever looked up by name on the context or eval'd.
 */
export type CanvasOp =
  // rectangles
  | { op: "fillRect"; x: number; y: number; w: number; h: number }
  | { op: "strokeRect"; x: number; y: number; w: number; h: number }
  | { op: "clearRect"; x: number; y: number; w: number; h: number }
  // paths
  | { op: "beginPath" }
  | { op: "closePath" }
  | { op: "moveTo"; x: number; y: number }
  | { op: "lineTo"; x: number; y: number }
  | {
      op: "arc";
      x: number;
      y: number;
      r: number;
      start: number;
      end: number;
      ccw?: boolean;
    }
  | {
      op: "ellipse";
      x: number;
      y: number;
      rx: number;
      ry: number;
      rotation?: number;
      start: number;
      end: number;
      ccw?: boolean;
    }
  | { op: "rect"; x: number; y: number; w: number; h: number }
  | {
      op: "bezierCurveTo";
      cp1x: number;
      cp1y: number;
      cp2x: number;
      cp2y: number;
      x: number;
      y: number;
    }
  | { op: "quadraticCurveTo"; cpx: number; cpy: number; x: number; y: number }
  | { op: "fill"; rule?: "nonzero" | "evenodd" }
  | { op: "stroke" }
  | { op: "clip"; rule?: "nonzero" | "evenodd" }
  // text
  | { op: "fillText"; text: string; x: number; y: number; maxWidth?: number }
  | { op: "strokeText"; text: string; x: number; y: number; maxWidth?: number }
  // images (loaded earlier with the `loadImage` effect)
  | {
      op: "drawImage";
      image: string;
      x: number;
      y: number;
      w?: number;
      h?: number;
      /** Source rectangle; when given, `w` and `h` are required. */
      sx?: number;
      sy?: number;
      sw?: number;
      sh?: number;
    }
  // state and transforms
  | { op: "save" }
  | { op: "restore" }
  | { op: "translate"; x: number; y: number }
  | { op: "rotate"; angle: number }
  | { op: "scale"; x: number; y: number }
  | {
      op: "setTransform";
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
    }
  // style setters
  | { op: "fillStyle"; value: CanvasPaint }
  | { op: "strokeStyle"; value: CanvasPaint }
  | { op: "lineWidth"; value: number }
  | { op: "font"; value: string }
  | { op: "globalAlpha"; value: number }
  | { op: "lineCap"; value: "butt" | "round" | "square" }
  | { op: "lineJoin"; value: "bevel" | "round" | "miter" }
  | { op: "textAlign"; value: "start" | "end" | "left" | "right" | "center" }
  | {
      op: "textBaseline";
      value:
        "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
    }
  | { op: "shadowColor"; value: string }
  | { op: "shadowBlur"; value: number }
  | { op: "shadowOffsetX"; value: number }
  | { op: "shadowOffsetY"; value: number }
  | { op: "setLineDash"; segments: number[] }
  // gradients, referenced by `name` from fillStyle / strokeStyle
  | {
      op: "linearGradient";
      name: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      stops: GradientStop[];
    }
  | {
      op: "radialGradient";
      name: string;
      x0: number;
      y0: number;
      r0: number;
      x1: number;
      y1: number;
      r1: number;
      stops: GradientStop[];
    };

export type CanvasTarget = string | HTMLCanvasElement;

export type CanvasEffect =
  | {
      plugin: "canvas";
      type: "draw";
      target: CanvasTarget;
      ops: CanvasOp[];
      /** Clear the whole canvas before drawing. */
      clear?: boolean;
      onError?: string;
    }
  | {
      plugin: "canvas";
      type: "loadImage";
      id: string;
      src: string;
      /** Payload: `{ id, width, height }`. */
      onSuccess?: string;
      onError?: string;
    }
  | {
      plugin: "canvas";
      type: "size";
      target: CanvasTarget;
      width: number;
      height: number;
      dpr?: number;
      onError?: string;
    }
  | {
      plugin: "canvas";
      type: "frames";
      id: string;
      target?: CanvasTarget;
      /** Payload: `{ time, dt, frame, width?, height? }` (ms; size is the canvas's logical size). */
      onFrame: string;
      onError?: string;
    }
  | { plugin: "canvas"; type: "stopFrames"; id: string }
  | {
      plugin: "canvas";
      type: "pointer";
      id: string;
      target: CanvasTarget;
      /** Payload: `{ type, x, y, nx, ny, button, buttons, down }`. */
      onChange: string;
      onError?: string;
    }
  | { plugin: "canvas"; type: "stopPointer"; id: string }
  | {
      plugin: "canvas";
      type: "snapshot";
      target: CanvasTarget;
      /** MIME type, default `image/png`. */
      mime?: string;
      quality?: number;
      /** Payload: the data URL. */
      onSuccess: string;
      onError?: string;
    };

export interface CanvasErrorPayload {
  code: "unsupported" | "notFound" | "invalid" | "load" | "failed";
  message: string;
  /** Index of the offending op, for `invalid` draw errors. */
  index?: number;
}

/** The subset of an `Image` the plugin needs. */
export interface ImageLike {
  src: string;
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  onload: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface CanvasPluginOptions {
  document?: Pick<Document, "querySelector">;
  requestAnimationFrame?: (cb: (time: number) => void) => unknown;
  cancelAnimationFrame?: (handle: any) => void;
  /** Constructor for images (default: global `Image`). */
  Image?: new () => ImageLike;
  /** Device pixel ratio used when `size` has no `dpr` (default: `window.devicePixelRatio ?? 1`). */
  devicePixelRatio?: number | (() => number);
}

export interface CanvasPlugin extends Plugin<CanvasEffect, any> {
  /** Ids of loaded images. */
  images(): string[];
  /** Ids of running frame loops. */
  frameLoops(): string[];
  /** Ids of active pointer streams. */
  pointers(): string[];
}

// ---------------------------------------------------------------- validation

type Kind = "n" | "s" | "b" | "paint" | "dash" | "stops" | "rule";
// `?` suffix = optional
const NUM4 = { x: "n", y: "n", w: "n", h: "n" } as const;
const SPEC: Record<string, Record<string, string>> = {
  fillRect: NUM4,
  strokeRect: NUM4,
  clearRect: NUM4,
  rect: NUM4,
  beginPath: {},
  closePath: {},
  moveTo: { x: "n", y: "n" },
  lineTo: { x: "n", y: "n" },
  arc: { x: "n", y: "n", r: "n", start: "n", end: "n", ccw: "b?" },
  ellipse: {
    x: "n",
    y: "n",
    rx: "n",
    ry: "n",
    rotation: "n?",
    start: "n",
    end: "n",
    ccw: "b?",
  },
  bezierCurveTo: {
    cp1x: "n",
    cp1y: "n",
    cp2x: "n",
    cp2y: "n",
    x: "n",
    y: "n",
  },
  quadraticCurveTo: { cpx: "n", cpy: "n", x: "n", y: "n" },
  fill: { rule: "rule?" },
  stroke: {},
  clip: { rule: "rule?" },
  fillText: { text: "s", x: "n", y: "n", maxWidth: "n?" },
  strokeText: { text: "s", x: "n", y: "n", maxWidth: "n?" },
  drawImage: {
    image: "s",
    x: "n",
    y: "n",
    w: "n?",
    h: "n?",
    sx: "n?",
    sy: "n?",
    sw: "n?",
    sh: "n?",
  },
  save: {},
  restore: {},
  translate: { x: "n", y: "n" },
  rotate: { angle: "n" },
  scale: { x: "n", y: "n" },
  setTransform: { a: "n", b: "n", c: "n", d: "n", e: "n", f: "n" },
  fillStyle: { value: "paint" },
  strokeStyle: { value: "paint" },
  lineWidth: { value: "n" },
  font: { value: "s" },
  globalAlpha: { value: "n" },
  lineCap: { value: "s" },
  lineJoin: { value: "s" },
  textAlign: { value: "s" },
  textBaseline: { value: "s" },
  shadowColor: { value: "s" },
  shadowBlur: { value: "n" },
  shadowOffsetX: { value: "n" },
  shadowOffsetY: { value: "n" },
  setLineDash: { segments: "dash" },
  linearGradient: {
    name: "s",
    x0: "n",
    y0: "n",
    x1: "n",
    y1: "n",
    stops: "stops",
  },
  radialGradient: {
    name: "s",
    x0: "n",
    y0: "n",
    r0: "n",
    x1: "n",
    y1: "n",
    r1: "n",
    stops: "stops",
  },
};

const ENUMS: Record<string, readonly string[]> = {
  lineCap: ["butt", "round", "square"],
  lineJoin: ["bevel", "round", "miter"],
  textAlign: ["start", "end", "left", "right", "center"],
  textBaseline: [
    "top",
    "hanging",
    "middle",
    "alphabetic",
    "ideographic",
    "bottom",
  ],
};

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkField(kind: string, v: unknown): string | null {
  const k = kind.replace("?", "") as Kind;
  switch (k) {
    case "n":
      return isNum(v) ? null : "must be a finite number";
    case "s":
      return typeof v === "string" ? null : "must be a string";
    case "b":
      return typeof v === "boolean" ? null : "must be a boolean";
    case "rule":
      return v === "nonzero" || v === "evenodd"
        ? null
        : 'must be "nonzero" or "evenodd"';
    case "paint":
      return typeof v === "string" ||
        (isObj(v) && typeof v.gradient === "string")
        ? null
        : "must be a colour string or { gradient: name }";
    case "dash":
      return Array.isArray(v) && v.every((n) => isNum(n) && n >= 0)
        ? null
        : "must be an array of non-negative numbers";
    case "stops":
      return Array.isArray(v) &&
        v.every(
          (s) =>
            isObj(s) &&
            isNum(s.offset) &&
            s.offset >= 0 &&
            s.offset <= 1 &&
            typeof s.color === "string",
        )
        ? null
        : "must be an array of { offset: 0..1, color: string }";
  }
}

/**
 * Checks a whole op list without touching any canvas. Returns the first
 * problem found, or null when every op is well formed.
 */
export function validateOps(
  ops: unknown,
  hasImage: (id: string) => boolean = () => true,
): { index: number; message: string } | null {
  if (!Array.isArray(ops))
    return { index: -1, message: "ops must be an array" };
  const gradients = new Set<string>();
  let depth = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    const bad = (message: string) => ({ index: i, message });
    if (!isObj(o) || typeof o.op !== "string")
      return bad("op must be an object with a string `op`");
    if (!Object.hasOwn(SPEC, o.op)) return bad(`unknown op "${o.op}"`);
    for (const [field, kind] of Object.entries(SPEC[o.op]!)) {
      const v = o[field];
      if (v === undefined) {
        if (kind.endsWith("?")) continue;
        return bad(`${o.op}.${field} is required`);
      }
      const err = checkField(kind, v);
      if (err) return bad(`${o.op}.${field} ${err}`);
    }
    const en = ENUMS[o.op];
    if (en && !en.includes(o.value as string))
      return bad(`${o.op}.value must be one of ${en.join(", ")}`);
    switch (o.op) {
      case "save":
        depth++;
        break;
      case "restore":
        if (depth === 0) return bad("restore without a matching save");
        depth--;
        break;
      case "linearGradient":
      case "radialGradient":
        gradients.add(o.name as string);
        break;
      case "fillStyle":
      case "strokeStyle":
        if (isObj(o.value) && !gradients.has(o.value.gradient as string))
          return bad(`gradient "${String(o.value.gradient)}" is not defined`);
        break;
      case "drawImage":
        if (!hasImage(o.image as string))
          return bad(`image "${String(o.image)}" is not loaded`);
        if (
          (o.w === undefined) !== (o.h === undefined) ||
          (o.sx !== undefined &&
            (o.sy === undefined ||
              o.sw === undefined ||
              o.sh === undefined ||
              o.w === undefined))
        )
          return bad(
            "drawImage needs both w and h (and all of sx, sy, sw, sh for a source rect)",
          );
        break;
    }
  }
  return null;
}

// -------------------------------------------------------------------- plugin

export function createCanvasPlugin(
  opts: CanvasPluginOptions = {},
): CanvasPlugin {
  const doc = opts.document ?? (globalThis as any).document;
  const raf: ((cb: (t: number) => void) => unknown) | undefined =
    opts.requestAnimationFrame ??
    (typeof globalThis.requestAnimationFrame === "function"
      ? (cb) => globalThis.requestAnimationFrame(cb)
      : undefined);
  const caf: ((h: any) => void) | undefined =
    opts.cancelAnimationFrame ??
    (typeof globalThis.cancelAnimationFrame === "function"
      ? (h) => globalThis.cancelAnimationFrame(h)
      : undefined);
  const ImageCtor: (new () => ImageLike) | undefined =
    opts.Image ?? (globalThis as any).Image;
  const defaultDpr = (): number => {
    const d = opts.devicePixelRatio;
    const v =
      typeof d === "function"
        ? d()
        : (d ?? (globalThis as any).devicePixelRatio);
    return isNum(v) && v > 0 ? v : 1;
  };

  const images = new Map<string, ImageLike>();
  const loading = new Map<string, ImageLike>();
  const frameLoops = new Map<string, () => void>();
  const pointers = new Map<string, () => void>();
  /** Device pixel ratio set by `size`, per canvas. */
  const dprs = new WeakMap<object, number>();

  const fail = (
    ctx: PluginContext<any>,
    onError: string | undefined,
    error: CanvasErrorPayload,
  ): void => {
    if (onError) ctx.dispatch({ id: onError, payload: error });
    else if (error.code !== "unsupported")
      throw new Error(`pavlus/canvas: ${error.message}`);
  };

  /** Resolves a target to a canvas; reports and returns undefined on failure. */
  const resolve = (
    ctx: PluginContext<any>,
    target: CanvasTarget | undefined,
    onError: string | undefined,
  ): HTMLCanvasElement | undefined => {
    let el: unknown = target;
    if (typeof target === "string") {
      if (!doc || typeof doc.querySelector !== "function") {
        fail(ctx, onError, {
          code: "unsupported",
          message: "no document available",
        });
        return;
      }
      el = doc.querySelector(target);
    }
    if (!el || typeof (el as any).getContext !== "function") {
      fail(ctx, onError, {
        code: "notFound",
        message: `canvas target "${String(target)}" not found`,
      });
      return;
    }
    return el as HTMLCanvasElement;
  };

  const dprOf = (c: HTMLCanvasElement): number => dprs.get(c) ?? 1;
  const logicalSize = (c: HTMLCanvasElement) => ({
    width: c.width / dprOf(c),
    height: c.height / dprOf(c),
  });

  function paint(
    ctx2d: CanvasRenderingContext2D,
    p: CanvasPaint,
    gradients: Map<string, CanvasGradient>,
  ): string | CanvasGradient {
    return typeof p === "string" ? p : gradients.get(p.gradient)!;
  }

  /** Runs validated ops. Throws if the browser rejects a value. */
  function run(
    c: HTMLCanvasElement,
    g: CanvasRenderingContext2D,
    ops: CanvasOp[],
    clear: boolean,
  ): void {
    const dpr = dprOf(c);
    const gradients = new Map<string, CanvasGradient>();
    let depth = 0;
    g.save();
    try {
      if (clear) {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        g.restore();
      }
      for (const o of ops) {
        switch (o.op) {
          case "fillRect":
            g.fillRect(o.x, o.y, o.w, o.h);
            break;
          case "strokeRect":
            g.strokeRect(o.x, o.y, o.w, o.h);
            break;
          case "clearRect":
            g.clearRect(o.x, o.y, o.w, o.h);
            break;
          case "rect":
            g.rect(o.x, o.y, o.w, o.h);
            break;
          case "beginPath":
            g.beginPath();
            break;
          case "closePath":
            g.closePath();
            break;
          case "moveTo":
            g.moveTo(o.x, o.y);
            break;
          case "lineTo":
            g.lineTo(o.x, o.y);
            break;
          case "arc":
            g.arc(o.x, o.y, o.r, o.start, o.end, o.ccw ?? false);
            break;
          case "ellipse":
            g.ellipse(
              o.x,
              o.y,
              o.rx,
              o.ry,
              o.rotation ?? 0,
              o.start,
              o.end,
              o.ccw ?? false,
            );
            break;
          case "bezierCurveTo":
            g.bezierCurveTo(o.cp1x, o.cp1y, o.cp2x, o.cp2y, o.x, o.y);
            break;
          case "quadraticCurveTo":
            g.quadraticCurveTo(o.cpx, o.cpy, o.x, o.y);
            break;
          case "fill":
            o.rule ? g.fill(o.rule) : g.fill();
            break;
          case "stroke":
            g.stroke();
            break;
          case "clip":
            o.rule ? g.clip(o.rule) : g.clip();
            break;
          case "fillText":
            o.maxWidth === undefined
              ? g.fillText(o.text, o.x, o.y)
              : g.fillText(o.text, o.x, o.y, o.maxWidth);
            break;
          case "strokeText":
            o.maxWidth === undefined
              ? g.strokeText(o.text, o.x, o.y)
              : g.strokeText(o.text, o.x, o.y, o.maxWidth);
            break;
          case "drawImage": {
            const img = images.get(o.image) as unknown as CanvasImageSource;
            if (o.sx !== undefined)
              g.drawImage(img, o.sx, o.sy!, o.sw!, o.sh!, o.x, o.y, o.w!, o.h!);
            else if (o.w !== undefined) g.drawImage(img, o.x, o.y, o.w, o.h!);
            else g.drawImage(img, o.x, o.y);
            break;
          }
          case "save":
            g.save();
            depth++;
            break;
          case "restore":
            g.restore();
            depth--;
            break;
          case "translate":
            g.translate(o.x, o.y);
            break;
          case "rotate":
            g.rotate(o.angle);
            break;
          case "scale":
            g.scale(o.x, o.y);
            break;
          case "setTransform":
            // relative to the hi-dpi base transform, so ops stay in logical pixels
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.transform(o.a, o.b, o.c, o.d, o.e, o.f);
            break;
          case "fillStyle":
            g.fillStyle = paint(g, o.value, gradients);
            break;
          case "strokeStyle":
            g.strokeStyle = paint(g, o.value, gradients);
            break;
          case "lineWidth":
            g.lineWidth = o.value;
            break;
          case "font":
            g.font = o.value;
            break;
          case "globalAlpha":
            g.globalAlpha = o.value;
            break;
          case "lineCap":
            g.lineCap = o.value;
            break;
          case "lineJoin":
            g.lineJoin = o.value;
            break;
          case "textAlign":
            g.textAlign = o.value;
            break;
          case "textBaseline":
            g.textBaseline = o.value;
            break;
          case "shadowColor":
            g.shadowColor = o.value;
            break;
          case "shadowBlur":
            g.shadowBlur = o.value;
            break;
          case "shadowOffsetX":
            g.shadowOffsetX = o.value;
            break;
          case "shadowOffsetY":
            g.shadowOffsetY = o.value;
            break;
          case "setLineDash":
            g.setLineDash(o.segments);
            break;
          case "linearGradient":
          case "radialGradient": {
            const grad =
              o.op === "linearGradient"
                ? g.createLinearGradient(o.x0, o.y0, o.x1, o.y1)
                : g.createRadialGradient(o.x0, o.y0, o.r0, o.x1, o.y1, o.r1);
            for (const s of o.stops) grad.addColorStop(s.offset, s.color);
            gradients.set(o.name, grad);
            break;
          }
        }
      }
    } finally {
      while (depth-- > 0) g.restore();
      g.restore();
    }
  }

  const stopFrame = (id: string): void => {
    frameLoops.get(id)?.();
    frameLoops.delete(id);
  };
  const stopPointer = (id: string): void => {
    pointers.get(id)?.();
    pointers.delete(id);
  };
  const dropImage = (id: string): void => {
    const l = loading.get(id);
    if (l) l.onload = l.onerror = null;
    loading.delete(id);
  };

  return {
    name: "canvas",
    handle(effect, ctx) {
      switch (effect.type) {
        case "draw": {
          const c = resolve(ctx, effect.target, effect.onError);
          if (!c) return;
          const bad = validateOps(effect.ops, (id) => images.has(id));
          if (bad)
            return fail(ctx, effect.onError, {
              code: "invalid",
              message: bad.message,
              index: bad.index,
            });
          const g = c.getContext("2d");
          if (!g)
            return fail(ctx, effect.onError, {
              code: "unsupported",
              message: "2d context not available",
            });
          try {
            run(c, g, effect.ops, effect.clear ?? false);
          } catch (e) {
            fail(ctx, effect.onError, {
              code: "failed",
              message: e instanceof Error ? e.message : String(e),
            });
          }
          return;
        }
        case "loadImage": {
          if (!ImageCtor)
            return fail(ctx, effect.onError, {
              code: "unsupported",
              message: "Image is not available",
            });
          dropImage(effect.id);
          images.delete(effect.id);
          const img = new ImageCtor();
          loading.set(effect.id, img);
          img.onload = () => {
            dropImage(effect.id);
            images.set(effect.id, img);
            if (effect.onSuccess)
              ctx.dispatch({
                id: effect.onSuccess,
                payload: {
                  id: effect.id,
                  width: img.naturalWidth ?? img.width,
                  height: img.naturalHeight ?? img.height,
                },
              });
          };
          img.onerror = () => {
            dropImage(effect.id);
            fail(ctx, effect.onError, {
              code: "load",
              message: `could not load image "${effect.id}" from ${effect.src}`,
            });
          };
          img.src = effect.src;
          return;
        }
        case "size": {
          const c = resolve(ctx, effect.target, effect.onError);
          if (!c) return;
          if (
            !isNum(effect.width) ||
            !isNum(effect.height) ||
            effect.width < 0 ||
            effect.height < 0 ||
            (effect.dpr !== undefined && !(isNum(effect.dpr) && effect.dpr > 0))
          )
            return fail(ctx, effect.onError, {
              code: "invalid",
              message:
                "size needs non-negative width/height and a positive dpr",
            });
          const dpr = effect.dpr ?? defaultDpr();
          dprs.set(c, dpr);
          c.width = Math.round(effect.width * dpr);
          c.height = Math.round(effect.height * dpr);
          if (c.style) {
            c.style.width = `${effect.width}px`;
            c.style.height = `${effect.height}px`;
          }
          // resizing resets the context; restore the logical-pixel scale
          c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
          return;
        }
        case "frames": {
          if (!raf || !caf)
            return fail(ctx, effect.onError, {
              code: "unsupported",
              message: "requestAnimationFrame is not available",
            });
          stopFrame(effect.id);
          let handle: unknown;
          let stopped = false;
          let last: number | undefined;
          let frame = 0;
          const tick = (time: number): void => {
            if (stopped) return;
            const payload: Record<string, unknown> = {
              time,
              dt: last === undefined ? 0 : time - last,
              frame: frame++,
            };
            last = time;
            if (effect.target !== undefined) {
              try {
                const el =
                  typeof effect.target === "string"
                    ? doc?.querySelector(effect.target)
                    : effect.target;
                if (el && typeof (el as any).getContext === "function")
                  Object.assign(payload, logicalSize(el as HTMLCanvasElement));
              } catch {
                /* size is a convenience only */
              }
            }
            // schedule first: a handler that stops the loop cancels this handle
            handle = raf(tick);
            ctx.dispatch({ id: effect.onFrame, payload });
          };
          handle = raf(tick);
          frameLoops.set(effect.id, () => {
            stopped = true;
            caf(handle);
          });
          return;
        }
        case "stopFrames":
          return stopFrame(effect.id);
        case "pointer": {
          const c = resolve(ctx, effect.target, effect.onError);
          if (!c) return;
          if (typeof c.addEventListener !== "function")
            return fail(ctx, effect.onError, {
              code: "unsupported",
              message: "canvas cannot listen to events",
            });
          stopPointer(effect.id);
          const handler = (ev: Event): void => {
            const e = ev as PointerEvent;
            const r = c.getBoundingClientRect();
            const { width: lw, height: lh } = logicalSize(c);
            const nx = r.width ? (e.clientX - r.left) / r.width : 0;
            const ny = r.height ? (e.clientY - r.top) / r.height : 0;
            ctx.dispatch({
              id: effect.onChange,
              payload: {
                type: e.type,
                x: nx * lw,
                y: ny * lh,
                nx,
                ny,
                button: e.button ?? 0,
                buttons: e.buttons ?? 0,
                down: (e.buttons ?? 0) !== 0,
              },
            });
          };
          const types = [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "pointerleave",
          ];
          for (const t of types) c.addEventListener(t, handler);
          pointers.set(effect.id, () => {
            for (const t of types) c.removeEventListener(t, handler);
          });
          return;
        }
        case "stopPointer":
          return stopPointer(effect.id);
        case "snapshot": {
          const c = resolve(ctx, effect.target, effect.onError);
          if (!c) return;
          try {
            const url =
              effect.quality === undefined
                ? c.toDataURL(effect.mime)
                : c.toDataURL(effect.mime, effect.quality);
            ctx.dispatch({ id: effect.onSuccess, payload: url });
          } catch (e) {
            fail(ctx, effect.onError, {
              code: "failed",
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    },
    images: () => [...images.keys()],
    frameLoops: () => [...frameLoops.keys()],
    pointers: () => [...pointers.keys()],
    dispose() {
      for (const id of [...frameLoops.keys()]) stopFrame(id);
      for (const id of [...pointers.keys()]) stopPointer(id);
      for (const id of [...loading.keys()]) dropImage(id);
      images.clear();
    },
  };
}

export { canvasEffector } from "./helpers.ts";
export type { CanvasEffector } from "./helpers.ts";
