// Plugins of a project: the manifests that say what a plugin is (its effects, how
// long they take, what it talks to) so the palette, the simulation, the checks and
// the code generator know it like a built-in one. Pure model code.
import {
  type EffectDef,
  type FlowNode,
  type Model,
  type PluginManifest,
  PLUGIN_NAMES,
  customOf,
} from "./model.ts";

// ---- the effects as text, one per line ----

const flagsOf = (e: EffectDef): string =>
  [
    e.replies ? (e.optionalReply ? "optional" : "reply") : "fire",
    e.noFail ? "nofail" : "",
    e.responds ? "responds" : "",
  ]
    .filter(Boolean)
    .join(" ");

/** `stripe.charge | charge a card | POST /v1/charges | reply` per line */
export const effectLines = (p: PluginManifest): string =>
  p.effects
    .map((e) => [e.type, e.hint, e.detail, flagsOf(e)].join(" | "))
    .join("\n");

/**
 * The effects of a plugin from their lines. A type is `<plugin>.<name>`; a bare
 * name is given the prefix. Flags: reply (answers with a message), optional (the
 * reply may be left out), fire (no reply), nofail (cannot fail), responds (ends the
 * request).
 */
export function parseEffectLines(name: string, text: string): EffectDef[] {
  const out: EffectDef[] = [];
  for (const raw of text.split("\n")) {
    const parts = raw.split("|").map((x) => x.trim());
    if (!parts[0]) continue;
    const bare = parts[0].replace(/^.*\./, "").replace(/[^\w.-]/g, "");
    if (!bare) continue;
    const type = `${name}.${bare}`;
    if (out.some((e) => e.type === type)) continue;
    const flags = (parts[3] ?? "reply").toLowerCase().split(/[\s,]+/);
    const replies = !flags.includes("fire");
    out.push({
      type,
      plugin: name,
      hint: parts[1] ?? "",
      detail: parts[2] ?? "",
      replies,
      ...(replies && flags.includes("optional") ? { optionalReply: true } : {}),
      ...(flags.includes("nofail") ? { noFail: true } : {}),
      ...(flags.includes("responds") ? { responds: true } : {}),
    });
  }
  return out;
}

// ---- editing the manifests of a model ----

const NAME = /^[a-z][a-z0-9]*$/;

/** How many effect nodes, in the top level or in a module, use the plugin. */
export function pluginInUse(m: Model, name: string): number {
  const count = (nodes: FlowNode[]): number =>
    nodes.filter((n) => n.kind === "effect" && n.plugin === name).length;
  return count(m.nodes) + m.modules.reduce((n, d) => n + count(d.nodes), 0);
}

/** A new plugin with a name that is free and one effect to start from. */
export function addPlugin(m: Model, name = ""): { model: Model; name: string } {
  const taken = new Set<string>([
    ...PLUGIN_NAMES,
    ...m.plugins.map((p) => p.name),
  ]);
  let n = NAME.test(name) && !taken.has(name) ? name : "";
  for (let i = m.plugins.length + 1; !n; i++)
    if (!taken.has(`plugin${i}`)) n = `plugin${i}`;
  const p: PluginManifest = {
    name: n,
    about: "",
    external: "",
    latency: 20,
    timeout: 0,
    errorCode: "ERR",
    effects: [
      {
        type: `${n}.call`,
        plugin: n,
        hint: "call it",
        detail: "",
        replies: true,
      },
    ],
  };
  return { model: { ...m, plugins: [...m.plugins, p] }, name: n };
}

export function updatePlugin(
  m: Model,
  name: string,
  patch: Partial<Omit<PluginManifest, "name" | "effects">> & {
    effectsText?: string;
  },
): Model {
  const { effectsText, ...rest } = patch;
  return {
    ...m,
    plugins: m.plugins.map((p) =>
      p.name === name
        ? {
            ...p,
            ...rest,
            ...(effectsText !== undefined
              ? { effects: parseEffectLines(name, effectsText) }
              : {}),
          }
        : p,
    ),
  };
}

