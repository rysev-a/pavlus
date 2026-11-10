# fetch plugin

Plugin `fetch`, effect `fetch.request` (node's global `fetch`).

```ts
import { fetchEffector as http } from "@pavlus/server/plugins/fetch";
http.get("https://api.example.com/users", {
  query: { page: 2 },
  replyTo: "gotUsers",
  onError: "usersFailed",
  timeoutMs: 2000,
});
http.post(url, { json: { a: 1 }, replyTo: "created" });
```

Fields: `url, method, headers, query, json | body, parse ("auto" | "json" | "text" | "buffer" | "none"), timeoutMs (30s), maxBytes (10 MiB), retries, retryUnsafe, backoffMs (100), retryOn ([429,502,503,504]), redirect`.

- Reply: `{status, ok, statusText, headers (lower case), body, url, attempts}`. HTTP error statuses are replies (`ok: false`), not errors.
- `onError` gets `{code, message}` with `code` one of `TIMEOUT`, `NETWORK`, `TOO_LARGE`, `PARSE`.
- Retries (default 2) apply to idempotent methods (GET HEAD PUT DELETE OPTIONS) on network errors, timeouts and `retryOn` statuses, with exponential backoff and jitter; `Retry-After` is honoured. POST/PATCH are never retried unless `retryUnsafe`.
- `timeoutMs` is per attempt and shortened by `ctx.deadline`. `auto` parsing is JSON when the content type says so, otherwise text.
- `cancel(rid)` aborts the request (and any backoff wait) and sends no reply.
