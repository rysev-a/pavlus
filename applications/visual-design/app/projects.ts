// The projects page: what is there, a new one from a template, delete with a
// second click. The data is on the server (HTTP, Postgres behind it).
import type { Effect, Message, Route } from "@pavlus/frontend";
import { Component } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import view from "./projects.pavlus";
import { docsOf, isTemplate, TEMPLATES, type TemplateId } from "./templates.ts";

export interface ProjectRow {
  id: number;
  name: string;
  updated_at: string;
  docs: string[];
}

/** a row as the page shows it */
export interface ProjectItem {
  id: number;
  name: string;
  when: string;
  flowHref: string;
  uiHref: string;
  asking: boolean;
}

export interface ProjectsState {
  route?: Route;
  status: "loading" | "ready" | "failed";
  rows: ProjectRow[];
  items: ProjectItem[];
  name: string;
  template: TemplateId;
  templates: { id: TemplateId; title: string; about: string; on: boolean }[];
  about: string;
  busy: boolean;
  error: string;
  /** the project whose delete waits for a second click */
  asking: number;
}

const templatesOf = (on: TemplateId): ProjectsState["templates"] =>
  TEMPLATES.map((t) => ({ ...t, on: t.id === on }));

export const initialProjects = (): ProjectsState => ({
  status: "loading",
  rows: [],
  items: [],
  name: "",
  template: "coffee",
  templates: templatesOf("coffee"),
  about: TEMPLATES.find((t) => t.id === "coffee")?.about ?? "",
  busy: false,
  error: "",
  asking: 0,
});

/** "5 min ago", "yesterday", or the date */
export function whenOf(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(t).toISOString().slice(0, 10);
}

export const itemsOf = (
  rows: ProjectRow[],
  asking: number,
  now = Date.now(),
): ProjectItem[] =>
  rows.map((r) => ({
    id: r.id,
    name: r.name,
    when: whenOf(r.updated_at, now),
    flowHref: `/projects/${r.id}/flow`,
    uiHref: `/projects/${r.id}/interface`,
    asking: r.id === asking,
  }));

const ask = (id: string, url: string, onSuccess: string, extra = {}): Effect =>
  http.request({ id, url, onSuccess, onError: `${onSuccess}Failed`, ...extra });

const failure = (msg: Message): string => {
  const p = msg.payload as { data?: { error?: string }; message?: string };
  return p?.data?.error ?? p?.message ?? "The server did not answer";
};

export class ProjectsPage extends Component<ProjectsState> {
  view = view;

  enter(): Effect[] {
    return [store.set("status", "loading"), this._list()];
  }

  _list(): Effect {
    return ask("projects", "/api/projects", "listed");
  }

  listed(msg: Message, state: ProjectsState): Effect[] {
    const rows = (msg.payload as { data: { projects: ProjectRow[] } }).data
      .projects;
    return [
      store.set("rows", rows),
      store.set("items", itemsOf(rows, state.asking)),
      store.set("status", "ready"),
    ];
  }

  listedFailed(msg: Message): Effect[] {
    return [store.set("status", "failed"), store.set("error", failure(msg))];
  }

  retry(): Effect[] {
    return [
      store.set("status", "loading"),
      store.set("error", ""),
      this._list(),
    ];
  }

  setName(msg: Message): Effect[] {
    return [store.set("name", msg.event?.value ?? ""), store.set("error", "")];
  }

  setTemplate(msg: Message): Effect[] {
    const id = msg.payload;
    if (!isTemplate(id)) return [];
    return [
      store.set("template", id),
      store.set("templates", templatesOf(id)),
      store.set("about", TEMPLATES.find((t) => t.id === id)?.about ?? ""),
    ];
  }

  create(_msg: Message, state: ProjectsState): Effect[] {
    const name = state.name.trim();
    if (!name) return [store.set("error", "Give the project a name")];
    if (state.busy) return [];
    return [
      store.set("busy", true),
      store.set("error", ""),
      ask("create", "/api/projects", "created", {
        method: "POST",
        body: { name, docs: docsOf(state.template, name) },
      }),
    ];
  }

  created(msg: Message): Effect[] {
    const project = (msg.payload as { data: { project: { id: number } } }).data
      .project;
    return [
      store.set("busy", false),
      store.set("name", ""),
      router.navigate(`/projects/${project.id}/flow`, { absolute: true }),
    ];
  }

  createdFailed(msg: Message): Effect[] {
    return [store.set("busy", false), store.set("error", failure(msg))];
  }

  /** the first click on delete asks, the second one deletes */
  askDelete(msg: Message, state: ProjectsState): Effect[] {
    const id = Number(msg.payload);
    return [
      store.set("asking", id),
      store.set("items", itemsOf(state.rows, id)),
    ];
  }

  cancelDelete(_msg: Message, state: ProjectsState): Effect[] {
    return [store.set("asking", 0), store.set("items", itemsOf(state.rows, 0))];
  }

  remove(msg: Message): Effect[] {
    return [
      store.set("asking", 0),
      ask("remove", `/api/projects/${Number(msg.payload)}`, "removed", {
        method: "DELETE",
      }),
    ];
  }

  removed(): Effect[] {
    return [this._list()];
  }

  removedFailed(msg: Message): Effect[] {
    return [store.set("error", failure(msg)), this._list()];
  }

  navigateTo(msg: Message): Effect[] {
    return [router.navigate(String(msg.payload), { absolute: true })];
  }
}

export const projectsPage = new ProjectsPage();
