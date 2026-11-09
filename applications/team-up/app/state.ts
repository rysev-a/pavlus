/**
 * The application state and its shape. This is data, only data: the views
 * render it, the handlers replace it through the store, and it never holds
 * components or DOM nodes — so the same state renders on the server and in
 * the browser. Each page owns one slice of it, the route included.
 */

import type { Route } from "@pavlus/frontend";

/** The languages the site speaks. */
export type Locale = "en" | "ru";

/**
 * The full address of the page.
 *
 * A routed child does not see the whole address in `route.path`: the router
 * keeps the matched pattern in `route.base` and leaves the rest in `path`
 * (for the pattern `/app/admin/tasks` the path is `/`). A page that needs to
 * know where it stands — which section of the back office, which of the
 * recovery forms — asks this helper.
 */
export const routePath = (route?: Route | null): string =>
  route?.base || route?.path || "";

/** What `GET /api/auth/me` answers (or null: a guest). */
export interface Me {
  id: number;
  email: string;
  name: string;
  slug: string;
  city: string;
  status: string;
  /** The language of the account. */
  locale: string;
  /** The member may open the back office. */
  isAdmin: boolean;
}

/** The computed match of a slot (the engine of `backend/match.ts`). */
export interface FeedMatch {
  percent: number | null;
  gradeOk: boolean;
  details: string[];
  note: string;
}

/** One open slot of the match feed, with its computed match. */
export interface FeedSlot {
  id: number;
  professionId: number;
  /** The slug of the profession (the filters speak slugs). */
  profession: string;
  professionName: string;
  bucket: string;
  /** "Frontend developer · middle" — the translation lives on the server. */
  title: string;
  description: string;
  /** What the slot pays ("" when it says nothing). */
  payLabel: string;
  /** The member already has a pending application for this slot. */
  applied: boolean;
  skills: { skillId: number; name: string; level: number }[];
  match: FeedMatch | null;
  /** Why the percent is what it is: "Rust 8/7 ✓", "grade too low". */
  why: string[];
}

/** One project of the match feed (the original's `MatchFeedItem`). */
export interface FeedProject {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  kind: string;
  kindLabel: string;
  city: string;
  budget: number | null;
  budgetCurrency: string;
  budgetLabel: string;
  deadline: string;
  deadlineLabel: string;
  ownerName: string;
  /** "Founder: Anna · Designer · senior" (the founder's line). */
  ownerLabel: string;
  openSlots: number;
  /** The best percent among the listed slots (null: no slot fits). */
  bestPercent: number | null;
  /** Every opening of the project already has my application. */
  allApplied: boolean;
  slots: FeedSlot[];
}

/**
 * One node of the skill tree (the original's `render_node`): a branch (a
 * collapsible group of skills) or a leaf (a rated skill).
 */
export interface SkillNode {
  id: number;
  slug: string;
  name: string;
  /** The children of a branch (empty for a leaf). */
  children: SkillNode[];
  /** A branch starts expanded: the first two levels, deeper ones hold a rating. */
  open: boolean;
  /** The rating of a leaf (null: none). */
  level: number | null;
  /** The zone of the rating ("junior", "middle", …; empty when there is none). */
  zone: string;
  /** "5 · Middle" — the rating as it is shown. */
  levelLabel: string;
  /** The label of the meter for this skill ("Level: rust"). */
  aria: string;
}

/**
 * The skill tree (the original's `skills_tree`): the branches of the
 * directory's skills and the ten-segment meter that rates a leaf. The page
 * that shows it owns the slice; the tree and its leaves are its children.
 */
export interface SkillTreeSlice {
  /** The roots of the tree (the skills of the profession). */
  roots: SkillNode[];
  /** The ten segments of the meter (the number and its zone). */
  segments: { n: number; zone: string }[];
  /** The segment under the pointer (the preview of the rating): the skill, the number. */
  hover: { skillId: number; level: number };
  /** The ratings of the leaves (by the skill's id). */
  levels: { skillId: number; level: number }[];
  /** The labels of the zones ("junior" → "Junior"), translated by the backend. */
  zones: Record<string, string>;
  /** The texts of the tree (translated by the backend). */
  strings: Record<string, string>;
}

/** One slot of the project page (the app's view of it). */
export interface ProjectSlot {
  id: number;
  profession: string;
  professionId: number;
  professionSlug: string;
  bucket: string;
  description: string;
  pay: string | null;
  payFrom: number | null;
  payTo: number | null;
  currency: string | null;
  userId: number | null;
  userName: string | null;
  userSlug: string | null;
  /** `open`, `invited`, `joined` or `left`. */
  status: string;
  invitedByName: string | null;
  invitedBySlug: string | null;
  /** The invitation is addressed to the viewer. */
  invitedMe: boolean;
  /** The viewer sent the invitation. */
  invitedByMe: boolean;
  /** The viewer's own application on this slot. */
  myApplication: { id: number; status: string } | null;
  skills: { skillId: number; name: string; level: number }[];
  /** "Backend developer · middle" (translated). */
  label: string;
  /** The pay of the opening (translated). */
  payLabel: string;
  /** The status of the opening (translated). */
  statusLabel: string;
  /** The skills of the opening ("Rust 8+"). */
  skillsLabel: string[];
}

/** One member of a project's team. */
export interface TeamMember {
  userId: number;
  slug: string;
  name: string;
  professionName: string | null;
  bucket: string | null;
  isOwner: boolean;
  initials: string;
  /** The role in the team ("Founder" or "Backend developer · middle"). */
  role: string;
  /** The role with the grade ("Senior Backend developer"). */
  roleLabel: string;
}

