# The pavlus philosophy

Four short documents about why the framework is shaped the way it is. They are
written for a reader who knows web frameworks and wants to know what pavlus
does differently and why; the code they describe is in `framework/`.

| Document                                               | One sentence                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [template-engine.md](./template-engine.md)             | A template is compiled into two pure functions before it reaches the browser; nothing is interpreted at runtime. |
| [architecture.md](./architecture.md)                   | The application is a pure function; a small core runs it; plugins are the only code that touches the world. |
| [plugins.md](./plugins.md)                             | A plugin is the one door between the application and the browser, the network, the clock.     |
| [functional-programming.md](./functional-programming.md) | Pure functions, plain data and composition, which is what makes testing fast and simple.      |

The contract for what a template may say is
[framework/docs/philosophy.md](../../framework/docs/philosophy.md): templates
display, code computes. The documents here explain the engine, the architecture
and the style that follow from it.

How the pieces fit, in one picture:

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  the browser, the network, the clock, storage                        │
 │                                                                      │
 │   ┌──────────────── plugins: the only code with side effects ───┐    │
 │   │  dom · store · http · ws · time · router · logger · yours   │    │
 │   │                                                             │    │
 │   │   ┌──────────── core: one loop, no dependencies ───────┐    │    │
 │   │   │  message ─▶ app(message, state) ─▶ effects[]        │    │    │
 │   │   │                                                     │    │    │
 │   │   │   ┌──── application: pure ────────────────────┐     │    │    │
 │   │   │   │  components: handlers (message, state)    │     │    │    │
 │   │   │   │  views: render(state), diff(prev, next)   │     │    │    │
 │   │   │   │  view models: plain functions of state    │     │    │    │
 │   │   │   └───────────────────────────────────────────┘     │    │    │
 │   │   └─────────────────────────────────────────────────────┘    │    │
 │   └─────────────────────────────────────────────────────────────┘    │
 └──────────────────────────────────────────────────────────────────────┘
```

Data flows inward as **messages** and outward as **effects**. Both are plain
objects. Nothing in the inner rings can reach the outer one except by returning
an effect, and nothing in the outer ring can change the application except by
dispatching a message.
