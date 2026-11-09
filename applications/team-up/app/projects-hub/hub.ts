/**
 * The cabinet (`/app/projects`): the original's three tabs — my projects, the
 * applications and the invitations, and the recommended projects.
 *
 * The page is one class with three instances (the tab of each): the frame (the
 * bar with the title and the two buttons, the tab row) is the same on every
 * tab, and the panel below it is the tab's own.
 *
 * The data comes from the backend (`/api/hub`): my projects, the invitations
 * addressed to me and my applications, with the texts of the page — the
 * translation lives on the server.
 *
 * The apply dialog (the change of an application) is the shared one
 * (apply-dialog/): a child of this page. The page opens it and, after the
 * application is sent, asks its lists again.
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
import { ApplyDialog } from "../apply-dialog/apply-dialog.ts";
import type { AppState, FeedProject, HubApplication } from "../state.ts";
import view from "./hub.pavlus";

/** The page's slice: what the outlet hands it (state.hub). */
export type HubSlice = AppState["hub"];

/** The tab an instance shows. */
export type HubTab = "mine" | "activity" | "match";

export class ProjectsHubPage extends Component<HubSlice> {
  view = view;

  /** The apply dialog of the page (its child: `apply.…` is its own). */
  private readonly applyDialog = new ApplyDialog();

  /** The embedded children, by instance name (`apply.…` goes to the dialog). */
  children: Children<HubSlice> = {
    apply: { component: this.applyDialog },
  };

  /** The tab this instance shows. */
  private readonly tab: HubTab;

  constructor(tab: HubTab) {
    super();
    this.tab = tab;
  }

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: HubSlice;
      next: HubSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(_msg: Message, s: HubSlice): Effect[] {
    return [
      store.set("tab", this.tab, { onSuccess: "paint" }),
      this.load(),
      ...(this.tab === "match"
        ? [
            store.set("feed.status", "loading", { onSuccess: "paint" }),
            this.loadOptions(),
            this.loadFeed(s.feed.filters),
          ]
        : []),
    ];
  }

  /** The cabinet's data again (the projects, the invitations, the answers). */
  private load(): Effect {
    return http.request({
      id: "hub",
      url: "/api/hub",
      onSuccess: "hub.loaded",
      onError: "hub.failed",
    });
  }

