import type { Effect, Plugin } from "@service-laboratory/pavlus";

/**
 * Files of the visitor's disk. The application asks to save a text
 * (`filesEffector.download`) or to pick a file and read it (`pick`); the
 * answer comes back as a message.
 */

export type FilesEffect = Effect & { plugin: "files" } & (
    | { type: "download"; name: string; text: string; mime: string; onDone?: string }
    | { type: "pick"; accept: string; onText: string; onError: string }
  );

/** The reply of `pick`. */
export interface Picked {
  name: string;
  text: string;
}

export const filesEffector = {
  /** Saves `text` as a file; replies `{ name }` to `onDone` when given. */
  download: (name: string, text: string, mime: string, onDone?: string): FilesEffect => ({
    plugin: "files",
    type: "download",
    name,
    text,
    mime,
    onDone,
  }),
  /** Opens the file dialog (`accept`: `.json`) and replies `Picked` to `onText`; a cancelled dialog replies nothing. */
  pick: (accept: string, onText: string, onError: string): FilesEffect => ({
    plugin: "files",
    type: "pick",
    accept,
    onText,
    onError,
  }),
};

export function createFilesPlugin(
  doc: Document = document,
): Plugin<FilesEffect, unknown> {
  return {
    name: "files",
    handle(effect, ctx) {
      const win = doc.defaultView;
      if (effect.type === "download") {
        try {
          const url = win!.URL.createObjectURL(new Blob([effect.text], { type: effect.mime }));
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
        if (effect.onDone) ctx.dispatch({ id: effect.onDone, payload: { name: effect.name } });
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
              ctx.dispatch({ id: effect.onText, payload: { name: file.name, text } satisfies Picked }),
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
      }
    },
  };
}
