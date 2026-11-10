// The application: ONE pure function `(message, state) => effects`.
// Each feature module answers the messages it owns and returns `undefined`
// for the rest, so the app is a plain `??` chain, in the order that matters
// (routes pass the gate first; infrastructure noise is handled last).
import type { Effect, Message } from "@pavlus/core";
import { auth } from "./auth.ts";
import { boot } from "./boot.ts";
import { chat } from "./chat.ts";
import { demo } from "./demo.ts";
import { gate } from "./gate.ts";
import { health } from "./health.ts";
import type { AppState } from "./kit.ts";
import { lifecycle } from "./lifecycle.ts";
import { stream } from "./stream.ts";
import { todos } from "./todos.ts";

export const app = (msg: Message, state: AppState): Effect[] =>
  boot(msg, state) ??
  gate(msg, state) ??
  auth(msg, state) ??
  todos(msg, state) ??
  stream(msg, state) ??
  health(msg, state) ??
  demo(msg, state) ??
  chat(msg, state) ??
  lifecycle(msg, state) ??
  [];
