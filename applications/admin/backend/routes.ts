// The route table: "METHOD /path/:param" -> the message id the router rewrites
// http.request into. The API routes answer JSON; everything else (GET) is a
// page of the frontend, served through the pages plugin. The router itself is
// part of the framework (pure, no I/O).
export const routes: Record<string, string> = {
  "GET /api/users": "users.list",
  "GET /api/users/:id": "users.get",
  "POST /api/users": "users.save",
  "PUT /api/users/:id": "users.save",
  "DELETE /api/users/:id": "users.delete",
  "GET /api/roles": "roles.list",
  "POST /api/reset": "app.reset",
  // "/" needs its own entry: a wildcard does not match the empty path.
  "GET /": "pages.show",
  "GET /*": "pages.show",
};
