/**
 * The "communities" module: the list (All / Mine, search), a form to create one, and a
 * community page with its wall (same cards and composer as a user wall), contacts,
 * members (with moderation) and, for the owner, the settings. Rules: community.ts.
 */
import {
  byId,
  type Handler,
  type Module,
  type OrbitState,
  type Update,
} from "../../core.ts";
import { glyphOf, initialsOf, isUpload, pictureStyle } from "../../pictures.ts";
import type { Community, Db } from "../../schema.ts";
import type { HeaderView } from "../wall/index.ts";
import {
  deriveFeed,
  type FeedUi,
  type FeedView,
  feedHandlers,
  initialFeedUi,
  type PagerView,
  pagerView,
  PICTURES,
  type Scope,
} from "../wall/posts.ts";
import {
  canManage,
  type CommunityCard,
  type CommunityForm,
  communityRemoval,
  createCommunity,
  cardOf,
  createdLabel,
  emptyCommunityForm,
  filterCommunities,
  formOfCommunity,
  isMember,
  joinCommunity,
  LIST_PAGE,
  leaveCommunity,
  type ListTab,
  membersLabel,
  memberCount,
  membersPage,
  type PersonView,
  removeMember,
  ROLE_LABEL,
  ROLE_TONE,
  roleOf,
  setModerator,
  toggleContact,
  updateCommunity,
} from "./community.ts";

export type CommunityMode = "list" | "create" | "page";
export type CommunityTab = "wall" | "members" | "settings";

export interface CommunityFormView {
  heading: string;
  saveLabel: string;
  name: string;
  description: string;
  canCancel: boolean;
  errors: { name: string; description: string };
  covers: { i: number; style: string; glyph: string; selected: boolean }[];
}

export interface ContactView {
  id: number;
  name: string;
  avatarStyle: string;
  avatarText: string;
  role: string;
  canMessage: boolean;
}

export interface CommunitiesState {
  mode: CommunityMode;
  tab: ListTab;
  query: string;
  page: number;
  communityId: number;
  pageTab: CommunityTab;
  memberQuery: string;
  memberPage: number;
  form: CommunityForm;
  contactQuery: string;
  confirmDelete: boolean;
  forMe: number;
  ui: FeedUi;
  // derived: the list
  tabs: { id: string; label: string; active: boolean }[];
  cards: CommunityCard[];
  pager: PagerView;
  empty: string;
  canCreate: boolean;
  formView: CommunityFormView;
  // derived: a community page
  title: string;
  header: HeaderView;
  pageTabs: { id: string; label: string; active: boolean }[];
  feed: FeedView;
  hint: string;
  contacts: { title: string; empty: string; contacts: ContactView[] };
  members: { empty: string; members: PersonView[] };
  memberPager: PagerView;
  settingsContacts: ContactView[];
  contactResults: ContactView[];
  hasContactQuery: boolean;
  deleteLabel: string;
}

const NO_HEADER: HeaderView = {
  coverStyle: "",
  avatarStyle: "",
  avatarText: "",
  title: "",
  subtitle: "",
  about: "",
  badges: [],
  stats: [],
  actions: [],
};
const NO_PAGER: PagerView = {
  page: 1,
  pages: 1,
  total: 0,
  label: "0",
  hasPrev: false,
  hasNext: false,
  prevLabel: "Previous",
  nextLabel: "Next",
};
const NO_FEED: FeedView = {
  cards: [],
  pager: { ...NO_PAGER, prevLabel: "Newer", nextLabel: "Older" },
  composer: null,
  canPost: false,
  empty: "",
};
const NO_FORM_VIEW: CommunityFormView = {
  heading: "",
  saveLabel: "",
  name: "",
  description: "",
  canCancel: true,
  errors: { name: "", description: "" },
  covers: [],
};

export const initialCommunities = (): CommunitiesState => ({
  mode: "list",
  tab: "all",
  query: "",
  page: 1,
  communityId: 0,
  pageTab: "wall",
  memberQuery: "",
  memberPage: 1,
  form: emptyCommunityForm(),
  contactQuery: "",
  confirmDelete: false,
  forMe: 0,
  ui: initialFeedUi(),
  tabs: [],
  cards: [],
  pager: NO_PAGER,
  empty: "",
  canCreate: false,
  formView: NO_FORM_VIEW,
  title: "",
  header: NO_HEADER,
  pageTabs: [],
  feed: NO_FEED,
  hint: "",
  contacts: { title: "Contacts", empty: "", contacts: [] },
  members: { empty: "", members: [] },
  memberPager: NO_PAGER,
  settingsContacts: [],
  contactResults: [],
  hasContactQuery: false,
  deleteLabel: "Delete the community",
});

