// The route table: "METHOD /path/:param" -> the message id the router rewrites
// http.request into (pure data: the runtime and the tests both read it).
export const routes: Record<string, string> = {
  "GET /health": "health.get",
  "GET /projects": "projects.list",
  "POST /projects": "projects.create",
  "GET /projects/:id": "projects.get",
  "PATCH /projects/:id": "projects.rename",
  "DELETE /projects/:id": "projects.remove",
  "GET /projects/:id/docs/:key": "docs.get",
  "PUT /projects/:id/docs/:key": "docs.put",
};
