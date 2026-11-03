import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  clearLines,
  deriveLogs,
  initialLogs,
  type Level,
  type LogsState,
  type LogsView,
  setQuery,
  tick,
  toggleFollow,
  toggleLevel,
  togglePause,
} from "./logs.ts";
import view from "./log-viewer.pavlus";

export interface LogViewerState {
  logs: LogsState;
  view: LogsView;
}

export const LOG_TIMER = "logs";
export const LOG_MS = 1200;

const start = initialLogs();
export const initial: LogViewerState = {
  logs: start,
  view: deriveLogs(start),
};

/**
 * The viewer's messages, as handlers any page can reuse: a page with a
 * `logs: LogsState` and a `view: LogsView` in its state gets `logs.level`,
 * `logs.search`... by extending this class (the server dashboard does).
 */
export class LogViewerPage extends Component<LogViewerState> {
  view = view;

  /** The page opened: the timer starts. */
  enter(): Effect[] {
    return [time.setInterval(LOG_TIMER, LOG_MS, "tick")];
  }

  /** The page closed: the timer stops. */
  leave(): Effect[] {
    return [time.cancel(LOG_TIMER)];
  }

  tick(_msg: Message, state: LogViewerState): Effect[] {
    return this._commit(tick(state.logs));
  }

  "logs.level"(msg: Message, state: LogViewerState): Effect[] {
    return this._commit(toggleLevel(state.logs, msg.payload as Level));
  }

  "logs.search"(msg: Message, state: LogViewerState): Effect[] {
    return this._commit(setQuery(state.logs, msg.event?.value ?? ""));
  }

  "logs.pause"(_msg: Message, state: LogViewerState): Effect[] {
    const next = togglePause(state.logs);
    return [
      ...this._commit(next),
      next.paused
        ? time.cancel(LOG_TIMER)
        : time.setInterval(LOG_TIMER, LOG_MS, "tick"),
    ];
  }

  "logs.follow"(_msg: Message, state: LogViewerState): Effect[] {
    return this._commit(toggleFollow(state.logs));
  }

  "logs.clear"(_msg: Message, state: LogViewerState): Effect[] {
    return this._commit(clearLines(state.logs));
  }

  _commit(next: LogsState): Effect[] {
    return [store.set("logs", next), store.set("view", deriveLogs(next))];
  }
}

export const page = new LogViewerPage();