/** One application in the owner's inbox. */
export interface InboxItem {
  id: number;
  slotId: number;
  userId: number;
  userName: string;
  userSlug: string;
  message: string;
  bucket: string | null;
  /** The profession of the opening. */
  profession: string;
  /** The profession the applicant applied with. */
  appliedProfession: string | null;
  status: string;
}

/** One candidate of an opening (the owner's preview). */
export interface Candidate {
  userId: number;
  slug: string;
  name: string;
  city: string;
  role: string;
  percent: number | null;
  why: string;
  initials: string;
}

/** The project as the app's page sees it. */
export interface ProjectView {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  kind: string;
  kindLabel: string;
  tags: string[];
  status: string;
  statusLabel: string;
  workMode: string;
  workModeLabel: string;
  city: string;
  website: string;
  budget: number | null;
  budgetCurrency: string | null;
  budgetLabel: string;
  deadline: string | null;
  deadlineLabel: string;
  owner: string;
  ownerId: number;
  ownerSlug: string;
  ownerProfession: string | null;
  ownerBucket: string | null;
  ownerRole: string;
  isOwner: boolean;
  isMember: boolean;
  teamChatId: number | null;
  openCount: number;
  lookingLabel: string;
  founderLabel: string;
  slots: ProjectSlot[];
}

/** The form of the project (the owner's edit). */
export interface ProjectForm {
  name: string;
  tagline: string;
  description: string;
  kind: string;
  status: string;
  workMode: string;
  city: string;
  website: string;
  tags: string;
  budget: string;
  budgetCurrency: string;
  deadline: string;
}

/** The form of an opening (the owner's edit). */
export interface SlotForm {
  professionId: number;
  bucket: string;
  description: string;
  pay: string;
  payFrom: string;
  payTo: string;
  currency: string;
}

/** The invitation form of an opening (the owner invites a friend). */
export interface InviteForm {
  open: boolean;
  slotId: number;
  who: string;
}

/** The project page (`/app/projects/:slug`). */
export interface ProjectSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The slug of the project. */
  slug: string;
  /** The project as the backend sees it. */
  project: ProjectView | null;
  /** The team of the project. */
  team: TeamMember[];
  /** The owner's inbox: the applications waiting for an answer. */
  inbox: InboxItem[];
  /** My friends (the invitation form offers them). */
  friends: FriendCard[];
  /** The candidates of an opening (the owner's preview). */
  candidates: Record<string, Candidate[]>;
  /** The professions of the directory (the opening's form). */
  professions: { id: number; slug: string; name: string }[];
  /** The grades of the directory (the opening's form). */
  buckets: { value: string; label: string }[];
  /** The skill tree (the branches and the meter that rates a leaf). */
  tree: SkillTreeSlice;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
  /** What went wrong (the backend's words). */
  error: string;
  /** What the last action said. */
  notice: string;
  /** The request is in flight. */
  busy: boolean;
  /** The project is being edited (the owner's form). */
  editing: boolean;
  /** "" (closed), `new` or the id of the opening being edited. */
  slotMode: string;
  /** The form of the project (the owner's edit). */
  projectForm: ProjectForm;
  /** The form of an opening (the owner's edit). */
  slotForm: SlotForm;
  /** The invitation form of an opening. */
  invite: InviteForm;
  /** The apply dialog of the page. */
  apply: ApplySlice;
  /** The report dialog of the page. */
  report: ReportSlice;
}

/** One chat thread of the inbox. */
export interface Thread {
  id: number;
  type: string;
  projectId: number | null;
  title: string;
  unread: number;
}

/** One chat message (over http or the live ws frame). */
export interface ChatMessage {
  id: number;
  threadId: number;
  userId: number;
  author: string;
  body: string;
  sentAt: string;
}

/** The public profile page. */
export interface Profile {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  status: string;
  professions: { slug: string; name: string; bucket: string | null }[];
  skills: { slug: string; name: string; level: number | null }[];
}

/* ---------------------------------------------------------- the public site */

/** The texts of the header and the footer. */
export interface SiteStrings {
  projects: string;
  blog: string;
  members: string;
  about: string;
  signIn: string;
  myAccount: string;
  language: string;
  openMenu: string;
  closeMenu: string;
  footerBlurb: string;
  contacts: string;
  findUs: string;
  address: string;
  privacy: string;
  copyright: string;
}

/** The shell of the public site: the language, the visitor, the texts. */
export interface SiteSlice {
  /** The language of the page. */
  lang: Locale;
  /** The burger menu of the header: it is open or it is not. */
  burger: boolean;
  /** The languages the site speaks; `active` marks the current one. */
  locales: { code: Locale; name: string; active: boolean }[];
  /** The visitor in the header. */
  nav: {
    signedIn: boolean;
    email: string;
    initials: string;
    avatarClass: string;
  };
  strings: SiteStrings;
}

/** A card of the blog (the list and the landing page). */
export interface PostCard {
  pid: string;
  date: string;
  title: string;
  excerpt: string;
  tags: string[];
}

/** One post of the blog page. */
export interface PostView extends PostCard {
  paragraphs: string[];
}

/** A link of a filter row or a sort row. */
export interface NavLink {
  title: string;
  href: string;
  active: boolean;
}

/** One page of a pager. */
export interface PageLink {
  label: string;
  href: string;
  current: boolean;
  gap: boolean;
}

/** One chip of a filter row. */
export interface FilterOption {
  value: string;
  label: string;
  checked: boolean;
  href: string;
}

