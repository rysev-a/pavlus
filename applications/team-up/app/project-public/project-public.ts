/**
 * The public project page (`/projects/:slug`): the project with its team and
 * its positions. An unknown (or a cancelled) project answers a 404 — the
 * page shows its "no such project" block then.
 *
 * The "Report the project" button opens the report dialog (report/) — a child
 * of this page: the page says what is reported (the project), the dialog
 * sends it.
 */
import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { ReportDialog } from "../report/report.ts";
import type { AppState } from "../state.ts";
import view from "./project-public.pavlus";

/** The page's slice: what the outlet hands it (state.projectPublic). */
export type ProjectPublicSlice = AppState["projectPublic"];

export class ProjectPublicPage extends Component<ProjectPublicSlice> {
  view = view;

  /** The report dialog of the page (its child: `report.…` is its own). */
  private readonly report = new ReportDialog();

  /** The embedded children, by instance name (`report.…` goes to the dialog). */
  children: Children<ProjectPublicSlice> = {
    report: { component: this.report, tag: "report-dialog" },
  };

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProjectPublicSlice;
      next: ProjectPublicSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: the project of the slug of the route. */
  enter(msg: Message, state: ProjectPublicSlice): Effect[] {
    const route = (msg.payload as { params?: Record<string, string> })?.params;
    const slug = String(route?.slug ?? state.route?.params?.slug ?? "");
    return [
      store.set("project", null, { onSuccess: "paint" }),
      http.request({
        id: "project-public",
        url: `/api/public/project/${slug}`,
        onSuccess: "project.loaded",
        onError: "project.failed",
      }),
    ];
  }

  "project.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: ProjectPublicSlice }).data;
    return [store.set("project", data.project, { onSuccess: "paint" })];
  }

  /** A 404 (an unknown or a cancelled project): the page shows the block. */
  "project.failed"(msg: Message): Effect[] {
    const data = (msg.payload as { data?: ProjectPublicSlice }).data;
    return [
      store.set("project", data?.project ?? null, { onSuccess: "paint" }),
    ];
  }

  /** The "Report the project" button: the dialog opens on this project. */
  openReport(
    _msg: Message,
    s: ProjectPublicSlice,
    { send }: ComponentCtx,
  ): Effect[] {
    const project = s.project;
    return send("report", "open", {
      kind: "project",
      target: project?.slug ?? "",
      title: project ? `Report: ${project.name}` : "Report",
    });
  }
}
