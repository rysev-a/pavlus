/** Every feature module of Orbit, by the key of its slice. */
import type { Module, SliceKey } from "./core.ts";
import { adminModule } from "./modules/admin/index.ts";
import { blogModule } from "./modules/blog/index.ts";
import { communitiesModule } from "./modules/communities/index.ts";
import { gamesModule } from "./modules/games/index.ts";
import { messagesModule } from "./modules/messages/index.ts";
import { musicModule } from "./modules/music/index.ts";
import { photosModule } from "./modules/photos/index.ts";
import { profileModule } from "./modules/profile/index.ts";
import { wallModule } from "./modules/wall/index.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODULES: Record<SliceKey, Module<any>> = {
  wall: wallModule,
  blog: blogModule,
  profile: profileModule,
  photos: photosModule,
  messages: messagesModule,
  communities: communitiesModule,
  games: gamesModule,
  music: musicModule,
  admin: adminModule,
};