/** One member of the public directory. */
export interface MemberCard {
  slug: string;
  name: string;
  role: string;
  roleClass: string;
  bio: string;
  city: string;
  labels: string[];
  professions: string[];
  tags: string[];
  initials: string;
  avatarClass: string;
}

/** The members page (`/users`). */
export interface MembersSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  users: MemberCard[];
  pager: PageLink[];
  sorts: FilterOption[];
  labels: FilterOption[];
  cities: FilterOption[];
  statuses: FilterOption[];
  levels: FilterOption[];
  filtersActive: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: {
    title: string;
    sort: string;
    level: string;
    labels: string;
    city: string;
    status: string;
    reset: string;
    empty: string;
  };
}

/**
 * The report dialog: what is reported and what the backend answered. The
 * page that shows the dialog holds its own copy (the dialog is its child),
 * so two pages never share one.
 */
export interface ReportSlice {
  /** The dialog is open. */
  open: boolean;
  /** What is reported: "person", "project" or "message". */
  kind: string;
  /** The target of the report (the slug of the member or of the project). */
  target: string;
  /** The reason: "spam", "abuse", "fake" or "other". */
  reason: string;
  /** A few words about it (at most 500 characters). */
  details: string;
  /** The last answer of the backend (its own text, translated). */
  error: string;
  /** The report is sent: the dialog shows the thanks instead of the form. */
  done: boolean;
  /** The heading of the dialog ("Report: {name}"). */
  title: string;
}

/** The report state a closed dialog has. */
const closedReport: ReportSlice = {
  open: false,
  kind: "person",
  target: "",
  reason: "spam",
  details: "",
  error: "",
  done: false,
  title: "",
};

/** The member page (`/users/:slug`). */
export interface MemberSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  user: MemberCard | null;
  skillGroups: SkillGroup[];
  since: string;
  friend: { slug: string; relation: string };
  /** The report dialog of the page. */
  report: ReportSlice;
}

/** One group of skills (one per profession). */
export interface SkillGroup {
  title: string;
  skills: SkillBar[];
}

/** One skill bar (ten segments). */
export interface SkillBar {
  slug: string;
  name: string;
  level: number;
  segments: string[];
}

/** The home page (`/`). */
export interface HomeSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  hero: {
    badge: string;
    title: RichPart[];
    lead: string;
    buttons: { text: string; href: string; bg: boolean }[];
    members: RichPart[];
  };
  difficult: {
    title: RichPart[];
    blocks: { title: string; text: string; hue: string; image: string }[];
  };
  job: {
    title: RichPart[];
    steps: { n: string; title: string; text: string; image: string }[];
    inner: {
      kicker: string;
      title: string;
      items: string[];
      button: string;
      href: string;
      hue: string;
      images: string[];
    }[];
  };
  blog: {
    title: string;
    all: string;
    posts: { pid: string; title: string; excerpt: string; image: string }[];
  };
  reviews: {
    title: RichPart[];
    items: {
      name: string;
      role: string;
      text: string;
      image: string;
      hue: string;
      small: boolean;
    }[];
  };
}

/** One part of a text with an accent (the original's `|safe` markup). */
export interface RichPart {
  text: string;
  /** The part is the accented one (the blue word of a title). */
  accent: boolean;
  /** A line break before this part (the original's `<br />`). */
  br?: boolean;
}

/** The about page (`/about`): the copy of the original's about.html. */
export interface AboutSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  tag: string;
  title: RichPart[];
  lead: string;
  text: string;
  cards: { title: string; text: string; hue: string }[];
  /** The "Join TeamUp" button (a guest only). */
  join: { text: string; href: string } | null;
  benefits: {
    title: RichPart[];
    groups: {
      subtitle: string;
      cards: { title: string; text: string; hue: string }[];
    }[];
  }[];
  faq: {
    title: RichPart[];
    items: { question: string; answer: string }[];
  };
}

/** The 404 page. */
export interface NotFoundSlice {
  title: string;
  text: string;
  links: { text: string; href: string }[];
}

/** The settings page (`/app/settings`). */
export interface SettingsSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  name: string;
  email: string;
  /** The language of the account. */
  locale: string;
  /** The topics of the letters. */
  topics: { applications: boolean; friends: boolean; messages: boolean };
  /** The people the member blocked. */
  blocks: { slug: string; name: string }[];
  currentPassword: string;
  newPassword: string;
  emailPassword: string;
  newEmail: string;
  deletePassword: string;
  /** What the last change said. */
  notice: string;
  /** What went wrong (the backend's words). */
  error: string;
}

/** The blog page (`/blog`). */
export interface BlogSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  posts: PostCard[];
  tags: NavLink[];
  sorts: NavLink[];
  /** The texts of the page (the translation lives in the backend). */
  strings: {
    title: string;
    sort: string;
    tags: string;
    readMore: string;
    empty: string;
  };
}

/** The blog post page (`/blog/:pid`). */
export interface BlogPostSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  post: PostView | null;
  /** The texts of the page (the translation lives in the backend). */
  strings: { back: string };
}

/** The project catalog (`/projects`). */
export interface ProjectsSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  q: string;
  /** The chips of the filter form: a field → its options. */
  filters: Record<string, FilterOption[]>;
  /** The values that are on, per field. */
  checked: Record<string, string[]>;
  sort: string;
  canMatch: boolean;
  meProfessions: string[];
  countLabel: string;
  /** The name of the search that is being saved. */
  savedName: string;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
  cards: ProjectCard[];
  pager: PageLink[];
  saved: { id: number; name: string; href: string }[];
  filtered: boolean;
}

