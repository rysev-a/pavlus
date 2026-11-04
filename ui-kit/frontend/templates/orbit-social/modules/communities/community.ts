/**
 * The pure rules of the communities: roles, who may do what, joining and leaving,
 * the form, the cascade of a delete, and the cards and lists the blocks show.
 */
import { byId, nextId, when } from "../../core.ts";
import { glyphOf, initialsOf, isUpload, pictureStyle } from "../../pictures.ts";
import type { Community, Db, User } from "../../schema.ts";
import { isStaff, PICTURES, postIndex } from "../wall/posts.ts";

export const LIST_PAGE = 12;
export const MEMBER_PAGE = 10;

export type Role = "owner" | "moderator" | "member" | "none";

export function roleOf(c: Community, userId: number): Role {
  if (userId <= 0) return "none";
  if (c.ownerId === userId) return "owner";
  if (c.moderatorIds.includes(userId)) return "moderator";
  if (c.memberIds.includes(userId)) return "member";
  return "none";
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Administrator", moderator: "Moderator", member: "Member", none: "" };
export const ROLE_TONE: Record<Role, string> = { owner: "default", moderator: "secondary", member: "outline", none: "outline" };

const isAdmin = (db: Db, me: number): boolean => byId(db.users).get(me)?.role === "admin";

/** The owner, and the administrator of the site: settings, promoting, deleting. */
export const canManage = (db: Db, me: number, c: Community): boolean => me > 0 && (c.ownerId === me || isAdmin(db, me));

/** The owner, the moderators, and the staff of the site: removing members and posts. */
export const canModerate = (db: Db, me: number, c: Community): boolean => canManage(db, me, c) || roleOf(c, me) === "moderator" || (me > 0 && isStaff(byId(db.users).get(me)));

export const isMember = (c: Community, me: number): boolean => roleOf(c, me) !== "none";

// ---- list ----

const hays = new WeakMap<Community[], string[]>();

export type ListTab = "all" | "mine";

/** The communities of a tab that match the search, the biggest first. */
export function filterCommunities(db: Db, me: number, tab: ListTab, query: string): Community[] {
  let h = hays.get(db.communities);
  if (!h) {
    h = db.communities.map((c) => `${c.name}\n${c.description}`.toLowerCase());
    hays.set(db.communities, h);
  }
  const q = query.trim().toLowerCase();
  const out: Community[] = [];
  db.communities.forEach((c, i) => {
    if (tab === "mine" && !isMember(c, me)) return;
    if (q && !h![i].includes(q)) return;
    out.push(c);
  });
  return out.sort((a, b) => b.memberIds.length - a.memberIds.length || a.name.localeCompare(b.name));
}

/** All the people of a community: the owner, the moderators, the members (no repeats). */
export function peopleOf(c: Community): number[] {
  return [...new Set([c.ownerId, ...c.moderatorIds, ...c.memberIds])];
}

export const memberCount = (c: Community): number => peopleOf(c).length;

// ---- changes ----

export function joinCommunity(c: Community, me: number): Community | null {
  if (me <= 0 || isMember(c, me)) return null;
  return { ...c, memberIds: [...c.memberIds, me] };
}

/** The owner cannot leave. */
export function leaveCommunity(c: Community, me: number): Community | null {
  if (!isMember(c, me) || c.ownerId === me) return null;
  return dropPerson(c, me);
}

function dropPerson(c: Community, id: number): Community {
  return {
    ...c,
    memberIds: c.memberIds.filter((x) => x !== id),
    moderatorIds: c.moderatorIds.filter((x) => x !== id),
    contactIds: c.contactIds.filter((x) => x !== id),
  };
}

/** Moderators and the owner remove members; only the owner removes a moderator; nobody removes the owner or themselves. */
export function removeMember(db: Db, c: Community, actor: number, target: number): Community | null {
  if (!canModerate(db, actor, c) || target === c.ownerId || target === actor || !isMember(c, target)) return null;
  if (roleOf(c, target) === "moderator" && !canManage(db, actor, c)) return null;
  return dropPerson(c, target);
}

/** The owner makes a member a moderator, or a moderator a plain member. */
export function setModerator(db: Db, c: Community, actor: number, target: number, on: boolean): Community | null {
  if (!canManage(db, actor, c) || target === c.ownerId || !isMember(c, target)) return null;
  const has = c.moderatorIds.includes(target);
  if (on === has) return null;
  return {
    ...c,
    moderatorIds: on ? [...c.moderatorIds, target] : c.moderatorIds.filter((x) => x !== target),
    memberIds: c.memberIds.includes(target) ? c.memberIds : [...c.memberIds, target],
  };
}

export function toggleContact(db: Db, c: Community, actor: number, target: number): Community | null {
  if (!canManage(db, actor, c) || !isMember(c, target)) return null;
  return { ...c, contactIds: c.contactIds.includes(target) ? c.contactIds.filter((x) => x !== target) : [...c.contactIds, target] };
}

/** What a delete removes: the community, its posts and their comments. */
export function communityRemoval(db: Db, communityId: number): { communities: number[]; posts: number[]; comments: number[] } {
  const posts = (postIndex(db.posts).byCommunity.get(communityId) ?? []).map((p) => p.id);
  const gone = new Set(posts);
  return { communities: [communityId], posts, comments: db.comments.filter((c) => gone.has(c.postId)).map((c) => c.id) };
}

// ---- the form ----

export interface CommunityForm {
  name: string;
  description: string;
  wallpaper: string;
  errors: { name: string; description: string };
}

export const emptyCommunityForm = (): CommunityForm => ({ name: "", description: "", wallpaper: PICTURES[4], errors: { name: "", description: "" } });

export const formOfCommunity = (c: Community): CommunityForm => ({ name: c.name, description: c.description, wallpaper: c.wallpaper, errors: { name: "", description: "" } });

export function validateCommunity(db: Db, f: CommunityForm, ownId = 0): CommunityForm["errors"] {
  const name = f.name.trim();
  const dup = db.communities.some((c) => c.id !== ownId && c.name.toLowerCase() === name.toLowerCase());
  return {
    name: name.length < 3 ? "The name needs at least 3 letters" : name.length > 60 ? "At most 60 characters" : dup ? "A community with this name exists" : "",
    description: f.description.length > 500 ? "At most 500 characters" : "",
  };
}

/** A new community: the creator is the owner, a member and a contact. */
export function createCommunity(db: Db, me: number, f: CommunityForm, now: string): { community?: Community; errors: CommunityForm["errors"] } {
  const errors = validateCommunity(db, f);
  if (errors.name || errors.description) return { errors };
  if (me <= 0) return { errors: { name: "Sign in first", description: "" } };
  return {
    errors,
    community: {
      id: nextId(db.communities),
      name: f.name.trim(),
      description: f.description.trim(),
      wallpaper: f.wallpaper,
      ownerId: me,
      moderatorIds: [],
      memberIds: [me],
      contactIds: [me],
      createdAt: now,
    },
  };
}

export function updateCommunity(db: Db, me: number, c: Community, f: CommunityForm): { community?: Community; errors: CommunityForm["errors"] } {
  const errors = validateCommunity(db, f, c.id);
  if (errors.name || errors.description) return { errors };
  if (!canManage(db, me, c)) return { errors: { name: "Only the owner can change the settings", description: "" } };
  return { errors, community: { ...c, name: f.name.trim(), description: f.description.trim(), wallpaper: f.wallpaper } };
}

// ---- views ----

export interface CommunityCard {
  id: number;
  name: string;
  description: string;
  wallpaperStyle: string;
  wallpaperGlyph: string;
  members: string;
  role: string;
  roleTone: string;
}

export const membersLabel = (n: number): string => `${n} ${n === 1 ? "member" : "members"}`;

export function cardOf(c: Community, me: number): CommunityCard {
  const role = roleOf(c, me);
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    wallpaperStyle: pictureStyle(c.wallpaper),
    wallpaperGlyph: isUpload(c.wallpaper) ? "" : glyphOf(c.wallpaper),
    members: membersLabel(memberCount(c)),
    role: ROLE_LABEL[role],
    roleTone: ROLE_TONE[role],
  };
}

