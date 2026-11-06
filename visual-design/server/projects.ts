// Projects and their documents: one pure module, `(msg, state) => effects`.
// It answers the messages of its routes (and of its queries) and returns
// undefined for the others. Every effect names its replyTo and onError; the
// runtime stamps the request id on them.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type ServerState,
  httpEffector as http,
  pgEffector as pg,
} from "pavlus-server";

/** the documents of a project: the diagram and the interface */
export const DOC_KEYS = ["flow", "interface"] as const;
export type DocKey = (typeof DOC_KEYS)[number];

export const NAME_MAX = 120;
/** the text of one document (a big diagram with its trace stays far below) */
export const DOC_MAX = 6 * 1024 * 1024;

type Payload = {
  params?: Record<string, string>;
  body?: unknown;
  rows?: Record<string, unknown>[];
  code?: string;
};

const asId = (v: unknown): number | null =>
  typeof v === "string" && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : null;

const asKey = (v: unknown): DocKey | null =>
  DOC_KEYS.find((k) => k === v) ?? null;

const asName = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= NAME_MAX ? s : null;
};

/** `docs` of a new project: only the known keys, each a text */
function asDocs(v: unknown): Partial<Record<DocKey, string>> | null {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out: Partial<Record<DocKey, string>> = {};
  for (const [k, text] of Object.entries(v)) {
    const key = asKey(k);
    if (!key || typeof text !== "string" || text.length > DOC_MAX) return null;
    out[key] = text;
  }
  return out;
}

const bad = (error: string): Effect[] => [http.json({ error }, 400)];
const missing = (): Effect[] => [http.json({ error: "Not found" }, 404)];
const broken = (msg: string): Effect[] => [http.json({ error: msg }, 500)];

const ask = (
  sql: string,
  replyTo: string,
  params: unknown[],
  onError = "projects.failed",
): Effect[] => [pg.query(sql, { replyTo, onError }, params)];

export function handle(
  msg: Message,
  _state: ServerState,
): Effect[] | undefined {
  const p = (msg.payload ?? {}) as Payload;
  const body = (p.body ?? {}) as Record<string, unknown>;
  switch (msg.id) {
    case "health.get":
      return [http.json({ ok: true }, 200)];

    // ---- projects ----
    case "projects.list":
      return ask(
        `select p.id, p.name, p.created_at, p.updated_at,
                coalesce((select array_agg(d.key order by d.key) from project_docs d where d.project_id = p.id), '{}') as docs
           from projects p order by p.updated_at desc, p.id desc`,
        "projects.listed",
        [],
      );
    case "projects.listed":
      return [http.json({ projects: p.rows }, 200)];

    case "projects.create": {
      const name = asName(body.name);
      if (!name) return bad(`The name must be 1 to ${NAME_MAX} characters`);
      const docs = asDocs(body.docs);
      if (!docs) return bad("The documents are not valid");
      // the project and its documents in one statement
      return ask(
        `with p as (insert into projects (name) values ($1) returning *),
              d as (insert into project_docs (project_id, key, text)
                    select p.id, e.key, e.value from p, jsonb_each_text($2::jsonb) as e returning 1)
         select p.id, p.name, p.created_at, p.updated_at,
                (select array_agg(k order by k) from jsonb_object_keys($2::jsonb) as k) as docs
           from p`,
        "projects.created",
        [name, JSON.stringify(docs)],
      );
    }
    case "projects.created": {
      const row = p.rows?.[0];
      return [
        http.json({ project: row && { ...row, docs: row.docs ?? [] } }, 201),
      ];
    }

    case "projects.get": {
      const id = asId(p.params?.id);
      if (id === null) return missing();
      return ask(
        `select p.id, p.name, p.created_at, p.updated_at,
                coalesce((select array_agg(d.key order by d.key) from project_docs d where d.project_id = p.id), '{}') as docs
           from projects p where p.id = $1`,
        "projects.found",
        [id],
      );
    }
    case "projects.found":
      return p.rows?.[0] ? [http.json({ project: p.rows[0] }, 200)] : missing();

    case "projects.rename": {
      const id = asId(p.params?.id);
      if (id === null) return missing();
      const name = asName(body.name);
      if (!name) return bad(`The name must be 1 to ${NAME_MAX} characters`);
      return ask(
        `update projects set name = $2, updated_at = now() where id = $1
         returning id, name, created_at, updated_at`,
        "projects.renamed",
        [id, name],
      );
    }
    case "projects.renamed":
      return p.rows?.[0] ? [http.json({ project: p.rows[0] }, 200)] : missing();

    case "projects.remove": {
      const id = asId(p.params?.id);
      if (id === null) return missing();
      return ask(
        "delete from projects where id = $1 returning id",
        "projects.removed",
        [id],
      );
    }
    case "projects.removed":
      return p.rows?.[0]
        ? [http.json({ deleted: p.rows[0].id }, 200)]
        : missing();

    // ---- documents ----
    case "docs.get": {
      const id = asId(p.params?.id);
      const key = asKey(p.params?.key);
      if (id === null) return missing();
      if (!key) return bad("There is no such document");
      // the project is there, the document may not be yet (text: null)
      return ask(
        `select d.text from projects p
           left join project_docs d on d.project_id = p.id and d.key = $2
          where p.id = $1`,
        "docs.found",
        [id, key],
      );
    }
    case "docs.found":
      return p.rows?.[0]
        ? [http.json({ text: p.rows[0].text ?? null }, 200)]
        : missing();

    case "docs.put": {
      const id = asId(p.params?.id);
      const key = asKey(p.params?.key);
      if (id === null) return missing();
      if (!key) return bad("There is no such document");
      const text = body.text;
      if (typeof text !== "string") return bad("The text is missing");
      if (text.length > DOC_MAX) return bad("The document is too big");
      return ask(
        `with up as (
           insert into project_docs (project_id, key, text)
           select p.id, $2, $3 from projects p where p.id = $1
           on conflict (project_id, key) do update set text = excluded.text, updated_at = now()
           returning project_id)
         update projects set updated_at = now()
          where id in (select project_id from up) returning id`,
        "docs.saved",
        [id, key, text],
      );
    }
    case "docs.saved":
      return p.rows?.[0] ? [http.json({ saved: true }, 200)] : missing();

    case "projects.failed":
      return broken("The database could not answer");
  }
  return undefined;
}
