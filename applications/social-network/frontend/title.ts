import type { Effect, Plugin } from "@pavlus/frontend";

/** Sets `document.title`: the application only says what it should be. */
export type TitleEffect = Effect & {
  plugin: "title";
  type: "set";
  text: string;
};

export const titleEffector = {
  set: (text: string): TitleEffect => ({
    plugin: "title",
    type: "set",
    text,
  }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect, unknown> {
  return {
    name: "title",
    handle(effect) {
      if (effect.type === "set") doc.title = effect.text;
    },
  };
}
