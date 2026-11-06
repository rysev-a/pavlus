// The route table: "METHOD /path/:param" -> the message id the router rewrites
// http.request into (pure data, the runtime and the tests both read it).
export const routes: Record<string, string> = {
  "GET /customers": "customers.list",
  "POST /customers": "customers.create",
  "GET /menu": "menu.list",
  "GET /orders": "orders.list",
  "POST /orders": "orders.create",
  "PATCH /orders/:id": "orders.setStatus",
  "GET /dashboard": "dashboard.get",
};
