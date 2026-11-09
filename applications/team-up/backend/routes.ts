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
  // the account recovery: the forgotten password, the new password, the
  // verification of the address
  "GET /api/auth/recovery": "auth.recovery",
  "POST /api/auth/forgot": "auth.forgot",
  "POST /api/auth/reset": "auth.reset",
  "POST /api/auth/verify": "auth.verify",
  "PUT /api/auth/preferences": "auth.preferences",
  // the account of the member (the settings page)
  "PUT /api/account/password": "account.password",
  "PUT /api/account/email": "account.email",
  "DELETE /api/account": "account.delete",
  // the directory: professions and the skill tree
  "GET /api/directory": "dir.list",
  "GET /api/directory/filters": "dir.filters",
  // profiles
  "GET /api/profile/me": "profile.me",
  "GET /api/profile/editor": "profile.editor",
  "POST /api/profile/avatar": "profile.avatarUpload",
  "DELETE /api/profile/avatar": "profile.avatarDelete",
  "GET /api/avatars/:slug": "avatar.get",
  "PUT /api/profile": "profile.save",
  "PUT /api/profile/professions": "profile.setProfessions",
  "PUT /api/profile/skills": "profile.setSkills",
  // projects and their slots
  "GET /api/projects": "projects.list",
  "GET /api/projects/:slug": "projects.get",
  "POST /api/projects": "projects.create",
  "POST /api/projects/:slug/slots": "projects.addSlot",
  // the cabinet (`/app/projects`): my projects, the applications and the
  // invitations, and the writes of the owner
  "GET /api/hub": "hub.get",
  "GET /api/apply/options": "hub.applyOptions",
  "POST /api/invites/:slotId/accept": "invites.accept",
  "POST /api/invites/:slotId/decline": "invites.decline",
  "POST /api/projects/:slug/slots/:slotId/invite": "hub.invite",
  "DELETE /api/projects/:slug/slots/:slotId/invite": "hub.revoke",
  "POST /api/projects/:slug/leave": "hub.leave",
  "DELETE /api/projects/:slug/members/:userSlug": "hub.removeMember",
  "PUT /api/projects/:slug": "hub.updateProject",
  "PUT /api/projects/:slug/slots/:slotId": "hub.updateSlot",
  "DELETE /api/projects/:slug/slots/:slotId": "hub.deleteSlot",
  // the person page of the app
  "GET /api/people/:slug": "people.view",
  // the match: my feed, a slot's candidates
  "GET /api/match/feed": "match.feed",
  "GET /api/match/startups": "match.startups",
  "GET /api/match/candidates/:slotId": "match.candidates",
  // applications
  "POST /api/slots/:slotId/apply": "apps.apply",
  "GET /api/applications/mine": "apps.mine",
  "GET /api/projects/:slug/applications": "apps.byProject",
  "POST /api/applications/:id/accept": "apps.accept",
  "POST /api/applications/:id/decline": "apps.decline",
  "DELETE /api/applications/:id": "apps.withdraw",
  "PUT /api/applications/:id": "apps.edit",
  // friends
  "GET /api/friends": "friends.list",
  "POST /api/friends/:slug": "friends.request",
  "POST /api/friends/:slug/accept": "friends.accept",
  "POST /api/friends/:slug/decline": "friends.decline",
  "DELETE /api/friends/:slug": "friends.remove",
  // chat (the live part is ws at /ws)
  "GET /api/chat/threads": "chat.threads",
  "GET /api/chat/unread": "chat.unread",
  "GET /api/chat/threads/:id": "chat.thread",
  "POST /api/chat/dm/:slug": "chat.dm",
  "POST /api/chat/threads/:id/send": "chat.send",
  // notifications
  "GET /api/notifications": "notify.list",
  "GET /api/notifications/settings": "notify.settingsGet",
  "PUT /api/notifications/settings": "notify.settingsSave",
  // the public site (the original teamUP)
  "GET /api/site": "site.get",
  "GET /api/lang/:code": "site.lang",
  // the welcome page of the app
  "GET /api/welcome": "welcome.get",
  "GET /api/public/home": "pages.home",
  "GET /api/public/about": "pages.about",
  "GET /api/public/not-found": "pages.notFound",
  "GET /api/public/blog": "blog.list",
  "GET /api/public/blog/:pid": "blog.get",
  "GET /api/public/members": "members.list",
  "GET /api/public/member/:slug": "member.get",
  "GET /api/public/projects": "projects.catalog",
  "GET /api/public/project/:slug": "projects.detail",
  // the starred projects and the saved searches
  "GET /api/favorites": "favorites.list",
  "POST /api/favorites/:slug": "favorites.add",
  "DELETE /api/favorites/:slug": "favorites.remove",
  "GET /api/saved-searches": "saved.list",
  "POST /api/saved-searches": "saved.add",
  "DELETE /api/saved-searches/:id": "saved.remove",
  // the reports and the blocks
  "POST /api/reports": "reports.create",
  "GET /api/blocks": "blocks.list",
  "POST /api/blocks/:slug": "blocks.add",
  "DELETE /api/blocks/:slug": "blocks.remove",
  // the back office
  "GET /api/admin/reports": "admin.reports",
  "POST /api/admin/reports/:id/resolve": "admin.resolve",
  "GET /api/admin/suspensions": "admin.suspensions",
  "DELETE /api/admin/suspensions/:slug": "admin.unsuspend",
  // the back office of the original's admin api: the members, the roles, the
  // permissions and the sessions (the guard is the `manage` permission)
  "GET /api/admin/panel": "admin.panel",
  "GET /api/admin/users": "admin.users",
  "GET /api/admin/users/:id": "admin.user",
  "PUT /api/admin/users/:id/roles": "admin.userRoles",
  "GET /api/admin/roles": "admin.roles",
  "POST /api/admin/roles": "admin.roleCreate",
  "PUT /api/admin/roles/:id/permissions": "admin.rolePermissions",
  "DELETE /api/admin/roles/:id": "admin.roleDelete",
  "GET /api/admin/permissions": "admin.permissions",
  "POST /api/admin/permissions": "admin.permissionCreate",
  "DELETE /api/admin/permissions/:id": "admin.permissionDelete",
  "GET /api/admin/sessions": "admin.sessions",
  "DELETE /api/admin/sessions/:id": "admin.sessionRevoke",
  // the tasks of the system (the original's `system_tasks`)
  "GET /api/admin/tasks": "tasks.list",
  "GET /api/admin/tasks/handlers": "tasks.handlers",
  "GET /api/admin/tasks/actions": "tasks.actions",
  "POST /api/admin/tasks": "tasks.create",
  "PUT /api/admin/tasks/:id": "tasks.update",
  "DELETE /api/admin/tasks/:id": "tasks.remove",
  "POST /api/admin/tasks/:id/run": "tasks.run",
  "POST /api/admin/tasks/:id/cancel": "tasks.cancel",
  // the old addresses of the original: /startups → /projects
  "GET /startups": "site.oldStartups",
  "GET /startups/:slug": "site.oldStartup",
  // the frontend
  "GET /": "pages.show",
  "GET /*": "pages.show",
};
