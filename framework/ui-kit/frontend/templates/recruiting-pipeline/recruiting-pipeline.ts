import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import { targetColumn } from "../../blocks/kanban-board/board.ts";
import type { Filter } from "../../blocks/list-filter/filters.ts";
import { withValue } from "../../blocks/record-sheet/sheet.ts";
import { setRating } from "../../blocks/scorecard/score.ts";
import {
  addInterview,
  advance,
  CANDIDATES,
  candById,
  INTERVIEWS,
  JOB_NEXT,
  JOBS,
  jobById,
  moveTo,
  OFFERS,
  reject,
  STAGES,
  saveOffer,
  TODAY,
  validateInterview,
  validateOffer,
} from "./rec.ts";
import view from "./recruiting-pipeline.pavlus";
import {
  closedSheet,
  interviewDraftOf,
  interviewSheet,
  newInterviewDraft,
  newOfferDraft,
  offerDraftOf,
  offerSheet,
  type SheetState,
} from "./sheet.ts";
import { derive, type RecCore, type RecViews } from "./views.ts";

export interface RecState extends AppState, RecCore, RecViews {
  user: ShellUser;
  actions: ShellAction[];
  none: Filter[];
  sheet: SheetState;
}

const NAV: NavGroup[] = [
  {
    title: "Hiring",
    items: [
      { id: "jobs", label: "Job openings", icon: "k-ai-briefcase" },
      { id: "pipeline", label: "Pipeline", icon: "k-ai-kanban" },
      { id: "candidate", label: "Candidate", icon: "k-icon-user" },
    ],
  },
  {
    title: "Plan and measure",
    items: [
      { id: "interviews", label: "Interviews", icon: "k-icon-calendar" },
      { id: "stats", label: "Hiring stats", icon: "k-ai-chart" },
    ],
  },
];

const navFor = (s: RecCore): NavGroup[] => {
  const offers = s.cands.filter((c) => c.stage === "offer").length;
  return withBadge(NAV, "pipeline", offers ? String(offers) : "");
};

const core: RecCore = {
  jobs: JOBS,
  cands: CANDIDATES,
  offers: OFFERS,
  interviews: INTERVIEWS,
  selected: "c1",
  jobFilter: "all",
};