/** Removes a plugin of the project; refused while an effect node uses it. */
export function removePlugin(m: Model, name: string): Model {
  if (!customOf(m.plugins, name) || pluginInUse(m, name) > 0) return m;
  return { ...m, plugins: m.plugins.filter((p) => p.name !== name) };
}

/** Adds manifests (a manifest with a name that is taken replaces the old one). */
export function mergePlugins(m: Model, list: PluginManifest[]): Model {
  const names = new Set(list.map((p) => p.name));
  return {
    ...m,
    plugins: [...m.plugins.filter((p) => !names.has(p.name)), ...list],
  };
}

export const pluginsText = (list: PluginManifest[]): string =>
  JSON.stringify(list, null, 2);

/** The plugins of the project that effect nodes of the model use, in order. */
export function usedCustom(m: Model): PluginManifest[] {
  const used = new Set(
    [m.nodes, ...m.modules.map((d) => d.nodes)]
      .flat()
      .filter((n) => n.kind === "effect")
      .map((n) => n.plugin),
  );
  return m.plugins.filter((p) => used.has(p.name));
}

// ---- the stub of a plugin, for the generated server ----

const camel = (s: string): string =>
  s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ""));
const Cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** the name of the builder of an effect: `stripe.charge` -> `charge` */
export const builderOf = (type: string): string =>
  camel(type.slice(type.indexOf(".") + 1));

/**
 * `server/plugins/<name>.ts`: the effect builders and a plugin that answers every
 * effect with its `replyTo` (the body is a TODO to be replaced by the real client).
 * Written from the manifest, so it matches what the design simulates.
 */
export function pluginStub(p: PluginManifest): string {
  const N = Cap(camel(p.name));
  const builders = p.effects
    .map((e) => {
      const fn = builderOf(e.type);
      const reply = e.replies
        ? "opts: { replyTo?: string; onError?: string } = {}"
        : "";
      return `  /** ${e.hint || e.type} */
  ${fn}: (detail: string${reply ? `, ${reply}` : ""}) =>
    ({ plugin: ${JSON.stringify(p.name)}, type: ${JSON.stringify(e.type.slice(p.name.length + 1))}, detail${reply ? ", ...opts" : ""} }) as ${N}Effect,`;
    })
    .join("\n");
  const cases = p.effects
    .map(
      (e) => `      case ${JSON.stringify(e.type.slice(p.name.length + 1))}:
        // TODO: ${e.hint || e.type}${p.external ? ` (talks to ${p.external})` : ""}
        console.log(${JSON.stringify(`[${p.name}] ${e.type.slice(p.name.length + 1)}:`)}, effect.detail);
        ${
          e.replies
            ? `if (effect.replyTo)
          ctx.dispatch({ id: effect.replyTo, payload: {}, ctx: effect.ctx });`
            : "return;"
        }
        return;`,
    )
    .join("\n");
  return `// The plugin ${p.name}${p.about ? `: ${p.about}` : ""}.${p.external ? ` It talks to ${p.external}.` : ""}
// A stub made from the manifest of the design: replace the TODOs with the real client.
import type { Plugin } from "@service-laboratory/pavlus";

export type ${N}Effect = {
  plugin: ${JSON.stringify(p.name)};
  type: ${p.effects.map((e) => JSON.stringify(e.type.slice(p.name.length + 1))).join(" | ") || "never"};
  detail: string;
  replyTo?: string;
  onError?: string;
  ctx?: { rid?: string };
};

export const ${camel(p.name)}Effector = {
${builders}
};

export function create${N}Plugin(): Plugin<${N}Effect, unknown> {
  return {
    name: ${JSON.stringify(p.name)},
    handle(effect, ctx) {
      switch (effect.type) {
${cases}
      }
    },
  };
}
`;
}