/** One card of the project catalog. */
export interface ProjectCard {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  statusLabel: string;
  status: string;
  kind: string;
  kindLabel: string;
  workModeLabel: string;
  city: string;
  budgetLabel: string;
  deadlineLabel: string;
  ownerName: string;
  ownerRole: string;
  openSlots: number;
  isMember: boolean;
  favorite: boolean;
  slots: ProjectCardSlot[];
}

/** One open slot of a catalog card. */
export interface ProjectCardSlot {
  id: number;
  title: string;
  description: string;
  skillsLine: string;
  payLabel: string;
  matched: { percent: number; gradeOk: boolean; why: string } | null;
  matchClass: string;
}

/** The public project page (`/projects/:slug`). */
export interface ProjectPublicSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  project: ProjectPublic | null;
  /** The report dialog of the page. */
  report: ReportSlice;
}

/** One project of the public page. */
export interface ProjectPublic {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  statusLabel: string;
  status: string;
  kindLabel: string;
  kind: string;
  workModeLabel: string;
  city: string;
  website: string;
  budgetLabel: string;
  deadlineLabel: string;
  date: string;
  ownerName: string;
  ownerSlug: string;
  openCount: number;
  team: { slug: string; name: string; role: string; avatarClass: string }[];
  slots: ProjectPublicSlot[];
}

/** One slot of the public project page. */
export interface ProjectPublicSlot {
  id: number;
  title: string;
  description: string;
  skills: { name: string; level: number }[];
  payLabel: string;
  status: string;
  memberName: string;
  memberSlug: string;
}

/** The signup page (`/app/signup`): the registration form. */
export interface SignupSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  name: string;
  email: string;
  password: string;
  /** The password again — the form checks it before it sends anything. */
  confirm: string;
  /** The last error (the server's answer or the form's own check). */
  error: string;
  busy: boolean;
}

/** The new project page (`/app/projects/new`): the form that creates one. */
export interface ProjectNewSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The kind of the project: `startup`, `company` or `part-time`. */
  kind: string;
  name: string;
  tagline: string;
  description: string;
  /** The professions of the directory (the first opening's role). */
  professions: { id: number; slug: string; name: string }[];
  /** The chosen profession's id (0: the project starts without openings). */
  professionId: number;
  /** The chosen grade: `junior`, `middle`, `senior` or `lead`. */
  bucket: string;
  /** The first opening's description. */
  slotDescription: string;
  /** The slug of the project just created (the page goes to it). */
  slug: string;
  /** The last error (the server's answer or the form's own check). */
  error: string;
  busy: boolean;
}

/* --------------------------------------------------- the moderation queue */

/** One report of the moderation queue. */
export interface ModerationReport {
  id: number;
  /** What is reported: `person`, `project` or `message`. */
  kind: string;
  /** The kind's own name, translated. */
  kindLabel: string;
  /** The address of the target (the slug of a member or of a project). */
  target: string;
  /** How the target is called. */
  targetLabel: string;
  /** Why: `spam`, `abuse`, `fake` or `other`. */
  reason: string;
  /** The reason's own name, translated. */
  reasonLabel: string;
  /** A few words about it. */
  details: string;
  /** The text of a reported message. */
  excerpt: string;
  /** `open`, `actioned` or `dismissed`. */
  status: string;
  /** What was done: `dismiss`, `cancel_project`, `remove_message`, `suspend_user`. */
  action: string;
  /** The action's own name, translated. */
  actionLabel: string;
  /** The note of the moderator. */
  note: string;
  /** When the report came in. */
  createdAt: string;
  /** Who reported it. */
  reporterName: string;
  /** The member who answers for the target (empty for a project). */
  subjectSlug: string;
  subjectName: string;
  /** The member is suspended. */
  subjectSuspended: boolean;
  /** Who answered the report. */
  handledByName: string;
}

/** One suspended member. */
export interface ModerationSuspension {
  slug: string;
  name: string;
  /** When the suspension began. */
  at: string;
  /** Why the member was suspended. */
  reason: string;
}

/** The moderation page (`/app/moderation`). */
export interface ModerationSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The filter of the queue: `open`, `actioned`, `dismissed` or `all`. */
  status: string;
  /** The filters the page offers. */
  statuses: { value: string; label: string }[];
  reports: ModerationReport[];
  suspended: ModerationSuspension[];
  /** The note the moderator writes before answering a report. */
  note: string;
  /** What the backend said (translated). */
  notice: string;
  /** The moderator is answering: the buttons are off. */
  busy: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/* -------------------------------------------- the password and the account */

/**
 * The three pages of the account recovery: the forgotten password
 * (`/app/forgot`), the new password (`/app/reset`) and the verification of the
 * address (`/app/verify`). One slice, three pages.
 */
export interface AuthRecoverySlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** Which of the three the address stands for: `forgot`, `reset`, `verify`. */
  mode: string;
  /** The address of the account (the form of `/app/forgot`). */
  email: string;
  /** The one-time token (the query of `/app/reset` and of `/app/verify`). */
  token: string;
  /** The new password (the form of `/app/reset`). */
  password: string;
  /** The new password again. */
  confirm: string;
  /** What the backend said (its own text, translated). */
  error: string;
  /** The backend answered: the page shows the notice instead of the form. */
  done: boolean;
  /** The notice of the done state. */
  notice: string;
  /** The request is in flight. */
  busy: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/* ------------------------------------------------------ the back office */

