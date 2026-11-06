// The plugin library as Flow Studio sees it: the built-in manifests (made from the
// server, folder `builtin/`) and the ready-made plugins you can add to a project
// (the other `*.json` files here). A file is a manifest of Flow Studio with a few
// extra fields for the built-in ones.
import {
  type PluginManifest,
  parsePlugins,
} from "../templates/flow-studio/model.ts";

export interface LibraryEntry {
  /** the name of the plugin */
  name: string;
  /** a plugin of pavlus-server that Flow Studio knows by itself */
  builtin: boolean;
  /** where it lives on the server (built-in ones) */
  server: string;
  /** effects of the server that are not modelled yet (built-in ones) */
  unmodelled: string[];
  manifest: PluginManifest;
}

const files = import.meta.glob("./**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

/** the entries of the library, built-in ones first, each group by name */
export function libraryEntries(
  source: Record<string, unknown> = files,
): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  for (const [path, raw] of Object.entries(source)) {
    const builtin = path.includes("/builtin/");
    // built-in names are taken (that is what makes them built in), so the manifest
    // is read as if it had a free name, and given its own back
    const own = (raw as { name?: string }).name ?? "";
    const parsed = parsePlugins(
      JSON.stringify(builtin ? { ...(raw as object), name: `x${own}` } : raw),
    );
    if (typeof parsed === "string") continue;
    const m = { ...parsed[0], name: own };
    out.push({
      name: own,
      builtin,
      server: String((raw as { server?: string }).server ?? ""),
      unmodelled: Array.isArray((raw as { unmodelled?: unknown }).unmodelled)
        ? ((raw as { unmodelled: unknown[] }).unmodelled.filter(
            (x) => typeof x === "string",
          ) as string[])
        : [],
      manifest: {
        ...m,
        effects: m.effects.map((e) => ({ ...e, plugin: own })),
      },
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name),
  );
}

/** the plugins of the library that a project can add (not the built-in ones) */
export const addable = (entries: LibraryEntry[]): LibraryEntry[] =>
  entries.filter((e) => !e.builtin);
