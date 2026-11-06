/**
 * The two demo applications for Part II. The build compiles their templates
 * with the real compiler and runs the real `diff` for the exact transitions
 * the scenario diagrams show — the patch JSON on the page and in the SVG
 * labels is genuine compiler output, not an illustration.
 */

export const counterTemplate = `p.score Count: {count}
button(@click=inc) Increment`;

export const counterApp = `import { Component, createApp, type Message } from "@pavlus/frontend";
import { createStorePlugin, storeEffector as store } from "@pavlus/frontend/plugins/store";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import view from "./counter.pavlus";

class Counter extends Component<{ count: number }> {
  view = view;
  // pure: same message + same state → same effects. Nothing else happens.
  inc(_msg: Message, state: { count: number }) {
    return [store.set("count", state.count + 1)];
  }
}

createApp({
  app: new Counter(),
  plugins: [createStorePlugin({ count: 0 }), new DomPlugin()],
  mount: "#app", // renders the view; \`mounted\` is the first message
});`;

export const usersTemplate = `ul.users
  if status === "loading"
    li.muted Loading…
  else if status === "ready"
    for u in users key u.id
      li.row(@click=remove(u.id)) {u.name}
  else
    li.muted Ready when you are`;

export const usersApp = `import { Component, createApp, type Message } from "@pavlus/frontend";
import { createStorePlugin, storeEffector as store } from "@pavlus/frontend/plugins/store";
import { createHttpPlugin, httpEffector as http } from "@pavlus/frontend/plugins/http";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import view from "./users.pavlus";

interface UsersState {
  status: "boot" | "loading" | "ready" | "failed";
  users: { id: number; name: string }[];
  error: string;
}

class Users extends Component<UsersState> {
  view = view;
  // the first message: start loading, ask the network
  mounted() {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users",
                     onSuccess: "loaded", onError: "failed" }),
    ];
  }
  // the http plugin replies with a message; it is handled like any other
  loaded(msg: Message) {
    return [
      store.set("users", msg.payload.data),
      store.set("status", "ready"),
    ];
  }
  failed(msg: Message) {
    return [store.set("status", "failed"), store.set("error", msg.payload.error)];
  }
  remove(msg: Message, state: UsersState) {
    return [store.set("users", state.users.filter((u) => u.id !== msg.payload))];
  }
}

createApp({
  app: new Users(),
  plugins: [
    createStorePlugin({ status: "boot", users: [], error: "" }),
    createHttpPlugin(),
    new DomPlugin(),
  ],
  mount: "#app",
});`;

export const bootState = { status: "boot", users: [] as unknown[], error: "" };
export const loadingState = {
  status: "loading",
  users: [] as unknown[],
  error: "",
};
export const readyState = {
  status: "ready",
  users: [
    { id: 1, name: "Ann" },
    { id: 2, name: "Bob" },
    { id: 3, name: "Clara" },
  ],
  error: "",
};
export const afterRemoveState = {
  ...readyState,
  users: readyState.users.filter((u) => u.id !== 3),
};
