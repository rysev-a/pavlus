/**
 * The data of Orbit, the social network: sixteen tables kept in IndexedDB
 * and, while the page is open, in the state as plain rows. Ids are positive
 * integers, dates are ISO strings (`2026-03-14T09:30:00`), a picture is a
 * string (see pictures.ts), money does not exist here.
 */

export type Role = "user" | "moderator" | "admin";

export interface User {
  id: number;
  name: string;
  email: string;
  /** `hashPassword(password)` from auth.ts */
  passwordHash: string;
  role: Role;
  status: "active" | "banned";
  /** a picture string */
  avatar: string;
  about: string;
  city: string;
  /** `YYYY-MM-DD` */
  birthday: string;
  website: string;
  phone: string;
  interests: string[];
  createdAt: string;
  lastSeen: string;
}

/** A contact: `userId` added `friendId`; `pending` until `friendId` accepts. */
export interface Friend {
  id: number;
  userId: number;
  friendId: number;
  status: "accepted" | "pending";
  since: string;
}

export type PostKind = "text" | "music" | "photo" | "picture" | "link" | "repost";

/**
 * An item of a wall. `wallId` is the user whose wall it is on (the author's own
 * wall, or a friend's); `communityId` is set instead for a post on a community
 * wall (and `wallId` is 0).
 */
export interface Post {
  id: number;
  authorId: number;
  wallId: number;
  communityId: number;
  kind: PostKind;
  text: string;
  /** a `music` post: a song id, else 0 */
  songId: number;
  /** a `photo` post: a photo id, else 0 */
  photoId: number;
  /** a `picture` post: a picture string, else "" */
  picture: string;
  /** a `link` post */
  url: string;
  linkTitle: string;
  /** a `repost`: the id of the post it shows (a link to another user's post), else 0 */
  repostOf: number;
  createdAt: string;
  likeIds: number[];
}

export interface Comment {
  id: number;
  postId: number;
  authorId: number;
  text: string;
  createdAt: string;
}

/** A blog article (the "Posts" section): longer than a wall post, with a title. */
export interface Article {
  id: number;
  authorId: number;
  title: string;
  body: string;
  tags: string[];
  cover: string;
  createdAt: string;
  likeIds: number[];
}

export interface PhotoAlbum {
  id: number;
  ownerId: number;
  title: string;
  description: string;
  createdAt: string;
}

export interface Photo {
  id: number;
  albumId: number;
  ownerId: number;
  /** a picture string: generated, or an uploaded image as a data URL */
  src: string;
  caption: string;
  createdAt: string;
}

/** A one-to-one dialogue (`dm`, two members) or a group chat (`chat`). */
export interface Conversation {
  id: number;
  kind: "dm" | "chat";
  title: string;
  memberIds: number[];
  createdAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  authorId: number;
  text: string;
  createdAt: string;
}

export interface Community {
  id: number;
  name: string;
  description: string;
  /** a picture string */
  wallpaper: string;
  /** the administrator: one user */
  ownerId: number;
  moderatorIds: number[];
  memberIds: number[];
  /** the people to write to (members, usually the admin and moderators) */
  contactIds: number[];
  createdAt: string;
}

export interface Artist {
  id: number;
  name: string;
  country: string;
}

export interface Album {
  id: number;
  artistId: number;
  title: string;
  year: number;
  cover: string;
}

export interface Song {
  id: number;
  albumId: number;
  artistId: number;
  title: string;
  genre: string;
  /** seconds */
  duration: number;
  year: number;
}

export interface Playlist {
  id: number;
  ownerId: number;
  title: string;
  songIds: number[];
  createdAt: string;
}

export const GAMES = ["snake", "pacman", "tetris"] as const;
export type GameName = (typeof GAMES)[number];

export interface Score {
  id: number;
  userId: number;
  game: GameName;
  score: number;
  at: string;
}

/** The one row that says who is signed in (id 1), kept so a reload stays signed in. */
export interface SessionRow {
  id: number;
  userId: number;
}

export const GENRES = [
  "Rock",
  "Pop",
  "Hip-hop",
  "Jazz",
  "Blues",
  "Classical",
  "Electronic",
  "House",
  "Techno",
  "Ambient",
  "Folk",
  "Country",
  "Reggae",
  "Metal",
  "Punk",
  "Soul",
  "Funk",
  "R&B",
  "Indie",
  "Latin",
] as const;

/** Every table, by name: this is the whole database. */
export interface Db {
  users: User[];
  friends: Friend[];
  posts: Post[];
  comments: Comment[];
  articles: Article[];
  photoAlbums: PhotoAlbum[];
  photos: Photo[];
  conversations: Conversation[];
  messages: Message[];
  communities: Community[];
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  playlists: Playlist[];
  scores: Score[];
  session: SessionRow[];
}

export type TableName = keyof Db;

export const TABLES: TableName[] = [
  "users",
  "friends",
  "posts",
  "comments",
  "articles",
  "photoAlbums",
  "photos",
  "conversations",
  "messages",
  "communities",
  "artists",
  "albums",
  "songs",
  "playlists",
  "scores",
  "session",
];

/** The sizes of the sample data. */
export const SEED_COUNTS = {
  users: 1000,
  communities: 60,
  songs: 10000,
  artists: 600,
  albums: 1500,
  playlists: 400,
} as const;

/** The fixed "now" of the demo: new rows are stamped from here on. */
export const NOW = "2026-11-04T12:00:00";

export const emptyDb = (): Db => ({
  users: [],
  friends: [],
  posts: [],
  comments: [],
  articles: [],
  photoAlbums: [],
  photos: [],
  conversations: [],
  messages: [],
  communities: [],
  artists: [],
  albums: [],
  songs: [],
  playlists: [],
  scores: [],
  session: [],
});

/** What an exported file is: a marker, a version, the tables. */
export interface Snapshot {
  app: "orbit-social";
  version: 1;
  exportedAt: string;
  data: Db;
}