/** One member of the users table of the back office. */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  slug: string;
  /** The letters of the avatar. */
  initials: string;
  /** The hue of the avatar (the ui_kit's `--hue` custom property). */
  hue: number;
  /** The roles of the member. */
  roles: string[];
  /** The permissions the roles give. */
  permissions: string[];
  /** When the member was last seen. */
  lastLoginAt: string;
  /** When the account was made. */
  createdAt: string;
  /** The member is suspended. */
  suspended: boolean;
}

/** One role of the back office. */
export interface AdminRole {
  name: string;
  /** The members who have the role. */
  members: number;
  /** The permissions the role gives. */
  permissions: string[];
  /** The role is the superuser's. */
  superuser: boolean;
}

/** One permission of the back office. */
export interface AdminPermission {
  name: string;
  /** The roles that give it. */
  roles: string[];
}

/** One session of the back office. */
export interface AdminSession {
  /** The session's id — the token itself (the port's sessions are keyed by it). */
  id: string;
  userId: number;
  userName: string;
  email: string;
  /** When the session began. */
  createdAt: string;
  /** When the session ends. */
  expiresAt: string;
}

/** One task of the system (the back office's tasks section). */
export interface AdminTask {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  /** `queued`, `running`, `done`, `failed` or `cancelled`. */
  status: string;
  statusLabel: string;
  attempts: number;
  lastError: string;
  runAt: string;
  createdAt: string;
  finishedAt: string | null;
  /** What the handler does (translated). */
  handlerLabel: string;
}

/** One handler of the tasks (the port registers three). */
export interface AdminTaskHandler {
  name: string;
  label: string;
  description: string;
}

/** The back office (`/app/admin/*`). */
export interface AdminSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The section of the back office: `users`, `roles`, `permissions`, `sessions`. */
  section: string;
  /** The sections the sidebar offers. */
  sections: { id: string; title: string; href: string }[];
  /** The title of the page (the breadcrumb's last crumb). */
  pageTitle: string;
  /** The administrator of the panel (the sidebar's account block). */
  account: { name: string; email: string; initials: string };
  /** The languages the switch offers. */
  locales: { code: string; name: string; active: boolean }[];
  /** The counters of the users page. */
  stats: { total: number; confirmed: number; admins: number };
  users: AdminUser[];
  roles: AdminRole[];
  permissions: AdminPermission[];
  sessions: AdminSession[];
  /** The tasks of the system (the tasks section). */
  tasks: AdminTask[];
  /** The handlers the port registers (the tasks form offers them). */
  taskHandlers: AdminTaskHandler[];
  /** The handler of the new task. */
  newTaskKind: string;
  /** When the new task should run. */
  newTaskRunAt: string;
  /** The name of the role to give (the form of the users table). */
  grantRole: string;
  /** The roles the form offers. */
  roleOptions: { name: string; label: string }[];
  /** The filter of the table. */
  search: string;
  /** The name of the new role (the form of the roles page). */
  newRole: string;
  /** The name of the new permission (the form of the permissions page). */
  newPermission: string;
  /** The role whose permissions are being edited (empty: none). */
  editingRole: string;
  /** The permissions of the edited role. */
  rolePermissions: string[];
  /** What the backend said (translated). */
  notice: string;
  /** What went wrong (the backend's words). */
  error: string;
  /** The request is in flight. */
  busy: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/* ----------------------------------------------- the welcome and the profile */

/** The welcome page (`/app`): it greets the member and asks for a profile. */
export interface WelcomeSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The greeting ("Welcome, {name}!"). */
  greeting: string;
  /** The profile is complete: the page says it is time to look for a project. */
  profileReady: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/** The profile of the member, as the editor of `/app/profile` needs it. */
export interface MyProfile {
  name: string;
  email: string;
  city: string;
  bio: string;
  /** The status of the member: `searching`, `open` or `not-searching`. */
  status: string;
  /** The professions of the member, with their bucket. */
  professions: { slug: string; name: string; bucket: string | null }[];
  /** The skills of the member. */
  skills: { slug: string; name: string; level: number | null }[];
}

/** The profile editor (`/app/profile`). */
export interface MyProfileSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  profile: MyProfile | null;
  /** The address of the picture (`/api/avatars/:slug`). */
  avatarUrl: string;
  /** The name the form holds. */
  name: string;
  /** The city the form holds. */
  city: string;
  /** The bio the form holds. */
  bio: string;
  /** The status the form holds: `searching`, `open` or `not-searching`. */
  status: string;
  /** The statuses the form offers. */
  statuses: { value: string; label: string }[];
  /** What the last change said. */
  notice: string;
  /** What went wrong (the backend's words). */
  error: string;
  /** The request is in flight. */
  busy: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/** One member of the friends page. */
export interface FriendCard {
  userId: number;
  slug: string;
  name: string;
  city: string;
  role: string;
  initials: string;
}

/** The friends page (`/app/friends`). */
export interface FriendsSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The requests the member received. */
  incoming: FriendCard[];
  /** The members who are friends. */
  friends: FriendCard[];
  /** The requests the member sent. */
  outgoing: FriendCard[];
  /** The request is in flight: the buttons are off. */
  busy: boolean;
  /** What went wrong (the backend's words). */
  error: string;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

/** One profession of the member (the professions page). */
export interface MyProfession {
  professionId: number;
  slug: string;
  name: string;
  /** The grade: `junior`, `middle`, `senior` or `lead`. */
  bucket: string;
}

/** One skill of the directory (the professions page). */
export interface DirectorySkill {
  id: number;
  slug: string;
  name: string;
  /** The parent skill (the tree of the skills). */
  parentId: number | null;
}

