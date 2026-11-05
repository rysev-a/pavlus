import type { Effect, Plugin } from "@service-laboratory/pavlus";

/** The title of the browser tab: the application asks, this plugin writes it. */
export type TitleEffect = Effect & {
  plugin: "title";
  type: "set";
  title: string;
};

export const titleEffector = {
  set: (title: string): TitleEffect => ({
    plugin: "title",
    type: "set",
    title,
  }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect, unknown> {
  return {
    name: "title",
    handle(effect) {
      if (effect.type === "set") doc.title = effect.title;
    },
  };
}
