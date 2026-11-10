// Process lifecycle messages that are not requests: boot (migrate, make the
// dummy hash, become ready) and drain (SIGTERM: stop being ready, end streams).
import { crypto, log, pg, rq, sharedOf, type Handler } from "./kit.ts";
import { migrations } from "./schema.ts";
import { endAll } from "./stream.ts";

export const boot: Handler = (msg, state) => {
  switch (msg.id) {
    case "app.boot":
      return [
        log.info("booting"),
        pg.migrate(
          { steps: migrations },
          { replyTo: "app.migrated", onError: "app.bootFailed" },
        ),
      ];
    case "app.migrated":
      return [
        log.info("migrated", msg.payload as Record<string, unknown>),
        crypto.hash("not-a-real-password", {
          replyTo: "app.dummyHash",
          onError: "app.bootFailed",
        }),
      ];
    case "app.dummyHash":
      return [
        rq.sharedMerge({
          ready: true,
          dummyHash: (msg.payload as { hash: string }).hash,
        }),
        log.info("ready"),
      ];
    case "app.bootFailed":
      return [log.fatal("boot failed", { error: msg.payload })];
    case "app.drain":
      return [
        rq.sharedSet("draining", true),
        log.info("draining", {
          streams: Object.keys(sharedOf(state).sse ?? {}).length,
        }),
        ...endAll(state),
      ];
  }
  return undefined;
};