function formView(f: CommunityForm, editing: boolean): CommunityFormView {
  return {
    heading: editing ? "Settings" : "Create a community",
    saveLabel: editing ? "Save changes" : "Create",
    name: f.name,
    description: f.description,
    canCancel: true,
    errors: f.errors,
    covers: PICTURES.map((src, i) => ({
      i,
      style: pictureStyle(src),
      glyph: glyphOf(src),
      selected: src === f.wallpaper,
    })),
  };
}

function contactOf(
  db: Db,
  me: number,
  c: Community,
  id: number,
): ContactView | null {
  const u = byId(db.users).get(id);
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    avatarStyle: pictureStyle(u.avatar),
    avatarText: isUpload(u.avatar)
      ? ""
      : glyphOf(u.avatar) || initialsOf(u.name),
    role: ROLE_LABEL[roleOf(c, u.id)],
    canMessage: u.id !== me,
  };
}

const present = (x: ContactView | null): x is ContactView => x !== null;

/** The header of a community: wallpaper, name, description, role badge, Join / Leave. */
export function headerOf(
  db: Db,
  me: number,
  c: Community,
  now: string,
): HeaderView {
  const role = roleOf(c, me);
  const actions: HeaderView["actions"] = [];
  if (me > 0 && role === "none")
    actions.push({
      id: "join",
      label: "Join",
      variant: "default",
      disabled: false,
    });
  else if (role === "member" || role === "moderator")
    actions.push({
      id: "leave",
      label: "Leave",
      variant: "outline",
      disabled: false,
    });
  return {
    coverStyle: pictureStyle(c.wallpaper),
    avatarStyle: pictureStyle(c.wallpaper),
    avatarText: isUpload(c.wallpaper) ? "" : glyphOf(c.wallpaper),
    title: c.name,
    subtitle: `${membersLabel(memberCount(c))} · ${createdLabel(c, now)}`,
    about: c.description,
    badges:
      role === "none"
        ? []
        : [{ label: ROLE_LABEL[role], tone: ROLE_TONE[role] }],
    stats: [],
    actions,
  };
}

export const scopeOf = (communityId: number): Scope => ({
  kind: "community",
  communityId,
});

function derive(state: OrbitState): CommunitiesState {
  let s = state.communities;
  const { db, me } = state;
  if (s.forMe !== me) s = { ...initialCommunities(), forMe: me };
  const community = byId(db.communities).get(s.communityId);
  const mode: CommunityMode = s.mode === "page" && !community ? "list" : s.mode;
  const base: CommunitiesState = { ...s, mode, canCreate: me > 0 };

  if (mode === "create") return { ...base, formView: formView(s.form, false) };

  if (mode === "list") {
    const found = filterCommunities(db, me, s.tab, s.query);
    const pager = pagerView(
      s.page,
      LIST_PAGE,
      found.length,
      found.length === 1 ? "community" : "communities",
      ["Previous", "Next"],
    );
    return {
      ...base,
      page: pager.page,
      tabs: [
        { id: "all", label: "All", active: s.tab === "all" },
        { id: "mine", label: "Mine", active: s.tab === "mine" },
      ],
      cards: found
        .slice((pager.page - 1) * LIST_PAGE, pager.page * LIST_PAGE)
        .map((c) => cardOf(c, me)),
      pager,
      empty:
        s.tab === "mine" && !s.query.trim()
          ? "You have not joined any community yet. Open All and join one."
          : "No communities match.",
    };
  }

  const c = community as Community;
  const manage = canManage(db, me, c);
  const pageTab: CommunityTab =
    s.pageTab === "settings" && !manage ? "wall" : s.pageTab;
  const out: CommunitiesState = {
    ...base,
    pageTab,
    title: c.name,
    header: headerOf(db, me, c, state.now),
    pageTabs: [
      { id: "wall", label: "Wall", active: pageTab === "wall" },
      {
        id: "members",
        label: `Members (${memberCount(c)})`,
        active: pageTab === "members",
      },
      ...(manage
        ? [
            {
              id: "settings",
              label: "Settings",
              active: pageTab === "settings",
            },
          ]
        : []),
    ],
  };
  if (pageTab === "wall") {
    const r = deriveFeed(
      db,
      me,
      state.now,
      scopeOf(c.id),
      s.ui,
      "Nothing here yet. Members can write the first post.",
    );
    return {
      ...out,
      ui: r.ui,
      feed: r.feed,
      hint: r.feed.canPost
        ? ""
        : me > 0
          ? "Join the community to write on its wall."
          : "",
      contacts: {
        title: "Contacts",
        empty: "This community has no contacts yet.",
        contacts: c.contactIds
          .map((id) => contactOf(db, me, c, id))
          .filter(present),
      },
    };
  }
  if (pageTab === "members") {
    const m = membersPage(db, me, c, s.memberQuery, s.memberPage);
    return {
      ...out,
      memberPage: m.page,
      members: { empty: "No members match.", members: m.people },
      memberPager: pagerView(
        m.page,
        10,
        m.total,
        m.total === 1 ? "person" : "people",
        ["Previous", "Next"],
      ),
    };
  }
  // settings
  const q = s.contactQuery.trim().toLowerCase();
  const results: ContactView[] = [];
  if (q) {
    for (const id of [c.ownerId, ...c.moderatorIds, ...c.memberIds]) {
      if (results.length >= 8) break;
      const u = byId(db.users).get(id);
      if (
        u &&
        !c.contactIds.includes(id) &&
        u.name.toLowerCase().includes(q) &&
        !results.some((r) => r.id === id)
      ) {
        const v = contactOf(db, me, c, id);
        if (v) results.push(v);
      }
    }
  }
  return {
    ...out,
    formView: formView(s.form, true),
    settingsContacts: c.contactIds
      .map((id) => contactOf(db, me, c, id))
      .filter(present),
    contactResults: results,
    hasContactQuery: q !== "",
    deleteLabel: s.confirmDelete
      ? "Click again to delete it with all its posts"
      : "Delete the community",
  };
}