/** One skill of the member, with its rating. */
export interface MySkill {
  skillId: number;
  slug: string;
  name: string;
  /** The rating: 1..10, null when the member did not rate it. */
  level: number | null;
}

/** The professions page (`/app/professions`). */
export interface ProfessionsSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The professions of the member. */
  mine: MyProfession[];
  /** The professions of the directory. */
  available: { id: number; slug: string; name: string }[];
  /** The skills of the directory. */
  skills: DirectorySkill[];
  /** The skills of every profession (the links of the directory). */
  professionSkills: { professionId: number; skillId: number }[];
  /** The skills of the member, with their rating. */
  mySkills: MySkill[];
  /** The profession whose skills are open (the slug). */
  open: string;
  /** The skills of the open profession, with the rating of the member. */
  openSkills: {
    id: number;
    slug: string;
    name: string;
    level: number | null;
  }[];
  /** The grade of the new profession. */
  bucket: string;
  /** The grades the form offers. */
  buckets: { value: string; label: string }[];
  /** What the last change said. */
  notice: string;
  /** What went wrong (the backend's words). */
  error: string;
  /** The request is in flight. */
  busy: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
  /** The skill tree (the branches and the meter that rates a leaf). */
  tree: SkillTreeSlice;
}

/* ------------------------------------------------- the cabinet and the person */

/** One project of the cabinet's "My projects" tab. */
export interface HubProject {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  kind: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  city: string;
  deadline: string | null;
  deadlineLabel: string;
  tags: string[];
  ownerName: string;
  ownerSlug: string;
  ownerRole: string;
  openSlots: number;
  lookingLabel: string;
  founderLabel: string;
  isOwner: boolean;
  isMember: boolean;
}

/** One invitation of the activity tab (a slot waiting for the answer). */
export interface HubInvite {
  slotId: number;
  projectSlug: string;
  projectName: string;
  professionName: string;
  bucket: string;
  slotLabel: string;
  invitedByName: string | null;
  invitedBySlug: string | null;
  invitedByLabel: string;
}

/** One application of the activity tab. */
export interface HubApplication {
  id: number;
  slotId: number;
  status: string;
  statusLabel: string;
  message: string;
  bucket: string | null;
  professionId: number | null;
  projectSlug: string;
  projectName: string;
  professionName: string;
  slotLabel: string;
  asProfession: string;
  appliedAsLabel: string;
  canEdit: boolean;
  canDelete: boolean;
}

/** One slot of the apply dialog (the openings an application can go to). */
export interface DialogSlot {
  id: number;
  label: string;
  profession: string;
}

/**
 * The dialog of an application (the original's `ApplyDialog`): the opening,
 * the profession to apply with and the message. The page that shows it holds
 * its own copy, so two pages never share one.
 */
export interface ApplySlice {
  /** The dialog is open. */
  open: boolean;
  /** What "send" does: `new` (an application) or `edit` (a change). */
  mode: string;
  /** The application to change (the edit mode). */
  id: number;
  /** The opening of the new application. */
  slotId: number;
  /** The openings to choose from (the new mode). */
  slots: DialogSlot[];
  /** The heading of the dialog. */
  title: string;
  /** The profession to apply with (the slug). */
  profession: string;
  /** The id of that profession (what the backend wants). */
  professionId: number;
  /** The message of the application. */
  message: string;
  /** My professions (the id, the slug and the title). */
  professions: { professionId: number; slug: string; title: string }[];
  /** The professions are loaded. */
  loaded: boolean;
  /** The texts of the dialog (the translation lives in the backend). */
  strings: Record<string, string>;
  /** The request is in flight. */
  busy: boolean;
  /** What the backend said. */
  error: string;
  /** The application was sent: the page reloads its lists. */
  sent: boolean;
}

/** The "are you sure?" of a destructive step (the original's `ConfirmDialog`). */
export interface ConfirmSlice {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
}

/** The closed states of the two dialogs. */
export const closedApply: ApplySlice = {
  open: false,
  mode: "new",
  id: 0,
  slotId: 0,
  slots: [],
  title: "",
  profession: "",
  professionId: 0,
  message: "",
  professions: [],
  loaded: false,
  strings: {},
  busy: false,
  error: "",
  sent: false,
};

export const closedConfirm: ConfirmSlice = {
  open: false,
  title: "",
  text: "",
  confirmLabel: "",
};

/** The cabinet (`/app/projects`): my projects and the activity tab. */
export interface HubSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The tab of the page: `mine`, `activity` or `match`. */
  tab: string;
  /** My projects (the "My projects" tab). */
  mine: HubProject[];
  /** The invitations addressed to me. */
  invites: HubInvite[];
  /** My applications. */
  applications: HubApplication[];
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
  /** The match feed (the "Recommended" tab). */
  feed: {
    items: FeedProject[];
    status: "idle" | "loading" | "failed";
    /** How many projects fit the filters (the feed shows the best of them). */
    total: number;
    /** The member has a profession, so a match can be computed at all. */
    canMatch: boolean;
    /** "Showing the best 30 of 57…" (empty when everything is shown). */
    more: string;
    /** The texts of the feed (the translation lives on the backend). */
    strings: Record<string, string>;
    /** The filters of the feed. */
    filters: { q: string; role: string; grade: string };
    /** The options of the filters (the professions and the grades). */
    options: {
      professions: { slug: string; name: string }[];
      buckets: { value: string; label: string }[];
    };
  };
  /** What went wrong (the backend's words). */
  error: string;
  /** The request is in flight. */
  busy: boolean;
  /** The apply dialog of the page (the change of an application). */
  apply: ApplySlice;
  /** The confirmation of the page (the deletion of an application). */
  confirm: ConfirmSlice;
  /** The application the confirmation is about (0: none). */
  confirmAppId: number;
}

