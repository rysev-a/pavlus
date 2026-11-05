// node --cpu-prof --cpu-prof-dir=/some/dir bench/profile.ts   (the forked load generator writes a profile too; the server is the one with the lower pid)
import { fork } from "node:child_process";
import { dropSchema, pavlusPg, seed } from "./servers.ts";
const url = "postgres://admin@127.0.0.1:54329/postgres";
const schema = "prof_" + Math.random().toString(36).slice(2, 7);
await seed(url, schema);
const s = await pavlusPg(url, schema, false);
const c = fork(new URL("./loadgen.ts", import.meta.url), [
  String(s.port),
  "item",
  "100",
  "4",
  "1",
]);
await new Promise((r) => c.on("exit", r));
await s.stop();
await dropSchema(url, schema);
