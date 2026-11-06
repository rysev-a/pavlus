# pavlus framework

The framework packages, one concern each:

| Directory     | npm name         | What                                                                                                     |
| ------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `core/`       | `@pavlus/core`   | The isomorphic heart: the `Message`/`Effect`/`Plugin` contract, the `createApp` loop, `toHandler`, and the pure store changes. Nothing here knows about the DOM or a socket. |
| `frontend/`   | `@pavlus/frontend` | The browser half: dom/store/router/http/… plugins, the `Component` class, `namespace` and friends, the template compiler (`*.pavlus`), the vite plugin, SSR. Adds `mount` on top of `createApp`. |
| `backend/`    | `@pavlus/backend` | The server half: the per-request runtime (rid tracking, deadlines, error isolation, graceful shutdown) and the http/ws/pg/redis/log plugins, plus the class-controller kit (`controllersApp`, `HttpController`, `db`). |
| `ui-kit/`     | `@pavlus/ui-kit` | Every shadcn component as a pavlus template, with live-demo pages.                                        |
| `debug-panel/` | —               | The devtools panel and its agents (in-repo).                                                              |
| `editors/`    | —                | The zed extension and the tree-sitter grammar for `*.pavlus`.                                             |
| `docs/`       | —                | Framework docs: [architecture.md](./docs/architecture.md), [plugins](./docs/plugins/), routing, SSR.      |

`frontend` and `backend` both depend on `core` and never on each other; what
they share is exactly the core contract. See the root [README](../README.md)
for the applications that exercise all of this.
