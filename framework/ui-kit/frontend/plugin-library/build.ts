// The plugin library: manifests of plugins for Flow Studio (see
// templates/flow-studio/plugins.ts). The built-in ones are made from the plugins of
// @pavlus/backend (server/src/plugins/*): the effects Flow Studio models come with the
// hints it has for them, and the effects the server has and Flow Studio does not model
// yet are listed, so a plugin that grows on the server shows up here as a difference.
// Pure: sources in, files out. The script `scripts/gen-plugin-library.ts` writes them
// and a test checks that the files on disk are what this makes.
import {
  DEFAULT_ERROR_CODE,
  DEFAULT_LATENCY,
  DEFAULT_TIMEOUT,
  EFFECTS,
  type EffectDef,
  EXTERNAL_OF,
  PLUGIN_NAMES,
  type PluginManifest,
} from "../templates/flow-studio/model.ts";

/** the directory of each built-in plugin in server/src/plugins */
export const SERVER_DIR: Record<string, string> = {
  pg: "postgres",
  redis: "redis",
  fetch: "fetch",
  timer: "time",
  log: "log",
  crypto: "crypto",
  http: "http",
  ws: "ws",
};

/** how an effect of Flow Studio is named by the server: `plugin:type` */
const SERVER_TYPE: Record<string, string> = {
  log: "log",
  "http.sse": "sse.start",
  "timer.after": "timer.after",
};

export const serverTypeOf = (e: EffectDef): string =>
  SERVER_TYPE[e.type] ?? e.type.slice(e.plugin.length + 1);

/**
 * The effect types a server plugin declares: the `type: "..."` of the members of its
 * effect union (`export type XEffect = ... ;`), in the order of the file.
 */
export function serverEffects(raw: string): string[] {
  // comments hold `;` and parentheses of their own
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const start = source.search(/export type \w+Effect\s*=/);
  if (start < 0) return [];
  // the union ends at the first `;` that is not inside braces
  let depth = 0;
  let end = source.length;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "{" || c === "(") depth++;
    else if (c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) {
      end = i;
      break;
    }
  }
  const union = source.slice(start, end);
  const out: string[] = [];
  for (const m of union.matchAll(/\btype:\s*"([A-Za-z.]+)"/g))
    if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export interface BuiltinFile {
  /** the file name inside `plugin-library/builtin/` */
  file: string;
  json: string;
}

/**
 * One file per built-in plugin: the manifest Flow Studio runs on, where the plugin
 * lives on the server, and the effects of the server it does not model yet.
 */
export function builtinFiles(
  readServer: (dir: string) => string,
): BuiltinFile[] {
  return PLUGIN_NAMES.map((name) => {
    const effects = EFFECTS.filter((e) => e.plugin === name);
    const have = new Set(effects.map(serverTypeOf));
    const dir = SERVER_DIR[name];
    const server = serverEffects(readServer(dir));
    const manifest = {
      name,
      about: `built in: the ${dir} plugin of @pavlus/backend`,
      external: EXTERNAL_OF[name]?.title ?? "",
      latency: DEFAULT_LATENCY[name] ?? 1,
      timeout: DEFAULT_TIMEOUT[name] ?? 0,
      errorCode: DEFAULT_ERROR_CODE[name] ?? "ERR",
      effects,
      builtin: true,
      server: `server/src/plugins/${dir}`,
      /** the effect types of the server this design does not model yet */
      unmodelled: server.filter((t) => !have.has(t)),
    };
    return {
      file: `${name}.json`,
      json: `${JSON.stringify(manifest, null, 2)}\n`,
    };
  });
}

export type { PluginManifest };
