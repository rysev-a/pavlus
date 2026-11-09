/**
 * The new project page (`/app/projects/new`): the form that creates a
 * project. The kind, the name, the tagline and the description go to
 * POST /api/projects; the first opening (a profession of the directory, a
 * grade and what it needs) goes to POST /api/projects/:slug/slots. The
 * creator owns the project, so the page goes to it afterwards.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./project-new.pavlus";

/** The page's slice: what the outlet hands it (state.projectNew). */
export type ProjectNewSlice = AppState["projectNew"];

export class ProjectNewPage extends Component<ProjectNewSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProjectNewSlice;
      next: ProjectNewSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page opens: the professions of the directory are for the opening. */
  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("busy", false, { onSuccess: "paint" }),
      http.request({
        id: "project-new-directory",
        url: "/api/directory",
        onSuccess: "projectNew.loaded",
        onError: "projectNew.directoryFailed",
      }),
    ];
  }

  /** The directory: the professions the first opening may ask for. */
  "projectNew.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: { professions?: Profession[] } }).data;
    return [
      store.set("professions", data?.professions ?? [], { onSuccess: "paint" }),
    ];
  }

  /** No directory: the form still creates the project, just without openings. */
  "projectNew.directoryFailed"(): Effect[] {
    return [];
  }

  setKind(msg: Message): Effect[] {
    return [
      store.set("kind", msg.event?.value ?? "startup", { onSuccess: "paint" }),
    ];
  }

  setName(msg: Message): Effect[] {
    return [store.set("name", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setTagline(msg: Message): Effect[] {
    return [
      store.set("tagline", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setDescription(msg: Message): Effect[] {
    return [
      store.set("description", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setProfession(msg: Message): Effect[] {
    const id = Number(msg.event?.value ?? 0);
    return [
      store.set("professionId", Number.isFinite(id) ? id : 0, {
        onSuccess: "paint",
      }),
    ];
  }

  setBucket(msg: Message): Effect[] {
    return [
      store.set("bucket", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setSlotDescription(msg: Message): Effect[] {
    return [
      store.set("slotDescription", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The form's own check first — the server answers the rest. */
  submit(_msg: Message, s: ProjectNewSlice): Effect[] {
    if (s.busy) return [];
    const name = s.name.trim();
    if (!name)
      return [
        store.set("error", "Tell the project its name.", {
          onSuccess: "paint",
        }),
      ];
    if (s.professionId > 0 && !s.bucket)
      return [
        store.set("error", "Choose the grade of the opening.", {
          onSuccess: "paint",
        }),
      ];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "project-new-create",
        url: "/api/projects",
        method: "POST",
        body: {
          name,
          kind: s.kind || "startup",
          tagline: s.tagline.trim(),
          description: s.description.trim(),
        },
        onSuccess: "projectNew.created",
        onError: "projectNew.failed",
      }),
    ];
  }

  /** The project is created: the opening goes to it, then the page follows. */
  "projectNew.created"(msg: Message, s: ProjectNewSlice): Effect[] {
    const project = (msg.payload as { data: { slug: string } }).data;
    const effects: Effect[] = [
      store.set("slug", project.slug, { onSuccess: "paint" }),
    ];
    if (s.professionId > 0) {
      effects.push(
        http.request({
          id: "project-new-slot",
          url: `/api/projects/${project.slug}/slots`,
          method: "POST",
          body: {
            professionId: s.professionId,
            bucket: s.bucket,
            description: s.slotDescription.trim(),
          },
          onSuccess: "projectNew.slotted",
          onError: "projectNew.failed",
        }),
      );
      return effects;
    }
    effects.push(
      router.navigate(`/app/projects/${project.slug}`, { absolute: true }),
    );
    return effects;
  }

  /** The opening is there too: the new project is ready. */
  "projectNew.slotted"(msg: Message, s: ProjectNewSlice): Effect[] {
    const slug = s.slug;
    return [router.navigate(`/app/projects/${slug}`, { absolute: true })];
  }

  "projectNew.failed"(msg: Message): Effect[] {
    const payload = msg.payload as {
      error?: string;
      data?: { error?: string };
    };
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set(
        "error",
        payload.data?.error ?? payload.error ?? "could not create the project",
        { onSuccess: "paint" },
      ),
    ];
  }
}

/** One profession of the directory (`GET /api/directory`). */
interface Profession {
  id: number;
  slug: string;
  name: string;
}
