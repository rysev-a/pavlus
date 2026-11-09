/**
 * The project catalog (`/projects`): the filter form and the cards. The
 * filters are links with a query (the original teamUP used htmx; the port
 * navigates), so the page asks the backend for the query of the route it was
 * entered with.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./projects.pavlus";

/** The page's slice: what the outlet hands it (state.projects). */
export type ProjectsSlice = AppState["projects"];

export class ProjectsPage extends Component<ProjectsSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProjectsSlice;
      next: ProjectsSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: the catalog of the query of the route. */
  enter(msg: Message, state: ProjectsSlice): Effect[] {
    const route = (msg.payload as { search?: string } | undefined) ?? {
      search: state.route?.search ?? "",
    };
    const search = String(route.search ?? "");
    return [
      http.request({
        id: "projects",
        url: `/api/public/projects${search}`,
        onSuccess: "projects.loaded",
        onError: "projects.failed",
      }),
    ];
  }

  "projects.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: ProjectsSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "projects.failed"(): Effect[] {
    return [];
  }

  /** The star of a card: the project is saved (or not) any more. */
  star(msg: Message, state: ProjectsSlice): Effect[] {
    const slug = String(msg.payload ?? "");
    const card = state.cards.find((one) => one.slug === slug);
    if (!card) return [];
    return [
      http.request({
        id: `star-${slug}`,
        method: card.favorite ? "DELETE" : "POST",
        url: `/api/favorites/${slug}`,
        onSuccess: "projects.refreshed",
        onError: "projects.starFailed",
      }),
    ];
  }

  /** The name of the search that is saved. */
  setSavedName(msg: Message): Effect[] {
    return [
      store.set("savedName", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** The search of the address is saved (the signed-in member only). */
  saveSearch(msg: Message, state: ProjectsSlice): Effect[] {
    const search = String(state.route?.search ?? "");
    if (!search) return [];
    return [
      http.request({
        id: "saveSearch",
        method: "POST",
        url: "/api/saved-searches",
        body: { name: state.savedName ?? "", query: search },
        onSuccess: "projects.refreshed",
        onError: "projects.starFailed",
      }),
    ];
  }

  /** The star is off: the saved search of the box is deleted. */
  unsave(msg: Message): Effect[] {
    const id = Number(msg.payload);
    if (!Number.isInteger(id)) return [];
    return [
      http.request({
        id: `saved-${id}`,
        method: "DELETE",
        url: `/api/saved-searches/${id}`,
        onSuccess: "projects.refreshed",
        onError: "projects.starFailed",
      }),
    ];
  }

  /** The list changed: ask for the catalog of the same query again. */
  "projects.refreshed"(msg: Message, state: ProjectsSlice): Effect[] {
    void msg;
    const search = String(state.route?.search ?? "");
    return [
      http.request({
        id: "projects",
        url: `/api/public/projects${search}`,
        onSuccess: "projects.loaded",
        onError: "projects.failed",
      }),
    ];
  }

  /** A guest cannot star a project: nothing changes. */
  "projects.starFailed"(): Effect[] {
    return [];
  }
}
