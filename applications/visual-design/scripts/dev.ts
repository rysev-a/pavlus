// npm run dev: the database (Docker), the API and the web app, together.
// Ctrl+C stops the API and the web app; the database keeps running (npm run db:down).
import { spawn, spawnSync } from "node:child_process";

const run = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { stdio: "inherit" }).status === 0;

console.log("-> Postgres (docker compose up)");
if (!run("docker", ["compose", "up", "-d", "--wait"])) {
  console.error("Postgres did not start. Is Docker running?");
  process.exit(1);
}

const children = [
  spawn("npm", ["run", "dev:api"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev:web"], { stdio: "inherit" }),
];
const stop = (): void => {
  for (const c of children) c.kill("SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
for (const c of children) c.on("exit", () => stop());
