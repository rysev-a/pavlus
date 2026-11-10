import type { Effect, Plugin } from "@pavlus/client";

/**
 * Files of the visitor's disk. The application asks to save a text
 * (`filesEffector.download`) or to pick a file and read it (`pick`); the
 * answer comes back as a message.
 */

export type FilesEffect = Effect & { plugin: "files" } & (
    | {
        type: "download";
        name: string;
        text: string;
        mime: string;
        onSuccess?: string;
      }
    | { type: "pick"; accept: string; onSuccess: string; onError: string }
    | {
        type: "pickImages";
        maxSide: number;
        multiple: boolean;
        onSuccess: string;
        onError: string;
      }
  );

/** The reply of `pick`. */
export interface Picked {
  name: string;
  text: string;
}

/** The reply of `pickImages`: every chosen image, downsized, as a JPEG data URL. */
export interface PickedImages {
  images: { name: string; src: string }[];
}

/** The quality of the JPEG a picked image is stored as. */
export const IMAGE_QUALITY = 0.8;

/**
 * Pure: the size of an image of `width` x `height` scaled down so that its
 * longest side is at most `maxSide` (never scaled up, never below 1px).
 */
export function scaleSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > maxSide) || !(maxSide >= 1)) {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }
  const k = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

/** Pure: whether `src` is an image data URL (`data:image/...;base64,...`). */
export const isImageDataUrl = (src: string): boolean =>
  /^data:image\/[a-z0-9.+-]+(;[^,]*)?,/i.test(src);

export const filesEffector = {
  /** Saves `text` as a file; replies `{ name }` to `onSuccess` when given. */
  download: (
    name: string,
    text: string,
    mime: string,
    onSuccess?: string,
  ): FilesEffect => ({
    plugin: "files",
    type: "download",
    name,
    text,
    mime,
    onSuccess,
  }),
  /** Opens the file dialog (`accept`: `.json`) and replies `Picked` to `onSuccess`; a cancelled dialog replies nothing. */
  pick: (accept: string, onSuccess: string, onError: string): FilesEffect => ({
    plugin: "files",
    type: "pick",
    accept,
    onSuccess,
    onError,
  }),
  /**
   * Opens the file dialog for images, reads each chosen file, downsizes it in the
   * browser (longest side <= `maxSide`, JPEG) and replies `PickedImages` to
   * `onSuccess`; files that are not images or cannot be decoded are skipped, and
   * when none is left `onError` gets a text. A cancelled dialog replies nothing.
   */
  pickImages: (
    maxSide: number,
    multiple: boolean,
    onSuccess: string,
    onError: string,
  ): FilesEffect => ({
    plugin: "files",
    type: "pickImages",
    maxSide,
    multiple,
    onSuccess,
    onError,
  }),
};

function readDataUrl(win: Window, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new (
      win as unknown as { FileReader: typeof FileReader }
    ).FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("cannot read the file"));
    reader.readAsDataURL(file);
  });
}

/** Decodes `src`, draws it into a canvas of at most `maxSide` and gives a JPEG data URL. */
function downsize(
  doc: Document,
  win: Window,
  src: string,
  maxSide: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new (win as unknown as { Image: typeof Image }).Image();
    img.onload = () => {
      try {
        const { width, height } = scaleSize(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          maxSide,
        );
        const canvas = doc.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const g = canvas.getContext("2d");
        if (!g) throw new Error("no canvas");
        g.fillStyle = "#fff"; // a transparent PNG would turn black as a JPEG
        g.fillRect(0, 0, width, height);
        g.drawImage(img, 0, 0, width, height);
        const out = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
        if (!isImageDataUrl(out)) throw new Error("no image");
        resolve(out);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error("not an image"));
    img.src = src;
  });
}

export function createFilesPlugin(
  doc: Document = document,
): Plugin<FilesEffect, unknown> {
  return {
    name: "files",
    handle(effect, ctx) {
      const win = doc.defaultView;
      if (effect.type === "download") {
        try {
          const url = win!.URL.createObjectURL(
            new Blob([effect.text], { type: effect.mime }),
          );
          const a = doc.createElement("a");
          a.href = url;
          a.download = effect.name;
          doc.body.appendChild(a);
          a.click();
          a.remove();
          win!.setTimeout(() => win!.URL.revokeObjectURL(url), 1000);
        } catch {
          // no download in this environment
        }
        if (effect.onSuccess)
          ctx.dispatch({
            id: effect.onSuccess,
            payload: { name: effect.name },
          });
        return;
      }
      if (effect.type === "pick") {
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = effect.accept;
        input.hidden = true;
        const done = () => input.remove();
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          done();
          if (!file) return;
          file.text().then(
            (text) =>
              ctx.dispatch({
                id: effect.onSuccess,
                payload: { name: file.name, text } satisfies Picked,
              }),
            (e) =>
              ctx.dispatch({
                id: effect.onError,
                payload: `cannot read ${file.name}: ${e instanceof Error ? e.message : String(e)}`,
              }),
          );
        });
        // a dialog closed without a file: the browser says so with `cancel` (where it does)
        input.addEventListener("cancel", done);
        doc.body.appendChild(input);
        input.click();
        return;
      }
      if (effect.type === "pickImages") {
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.multiple = effect.multiple;
        input.hidden = true;
        const done = () => input.remove();
        input.addEventListener("change", () => {
          const files = Array.from(input.files ?? []);
          done();
          if (files.length === 0) return;
          Promise.all(
            files.map((file) =>
              readDataUrl(win!, file)
                .then((src) => downsize(doc, win!, src, effect.maxSide))
                .then(
                  (src) => ({ name: file.name, src }),
                  (e: unknown) => ({
                    name: file.name,
                    error: e instanceof Error ? e.message : String(e),
                  }),
                ),
            ),
          ).then((results) => {
            const images = results.filter(
              (r): r is { name: string; src: string } => "src" in r,
            );
            if (images.length > 0) {
              ctx.dispatch({
                id: effect.onSuccess,
                payload: { images } satisfies PickedImages,
              });
              return;
            }
            const first = results[0] as { name: string; error: string };
            ctx.dispatch({
              id: effect.onError,
              payload: `cannot read ${first.name}: ${first.error}`,
            });
          });
        });
        input.addEventListener("cancel", done);
        doc.body.appendChild(input);
        input.click();
      }
    },
  };
}
