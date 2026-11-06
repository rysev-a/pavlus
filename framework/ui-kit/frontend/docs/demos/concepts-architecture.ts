import type { Demo } from "../demo.ts";

const idle = { status: "idle", items: [] as string[] };
const loading = { status: "loading", items: [] as string[] };
const loaded = { status: "idle", items: ["Ann", "Bob"] };

export const demos: Record<string, Demo> = {
  "state-to-patches": {
    template: `section.users
  button(type="button" @click=load) Load
  if status === "loading"
    p.status Loading...
  ul
    for name in items key name
      li {name}`,
    state: idle,
    steps: [
      { label: "load: status idle → loading", prev: idle, next: loading },
      { label: "loaded: items [] → [Ann, Bob]", prev: loading, next: loaded },
    ],
  },
};
