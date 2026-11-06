import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  counter: {
    template: `section.counter
  h2 Count: {count}
  button(type="button" @click=dec) -
  button(type="button" @click=inc) +
  if count > 2
    p.hint That is a lot of clicks.`,
    state: { count: 2 },
    steps: [
      {
        label: "count 2 → 3",
        prev: { count: 2 },
        next: { count: 3 },
      },
      {
        label: "count 3 → 2",
        prev: { count: 3 },
        next: { count: 2 },
      },
    ],
  },
};
