import type { Demo } from "../demo.ts";

const at = (path: string, base = "", params: Record<string, string> = {}) => ({
  path,
  base,
  params,
  search: "",
  hash: "",
});

export const demos: Record<string, Demo> = {
  links: {
    template: `nav
  a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
  a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About`,
    state: { route: at("/") },
    steps: [
      {
        label: "path / → /about",
        prev: { route: at("/") },
        next: { route: at("/about") },
      },
      {
        label: "route null → /",
        prev: { route: null },
        next: { route: at("/") },
      },
    ],
  },
  "route-state": {
    template: `article
  h2 User {route.params.id}
  p The base is {route.base}; below it the path is {route.path}.`,
    state: { route: at("/", "/admin/users/2", { id: "2" }) },
    steps: [
      {
        label: "id 2 → 7",
        prev: { route: at("/", "/admin/users/2", { id: "2" }) },
        next: { route: at("/", "/admin/users/7", { id: "7" }) },
      },
    ],
  },
  tabs: {
    template: `nav.admin__tabs
  a(href={route.base} class:active={route.path === "/"} @click.prevent=navigate("/")) Overview
  a(href={route.base + "/users"} class:active={route.path !== "/"} @click.prevent=navigate("/users")) Users`,
    state: { route: at("/", "/admin") },
    steps: [
      {
        label: "path / → /users",
        prev: { route: at("/", "/admin") },
        next: { route: at("/users", "/admin") },
      },
    ],
  },
  "base-href": {
    template: `a(href={root + "/about"} @click.prevent=navigate("/about")) About`,
    state: { root: "/pavlus" },
    steps: [
      {
        label: "root /pavlus → empty",
        prev: { root: "/pavlus" },
        next: { root: "" },
      },
    ],
  },
};
