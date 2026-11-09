/**
 * The project page (`/app/projects/:slug`): the project with its openings, and
 * the controls of its owner — the edit of the project, the openings (add, edit,
 * delete), the invitations to the team, the candidates of an opening, the
 * inbox of the applications and the team itself.
 *
 * The data comes from the backend: the project (`/api/projects/:slug`), the
 * owner's inbox (`/api/projects/:slug/applications`), my friends (the
 * invitation form) and the directory (the opening's form). The texts of the
 * page travel with the project — the translation lives on the server.
 *
 * The apply dialog (an application to an opening) and the report dialog (the
 * report of the project) are children of this page.
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
import { ReportDialog } from "../report/report.ts";
import { SkillTree } from "../skill-tree/skill-tree.ts";
import { buildTree, segmentsOf } from "../skill-tree/tree.ts";
import type {
  AppState,
  Candidate,
  FriendCard,
  InboxItem,
  ProjectForm,
  ProjectView,
  SlotForm,
} from "../state.ts";
import view from "./project.pavlus";

/** The page's slice: what the outlet hands it (state.project). */
export type ProjectSlice = AppState["project"];

/** The empty forms of the page. */
const emptyProjectForm: ProjectForm = {
  name: "",
  tagline: "",
  description: "",
  kind: "startup",
  status: "active",
  workMode: "remote",
  city: "",
  website: "",
  tags: "",
  budget: "",
  budgetCurrency: "RUB",
  deadline: "",
};

const emptySlotForm: SlotForm = {
  professionId: 0,
  bucket: "middle",
  description: "",
  pay: "",
  payFrom: "",
  payTo: "",
  currency: "RUB",
};

export class ProjectPage extends Component<ProjectSlice> {
  view = view;

  /** The apply dialog of the page (its child: `apply.…` is its own). */
  private readonly applyDialog = new ApplyDialog();

  /** The report dialog of the page (its child: `report.…` is its own). */
  private readonly report = new ReportDialog();

  /** The skill tree of the opening's form (its child: `tree.…` is its own). */
  private readonly skillTree = new SkillTree();

  /** The embedded children, by instance name (`apply.…` goes to the dialog). */
  children: Children<ProjectSlice> = {
    apply: { component: this.applyDialog },
    report: { component: this.report },
    tree: { component: this.skillTree },
  };

  /** The directory's skills (the tree of the opening's form). */
  private skills: {
    id: number;
    slug: string;
    name: string;
    parentId: number | null;
  }[] = [];
  private links: { professionId: number; skillId: number }[] = [];