/** The person page (`/app/people/:slug`). */
export interface PersonSlice {
  /** The route of the page: its path, its query and its params. */
  route?: Route | null;

  /** The member as the viewer sees them. */
  person: Person | null;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
  /** What went wrong (the backend's words). */
  error: string;
  /** The request is in flight. */
  busy: boolean;
  /** The report dialog of the page. */
  report: ReportSlice;
}

/** The member of the person page. */
export interface Person {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  /** The status of the member (translated). */
  role: string;
  status: string;
  age: number;
  ageLabel: string;
  domains: string[];
  professions: { slug: string; name: string; bucket: string }[];
  skillGroups: {
    title: string;
    skills: {
      slug: string;
      name: string;
      level: number;
      zone: string;
      /** The meter's ten segments (the css classes). */
      segments: string[];
    }[];
  }[];
  /** The relation with the viewer: `self`, `none`, `waiting`, `incoming`, `friends`. */
  relation: string;
  /** The viewer blocked the member. */
  blocked: boolean;
  /** The contacts (the friends and the member see them; else null). */
  contacts: string | null;
  initials: string;
}

export interface AppState {
  /** Where we are; null until the router plugin reports it. */
  route: Route | null;
  /** Who is signed in; null until asked, `false` while asking. */
  me: Me | null | false;
  /** The shell: the avatar dropdown's open flag. */
  shell: { menu: boolean; app: boolean; unread: number };
  /** The public site's shell (the header and the footer). */
  site: SiteSlice;
  /** The login page (`/app/login`): the form's values and its last error. */
  login: {
    email: string;
    password: string;
    error: string;
    busy: boolean;
  };
  /** The signup page (`/app/signup`): the registration form. */
  signup: SignupSlice;
  /** A project page (`/app/projects/:slug`). */
  project: ProjectSlice;
  /** The cabinet of the app (`/app/projects`). */
  hub: HubSlice;
  /** The person page (`/app/people/:slug`). */
  person: PersonSlice;
  /** The new project page (`/app/projects/new`): the form that creates one. */
  projectNew: ProjectNewSlice;
  /** The chat page (`/app/chat`). */
  chat: {
    threads: Thread[];
    /** The open thread's messages, oldest first. */
    messages: ChatMessage[];
    /** The open thread's id (0: the inbox list only). */
    open: number;
    /** The open thread's title (the chat header shows it). */
    openTitle: string;
    /** The ws connection: "" down, "connecting", "live". */
    live: "" | "connecting" | "live";
    /** What the composer holds. */
    draft: string;
  };
  /** The home page (`/`). */
  home: HomeSlice;
  /** The about page (`/about`). */
  about: AboutSlice;
  /** The 404 page. */
  notFound: NotFoundSlice;
  /** The blog page (`/blog`). */
  settings: SettingsSlice;
  blog: BlogSlice;
  /** The blog post page (`/blog/:pid`). */
  blogPost: BlogPostSlice;
  /** The project catalog (`/projects`). */
  projects: ProjectsSlice;
  /** The public project page (`/projects/:slug`). */
  projectPublic: ProjectPublicSlice;
  /** The members page (`/users`). */
  members: MembersSlice;
  /** The member page (`/users/:slug`). */
  member: MemberSlice;
  /** The report dialog (the page that shows it holds its own copy). */
  report: ReportSlice;
  /** The moderation queue (`/app/moderation`). */
  moderation: ModerationSlice;
  /** The friends page (`/app/friends`). */
  friends: FriendsSlice;
  /** The professions page (`/app/professions`). */
  professions: ProfessionsSlice;
  /** The account recovery (`/app/forgot`, `/app/reset`, `/app/verify`). */
  authRecovery: AuthRecoverySlice;
  /** The back office (`/app/admin/*`). */
  admin: AdminSlice;
  /** The welcome page (`/app`). */
  welcome: WelcomeSlice;
  /** The profile editor (`/app/profile`). */
  myProfile: MyProfileSlice;
}

