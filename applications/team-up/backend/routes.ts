// The route table: "METHOD /path/:param" -> the message id the router
// rewrites http.request into. The API routes answer JSON; everything else
// (GET) is a page of the frontend, served through the pages plugin. The
// ws upgrade path (/ws) never gets here — the ws plugin takes it first.
export const routes: Record<string, string> = {
  // auth
  "POST /api/auth/register": "auth.register",
  "POST /api/auth/login": "auth.login",
  "GET /api/auth/me": "auth.me",
  "POST /api/auth/logout": "auth.logout",
  // the directory: professions and the skill tree
  "GET /api/directory": "dir.list",
  // profiles
  "GET /api/profile/me": "profile.me",
  "GET /api/people/:slug": "profile.bySlug",
  "PUT /api/profile": "profile.save",
  "PUT /api/profile/professions": "profile.setProfessions",
  "PUT /api/profile/skills": "profile.setSkills",
  // projects and their slots
  "GET /api/projects": "projects.list",
  "GET /api/projects/:slug": "projects.get",
  "POST /api/projects": "projects.create",
  "POST /api/projects/:slug/slots": "projects.addSlot",
  // the match: my feed, a slot's candidates
  "GET /api/match/feed": "match.feed",
  "GET /api/match/candidates/:slotId": "match.candidates",
  // applications
  "POST /api/slots/:slotId/apply": "apps.apply",
  "GET /api/applications/mine": "apps.mine",
  "GET /api/projects/:slug/applications": "apps.byProject",
  "POST /api/applications/:id/accept": "apps.accept",
  "POST /api/applications/:id/decline": "apps.decline",
  "DELETE /api/applications/:id": "apps.withdraw",
  // friends
  "GET /api/friends": "friends.list",
  "POST /api/friends/:slug": "friends.request",
  "POST /api/friends/:slug/accept": "friends.accept",
  "POST /api/friends/:slug/decline": "friends.decline",
  "DELETE /api/friends/:slug": "friends.remove",
  // chat (the live part is ws at /ws)
  "GET /api/chat/threads": "chat.threads",
  "GET /api/chat/threads/:id": "chat.thread",
  "POST /api/chat/dm/:slug": "chat.dm",
  "POST /api/chat/threads/:id/send": "chat.send",
  // notifications
  "GET /api/notifications": "notify.list",
  // the frontend
  "GET /": "pages.show",
  "GET /*": "pages.show",
};
