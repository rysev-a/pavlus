/**
 * What the admin panel knows about each table: how its list looks (the columns
 * of the data table), what its create / update form asks (the fields), the
 * defaults of a new row and the rules a row must follow. One generic list
 * (blocks/crud-table) and one generic form (blocks/crud-form) serve them all,
 * as in the Phone Retail CRM.
 *
 * A foreign key to a table with thousands of rows (users, posts, songs...) is a
 * numeric field that is checked against the table; a short table (communities,
 * artists...) is a select.
 */
import type {
  Cell,
  ColumnDef,
  FilterDef,
} from "../../../../blocks/crud-table/table.ts";
import type {
  Draft,
  DraftValue,
  FieldDef,
} from "../../../../blocks/crud-form/form.ts";
import { hashPassword } from "../../auth.ts";
import { byId } from "../../core.ts";
import { gradient } from "../../pictures.ts";
import {
  type Db,
  GAMES,
  GENRES,
  type Role,
  type TableName,
} from "../../schema.ts";

/** What the options, the rules and the lists look at. */
export interface Ctx {
  db: Db;
  /** the signed-in administrator */
  me: number;
  now: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export interface Entity {
  key: TableName;
  singular: string;
  plural: string;
  description: string;
  sortKey: string;
  columns: (c: Ctx) => ColumnDef<Row>[];
  filters: (c: Ctx) => FilterDef<Row>[];
  fields: FieldDef<Ctx>[];
  /** the defaults of a new row (id 0) */
  blank: (c: Ctx) => Record<string, unknown>;
  /** a short name for notices and the delete question */
  label: (row: Row, db: Db) => string;
  /** the row as it is saved */
  beforeSave?: (row: Row, c: Ctx, draft: Draft) => Row;
  /** why these rows may not be deleted, or "" */
  guardDelete?: (rows: Row[], c: Ctx) => string;
}

// ---- lookups ----

export const userName = (db: Db, id: number): string =>
  byId(db.users).get(id)?.name ?? `user #${id}`;
const communityName = (db: Db, id: number): string =>
  byId(db.communities).get(id)?.name ?? `community #${id}`;
const artistName = (db: Db, id: number): string =>
  byId(db.artists).get(id)?.name ?? `artist #${id}`;
const albumTitle = (db: Db, id: number): string =>
  byId(db.albums).get(id)?.title ?? `album #${id}`;

const cut = (s: string, n = 70): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
const stamp = (iso: string): string => iso.slice(0, 16).replace("T", " ");
const memo = <T>(f: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};
const countBy = <T>(rows: T[], key: (r: T) => number): Map<number, number> => {
  const m = new Map<number, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
};

const num = (n: number): Cell => ({ kind: "number", text: String(n) });
const mono = (s: string): Cell => ({ kind: "mono", text: s });
const text = (s: string): Cell => ({ kind: "text", text: s });
const strong = (s: string, sub = ""): Cell => ({
  kind: "strong",
  text: s,
  sub,
});
const pill = (s: string, tone: string): Cell => ({
  kind: "pill",
  text: s,
  tone,
});

const idColumn = (): ColumnDef<Row> => ({
  key: "id",
  label: "#",
  value: (r) => r.id,
  cell: (r) => mono(String(r.id)),
});
const options = (
  xs: readonly string[],
  all: string,
): FilterDef<Row>["options"] => [
  { value: "", label: all },
  ...xs.map((x) => ({ value: x, label: x })),
];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---- field helpers ----

const draftId = (d: Draft): number =>
  Number(typeof d.__id === "string" ? d.__id : 0);

/** A foreign key to a big table: a number that must name an existing row. */
function refField(
  key: string,
  label: string,
  table:
    | "users"
    | "posts"
    | "comments"
    | "photos"
    | "photoAlbums"
    | "songs"
    | "albums"
    | "artists"
    | "conversations"
    | "communities",
  what: string,
  opts: { optional?: boolean; hint?: string } = {},
): FieldDef<Ctx> {
  return {
    key,
    label,
    kind: "number",
    required: !opts.optional,
    min: opts.optional ? 0 : 1,
    hint:
      opts.hint ??
      `The id of ${what === "user" ? "a" : "an"} ${what}${opts.optional ? " (0 for none)" : ""}. The row must exist.`,
    validate: (v, _d, c) => {
      const n = Number(v);
      if (!Number.isInteger(n)) return "A whole number, please";
      if (n === 0 && opts.optional) return "";
      if (!byId(c.db[table] as { id: number }[]).has(n))
        return `There is no ${what} with id ${n}`;
      return "";
    },
  };
}

/** `3, 17, 42` to [3, 17, 42] (invalid parts are dropped: `idsError` finds them). */
export function parseIds(s: string): number[] {
  return [
    ...new Set(
      s
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ].filter((n) => Number.isInteger(n) && n > 0);
}
const idsError = (
  s: string,
  table: "users" | "songs",
  what: string,
  c: Ctx,
  min = 0,
): string => {
  const parts = s.split(/[\s,;]+/).filter(Boolean);
  const bad = parts.find((p) => !/^\d+$/.test(p));
  if (bad) return `“${bad}” is not an id`;
  const ids = parseIds(s);
  const rows = byId(c.db[table] as { id: number }[]);
  const missing = ids.find((n) => !rows.has(n));
  if (missing !== undefined) return `There is no ${what} with id ${missing}`;
  if (ids.length < min) return `At least ${min} ${what}${min === 1 ? "" : "s"}`;
  return "";
};

/** A list of ids typed as `3, 17, 42`. */
function idsField(
  key: string,
  label: string,
  table: "users" | "songs",
  what: string,
  opts: { min?: number; hint?: string } = {},
): FieldDef<Ctx> {
  return {
    key,
    label,
    kind: "textarea",
    rows: 2,
    required: (opts.min ?? 0) > 0,
    hint: opts.hint ?? `Ids of ${what}s, separated by commas.`,
    toDraft: (row) => ((row[key] as number[]) ?? []).join(", "),
    fromDraft: (v) => parseIds(typeof v === "string" ? v : ""),
    validate: (v, _d, c) =>
      idsError(typeof v === "string" ? v : "", table, what, c, opts.min ?? 0),
  };
}

const select = (
  key: string,
  label: string,
  choices: readonly string[],
  required = true,
): FieldDef<Ctx> => ({
  key,
  label,
  kind: "select",
  required,
  options: () => choices.map((x) => ({ value: x, label: cap(x) })),
});

const str = (v: DraftValue | undefined): string =>
  typeof v === "string" ? v.trim() : "";
const required = (
  key: string,
  label: string,
  kind: FieldDef<Ctx>["kind"] = "text",
  extra: Partial<FieldDef<Ctx>> = {},
): FieldDef<Ctx> => ({
  key,
  label,
  kind,
  required: true,
  ...extra,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- the definitions ----

export const ENTITIES: Entity[] = [
  {
    key: "users",
    singular: "user",
    plural: "Users",
    description: "Every account: profile, role, status and a password reset.",
    sortKey: "name",
    columns: () => [
      idColumn(),
      {
        key: "name",
        label: "User",
        value: (u) => `${u.name} ${u.email}`,
        cell: (u) => strong(u.name, u.email),
      },
      {
        key: "city",
        label: "City",
        value: (u) => u.city,
        cell: (u) => text(u.city || "-"),
      },
      {
        key: "role",
        label: "Role",
        searchable: false,
        value: (u) => u.role,
        cell: (u) =>
          pill(
            cap(u.role),
            u.role === "admin"
              ? "destructive"
              : u.role === "moderator"
                ? "info"
                : "muted",
          ),
      },
      {
        key: "status",
        label: "Status",
        searchable: false,
        value: (u) => u.status,
        cell: (u) =>
          pill(
            cap(u.status),
            u.status === "banned" ? "destructive" : "success",
          ),
      },
      {
        key: "createdAt",
        label: "Joined",
        searchable: false,
        value: (u) => u.createdAt,
        cell: (u) => text(u.createdAt.slice(0, 10)),
      },
      {
        key: "lastSeen",
        label: "Last seen",
        searchable: false,
        value: (u) => u.lastSeen,
        cell: (u) => text(stamp(u.lastSeen)),
      },
    ],
    filters: () => [
      {
        key: "role",
        label: "Role",
        options: [
          { value: "", label: "All roles" },
          ...(["user", "moderator", "admin"] as Role[]).map((r) => ({
            value: r,
            label: cap(r),
          })),
        ],
        value: (u) => u.role,
      },
      {
        key: "status",
        label: "Status",
        options: [
          { value: "", label: "Any status" },
          { value: "active", label: "Active" },
          { value: "banned", label: "Banned" },
        ],
        value: (u) => u.status,
      },
    ],
    fields: [
      required("name", "Name", "text", {
        validate: (v) => (str(v).length < 2 ? "At least 2 letters" : ""),
      }),
      required("email", "Email", "email", {
        hint: "Must be unique: it is the sign-in name.",
        validate: (v, d, c) => {
          const email = str(v).toLowerCase();
          const id = draftId(d);
          return c.db.users.some(
            (u) => u.id !== id && u.email.toLowerCase() === email,
          )
            ? "Someone already has this email"
            : "";
        },
      }),
      {
        key: "role",
        label: "Role",
        kind: "select",
        required: true,
        options: () => [
          { value: "user", label: "Member" },
          { value: "moderator", label: "Moderator" },
          { value: "admin", label: "Administrator" },
        ],
        validate: (v, d, c) =>
          draftId(d) === c.me && v !== "admin"
            ? "You cannot demote yourself"
            : "",
      },
      {
        key: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: () => [
          { value: "active", label: "Active" },
          { value: "banned", label: "Banned (cannot sign in)" },
        ],
        validate: (v, d, c) =>
          draftId(d) === c.me && v !== "active"
            ? "You cannot ban yourself"
            : "",
      },
      { key: "city", label: "City", kind: "text" },
      { key: "about", label: "About", kind: "textarea", rows: 3 },
      {
        key: "newPassword",
        label: "New password",
        kind: "text",
        hint: "Leave empty to keep the password. A new user needs one (6 characters or more).",
        toDraft: () => "",
        validate: (v, d) => {
          const s = typeof v === "string" ? v : "";
          if (draftId(d) === 0 && s === "")
            return "A new user needs a password";
          return s !== "" && s.length < 6 ? "At least 6 characters" : "";
        },
      },
    ],
    blank: (c) => ({
      id: 0,
      name: "",
      email: "",
      passwordHash: "",
      role: "user",
      status: "active",
      avatar: "",
      about: "",
      city: "",
      birthday: "2000-01-01",
      website: "",
      phone: "",
      interests: [],
      createdAt: c.now,
      lastSeen: c.now,
    }),
    label: (u) => u.name,
    beforeSave: (row, _c, draft) => {
      const { newPassword: _drop, ...user } = row;
      void _drop;
      const pw = typeof draft.newPassword === "string" ? draft.newPassword : "";
      const hue = (user.id * 47) % 360;
      return {
        ...user,
        passwordHash: pw !== "" ? hashPassword(pw) : user.passwordHash,
        avatar:
          user.avatar ||
          gradient(hue, hue + 40, String(user.name).charAt(0).toUpperCase()),
      };
    },
    guardDelete: (rows, c) =>
      rows.some((u) => u.id === c.me)
        ? "You cannot delete your own account"
        : "",
  },

  {
    key: "posts",
    singular: "post",
    plural: "Posts",
    description:
      "Wall posts: text, music, photos, pictures, links and reposts.",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "text",
        label: "Post",
        value: (p) => `${p.text} ${p.linkTitle}`,
        cell: (p) =>
          strong(
            cut(p.text || p.linkTitle || `(${p.kind})`),
            p.kind === "repost" ? `repost of #${p.repostOf}` : "",
          ),
      },
      {
        key: "author",
        label: "Author",
        value: (p) => userName(db, p.authorId),
        cell: (p) => text(userName(db, p.authorId)),
      },
      {
        key: "kind",
        label: "Kind",
        searchable: false,
        value: (p) => p.kind,
        cell: (p) => pill(p.kind, "info"),
      },
      {
        key: "wall",
        label: "Wall",
        searchable: false,
        value: (p) =>
          p.communityId > 0
            ? communityName(db, p.communityId)
            : userName(db, p.wallId),
        cell: (p) =>
          text(
            p.communityId > 0
              ? `Community: ${communityName(db, p.communityId)}`
              : userName(db, p.wallId),
          ),
      },
      {
        key: "likes",
        label: "Likes",
        align: "right",
        searchable: false,
        value: (p) => p.likeIds.length,
        cell: (p) => num(p.likeIds.length),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (p) => p.createdAt,
        cell: (p) => text(stamp(p.createdAt)),
      },
    ],
    filters: () => [
      {
        key: "kind",
        label: "Kind",
        options: options(
          ["text", "music", "photo", "picture", "link", "repost"],
          "All kinds",
        ),
        value: (p) => p.kind,
      },
      {
        key: "where",
        label: "Where",
        options: [
          { value: "", label: "Any wall" },
          { value: "user", label: "User walls" },
          { value: "community", label: "Community walls" },
        ],
        value: (p) => (p.communityId > 0 ? "community" : "user"),
      },
    ],
    fields: [
      refField("authorId", "Author", "users", "user"),
      refField("wallId", "Wall of user", "users", "user", {
        optional: true,
        hint: "The user whose wall it is on (0 for a community post).",
      }),
      {
        key: "communityId",
        label: "Community wall",
        kind: "select",
        numeric: true,
        hint: "Choose “None” for a post on a user wall.",
        options: (c) => [
          { value: "0", label: "None" },
          ...c.db.communities
            .map((x) => ({ value: String(x.id), label: x.name }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ],
        validate: (v, d) =>
          Number(v) === 0 && Number(str(d.wallId)) === 0
            ? "A post needs a user wall or a community wall"
            : Number(v) > 0 && Number(str(d.wallId)) > 0
              ? "Choose a user wall or a community wall, not both"
              : "",
      },
      {
        key: "kind",
        label: "Kind",
        kind: "select",
        required: true,
        options: () =>
          ["text", "music", "photo", "picture", "link", "repost"].map((x) => ({
            value: x,
            label: cap(x),
          })),
        validate: (v, d) => {
          const need = (k: string) => Number(str(d[k])) > 0;
          if (v === "music" && !need("songId"))
            return "A music post needs a song id";
          if (v === "photo" && !need("photoId"))
            return "A photo post needs a photo id";
          if (v === "repost" && !need("repostOf"))
            return "A repost needs the id of the post";
          if (v === "link" && str(d.url) === "")
            return "A link post needs a link";
          if (v === "picture" && str(d.picture) === "")
            return "A picture post needs a picture";
          if (v === "text" && str(d.text) === "")
            return "A text post needs a text";
          return "";
        },
      },
      { key: "text", label: "Text", kind: "textarea", rows: 3 },
      refField("songId", "Song", "songs", "song", { optional: true }),
      refField("photoId", "Photo", "photos", "photo", { optional: true }),
      {
        key: "picture",
        label: "Picture",
        kind: "text",
        hint: "A picture string such as grad:210:260:🌅 or a data URL.",
      },
      { key: "url", label: "Link", kind: "text", placeholder: "https://" },
      { key: "linkTitle", label: "Link title", kind: "text" },
      {
        ...refField("repostOf", "Reposted post", "posts", "post", {
          optional: true,
        }),
        validate: (v, d, c) => {
          const n = Number(v);
          if (n === 0) return "";
          if (n === draftId(d)) return "A post cannot repost itself";
          return byId(c.db.posts).has(n) ? "" : `There is no post with id ${n}`;
        },
      },
    ],
    blank: (c) => ({
      id: 0,
      authorId: c.me,
      wallId: c.me,
      communityId: 0,
      kind: "text",
      text: "",
      songId: 0,
      photoId: 0,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 0,
      createdAt: c.now,
      likeIds: [],
    }),
    label: (p) => `post #${p.id}`,
  },

  {
    key: "comments",
    singular: "comment",
    plural: "Comments",
    description: "Replies under wall posts.",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "text",
        label: "Comment",
        value: (r) => r.text,
        cell: (r) => strong(cut(r.text)),
      },
      {
        key: "post",
        label: "On post",
        searchable: false,
        value: (r) => r.postId,
        cell: (r) => mono(`#${r.postId}`),
      },
      {
        key: "author",
        label: "Author",
        value: (r) => userName(db, r.authorId),
        cell: (r) => text(userName(db, r.authorId)),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (r) => r.createdAt,
        cell: (r) => text(stamp(r.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      refField("postId", "Post", "posts", "post"),
      refField("authorId", "Author", "users", "user"),
      required("text", "Text", "textarea"),
    ],
    blank: (c) => ({
      id: 0,
      postId: 0,
      authorId: c.me,
      text: "",
      createdAt: c.now,
    }),
    label: (r) => `comment #${r.id}`,
  },

  {
    key: "articles",
    singular: "article",
    plural: "Articles",
    description: "Blog articles (the Posts section of the network).",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "title",
        label: "Article",
        value: (a) => `${a.title} ${a.tags.join(" ")}`,
        cell: (a) => strong(a.title, a.tags.join(", ")),
      },
      {
        key: "author",
        label: "Author",
        value: (a) => userName(db, a.authorId),
        cell: (a) => text(userName(db, a.authorId)),
      },
      {
        key: "likes",
        label: "Likes",
        align: "right",
        searchable: false,
        value: (a) => a.likeIds.length,
        cell: (a) => num(a.likeIds.length),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (a) => a.createdAt,
        cell: (a) => text(stamp(a.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      refField("authorId", "Author", "users", "user"),
      required("title", "Title"),
      required("body", "Text", "textarea", { rows: 6 }),
      {
        key: "tags",
        label: "Tags",
        kind: "text",
        hint: "Separated by commas.",
        toDraft: (row) => ((row.tags as string[]) ?? []).join(", "),
        fromDraft: (v) =>
          str(v as DraftValue)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
      },
      {
        key: "cover",
        label: "Cover picture",
        kind: "text",
        hint: "A picture string such as grad:210:260:🌅 (or empty).",
      },
    ],
    blank: (c) => ({
      id: 0,
      authorId: c.me,
      title: "",
      body: "",
      tags: [],
      cover: "",
      createdAt: c.now,
      likeIds: [],
    }),
    label: (a) => a.title,
  },

  {
    key: "photoAlbums",
    singular: "photo album",
    plural: "Photo albums",
    description: "Albums of photos. Deleting one deletes its photos.",
    sortKey: "title",
    columns: ({ db }) => {
      const photos = memo(() => countBy(db.photos, (p) => p.albumId));
      return [
        idColumn(),
        {
          key: "title",
          label: "Album",
          value: (a) => `${a.title} ${a.description}`,
          cell: (a) => strong(a.title, cut(a.description, 50)),
        },
        {
          key: "owner",
          label: "Owner",
          value: (a) => userName(db, a.ownerId),
          cell: (a) => text(userName(db, a.ownerId)),
        },
        {
          key: "photos",
          label: "Photos",
          align: "right",
          searchable: false,
          value: (a) => photos().get(a.id) ?? 0,
          cell: (a) => num(photos().get(a.id) ?? 0),
        },
        {
          key: "createdAt",
          label: "Created",
          searchable: false,
          value: (a) => a.createdAt,
          cell: (a) => text(stamp(a.createdAt)),
        },
      ];
    },
    filters: () => [],
    fields: [
      refField("ownerId", "Owner", "users", "user"),
      required("title", "Title"),
      { key: "description", label: "Description", kind: "textarea" },
    ],
    blank: (c) => ({
      id: 0,
      ownerId: c.me,
      title: "",
      description: "",
      createdAt: c.now,
    }),
    label: (a) => a.title,
  },

  {
    key: "photos",
    singular: "photo",
    plural: "Photos",
    description: "Photos in albums.",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "caption",
        label: "Photo",
        value: (p) => p.caption,
        cell: (p) => strong(p.caption || "(no caption)"),
      },
      {
        key: "album",
        label: "Album",
        value: (p) =>
          byId(db.photoAlbums).get(p.albumId)?.title ?? `album #${p.albumId}`,
        cell: (p) =>
          text(
            byId(db.photoAlbums).get(p.albumId)?.title ?? `album #${p.albumId}`,
          ),
      },
      {
        key: "owner",
        label: "Owner",
        value: (p) => userName(db, p.ownerId),
        cell: (p) => text(userName(db, p.ownerId)),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (p) => p.createdAt,
        cell: (p) => text(stamp(p.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      {
        ...refField("albumId", "Album", "photoAlbums", "album of photos"),
        validate: (v, _d, c) =>
          byId(c.db.photoAlbums).has(Number(v))
            ? ""
            : `There is no album with id ${Number(v)}`,
      },
      {
        ...refField("ownerId", "Owner", "users", "user", {
          hint: "Must be the owner of the album.",
        }),
        validate: (v, d, c) => {
          const n = Number(v);
          if (!byId(c.db.users).has(n)) return `There is no user with id ${n}`;
          const album = byId(c.db.photoAlbums).get(Number(str(d.albumId)));
          return album && album.ownerId !== n
            ? `The album belongs to ${userName(c.db, album.ownerId)} (#${album.ownerId})`
            : "";
        },
      },
      {
        key: "src",
        label: "Picture",
        kind: "text",
        required: true,
        hint: "A picture string such as grad:210:260:🌅 or a data URL.",
      },
      { key: "caption", label: "Caption", kind: "text" },
    ],
    blank: (c) => ({
      id: 0,
      albumId: 0,
      ownerId: c.me,
      src: "grad:200:260:📷",
      caption: "",
      createdAt: c.now,
    }),
    label: (p) => p.caption || `photo #${p.id}`,
  },

  {
    key: "conversations",
    singular: "conversation",
    plural: "Conversations",
    description:
      "Dialogues (two people) and group chats. Deleting one deletes its messages.",
    sortKey: "id",
    columns: ({ db }) => {
      const msgs = memo(() => countBy(db.messages, (m) => m.conversationId));
      return [
        idColumn(),
        {
          key: "title",
          label: "Conversation",
          value: (c) =>
            `${c.title} ${c.memberIds.map((m: number) => userName(db, m)).join(" ")}`,
          cell: (c) =>
            strong(
              c.title || "Dialogue",
              c.memberIds
                .slice(0, 3)
                .map((m: number) => userName(db, m))
                .join(", ") + (c.memberIds.length > 3 ? ", ..." : ""),
            ),
        },
        {
          key: "kind",
          label: "Kind",
          searchable: false,
          value: (c) => c.kind,
          cell: (c) =>
            pill(
              c.kind === "dm" ? "Dialogue" : "Chat",
              c.kind === "dm" ? "muted" : "info",
            ),
        },
        {
          key: "members",
          label: "Members",
          align: "right",
          searchable: false,
          value: (c) => c.memberIds.length,
          cell: (c) => num(c.memberIds.length),
        },
        {
          key: "messages",
          label: "Messages",
          align: "right",
          searchable: false,
          value: (c) => msgs().get(c.id) ?? 0,
          cell: (c) => num(msgs().get(c.id) ?? 0),
        },
        {
          key: "createdAt",
          label: "Created",
          searchable: false,
          value: (c) => c.createdAt,
          cell: (c) => text(stamp(c.createdAt)),
        },
      ];
    },
    filters: () => [
      {
        key: "kind",
        label: "Kind",
        options: [
          { value: "", label: "All kinds" },
          { value: "dm", label: "Dialogues" },
          { value: "chat", label: "Chats" },
        ],
        value: (c) => c.kind,
      },
    ],
    fields: [
      {
        key: "kind",
        label: "Kind",
        kind: "select",
        required: true,
        options: () => [
          { value: "dm", label: "Dialogue (two people)" },
          { value: "chat", label: "Group chat" },
        ],
      },
      {
        key: "title",
        label: "Title",
        kind: "text",
        hint: "The name of a group chat (empty for a dialogue).",
      },
      {
        ...idsField("memberIds", "Members", "users", "user", { min: 2 }),
        validate: (v, d, c) => {
          const s = typeof v === "string" ? v : "";
          const e = idsError(s, "users", "user", c, 2);
          if (e) return e;
          return d.kind === "dm" && parseIds(s).length !== 2
            ? "A dialogue has exactly two members"
            : "";
        },
      },
    ],
    blank: (c) => ({
      id: 0,
      kind: "chat",
      title: "",
      memberIds: [c.me],
      createdAt: c.now,
    }),
    label: (c) => c.title || `conversation #${c.id}`,
  },

  {
    key: "messages",
    singular: "message",
    plural: "Messages",
    description: "Messages in conversations.",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "text",
        label: "Message",
        value: (m) => m.text,
        cell: (m) => strong(cut(m.text)),
      },
      {
        key: "conversation",
        label: "Conversation",
        searchable: false,
        value: (m) => m.conversationId,
        cell: (m) => mono(`#${m.conversationId}`),
      },
      {
        key: "author",
        label: "Author",
        value: (m) => userName(db, m.authorId),
        cell: (m) => text(userName(db, m.authorId)),
      },
      {
        key: "createdAt",
        label: "Sent",
        searchable: false,
        value: (m) => m.createdAt,
        cell: (m) => text(stamp(m.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      refField(
        "conversationId",
        "Conversation",
        "conversations",
        "conversation",
      ),
      {
        ...refField("authorId", "Author", "users", "user", {
          hint: "Must be a member of the conversation.",
        }),
        validate: (v, d, c) => {
          const n = Number(v);
          if (!byId(c.db.users).has(n)) return `There is no user with id ${n}`;
          const conv = byId(c.db.conversations).get(
            Number(str(d.conversationId)),
          );
          return conv && !conv.memberIds.includes(n)
            ? "That user is not in the conversation"
            : "";
        },
      },
      required("text", "Text", "textarea"),
    ],
    blank: (c) => ({
      id: 0,
      conversationId: 0,
      authorId: c.me,
      text: "",
      createdAt: c.now,
    }),
    label: (m) => `message #${m.id}`,
  },

  {
    key: "communities",
    singular: "community",
    plural: "Communities",
    description: "Groups with an owner, moderators, members and a wall.",
    sortKey: "name",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "name",
        label: "Community",
        value: (c) => `${c.name} ${c.description}`,
        cell: (c) => strong(c.name, cut(c.description, 60)),
      },
      {
        key: "owner",
        label: "Owner",
        value: (c) => userName(db, c.ownerId),
        cell: (c) => text(userName(db, c.ownerId)),
      },
      {
        key: "members",
        label: "Members",
        align: "right",
        searchable: false,
        value: (c) => c.memberIds.length,
        cell: (c) => num(c.memberIds.length),
      },
      {
        key: "moderators",
        label: "Moderators",
        align: "right",
        searchable: false,
        value: (c) => c.moderatorIds.length,
        cell: (c) => num(c.moderatorIds.length),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (c) => c.createdAt,
        cell: (c) => text(stamp(c.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      required("name", "Name"),
      { key: "description", label: "Description", kind: "textarea" },
      {
        key: "wallpaper",
        label: "Wallpaper",
        kind: "text",
        hint: "A picture string such as grad:210:260:🌌 or a data URL.",
      },
      refField("ownerId", "Owner (administrator)", "users", "user"),
      idsField("moderatorIds", "Moderators", "users", "user"),
      idsField("memberIds", "Members", "users", "user", {
        hint: "The owner and the moderators are added automatically.",
      }),
      idsField("contactIds", "Contacts", "users", "user", {
        hint: "People to write to.",
      }),
    ],
    blank: (c) => ({
      id: 0,
      name: "",
      description: "",
      wallpaper: "grad:220:280:🌌",
      ownerId: c.me,
      moderatorIds: [],
      memberIds: [],
      contactIds: [],
      createdAt: c.now,
    }),
    label: (c) => c.name,
    beforeSave: (row) => {
      const members = [
        ...new Set([row.ownerId, ...row.moderatorIds, ...row.memberIds]),
      ];
      return { ...row, memberIds: members };
    },
  },

  {
    key: "artists",
    singular: "artist",
    plural: "Artists",
    description: "Music artists.",
    sortKey: "name",
    columns: ({ db }) => {
      const albums = memo(() => countBy(db.albums, (a) => a.artistId));
      return [
        idColumn(),
        {
          key: "name",
          label: "Artist",
          value: (a) => a.name,
          cell: (a) => strong(a.name),
        },
        {
          key: "country",
          label: "Country",
          value: (a) => a.country,
          cell: (a) => text(a.country),
        },
        {
          key: "albums",
          label: "Albums",
          align: "right",
          searchable: false,
          value: (a) => albums().get(a.id) ?? 0,
          cell: (a) => num(albums().get(a.id) ?? 0),
        },
      ];
    },
    filters: () => [],
    fields: [
      required("name", "Name"),
      { key: "country", label: "Country", kind: "text" },
    ],
    blank: () => ({ id: 0, name: "", country: "" }),
    label: (a) => a.name,
  },

  {
    key: "albums",
    singular: "album",
    plural: "Albums",
    description: "Music albums.",
    sortKey: "title",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "title",
        label: "Album",
        value: (a) => a.title,
        cell: (a) => strong(a.title),
      },
      {
        key: "artist",
        label: "Artist",
        value: (a) => artistName(db, a.artistId),
        cell: (a) => text(artistName(db, a.artistId)),
      },
      {
        key: "year",
        label: "Year",
        align: "right",
        searchable: false,
        value: (a) => a.year,
        cell: (a) => num(a.year),
      },
    ],
    filters: () => [],
    fields: [
      refField("artistId", "Artist", "artists", "artist"),
      required("title", "Title"),
      {
        key: "year",
        label: "Year",
        kind: "number",
        required: true,
        min: 1900,
        max: 2100,
      },
      {
        key: "cover",
        label: "Cover",
        kind: "text",
        hint: "A picture string such as grad:210:260:💿.",
      },
    ],
    blank: (c) => ({
      id: 0,
      artistId: 0,
      title: "",
      year: Number(c.now.slice(0, 4)),
      cover: "grad:260:320:💿",
    }),
    label: (a) => a.title,
  },

  {
    key: "songs",
    singular: "song",
    plural: "Songs",
    description: "The music library. A deleted song leaves every playlist.",
    sortKey: "title",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "title",
        label: "Song",
        value: (s) => s.title,
        cell: (s) => strong(s.title, albumTitle(db, s.albumId)),
      },
      {
        key: "artist",
        label: "Artist",
        value: (s) => artistName(db, s.artistId),
        cell: (s) => text(artistName(db, s.artistId)),
      },
      {
        key: "genre",
        label: "Genre",
        searchable: false,
        value: (s) => s.genre,
        cell: (s) => pill(s.genre, "muted"),
      },
      {
        key: "year",
        label: "Year",
        align: "right",
        searchable: false,
        value: (s) => s.year,
        cell: (s) => num(s.year),
      },
      {
        key: "duration",
        label: "Length",
        align: "right",
        searchable: false,
        value: (s) => s.duration,
        cell: (s) =>
          text(
            `${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, "0")}`,
          ),
      },
    ],
    filters: () => [
      {
        key: "genre",
        label: "Genre",
        options: options(GENRES, "All genres"),
        value: (s) => s.genre,
      },
    ],
    fields: [
      refField("artistId", "Artist", "artists", "artist"),
      {
        ...refField("albumId", "Album", "albums", "album", {
          hint: "The id of an album of this artist.",
        }),
        validate: (v, d, c) => {
          const album = byId(c.db.albums).get(Number(v));
          if (!album) return `There is no album with id ${Number(v)}`;
          return album.artistId !== Number(str(d.artistId))
            ? `That album is by ${artistName(c.db, album.artistId)} (artist #${album.artistId})`
            : "";
        },
      },
      required("title", "Title"),
      {
        key: "genre",
        label: "Genre",
        kind: "select",
        required: true,
        options: () => GENRES.map((g) => ({ value: g, label: g })),
      },
      {
        key: "duration",
        label: "Duration (seconds)",
        kind: "number",
        required: true,
        min: 1,
        max: 7200,
      },
      {
        key: "year",
        label: "Year",
        kind: "number",
        required: true,
        min: 1900,
        max: 2100,
      },
    ],
    blank: (c) => ({
      id: 0,
      albumId: 0,
      artistId: 0,
      title: "",
      genre: "Rock",
      duration: 180,
      year: Number(c.now.slice(0, 4)),
    }),
    label: (s) => s.title,
  },

  {
    key: "playlists",
    singular: "playlist",
    plural: "Playlists",
    description: "Playlists of songs.",
    sortKey: "title",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "title",
        label: "Playlist",
        value: (p) => p.title,
        cell: (p) => strong(p.title),
      },
      {
        key: "owner",
        label: "Owner",
        value: (p) => userName(db, p.ownerId),
        cell: (p) => text(userName(db, p.ownerId)),
      },
      {
        key: "songs",
        label: "Songs",
        align: "right",
        searchable: false,
        value: (p) => p.songIds.length,
        cell: (p) => num(p.songIds.length),
      },
      {
        key: "createdAt",
        label: "Created",
        searchable: false,
        value: (p) => p.createdAt,
        cell: (p) => text(stamp(p.createdAt)),
      },
    ],
    filters: () => [],
    fields: [
      refField("ownerId", "Owner", "users", "user"),
      required("title", "Title"),
      idsField("songIds", "Songs", "songs", "song"),
    ],
    blank: (c) => ({
      id: 0,
      ownerId: c.me,
      title: "",
      songIds: [],
      createdAt: c.now,
    }),
    label: (p) => p.title,
  },

  {
    key: "friends",
    singular: "contact",
    plural: "Friends",
    description: "Contacts: who added whom, and whether it was accepted.",
    sortKey: "id",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "user",
        label: "User",
        value: (f) => userName(db, f.userId),
        cell: (f) => strong(userName(db, f.userId)),
      },
      {
        key: "friend",
        label: "Friend",
        value: (f) => userName(db, f.friendId),
        cell: (f) => text(userName(db, f.friendId)),
      },
      {
        key: "status",
        label: "Status",
        searchable: false,
        value: (f) => f.status,
        cell: (f) =>
          pill(cap(f.status), f.status === "accepted" ? "success" : "warning"),
      },
      {
        key: "since",
        label: "Since",
        searchable: false,
        value: (f) => f.since,
        cell: (f) => text(stamp(f.since)),
      },
    ],
    filters: () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "", label: "Any status" },
          { value: "accepted", label: "Accepted" },
          { value: "pending", label: "Pending" },
        ],
        value: (f) => f.status,
      },
    ],
    fields: [
      refField("userId", "User", "users", "user"),
      {
        ...refField("friendId", "Friend", "users", "user"),
        validate: (v, d, c) => {
          const n = Number(v);
          const u = Number(str(d.userId));
          if (!byId(c.db.users).has(n)) return `There is no user with id ${n}`;
          if (n === u) return "A user cannot add themselves";
          const id = draftId(d);
          return c.db.friends.some(
            (f) =>
              f.id !== id &&
              ((f.userId === u && f.friendId === n) ||
                (f.userId === n && f.friendId === u)),
          )
            ? "These two are already connected"
            : "";
        },
      },
      select("status", "Status", ["accepted", "pending"]),
    ],
    blank: (c) => ({
      id: 0,
      userId: c.me,
      friendId: 0,
      status: "accepted",
      since: c.now,
    }),
    label: (f, db) =>
      `${userName(db, f.userId)} and ${userName(db, f.friendId)}`,
  },

  {
    key: "scores",
    singular: "score",
    plural: "Scores",
    description: "High scores of the games.",
    sortKey: "score",
    columns: ({ db }) => [
      idColumn(),
      {
        key: "user",
        label: "Player",
        value: (s) => userName(db, s.userId),
        cell: (s) => strong(userName(db, s.userId)),
      },
      {
        key: "game",
        label: "Game",
        searchable: false,
        value: (s) => s.game,
        cell: (s) => pill(cap(s.game), "info"),
      },
      {
        key: "score",
        label: "Score",
        align: "right",
        searchable: false,
        value: (s) => s.score,
        cell: (s) => num(s.score),
      },
      {
        key: "at",
        label: "When",
        searchable: false,
        value: (s) => s.at,
        cell: (s) => text(stamp(s.at)),
      },
    ],
    filters: () => [
      {
        key: "game",
        label: "Game",
        options: options(GAMES, "All games"),
        value: (s) => s.game,
      },
    ],
    fields: [
      refField("userId", "Player", "users", "user"),
      select("game", "Game", GAMES),
      { key: "score", label: "Score", kind: "number", required: true, min: 0 },
    ],
    blank: (c) => ({ id: 0, userId: c.me, game: "snake", score: 0, at: c.now }),
    label: (s, db) => `${userName(db, s.userId)}: ${s.score}`,
  },
];

export const entityOf = (key: string): Entity | undefined =>
  ENTITIES.find((e) => e.key === key);

/** Every table but the users (they have a section of their own). */
export const DATA_ENTITIES: Entity[] = ENTITIES.filter(
  (e) => e.key !== "users",
);