  "hub.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        mine: HubSlice["mine"];
        invites: HubSlice["invites"];
        applications: HubSlice["applications"];
        strings: Record<string, string>;
      };
    };
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "hub.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  /** The match feed of the "Recommended" tab (the original's `MatchPanel`). */
  private loadFeed(filters: HubSlice["feed"]["filters"]): Effect {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.role) query.set("role", filters.role);
    if (filters.grade) query.set("grade", filters.grade);
    const suffix = query.toString();
    return http.request({
      id: "feed",
      url: suffix ? `/api/match/startups?${suffix}` : "/api/match/startups",
      onSuccess: "feed.loaded",
      onError: "feed.failed",
    });
  }

  /** The options of the feed's filters (the professions and the grades). */
  private loadOptions(): Effect {
    return http.request({
      id: "feed.options",
      url: "/api/directory/filters",
      onSuccess: "feed.options.loaded",
      onError: "feed.options.failed",
    });
  }

  "feed.options.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data?: { professions?: []; buckets?: [] } })
      .data;
    return [
      store.set(
        "feed.options",
        {
          professions: data?.professions ?? [],
          buckets: data?.buckets ?? [],
        },
        { onSuccess: "paint" },
      ),
    ];
  }

  "feed.options.failed"(): Effect[] {
    return [];
  }

  "feed.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data?: Record<string, unknown> }).data ?? {};
    const strings = (data.strings ?? {}) as Record<string, string>;
    const items = ((data.items ?? []) as FeedProject[]).map((item) => ({
      ...item,
      // every opening of the project already has my application
      allApplied:
        item.slots.length > 0 && item.slots.every((slot) => slot.applied),
    }));
    return [
      store.set("feed.items", items, { onSuccess: "paint" }),
      store.set("feed.total", Number(data.total ?? 0), { onSuccess: "paint" }),
      store.set("feed.canMatch", data.canMatch !== false, {
        onSuccess: "paint",
      }),
      store.set("feed.more", strings.more ?? "", { onSuccess: "paint" }),
      store.set("feed.strings", strings, { onSuccess: "paint" }),
      store.set("feed.status", "idle", { onSuccess: "paint" }),
    ];
  }

  "feed.failed"(): Effect[] {
    return [store.set("feed.status", "failed", { onSuccess: "paint" })];
  }

  /** The free text of the filter. */
  setQuery(msg: Message): Effect[] {
    return [
      store.set("feed.filters.q", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The profession of the filter. */
  setRole(msg: Message): Effect[] {
    return [
      store.set("feed.filters.role", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The grade of the filter. */
  setGrade(msg: Message): Effect[] {
    return [
      store.set("feed.filters.grade", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** "Search": the feed with the filters. */
  search(_msg: Message, s: HubSlice): Effect[] {
    return [
      store.set("feed.status", "loading", { onSuccess: "paint" }),
      this.loadFeed(s.feed.filters),
    ];
  }

  /**
   * "Apply": the dialog of an application opens on the project's openings.
   * The slots that already have my application are left out of it.
   */
  join(msg: Message, s: HubSlice, { send }: ComponentCtx): Effect[] {
    const project = msg.payload as FeedProject;
    if (!project) return [];
    const slots = project.slots
      .filter((slot) => !slot.applied)
      .map((slot) => ({
        id: slot.id,
        label: slot.payLabel ? `${slot.title} · ${slot.payLabel}` : slot.title,
        profession: slot.profession,
      }));
    if (!slots.length) return [];
    const title = (s.feed.strings.applyTitle ?? "Apply: {name}").replace(
      "{name}",
      project.name,
    );
    return send("apply", "open", {
      mode: "new",
      slots,
      slotId: slots[0].id,
      title,
    });
  }

  /** The invitation is accepted or declined. */
  answer(msg: Message, s: HubSlice): Effect[] {
    if (s.busy) return [];
    const [slotId, accept] = (msg.payload as [number, boolean]) ?? [0, false];
    if (!slotId) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "answer",
        method: "POST",
        url: `/api/invites/${slotId}/${accept ? "accept" : "decline"}`,
        onSuccess: "answer.done",
        onError: "answer.failed",
      }),
    ];
  }

  "answer.done"(): Effect[] {
    return [store.set("busy", false, { onSuccess: "paint" }), this.load()];
  }

  "answer.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }

  /** The application is changed: the apply dialog opens in the edit mode. */
  edit(msg: Message, s: HubSlice, { send }: ComponentCtx): Effect[] {
    const app = msg.payload as HubApplication;
    if (!app) return [];
    return send("apply", "open", {
      mode: "edit",
      id: app.id,
      title: s.strings.editTitle?.replace("{name}", app.projectName) ?? "",
      profession: app.professionName,
      message: app.message,
    });
  }

  /** The application is deleted: the confirmation opens. */
  askDelete(msg: Message, s: HubSlice): Effect[] {
    const app = msg.payload as HubApplication;
    if (!app) return [];
    return [
      store.set(
        "confirm",
        {
          open: true,
          title: s.strings.deleteTitle ?? "",
          text: (s.strings.deleteText ?? "").replace("{name}", app.projectName),
          confirmLabel: s.strings.delete ?? "Delete",
        },
        { onSuccess: "paint" },
      ),
      store.set("confirmAppId", app.id, { onSuccess: "paint" }),
    ];
  }

  /** The confirmation closes: nothing happens. */
  closeConfirm(_msg: Message, s: HubSlice): Effect[] {
    return [
      store.set(
        "confirm",
        { ...s.confirm, open: false },
        { onSuccess: "paint" },
      ),
      store.set("confirmAppId", 0, { onSuccess: "paint" }),
    ];
  }

  /** The confirmation is accepted: the application is withdrawn. */
  confirmDelete(_msg: Message, s: HubSlice): Effect[] {
    const id = Number((s as unknown as { confirmAppId?: number }).confirmAppId);
    if (!id) return [];
    return [
      store.set(
        "confirm",
        { ...s.confirm, open: false },
        { onSuccess: "paint" },
      ),
      store.set("confirmAppId", 0, { onSuccess: "paint" }),
      http.request({
        id: "withdraw",
        method: "DELETE",
        url: `/api/applications/${id}`,
        onSuccess: "withdraw.done",
        onError: "withdraw.failed",
      }),
    ];
  }

  "withdraw.done"(): Effect[] {
    return [this.load()];
  }

  "withdraw.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  /** A click inside the confirmation: it must not close it. */
  noop(): Effect[] {
    return [];
  }

  /** The application was sent: the lists are asked again. */
  "apply.sent"(_msg: Message, s: HubSlice): Effect[] {
    return [
      this.load(),
      ...(this.tab === "match" ? [this.loadFeed(s.feed.filters)] : []),
    ];
  }
}
