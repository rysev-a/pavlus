import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  "event-as-data": {
    template: `button(type="button" @click=remove(todo.id)) Remove`,
    state: { todo: { id: 3 } },
    steps: [
      {
        label: "todo 3 → 4",
        prev: { todo: { id: 3 } },
        next: { todo: { id: 4 } },
      },
    ],
  },
};