export const initialState: AppState = {
  route: null,
  me: false,
  shell: { menu: false, app: false, unread: 0 },
  site: {
    lang: "en",
    burger: false,
    locales: [],
    nav: { signedIn: false, email: "", initials: "", avatarClass: "" },
    strings: {
      projects: "Projects",
      blog: "Blog",
      members: "Members",
      about: "About",
      signIn: "Sign in",
      myAccount: "My account",
      language: "Language",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      footerBlurb:
        "TeamUp is a service for those who want to launch a project but not alone. Find like-minded people, build a team and grow your idea together.",
      contacts: "Contacts",
      findUs: "Find us on social media",
      address: "1 Example Street, Moscow",
      privacy: "Privacy policy",
      copyright: "© 2026 TeamUp, a team-finding service.",
    },
  },
  login: {
    email: "bob@team.up",
    password: "teamup123",
    error: "",
    busy: false,
  },
  signup: {
    name: "",
    email: "",
    password: "",
    confirm: "",
    error: "",
    busy: false,
  },
  project: {
    route: null,
    slug: "",
    project: null,
    team: [],
    inbox: [],
    friends: [],
    candidates: {},
    professions: [],
    buckets: [],
    tree: {
      roots: [],
      segments: [],
      hover: { skillId: 0, level: 0 },
      levels: [],
      zones: {},
      strings: {},
    },
    strings: {},
    error: "",
    notice: "",
    busy: false,
    editing: false,
    slotMode: "",
    projectForm: {
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
    },
    slotForm: {
      professionId: 0,
      bucket: "middle",
      description: "",
      pay: "",
      payFrom: "",
      payTo: "",
      currency: "RUB",
    },
    invite: { open: false, slotId: 0, who: "" },
    apply: { ...closedApply },
    report: { ...closedReport },
  },
  hub: {
    route: null,
    tab: "mine",
    mine: [],
    invites: [],
    applications: [],
    strings: {
      title: "My projects",
      loading: "Loading…",
      error: "The list could not be loaded.",
    },
    feed: {
      items: [],
      status: "idle",
      total: 0,
      canMatch: true,
      more: "",
      strings: {},
      filters: { q: "", role: "", grade: "" },
      options: { professions: [], buckets: [] },
    },
    error: "",
    busy: false,
    apply: { ...closedApply },
    confirm: { ...closedConfirm },
    confirmAppId: 0,
  },
  person: {
    route: null,
    person: null,
    strings: {
      loading: "Loading…",
    },
    error: "",
    busy: false,
    report: { ...closedReport },
  },
  projectNew: {
    kind: "startup",
    name: "",
    tagline: "",
    description: "",
    professions: [],
    professionId: 0,
    bucket: "",
    slotDescription: "",
    slug: "",
    error: "",
    busy: false,
  },
  chat: {
    threads: [],
    messages: [],
    open: 0,
    openTitle: "",
    live: "",
    draft: "",
  },
  settings: {
    name: "",
    email: "",
    locale: "en",
    topics: { applications: true, friends: true, messages: true },
    blocks: [],
    currentPassword: "",
    newPassword: "",
    emailPassword: "",
    newEmail: "",
    deletePassword: "",
    notice: "",
    error: "",
  },
  home: {
    hero: {
      badge: "",
      title: [],
      lead: "",
      buttons: [],
      members: [],
    },
    difficult: { title: [], blocks: [] },
    job: { title: [], steps: [], inner: [] },
    blog: { title: "", all: "", posts: [] },
    reviews: { title: [], items: [] },
  },
  about: {
    tag: "",
    title: [],
    lead: "",
    text: "",
    cards: [],
    join: null,
    benefits: [],
    faq: { title: [], items: [] },
  },
  notFound: { title: "", text: "", links: [] },
  blog: {
    posts: [],
    tags: [],
    sorts: [],
    strings: {
      title: "Blog",
      sort: "Sort:",
      tags: "Tags:",
      readMore: "Read more",
      empty:
        "Nothing matches these conditions. Try changing the query or resetting the filters.",
    },
  },
  blogPost: {
    post: null,
    strings: { back: "Back to the blog" },
  },
  projects: {
    q: "",
    filters: {},
    checked: {},
    sort: "match",
    canMatch: false,
    meProfessions: [],
    countLabel: "",
    savedName: "",
    strings: {},
    cards: [],
    pager: [],
    saved: [],
    filtered: false,
  },
  projectPublic: { project: null, report: { ...closedReport } },
  members: {
    users: [],
    pager: [],
    sorts: [],
    labels: [],
    cities: [],
    statuses: [],
    levels: [],
    filtersActive: false,
    strings: {
      title: "Members",
      sort: "Sort:",
      level: "Level:",
      labels: "Labels:",
      city: "City:",
      status: "Status:",
      reset: "Reset filters",
      empty:
        "Nothing matches these conditions. Try changing the query or resetting the filters.",
    },
  },
  member: {
    user: null,
    skillGroups: [],
    since: "",
    friend: { slug: "", relation: "guest" },
    report: { ...closedReport },
  },
  report: { ...closedReport },
  professions: {
    mine: [],
    available: [],
    skills: [],
    professionSkills: [],
    mySkills: [],
    open: "",
    openSkills: [],
    bucket: "",
    buckets: [],
    notice: "",
    error: "",
    busy: false,
    strings: {},
    tree: {
      roots: [],
      segments: [],
      hover: { skillId: 0, level: 0 },
      levels: [],
      zones: {},
      strings: {},
    },
  },
  friends: {
    incoming: [],
    friends: [],
    outgoing: [],
    busy: false,
    error: "",
    strings: {},
  },
  moderation: {
    status: "open",
    statuses: [],
    reports: [],
    suspended: [],
    note: "",
    notice: "",
    busy: false,
    strings: {},
  },
  authRecovery: {
    mode: "forgot",
    email: "",
    token: "",
    password: "",
    confirm: "",
    error: "",
    done: false,
    notice: "",
    busy: false,
    strings: {},
  },
  admin: {
    section: "users",
    sections: [],
    pageTitle: "",
    account: { name: "", email: "", initials: "" },
    locales: [],
    stats: { total: 0, confirmed: 0, admins: 0 },
    users: [],
    roles: [],
    permissions: [],
    sessions: [],
    tasks: [],
    taskHandlers: [],
    newTaskKind: "",
    newTaskRunAt: "",
    grantRole: "",
    roleOptions: [],
    search: "",
    newRole: "",
    newPermission: "",
    editingRole: "",
    rolePermissions: [],
    notice: "",
    error: "",
    busy: false,
    strings: {},
  },
  welcome: { greeting: "", profileReady: false, strings: {} },
  myProfile: {
    profile: null,
    avatarUrl: "",
    name: "",
    city: "",
    bio: "",
    status: "",
    statuses: [],
    notice: "",
    error: "",
    busy: false,
    strings: {},
  },
};