// ---- handlers ----

const text = (e: { value?: string } | undefined): string =>
  String(e?.value ?? "");
const communityOf = (s: OrbitState): Community | undefined =>
  byId(s.db.communities).get(s.communities.communityId);
const putCommunity = (c: Community | null, notice?: string): Update | void =>
  c ? { put: { communities: [c] }, notice } : undefined;
const feed = feedHandlers("communities", (s) =>
  s.communities.mode === "page" && communityOf(s)
    ? scopeOf(s.communities.communityId)
    : null,
);

const openPage = (id: number): Update => ({
  slice: {
    mode: "page",
    communityId: id,
    pageTab: "wall",
    memberQuery: "",
    memberPage: 1,
    ui: initialFeedUi(),
    confirmDelete: false,
  },
});

const handlers: Record<string, Handler> = {
  // the list
  search: (_p, e) => ({ slice: { query: text(e), page: 1 } }),
  pickTab: (id) => ({
    slice: { tab: id === "mine" ? "mine" : "all", page: 1 },
  }),
  "pager.prev": (_p, _e, s) => ({
    slice: { page: Math.max(1, s.communities.page - 1) },
  }),
  "pager.next": (_p, _e, s) => ({ slice: { page: s.communities.page + 1 } }),
  "card.open": (id) => openPage(Number(id)),
  create: (_p, _e, s) =>
    s.me > 0
      ? { slice: { mode: "create", form: emptyCommunityForm() } }
      : undefined,
  back: () => ({ slice: { mode: "list", confirmDelete: false } }),

  // the form (create and settings)
  "form.setName": (_p, e, s) => ({
    slice: {
      form: {
        ...s.communities.form,
        name: text(e),
        errors: { ...s.communities.form.errors, name: "" },
      },
    },
  }),
  "form.setDescription": (_p, e, s) => ({
    slice: {
      form: {
        ...s.communities.form,
        description: text(e),
        errors: { ...s.communities.form.errors, description: "" },
      },
    },
  }),
  "form.pickWallpaper": (i, _e, s) => ({
    slice: {
      form: {
        ...s.communities.form,
        wallpaper: PICTURES[Number(i)] ?? s.communities.form.wallpaper,
      },
    },
  }),
  "form.cancel": (_p, _e, s) => {
    const c = communityOf(s);
    return s.communities.mode === "page" && c
      ? { slice: { form: formOfCommunity(c) } }
      : { slice: { mode: "list" } };
  },
  "form.save": (_p, _e, s) => {
    const f = s.communities.form;
    if (s.communities.mode === "create") {
      const r = createCommunity(s.db, s.me, f, s.now);
      if (!r.community) return { slice: { form: { ...f, errors: r.errors } } };
      return {
        put: { communities: [r.community] },
        ...openPage(r.community.id),
        notice: "Community created",
      };
    }
    const c = communityOf(s);
    if (!c) return;
    const r = updateCommunity(s.db, s.me, c, f);
    if (!r.community) return { slice: { form: { ...f, errors: r.errors } } };
    return {
      put: { communities: [r.community] },
      slice: { form: formOfCommunity(r.community) },
      notice: "Settings saved",
    };
  },

  // a community page
  "header.action": (id, _e, s) => {
    const c = communityOf(s);
    if (!c) return;
    if (id === "join")
      return putCommunity(joinCommunity(c, s.me), "You joined the community");
    if (id === "leave")
      return putCommunity(leaveCommunity(c, s.me), "You left the community");
  },
  openTab: (id, _e, s) => {
    const c = communityOf(s);
    const tab: CommunityTab =
      id === "members"
        ? "members"
        : id === "settings" && c && canManage(s.db, s.me, c)
          ? "settings"
          : "wall";
    return {
      slice: {
        pageTab: tab,
        memberQuery: "",
        memberPage: 1,
        contactQuery: "",
        confirmDelete: false,
        ui: { ...s.communities.ui, page: 1, openId: 0, shareId: 0 },
        form: tab === "settings" && c ? formOfCommunity(c) : s.communities.form,
      },
    };
  },
  ...feed,
  "fpager.prev": feed.newer,
  "fpager.next": feed.older,
  "contacts.open": (id) => ({
    go: { screen: "wall", params: { userId: Number(id) } },
  }),
  "contacts.message": (id) => ({
    go: { screen: "messages", params: { userId: Number(id) } },
  }),

  // members
  setMemberQuery: (_p, e) => ({
    slice: { memberQuery: text(e), memberPage: 1 },
  }),
  "mpager.prev": (_p, _e, s) => ({
    slice: { memberPage: Math.max(1, s.communities.memberPage - 1) },
  }),
  "mpager.next": (_p, _e, s) => ({
    slice: { memberPage: s.communities.memberPage + 1 },
  }),
  "members.open": (id) => ({
    go: { screen: "wall", params: { userId: Number(id) } },
  }),
  "members.message": (id) => ({
    go: { screen: "messages", params: { userId: Number(id) } },
  }),
  "members.promote": (id, _e, s) => {
    const c = communityOf(s);
    return c
      ? putCommunity(
          setModerator(s.db, c, s.me, Number(id), true),
          "Made a moderator",
        )
      : undefined;
  },
  "members.demote": (id, _e, s) => {
    const c = communityOf(s);
    return c
      ? putCommunity(
          setModerator(s.db, c, s.me, Number(id), false),
          "Moderator role removed",
        )
      : undefined;
  },
  "members.remove": (id, _e, s) => {
    const c = communityOf(s);
    return c
      ? putCommunity(removeMember(s.db, c, s.me, Number(id)), "Member removed")
      : undefined;
  },

  // settings
  setContactQuery: (_p, e) => ({ slice: { contactQuery: text(e) } }),
  addContact: (id, _e, s) => {
    const c = communityOf(s);
    if (!c || c.contactIds.includes(Number(id))) return;
    return putCommunity(
      toggleContact(s.db, c, s.me, Number(id)),
      "Contact added",
    );
  },
  removeContact: (id, _e, s) => {
    const c = communityOf(s);
    if (!c || !c.contactIds.includes(Number(id))) return;
    return putCommunity(
      toggleContact(s.db, c, s.me, Number(id)),
      "Contact removed",
    );
  },
  deleteCommunity: (_p, _e, s) => {
    const c = communityOf(s);
    if (!c || !canManage(s.db, s.me, c))
      return { notice: "Only the owner can delete the community" };
    if (!s.communities.confirmDelete) return { slice: { confirmDelete: true } };
    const r = communityRemoval(s.db, c.id);
    return {
      remove: {
        communities: r.communities,
        posts: r.posts,
        comments: r.comments,
      },
      slice: { mode: "list", communityId: 0, confirmDelete: false },
      notice: "Community deleted",
    };
  },
};

export const communitiesModule: Module<CommunitiesState> = {
  key: "communities",
  screens: ["communities"],
  initial: initialCommunities,
  derive,
  enter: (params, state) => {
    const id = Number(params?.communityId) || 0;
    const base = { ...initialCommunities(), forMe: state.me };
    return { slice: id ? { ...base, ...openPage(id).slice } : base };
  },
  handlers,
};