export const initial: RecState = {
  screen: "pipeline",
  title: "Pipeline",
  navOpen: false,
  notice: "",
  user: { name: "Rhea Kapoor", role: "Head of talent", initials: "RK" },
  actions: [
    {
      id: "schedule",
      label: "Schedule interview",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  ...core,
  ...derive(core),
  groups: navFor(core),
  sheet: closedSheet(CANDIDATES),
};

const coreOf = (s: RecState): RecCore => ({
  jobs: s.jobs,
  cands: s.cands,
  offers: s.offers,
  interviews: s.interviews,
  selected: s.selected,
  jobFilter: s.jobFilter,
});

export class RecruitingPipeline extends AdminApp<RecState> {
  view = view;

  _commit(state: RecState, changes: Partial<RecCore>): Effect[] {
    const next = { ...coreOf(state), ...changes };
    return patch({ ...changes, ...derive(next), groups: navFor(next) });
  }

  _go(screen: string, title: string): Effect[] {
    return patch({ screen, title, navOpen: false });
  }

  _closeSheet(state: RecState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  _openOffer(state: RecState): Effect[] {
    const c = candById(state.cands, state.selected);
    return patch({
      sheet: offerSheet(c, jobById(state.jobs, c.job), newOfferDraft(c)),
    });
  }

  // ---- the shell
  "top.action"(_msg: Message, state: RecState): Effect[] {
    return patch({
      sheet: interviewSheet(state.cands, newInterviewDraft(state.selected)),
    });
  }

  // ---- jobs
  "jobs.act"(msg: Message, state: RecState): Effect[] {
    const [id] = msg.payload as [string, string];
    const jobs = state.jobs.map((j) =>
      j.id === id ? { ...j, status: JOB_NEXT[j.status] } : j,
    );
    const after = jobs.find((j) => j.id === id);
    return [
      ...this._commit(state, { jobs }),
      ...notice(`${after?.title} is ${after?.status}`),
    ];
  }

  "jobs.pick"(msg: Message, state: RecState): Effect[] {
    return [
      ...this._commit(state, { jobFilter: msg.payload as string }),
      ...this._go("pipeline", "Pipeline"),
    ];
  }

  // ---- the board
  "jobfilter.pick"(msg: Message, state: RecState): Effect[] {
    return this._commit(state, { jobFilter: msg.payload as string });
  }

  "board.move"(msg: Message, state: RecState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const c = candById(state.cands, id);
    const to = targetColumn(
      STAGES.map((x) => ({ id: x.id, title: x.title })),
      c.stage,
      dir,
    );
    if (to === c.stage) return [];
    if (to === "hired" && !state.offers.some((o) => o.cand === id)) {
      return notice(`${c.name} has no offer yet`);
    }
    const cands = state.cands.map((x) =>
      x.id === id ? moveTo(x, to, TODAY) : x,
    );
    return [
      ...this._commit(state, { cands }),
      ...notice(`${c.name} moved to ${to}`),
    ];
  }

  "board.open"(msg: Message, state: RecState): Effect[] {
    return [
      ...this._commit(state, { selected: msg.payload as string }),
      ...this._go("candidate", "Candidate"),
    ];
  }

  // ---- the candidate
  pickPerson(msg: Message, state: RecState): Effect[] {
    return this._commit(state, {
      selected: msg.event?.value ?? state.selected,
    });
  }

  _update(
    state: RecState,
    id: string,
    change: (c: RecState["cands"][number]) => RecState["cands"][number],
  ): RecState["cands"] {
    return state.cands.map((c) => (c.id === id ? change(c) : c));
  }

  "score.rate"(msg: Message, state: RecState): Effect[] {
    const [skill, value] = msg.payload as [string, number];
    const cands = this._update(state, state.selected, (c) => ({
      ...c,
      ratings: setRating(c.ratings, skill, value),
    }));
    return this._commit(state, { cands });
  }

  "card.advance"(_msg: Message, state: RecState): Effect[] {
    const c = candById(state.cands, state.selected);
    const { candidate, problem } = advance(c, state.offers, TODAY);
    if (problem) return notice(problem);
    const cands = this._update(state, c.id, () => candidate);
    return [
      ...this._commit(state, { cands }),
      ...notice(`${c.name} moved to ${candidate.stage}`),
    ];
  }

  "card.reject"(_msg: Message, state: RecState): Effect[] {
    const c = candById(state.cands, state.selected);
    const cands = this._update(state, c.id, reject);
    return [
      ...this._commit(state, { cands }),
      ...notice(`${c.name} was rejected`),
    ];
  }

  "card.offer"(_msg: Message, state: RecState): Effect[] {
    return this._openOffer(state);
  }

  // ---- interviews
  "agenda.pick"(msg: Message, state: RecState): Effect[] {
    const i = state.interviews.find((x) => x.id === msg.payload);
    return i
      ? [
          ...this._commit(state, { selected: i.cand }),
          ...this._go("candidate", "Candidate"),
        ]
      : [];
  }

  // ---- the sheet
  "sheet.close"(_msg: Message, state: RecState): Effect[] {
    return this._closeSheet(state);
  }

  "sheet.field"(msg: Message, state: RecState): Effect[] {
    const fields = withValue(
      state.sheet.fields,
      msg.payload as string,
      msg.event?.value ?? "",
    );
    return patch({ sheet: { ...state.sheet, fields } });
  }

  "sheet.press"(_msg: Message, state: RecState): Effect[] {
    const sheet = state.sheet;
    if (sheet.kind === "offer") {
      const c = candById(state.cands, sheet.cand);
      const draft = offerDraftOf(sheet.fields);
      const job = jobById(state.jobs, c.job);
      const errors = validateOffer(draft, job, TODAY);
      if (Object.keys(errors).length > 0) {
        return patch({ sheet: offerSheet(c, job, draft, errors) });
      }
      const cands = this._update(state, c.id, (x) =>
        x.stage === "hired" ? x : { ...x, stage: "offer" },
      );
      return [
        ...this._commit(state, {
          offers: saveOffer(state.offers, c.id, draft, TODAY),
          cands,
        }),
        ...this._closeSheet(state),
        ...notice(`Offer sent to ${c.name}`),
      ];
    }
    const draft = interviewDraftOf(sheet.fields);
    const errors = validateInterview(draft, state.interviews, TODAY);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: interviewSheet(state.cands, draft, errors) });
    }
    return [
      ...this._commit(state, {
        interviews: addInterview(state.interviews, draft),
      }),
      ...this._closeSheet(state),
      ...this._go("interviews", "Interviews"),
      ...notice("Interview scheduled"),
    ];
  }
}

export const page = new RecruitingPipeline();