  /**
   * The tree of the opening's form: the skills of the chosen profession with
   * the ratings the owner gave them.
   */
  private treeOf(s: ProjectSlice, professionId: number): Effect[] {
    const ids = this.links
      .filter((l) => l.professionId === professionId)
      .map((l) => l.skillId);
    const zones: Record<string, string> = {};
    for (const bucket of s.buckets) zones[bucket.value] = bucket.label;
    const levels = s.tree.levels;
    return [
      store.set(
        "tree.roots",
        buildTree(this.skills, ids, levels, {
          zones,
          strings: s.tree.strings,
        }),
        { onSuccess: "paint" },
      ),
    ];
  }

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProjectSlice;
      next: ProjectSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(msg: Message, s: ProjectSlice): Effect[] {
    const slug = String(
      (msg.payload as { params?: Record<string, string> }).params?.slug ?? "",
    );
    return [
      store.set("slug", slug, { onSuccess: "paint" }),
      store.set("project", null, { onSuccess: "paint" }),
      store.set("team", [], { onSuccess: "paint" }),
      store.set("inbox", [], { onSuccess: "paint" }),
      store.set("candidates", {}, { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      store.set("editing", false, { onSuccess: "paint" }),
      store.set("slotMode", "", { onSuccess: "paint" }),
      store.set("projectForm", { ...emptyProjectForm }, { onSuccess: "paint" }),
      store.set("slotForm", { ...emptySlotForm }, { onSuccess: "paint" }),
      store.set(
        "invite",
        { open: false, slotId: 0, who: "" },
        {
          onSuccess: "paint",
        },
      ),
      ...this.load(slug),
    ];
  }

  /** The project, the inbox, my friends and the directory. */
  private load(slug: string): Effect[] {
    if (!slug) return [];
    return [
      http.request({
        id: "project",
        url: `/api/projects/${slug}`,
        onSuccess: "project.loaded",
        onError: "project.failed",
      }),
      http.request({
        id: "project.inbox",
        url: `/api/projects/${slug}/applications`,
        onSuccess: "project.inbox",
        onError: "project.inboxFailed",
      }),
      http.request({
        id: "project.friends",
        url: "/api/friends",
        onSuccess: "project.friends",
        onError: "project.friendsFailed",
      }),
      http.request({
        id: "project.directory",
        url: "/api/directory",
        onSuccess: "project.directory",
        onError: "project.directoryFailed",
      }),
    ];
  }

  "project.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: ProjectView & {
        team: ProjectSlice["team"];
        strings: Record<string, string>;
      };
    };
    const { team, strings, ...project } = data.data;
    return [
      store.set("project", project as ProjectView, { onSuccess: "paint" }),
      store.set("team", team ?? [], { onSuccess: "paint" }),
      store.set("strings", strings ?? {}, { onSuccess: "paint" }),
      store.set("projectForm", {
        ...emptyProjectForm,
        name: project.name,
        tagline: project.tagline,
        description: project.description,
        kind: project.kind,
        status: project.status,
        workMode: project.workMode,
        city: project.city,
        website: project.website,
        tags: (project.tags ?? []).join(", "),
        budget: project.budget === null ? "" : String(project.budget),
        budgetCurrency: project.budgetCurrency ?? "RUB",
        deadline: project.deadline ?? "",
      }),
    ];
  }

  "project.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  /** The owner's inbox: the applications waiting for an answer. */
  "project.inbox"(msg: Message): Effect[] {
    const data = msg.payload as { data: InboxItem[] };
    const rows = Array.isArray(data.data) ? data.data : [];
    return [store.set("inbox", rows, { onSuccess: "paint" })];
  }

  "project.inboxFailed"(): Effect[] {
    return [];
  }

  /** My friends (the invitation form offers them). */
  "project.friends"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: { friends: FriendCard[]; incoming: FriendCard[] };
    };
    const list = [...(data.data.friends ?? []), ...(data.data.incoming ?? [])];
    return [store.set("friends", list, { onSuccess: "paint" })];
  }

  "project.friendsFailed"(): Effect[] {
    return [];
  }

  /** The directory (the opening's form: the professions and the grades). */
  "project.directory"(msg: Message, s: ProjectSlice): Effect[] {
    const data = msg.payload as {
      data: {
        professions: { id: number; slug: string; name: string }[];
        buckets: { value: string; label: string }[];
        skills?: {
          id: number;
          slug: string;
          name: string;
          parentId: number | null;
        }[];
        professionSkills?: { professionId: number; skillId: number }[];
        strings?: Record<string, string>;
      };
    };
    this.skills = (data.data.skills ?? []) as {
      id: number;
      slug: string;
      name: string;
      parentId: number | null;
    }[];
    this.links = data.data.professionSkills ?? [];
    const strings = data.data.strings ?? {};
    return [
      store.set("professions", data.data.professions ?? [], {
        onSuccess: "paint",
      }),
      store.set("buckets", data.data.buckets ?? [], { onSuccess: "paint" }),
      store.set("tree.segments", segmentsOf(), { onSuccess: "paint" }),
      store.set(
        "tree.strings",
        {
          clearRating: strings.clearRating ?? "Clear the rating",
          levelAria: strings.levelAria ?? "Level: {skill}",
        },
        { onSuccess: "paint" },
      ),
      ...this.treeOf(s, s.slotForm.professionId),
    ];
  }

  "project.directoryFailed"(): Effect[] {
    return [];
  }

  // ----- the owner's controls -----

  /** The edit form of the project opens (or closes). */
  toggleEdit(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("editing", !s.editing, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
    ];
  }

  /** A field of the project's form. */
  setProjectField(msg: Message, s: ProjectSlice): Effect[] {
    const field = String(msg.payload ?? "");
    const value = msg.event?.value ?? "";
    return [store.set(`projectForm.${field}`, value, { onSuccess: "paint" })];
  }

  /** The project is saved. */
  saveProject(_msg: Message, s: ProjectSlice): Effect[] {
    if (s.busy) return [];
    const form = s.projectForm;
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "project.save",
        method: "PUT",
        url: `/api/projects/${s.slug}`,
        body: {
          name: form.name,
          tagline: form.tagline,
          description: form.description,
          kind: form.kind,
          status: form.status,
          workMode: form.workMode,
          city: form.city,
          website: form.website,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          budget: form.budget === "" ? null : Number(form.budget),
          budgetCurrency: form.budgetCurrency,
          deadline: form.deadline === "" ? null : form.deadline,
        },
        onSuccess: "project.saved",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.saved"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("editing", false, { onSuccess: "paint" }),
      store.set("notice", s.strings.saved ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  "project.writeFailed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }

  /** A new opening: the form opens. */
  newSlot(_msg: Message, s: ProjectSlice): Effect[] {
    const professionId = s.professions[0]?.id ?? 0;
    return [
      store.set("slotMode", "new", { onSuccess: "paint" }),
      store.set(
        "slotForm",
        {
          ...emptySlotForm,
          professionId,
          bucket: s.buckets[0]?.value ?? "middle",
        },
        { onSuccess: "paint" },
      ),
      store.set("error", "", { onSuccess: "paint" }),
      // the skills of the opening start empty
      store.set("tree.levels", [], { onSuccess: "paint" }),
      ...this.treeOf(s, professionId),
    ];
  }

  /** An opening is edited: the form opens with its values. */
  editSlot(msg: Message, s: ProjectSlice): Effect[] {
    const id = Number(msg.payload ?? 0);
    const slot = s.project?.slots.find((x) => x.id === id);
    if (!slot) return [];
    const levels = (slot.skills ?? []).map((skill) => ({
      skillId: skill.skillId,
      level: skill.level,
    }));
    return [
      store.set("slotMode", String(id), { onSuccess: "paint" }),
      store.set(
        "slotForm",
        {
          professionId: slot.professionId,
          bucket: slot.bucket,
          description: slot.description,
          pay: slot.pay ?? "",
          payFrom: slot.payFrom === null ? "" : String(slot.payFrom),
          payTo: slot.payTo === null ? "" : String(slot.payTo),
          currency: slot.currency ?? "RUB",
        },
        { onSuccess: "paint" },
      ),
      store.set("error", "", { onSuccess: "paint" }),
      // the tree opens with the skills the opening asks for
      store.set("tree.levels", levels, { onSuccess: "paint" }),
      ...this.treeOf(s, slot.professionId),
    ];
  }

  /** The opening's form closes. */
  closeSlotForm(_msg: Message): Effect[] {
    return [store.set("slotMode", "", { onSuccess: "paint" })];
  }

  /** A field of the opening's form. */
  setSlotField(msg: Message, s: ProjectSlice): Effect[] {
    const field = String(msg.payload ?? "");
    const raw = msg.event?.value ?? "";
    const value = field === "professionId" ? Number(raw) : raw;
    const effects: Effect[] = [
      store.set(`slotForm.${field}`, value, { onSuccess: "paint" }),
    ];
    // another profession: another tree (the ratings of the old one go)
    if (field === "professionId") {
      effects.push(store.set("tree.levels", [], { onSuccess: "paint" }));
      effects.push(...this.treeOf(s, Number(raw)));
    }
    return effects;
  }

  /** The opening is saved (a new one or the edited one). */
  saveSlot(_msg: Message, s: ProjectSlice): Effect[] {
    if (s.busy) return [];
    const form = s.slotForm;
    const editing = s.slotMode !== "" && s.slotMode !== "new";
    const body = {
      professionId: form.professionId,
      bucket: form.bucket,
      description: form.description,
      pay: form.pay === "" ? null : form.pay,
      payFrom: form.payFrom === "" ? null : Number(form.payFrom),
      payTo: form.payTo === "" ? null : Number(form.payTo),
      currency: form.currency,
      // the skills the opening asks for (the rated leaves of the tree)
      skills: s.tree.levels,
    };
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "slot.save",
        method: editing ? "PUT" : "POST",
        url: editing
          ? `/api/projects/${s.slug}/slots/${s.slotMode}`
          : `/api/projects/${s.slug}/slots`,
        body,
        onSuccess: "project.slotSaved",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.slotSaved"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("slotMode", "", { onSuccess: "paint" }),
      store.set("notice", s.strings.slotSaved ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  /** The opening is deleted. */
  deleteSlot(msg: Message, s: ProjectSlice): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "slot.delete",
        method: "DELETE",
        url: `/api/projects/${s.slug}/slots/${id}`,
        onSuccess: "project.slotDeleted",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.slotDeleted"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", s.strings.slotDeleted ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  // ----- the invitations -----

  /** The invitation form of an opening opens (or closes). */
  toggleInvite(msg: Message, s: ProjectSlice): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id) return [];
    const open = s.invite.open && s.invite.slotId === id;
    return [
      store.set(
        "invite",
        { open: !open, slotId: id, who: "" },
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The invitation form closes. */
  closeInvite(_msg: Message): Effect[] {
    return [
      store.set(
        "invite",
        { open: false, slotId: 0, who: "" },
        {
          onSuccess: "paint",
        },
      ),
    ];
  }

  /** The search field of the invitation form. */
  setInvite(msg: Message): Effect[] {
    return [
      store.set("invite.who", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** A friend is chosen in the invitation form. */
  chooseFriend(msg: Message): Effect[] {
    const slug = String(msg.payload ?? "");
    return [store.set("invite.who", slug, { onSuccess: "paint" })];
  }

  /** The invitation is sent. */
  sendInvite(_msg: Message, s: ProjectSlice): Effect[] {
    const who = s.invite.who.trim();
    if (!who || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "invite.send",
        method: "POST",
        url: `/api/projects/${s.slug}/slots/${s.invite.slotId}/invite`,
        body: { slug: who },
        onSuccess: "project.invited",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.invited"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set(
        "invite",
        { open: false, slotId: 0, who: "" },
        {
          onSuccess: "paint",
        },
      ),
      store.set("notice", s.strings.invited2 ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  /** The invitation is taken back. */
  revokeInvite(msg: Message, s: ProjectSlice): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "invite.revoke",
        method: "DELETE",
        url: `/api/projects/${s.slug}/slots/${id}/invite`,
        onSuccess: "project.revoked",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.revoked"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", s.strings.revoked ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  /** The invitation addressed to me is accepted or declined. */
  answerInvite(msg: Message, s: ProjectSlice): Effect[] {
    const [slotId, accept] = (msg.payload as [number, boolean]) ?? [0, false];
    if (!slotId || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "invite.answer",
        method: "POST",
        url: `/api/invites/${slotId}/${accept ? "accept" : "decline"}`,
        onSuccess: "project.inviteAnswered",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.inviteAnswered"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  // ----- the candidates -----

  /** The candidates of an opening are shown (or hidden). */
  toggleCandidates(msg: Message, s: ProjectSlice): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id) return [];
    if (s.candidates[id]) {
      const next = { ...s.candidates };
      delete next[id];
      return [store.set("candidates", next, { onSuccess: "paint" })];
    }
    return [
      http.request({
        id: `candidates-${id}`,
        url: `/api/match/candidates/${id}`,
        onSuccess: "project.candidates",
        onError: "project.candidatesFailed",
      }),
    ];
  }

  "project.candidates"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        slotId: number;
        items: {
          userId: number;
          name: string;
          slug: string;
          city: string;
          status: string;
          match: { percent: number; details: string[] } | null;
        }[];
      };
    };
    const list: Candidate[] = (data.data?.items ?? []).map((c) => ({
      userId: c.userId,
      name: c.name,
      slug: c.slug,
      city: c.city,
      role: c.status,
      percent: c.match?.percent ?? 0,
      why: (c.match?.details ?? []).join(" · "),
      initials: (c.name.split(" ")[0]?.[0] ?? "?").toUpperCase(),
    }));
    const slotId = data.data?.slotId ?? 0;
    return [store.set(`candidates.${slotId}`, list, { onSuccess: "paint" })];
  }

  "project.candidatesFailed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  // ----- the team -----

  /** A member is removed from the team (the owner). */
  removeMember(msg: Message, s: ProjectSlice): Effect[] {
    const slug = String(msg.payload ?? "");
    if (!slug || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "team.remove",
        method: "DELETE",
        url: `/api/projects/${s.slug}/members/${slug}`,
        onSuccess: "project.memberRemoved",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.memberRemoved"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", s.strings.removed ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  /** I leave the team. */
  leave(_msg: Message, s: ProjectSlice): Effect[] {
    if (s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "team.leave",
        method: "POST",
        url: `/api/projects/${s.slug}/leave`,
        onSuccess: "project.left",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.left"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", s.strings.left ?? "", { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  // ----- the applications -----

  /** The application is accepted or declined (the owner). */
  decide(msg: Message, s: ProjectSlice): Effect[] {
    const [id, accept] = (msg.payload as [number, boolean]) ?? [0, false];
    if (!id || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "application.decide",
        method: "POST",
        url: `/api/applications/${id}/${accept ? "accept" : "decline"}`,
        onSuccess: "project.decided",
        onError: "project.writeFailed",
      }),
    ];
  }

  "project.decided"(_msg: Message, s: ProjectSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      ...this.load(s.slug),
    ];
  }

  /** The apply dialog opens on an opening. */
  apply(msg: Message, s: ProjectSlice, { send }: ComponentCtx): Effect[] {
    const id = Number(msg.payload ?? 0);
    const slot = s.project?.slots.find((x) => x.id === id);
    if (!slot) return [];
    return send("apply", "open", {
      mode: "new",
      slotId: slot.id,
      slots: [
        {
          id: slot.id,
          label: slot.payLabel
            ? `${slot.label} · ${slot.payLabel}`
            : slot.label,
          profession: slot.professionSlug,
        },
      ],
      title: (s.strings.applyTitle ?? "Apply: {name}").replace(
        "{name}",
        slot.label,
      ),
    });
  }

  /** The application was sent: the page asks the project again. */
  "apply.sent"(_msg: Message, s: ProjectSlice): Effect[] {
    return [...this.load(s.slug)];
  }

  /** The report dialog opens on the project. */
  openReport(_msg: Message, s: ProjectSlice, { send }: ComponentCtx): Effect[] {
    return send("report", "open", {
      kind: "project",
      target: s.slug,
      title: s.project
        ? (s.strings.reportTitle ?? "Report {name}").replace(
            "{name}",
            s.project.name,
          )
        : "Report",
    });
  }
}