export interface PersonView {
  id: number;
  name: string;
  avatarStyle: string;
  avatarText: string;
  role: string;
  roleTone: string;
  city: string;
  canMessage: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canRemove: boolean;
}

const avatarText = (u: User): string => (isUpload(u.avatar) ? "" : glyphOf(u.avatar) || initialsOf(u.name));

export function personView(db: Db, me: number, c: Community, u: User): PersonView {
  const role = roleOf(c, u.id);
  const manage = canManage(db, me, c);
  return {
    id: u.id,
    name: u.name,
    avatarStyle: pictureStyle(u.avatar),
    avatarText: avatarText(u),
    role: ROLE_LABEL[role],
    roleTone: ROLE_TONE[role],
    city: u.city,
    canMessage: u.id !== me,
    canPromote: manage && role === "member",
    canDemote: manage && role === "moderator",
    canRemove: removeMember(db, c, me, u.id) !== null,
  };
}

/** The members, the owner first, then the moderators, then by name; filtered by the search. */
export function membersPage(db: Db, me: number, c: Community, query: string, page: number): { people: PersonView[]; total: number; page: number; pages: number } {
  const users = byId(db.users);
  const q = query.trim().toLowerCase();
  const rank = (id: number): number => (id === c.ownerId ? 0 : c.moderatorIds.includes(id) ? 1 : 2);
  const list = peopleOf(c)
    .map((id) => users.get(id))
    .filter((u): u is User => !!u && (!q || u.name.toLowerCase().includes(q)))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / MEMBER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  return { people: list.slice((p - 1) * MEMBER_PAGE, p * MEMBER_PAGE).map((u) => personView(db, me, c, u)), total: list.length, page: p, pages };
}

export const createdLabel = (c: Community, now: string): string => `since ${when(c.createdAt, now)}`;
