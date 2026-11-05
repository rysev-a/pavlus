// The built-in demos. Each one is a whole design with a scenario, so it opens ready
// to Run. They are written in the style of server/examples/todo-api (a request is a
// chain of small pure handlers, each reply is a message with the same rid).
import { autoLayout } from "./layout.ts";
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Model,
  type NodeKind,
  type RequestSpec,
  addEdge,
  addNode,
  emptyModel,
  fieldsOf,
  updateEdge,
} from "./model.ts";

/** A small drawing DSL: nodes by short ids, edges by ids of nodes. */
class Draw {
  m: Model;
  constructor(name: string) {
    this.m = { ...emptyModel(), name };
  }
  n(
    id: string,
    kind: NodeKind,
    title: string,
    patch: Partial<FlowNode> = {},
  ): this {
    this.m = addNode(this.m, kind, title, { ...patch, id, x: 0 }).model;
    return this;
  }
  e(
    from: string,
    to: string,
    msg?: string,
    o: {
      kind?: EdgeKind;
      cond?: string;
      payload?: string;
      port?: "out" | "ok" | "err";
      latency?: number;
    } = {},
  ): this {
    const r = addEdge(this.m, from, to, {
      kind: o.kind,
      msg,
      port: o.port,
      cond: o.cond ?? "",
      latency: o.latency ?? 0,
      payload: o.payload ? fieldsOf(o.payload) : [],
    });
    if (r) this.m = r.model;
    else throw new Error(`demo edge ${from} -> ${to} ${msg ?? ""} was not made`);
    return this;
  }
  /** the onError edge of an effect */
  err(from: string, to: string): this {
    return this.e(from, to, undefined, {
      port: "err",
      payload: "code:string=ECONNRESET; message:string=dependency failed",
    });
  }
  conds(c: Record<string, boolean>): this {
    this.m = { ...this.m, conds: c };
    return this;
  }
  requests(r: RequestSpec[]): this {
    this.m = { ...this.m, scenario: { ...this.m.scenario, requests: r } };
    return this;
  }
  done(): Model {
    return autoLayout(this.m);
  }
  setEdge(id: string, patch: Partial<FlowEdge>): this {
    this.m = updateEdge(this.m, id, patch);
    return this;
  }
}

const req = (
  rid: string,
  entry: string,
  at: number,
  payload: Record<string, string> = {},
): RequestSpec => ({ rid, entry, at, payload });

const R = "ip:string=203.0.113.9";

// ---- 1. Login with rate limit ----

export function loginDemo(): Model {
  const d = new Draw("Login with rate limit");
  d.n("ev", "ui-event", "click Sign in")
    .n("fh", "fe-handler", "login", {
      clientSet: {
        email: "{payload.email}",
        password: "{payload.password}",
        status: "loading",
      },
    })
    .n("fok", "fe-handler", "onLoggedIn", { clientSet: { status: "signed in" } })
    .n("ffail", "fe-handler", "onLoginFailed", {
      clientSet: { status: "failed", error: "{payload.body.error}" },
    })
    .n("fs", "fe-state", "session", { detail: "{payload.body.token}" })
    .n("rt", "route", "POST /login", { detail: "auth.login" })
    .n("h1", "handler", "auth.login", {
      detail: "validate, then count the attempt",
      reqSet: {
        step: "rate",
        email: "{payload.body.email}",
        secret: "{payload.body.password}",
        ip: "{payload.ip}",
      },
    })
    .n("incr", "effect", "redis.cmd", { detail: "INCR rl:{req.ip}" })
    .n("h2", "handler", "auth.login.counted", {
      detail: "over the limit? first hit of the window?",
      reqSet: { step: "lookup", hits: "{payload.count}" },
    })
    .n("expire", "effect", "redis.cmd", { detail: "EXPIRE rl:{req.ip} 60" })
    .n("log429", "effect", "log", { detail: "warn rate limited {req.ip}" })
    .n("r429", "effect", "http.respond", {
      status: 429,
      detail: '{"error":"rate_limited"}',
    })
    .n("pgu", "effect", "pg.query", {
      detail: "select id, email, password_hash from users where email = $1",
      timeoutMs: 800,
    })
    .n("h3", "handler", "auth.login.found", {
      detail: "no such user burns a verify too",
      reqSet: { step: "verify", userId: "{payload.rows.0.id}" },
    })
    .n("verify", "effect", "crypto.verify", { detail: "scrypt verify" })
    .n("h4", "handler", "auth.login.verified", {
      detail: "password ok?",
      reqSet: { step: "token", secret: "" },
    })
    .n("tok", "effect", "crypto.randomToken", { detail: "32 bytes" })
    .n("h5", "handler", "auth.login.token", {
      detail: "store the session",
      reqSet: { step: "store", token: "{payload.token}" },
    })
    .n("sess", "effect", "redis.cmd", {
      detail: "SET sess:{req.token} {req.userId} EX 3600",
      timeoutMs: 400,
    })
    .n("h6", "handler", "auth.login.stored", {
      detail: "answer 200 with the token",
      reqSet: { step: "done" },
      sharedSet: { lastLogin: "{req.email}" },
    })
    .n("log200", "effect", "log", { detail: "info login {req.userId}" })
    .n("r200", "effect", "http.respond", {
      status: 200,
      detail: '{"token":"{req.token}"}',
    })
    .n("log401", "effect", "log", { detail: "warn login failed {req.email}" })
    .n("r401", "effect", "http.respond", {
      status: 401,
      detail: '{"error":"invalid_credentials"}',
    })
    .n("efail", "error", "auth.failed", {
      detail: "any infrastructure failure of the above",
      reqSet: { step: "failed" },
    })
    .n("logerr", "effect", "log", { detail: "error dependency failed" })
    .n("r500", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"unavailable"}',
    })
    .n("habort", "handler", "http.aborted", { detail: "client went away" })
    .n("logab", "effect", "log", { detail: "warn client aborted {rid}" })
    .n("xc", "external", "Client", { plugin: "http" })
    .n("xpg", "external", "Postgres", { plugin: "pg" })
    .n("xr", "external", "Redis", { plugin: "redis" });
  d.e("ev", "fh", "ui.click")
    .e("fh", "rt", "http.request", {
      payload: `method=POST; path=/login; body.email={client.email}; body.password={client.password}; ${R}`,
    })
    .e("rt", "h1", "auth.login")
    .e("h1", "incr", "redis.cmd")
    .e("incr", "h2", "auth.login.counted", { payload: "count:number=1" })
    .err("incr", "efail")
    .e("h2", "expire", "redis.cmd", { cond: "firstHit" })
    .e("h2", "log429", "log", { cond: "limited" })
    .e("h2", "r429", "http.respond", { cond: "limited" })
    .e("h2", "pgu", "pg.query", { cond: "!limited" })
    .e("pgu", "h3", "auth.login.found", {
      payload:
        'rows:array=[{"id":7,"email":"ann@example.com","password_hash":"scrypt$16384$8$1$c2FsdA$a2V5"}]; rowCount:number=1',
    })
    .err("pgu", "efail")
    .e("h3", "verify", "crypto.verify", { cond: "userFound" })
    .e("h3", "r401", "http.respond", { cond: "!userFound" })
    .e("verify", "h4", "auth.login.verified", { payload: "ok:boolean=true" })
    .err("verify", "efail")
    .e("h4", "tok", "crypto.randomToken", { cond: "passwordOk" })
    .e("h4", "log401", "log", { cond: "!passwordOk" })
    .e("h4", "r401", "http.respond", { cond: "!passwordOk" })
    .e("tok", "h5", "auth.login.token", { payload: "token:string=tok_9d41c7" })
    .err("tok", "efail")
    .e("h5", "sess", "redis.cmd")
    .e("sess", "h6", "auth.login.stored", { payload: "ok:string=OK" })
    .err("sess", "efail")
    .e("h6", "log200", "log")
    .e("h6", "r200", "http.respond")
    .e("efail", "logerr", "log")
    .e("efail", "r500", "http.respond")
    .e("habort", "logab", "log")
    .e("r200", "fok", "onLoggedIn")
    .e("r429", "ffail", "onLoginFailed")
    .e("r401", "ffail", "onLoginFailed")
    .e("r500", "ffail", "onLoginFailed")
    .e("fok", "fs", "store.set");
  d.conds({ firstHit: true, limited: false, userFound: true, passwordOk: true });
  d.requests([
    req("r1", "ev", 0, { email: "ann@example.com", password: "correct horse" }),
    req("r2", "ev", 6, { email: "bob@example.com", password: "hunter2" }),
  ]);
  return d.done();
}

// ---- 2. Todo CRUD with cache ----

export function todoDemo(): Model {
  const d = new Draw("Todo CRUD with cache");
  d.n("evl", "ui-event", "load #todos")
    .n("fl", "fe-handler", "loadTodos")
    .n("evr", "ui-event", "drop #todo-row")
    .n("fr", "fe-handler", "reorder", {
      clientSet: { order: "{payload.order}" },
    })
    .n("fok", "fe-handler", "onTodos", { clientSet: { loading: "false" } })
    .n("fs", "fe-state", "todos", { detail: "{payload.body}" })
    .n("rl", "route", "GET /todos", { detail: "todos.list" })
    .n("hl", "handler", "todos.list", {
      detail: "read-through cache: look in Redis first",
      reqSet: { step: "cache", userId: "7" },
    })
    .n("cget", "effect", "redis.cmd", {
      detail: "GET cache:todos:{req.userId}",
      timeoutMs: 300,
    })
    .n("hc", "handler", "todos.list.cached", {
      detail: "hit: answer from the cache. miss: ask Postgres",
      reqSet: { step: "query" },
    })
    .n("rhit", "effect", "http.respond", {
      status: 200,
      detail: '{"todos":[{"id":1,"title":"cached"}],"cache":"hit"}',
    })
    .n("pgl", "effect", "pg.query", {
      detail: "select id, title, done, position from todos where user_id = $1 order by position",
    })
    .n("hq", "handler", "todos.list.loaded", {
      detail: "fill the cache, answer",
      reqSet: { step: "answer", todos: "{payload.rows}" },
    })
    .n("cset", "effect", "redis.cmd", {
      detail: "SET cache:todos:{req.userId} {req.todos} EX 30",
    })
    .n("hf", "handler", "todos.list.filled", {
      detail: "a failed cache fill is not a failed request",
      reqSet: { step: "respond" },
    })
    .n("rmiss", "effect", "http.respond", {
      status: 200,
      detail: '{"todos":{req.todos},"cache":"miss"}',
    })
    .n("rr", "route", "POST /todos/reorder", { detail: "todos.reorder" })
    .n("hr", "handler", "todos.reorder", {
      detail: "a transaction written as a step machine",
      reqSet: { step: "begin", userId: "7", order: "{payload.body.order}" },
    })
    .n("tbegin", "effect", "pg.tx.begin")
    .n("hb", "handler", "todos.reorder.began", {
      reqSet: { step: "update" },
    })
    .n("pgu", "effect", "pg.query", {
      detail: "update todos set position = v.pos from (values ...) v where todos.id = v.id",
    })
    .n("hu", "handler", "todos.reorder.updated", {
      detail: "all rows belong to the user?",
      reqSet: { step: "commit" },
    })
    .n("tcommit", "effect", "pg.tx.commit")
    .n("trb", "effect", "pg.tx.rollback")
    .n("r409", "effect", "http.respond", {
      status: 409,
      detail: '{"error":"not_yours"}',
    })
    .n("hco", "handler", "todos.reorder.committed", {
      detail: "invalidate the cache and tell the other tabs",
      reqSet: { step: "sync" },
    })
    .n("cdel", "effect", "redis.pipeline", {
      detail: "DEL cache:todos:{req.userId}; PUBLISH todos:{req.userId} reordered",
    })
    .n("hs", "handler", "todos.synced", { reqSet: { step: "answer" } })
    .n("r204", "effect", "http.respond", { status: 204, detail: "{}" })
    .n("efail", "error", "todos.failed", {
      detail: "never leave a transaction open",
      reqSet: { step: "failed" },
    })
    .n("trb2", "effect", "pg.tx.rollback")
    .n("logerr", "effect", "log", { detail: "error todos failed {rid}" })
    .n("r500", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"unavailable"}',
    })
    .n("xc", "external", "Client", { plugin: "http" })
    .n("xpg", "external", "Postgres", { plugin: "pg" })
    .n("xr", "external", "Redis", { plugin: "redis" });
  d.e("evl", "fl", "ui.mount")
    .e("fl", "rl", "http.request", {
      payload: "method=GET; path=/todos; headers.authorization=Bearer tok_9d41c7",
    })
    .e("rl", "hl", "todos.list")
    .e("hl", "cget", "redis.cmd")
    .e("cget", "hc", "todos.list.cached", {
      payload: "value:any=null",
    })
    .e("cget", "efail", "todos.failed", { port: "err", payload: "code:string=ETIMEDOUT; message:string=cache unavailable" })
    .e("hc", "rhit", "http.respond", { cond: "cacheHit" })
    .e("hc", "pgl", "pg.query", { cond: "!cacheHit" })
    .e("pgl", "hq", "todos.list.loaded", {
      payload:
        'rows:array=[{"id":1,"title":"write flow design","done":false,"position":1},{"id":2,"title":"run the simulation","done":false,"position":2}]; rowCount:number=2',
    })
    .err("pgl", "efail")
    .e("hq", "cset", "redis.cmd")
    .e("cset", "hf", "todos.list.filled", { payload: "ok:string=OK" })
    .e("cset", "hf", undefined, { port: "err", payload: "code:string=ETIMEDOUT; message:string=cache unavailable" })
    .e("hf", "rmiss", "http.respond")
    .e("evr", "fr", "ui.drop")
    .e("fr", "rr", "http.request", {
      payload:
        "method=POST; path=/todos/reorder; body.order={client.order}; headers.authorization=Bearer tok_9d41c7",
    })
    .e("rr", "hr", "todos.reorder")
    .e("hr", "tbegin", "pg.tx.begin")
    .e("tbegin", "hb", "todos.reorder.began", { payload: "tx:string=tx1" })
    .err("tbegin", "efail")
    .e("hb", "pgu", "pg.query")
    .e("pgu", "hu", "todos.reorder.updated", { payload: "rowCount:number=3" })
    .err("pgu", "efail")
    .e("hu", "tcommit", "pg.tx.commit", { cond: "ownsRows" })
    .e("hu", "trb", "pg.tx.rollback", { cond: "!ownsRows" })
    .e("hu", "r409", "http.respond", { cond: "!ownsRows" })
    .e("tcommit", "hco", "todos.reorder.committed", { payload: "ok:boolean=true" })
    .err("tcommit", "efail")
    .e("hco", "cdel", "redis.pipeline")
    .e("cdel", "hs", "todos.synced", { payload: "results:array=[1,1]" })
    .err("cdel", "efail")
    .e("hs", "r204", "http.respond")
    .e("efail", "trb2", "pg.tx.rollback")
    .e("efail", "logerr", "log")
    .e("efail", "r500", "http.respond")
    .e("rhit", "fok", "onTodos")
    .e("rmiss", "fok", "onTodos")
    .e("r204", "fok", "onTodos")
    .e("fok", "fs", "store.set");
  d.conds({ cacheHit: false, ownsRows: true });
  d.requests([
    req("r1", "evl", 0),
    req("r2", "evr", 10, { order: "[3,1,2]" }),
  ]);
  return d.done();
}

// ---- 3. Websocket chat with history ----

export function chatDemo(): Model {
  const d = new Draw("Websocket chat with history");
  d.n("evo", "ui-event", "open #chat")
    .n("fo", "fe-handler", "connect")
    .n("evs", "ui-event", "submit #message")
    .n("fsend", "fe-handler", "send", {
      clientSet: { draft: "{payload.text}" },
    })
    .n("fhist", "fe-handler", "onHistory")
    .n("fs", "fe-state", "messages", { detail: "{payload.body.history}" })
    .n("ro", "route", "GET /chat/:room", { detail: "chat.open" })
    .n("ho", "handler", "chat.open", {
      detail: "a new connection: send the last 20 messages",
      reqSet: { step: "history", room: "general", user: "ann" },
    })
    .n("lr", "effect", "redis.cmd", { detail: "LRANGE chat:{req.room} 0 19" })
    .n("hh", "handler", "chat.history", {
      reqSet: { step: "joined", history: "{payload.items}" },
    })
    .n("sendh", "effect", "ws.send", { detail: "history {req.history}" })
    .n("rm", "route", "WS /chat/:room", { detail: "chat.message" })
    .n("hm", "handler", "chat.message", {
      detail: "a frame arrived: store it first",
      reqSet: {
        step: "save",
        room: "general",
        user: "ann",
        text: "{payload.body.text}",
      },
    })
    .n("pgi", "effect", "pg.query", {
      detail: "insert into messages (room, author, body) values ($1, $2, $3) returning id",
    })
    .n("hsv", "handler", "chat.saved", {
      detail: "keep the last messages in Redis",
      reqSet: { step: "cache", id: "{payload.rows.0.id}" },
    })
    .n("lp", "effect", "redis.cmd", {
      detail: "LPUSH chat:{req.room} {req.text}",
    })
    .n("hpu", "handler", "chat.pushed", {
      detail: "fan out to the room, ack the sender",
      reqSet: { step: "broadcast" },
    })
    .n("bc", "effect", "ws.broadcast", { detail: "room {req.room}" })
    .n("ack", "effect", "ws.send", { detail: "ack {req.id}" })
    .n("efail", "error", "chat.failed", {
      reqSet: { step: "failed" },
    })
    .n("logerr", "effect", "log", { detail: "error chat failed {rid}" })
    .n("closeerr", "effect", "ws.send", { detail: "error frame" })
    .n("xc", "external", "Client", { plugin: "http" })
    .n("xpg", "external", "Postgres", { plugin: "pg" })
    .n("xr", "external", "Redis", { plugin: "redis" });
  d.e("evo", "fo", "ui.open")
    .e("fo", "ro", "http.request", {
      payload: "method=GET; path=/chat/general; headers.upgrade=websocket",
    })
    .e("ro", "ho", "chat.open")
    .e("ho", "lr", "redis.cmd")
    .e("lr", "hh", "chat.history", {
      payload: 'items:array=["ann: hello","bob: hi"]',
    })
    .err("lr", "efail")
    .e("hh", "sendh", "ws.send")
    .e("sendh", "fhist", "onHistory", {
      payload: 'body.history:array=["ann: hello","bob: hi"]',
    })
    .e("fhist", "fs", "store.set")
    .e("evs", "fsend", "ui.submit")
    .e("fsend", "rm", "ws.message", {
      payload: "body.text:string=hello everyone; method=WS; path=/chat/general",
    })
    .e("rm", "hm", "chat.message")
    .e("hm", "pgi", "pg.query")
    .e("pgi", "hsv", "chat.saved", { payload: "rows:array=[{\"id\":42}]" })
    .err("pgi", "efail")
    .e("hsv", "lp", "redis.cmd")
    .e("lp", "hpu", "chat.pushed", { payload: "length:number=21" })
    .err("lp", "efail")
    .e("hpu", "bc", "ws.broadcast")
    .e("hpu", "ack", "ws.send")
    .e("efail", "logerr", "log")
    .e("efail", "closeerr", "ws.send");
  d.conds({});
  d.requests([req("r1", "evo", 0), req("r2", "evs", 45)]);
  return d.done();
}

// ---- 4. Payment webhook with retries and idempotency key ----

export function paymentDemo(): Model {
  const d = new Draw("Payment webhook with retries and idempotency key");
  d.n("xc", "external", "Payment provider", { plugin: "http" })
    .n("rt", "route", "POST /webhooks/payment", { detail: "payment.hook" })
    .n("h1", "handler", "payment.hook", {
      detail: "check the signature before anything else",
      reqSet: {
        step: "signature",
        paymentId: "{payload.body.id}",
        amount: "{payload.body.amount}",
      },
    })
    .n("sig", "effect", "crypto.verify", { detail: "HMAC signature check" })
    .n("h2", "handler", "payment.verified", {
      detail: "genuine? then claim the idempotency key",
      reqSet: { step: "claim" },
    })
    .n("claim", "effect", "redis.cmd", {
      detail: "SET idem:{req.paymentId} 1 NX EX 86400",
      timeoutMs: 300,
    })
    .n("h3", "handler", "payment.claimed", {
      detail: "duplicate delivery? answer 200 and do nothing",
      reqSet: { step: "store" },
    })
    .n("rdup", "effect", "http.respond", {
      status: 200,
      detail: '{"status":"duplicate"}',
    })
    .n("pgi", "effect", "pg.query", {
      detail: "insert into payments (id, amount) values ($1, $2) on conflict do nothing",
    })
    .n("h4", "handler", "payment.stored", {
      detail: "tell the billing system (it may be flaky)",
      reqSet: { step: "ack" },
    })
    .n("ack", "effect", "fetch.request", {
      detail: "POST https://billing.example.com/api/ack",
      retries: 2,
      backoffMs: 100,
      timeoutMs: 1500,
    })
    .n("h5", "handler", "payment.acked", {
      reqSet: { step: "done" },
    })
    .n("r200", "effect", "http.respond", {
      status: 200,
      detail: '{"status":"processed","id":"{req.paymentId}"}',
    })
    .n("r400", "effect", "http.respond", {
      status: 400,
      detail: '{"error":"bad_signature"}',
    })
    .n("hf", "error", "payment.ackFailed", {
      detail: "release the key so the provider can retry later",
      reqSet: { step: "release" },
    })
    .n("rel", "effect", "redis.cmd", { detail: "DEL idem:{req.paymentId}" })
    .n("r502", "effect", "http.respond", {
      status: 502,
      detail: '{"error":"billing_unavailable"}',
    })
    .n("efail", "error", "payment.failed", { reqSet: { step: "failed" } })
    .n("logerr", "effect", "log", { detail: "error payment failed {rid}" })
    .n("r500", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"unavailable"}',
    })
    .n("xpg", "external", "Postgres", { plugin: "pg" })
    .n("xr", "external", "Redis", { plugin: "redis" })
    .n("xa", "external", "Third-party API", { plugin: "fetch" });
  d.e("xc", "rt", "http.request", {
    payload:
      "method=POST; path=/webhooks/payment; body.id=pay_1042; body.amount:number=4900; headers.x-signature=t=1,v1=9f2c; ip=198.51.100.7",
  })
    .e("rt", "h1", "payment.hook")
    .e("h1", "sig", "crypto.verify")
    .e("sig", "h2", "payment.verified", { payload: "ok:boolean=true" })
    .err("sig", "efail")
    .e("h2", "claim", "redis.cmd", { cond: "sigOk" })
    .e("h2", "r400", "http.respond", { cond: "!sigOk" })
    .e("claim", "h3", "payment.claimed", { payload: "value:string=OK" })
    .err("claim", "efail")
    .e("h3", "rdup", "http.respond", { cond: "duplicate" })
    .e("h3", "pgi", "pg.query", { cond: "!duplicate" })
    .e("pgi", "h4", "payment.stored", { payload: "rowCount:number=1" })
    .err("pgi", "hf")
    .e("h4", "ack", "fetch.request")
    .e("ack", "h5", "payment.acked", { payload: "status:number=204" })
    .err("ack", "hf")
    .e("h5", "r200", "http.respond")
    .e("hf", "rel", "redis.cmd")
    .e("hf", "r502", "http.respond")
    .e("efail", "logerr", "log")
    .e("efail", "r500", "http.respond");
  d.conds({ sigOk: true, duplicate: false });
  d.requests([req("r1", "xc", 0), req("r2", "xc", 14)]);
  // the billing API fails twice, the third attempt works: the retries are visible
  d.m = {
    ...d.m,
    scenario: {
      ...d.m.scenario,
      faults: [
        {
          id: "f-ack",
          kind: "error",
          target: "ack",
          rid: "r1",
          code: "ECONNREFUSED",
          ms: 2,
          on: true,
        },
      ],
    },
  };
  return d.done();
}

// ---- 5. Client abort and timeout ----

export function abortDemo(): Model {
  const d = new Draw("Client abort and timeout");
  d.n("ev", "ui-event", "click Export report")
    .n("fh", "fe-handler", "exportReport")
    .n("fok", "fe-handler", "onReport")
    .n("fs", "fe-state", "report", { detail: "{payload.body}" })
    .n("rt", "route", "GET /report", { detail: "report.get" })
    .n("h1", "handler", "report.get", {
      detail: "start a transaction and a deadline timer",
      reqSet: { step: "begin" },
    })
    .n("timer", "effect", "timer.after", { detail: "3000" })
    .n("tbegin", "effect", "pg.tx.begin")
    .n("h2", "handler", "report.began", { reqSet: { step: "aggregate" } })
    .n("agg", "effect", "pg.query", {
      detail: "select date_trunc('day', created_at), count(*) from events group by 1",
      latency: 900,
      timeoutMs: 2500,
    })
    .n("h3", "handler", "report.rows", {
      detail: "commit, then answer",
      reqSet: { step: "commit", rows: "{payload.rows}" },
    })
    .n("tcommit", "effect", "pg.tx.commit")
    .n("h4", "handler", "report.committed", { reqSet: { step: "answer" } })
    .n("r200", "effect", "http.respond", {
      status: 200,
      detail: '{"rows":{req.rows}}',
    })
    .n("htime", "handler", "request.timeout", {
      detail: "the deadline timer fired before the answer",
      reqSet: { step: "timeout" },
    })
    .n("trb", "effect", "pg.tx.rollback")
    .n("r504", "effect", "http.respond", {
      status: 504,
      detail: '{"error":"timeout"}',
    })
    .n("habort", "handler", "http.aborted", {
      detail: "the client hung up: only log it",
    })
    .n("logab", "effect", "log", { detail: "warn client aborted {rid}" })
    .n("efail", "error", "report.failed", { reqSet: { step: "failed" } })
    .n("trb2", "effect", "pg.tx.rollback")
    .n("r500", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"unavailable"}',
    })
    .n("xc", "external", "Client", { plugin: "http" })
    .n("xpg", "external", "Postgres", { plugin: "pg" });
  d.e("ev", "fh", "ui.click")
    .e("fh", "rt", "http.request", { payload: "method=GET; path=/report" })
    .e("rt", "h1", "report.get")
    .e("h1", "timer", "timer.after")
    .e("h1", "tbegin", "pg.tx.begin")
    .e("timer", "htime", "request.timeout", { payload: "deadline:boolean=true" })
    .e("tbegin", "h2", "report.began", { payload: "tx:string=tx1" })
    .err("tbegin", "efail")
    .e("h2", "agg", "pg.query")
    .e("agg", "h3", "report.rows", {
      payload: 'rows:array=[{"day":"2026-11-01","count":1204}]; rowCount:number=1',
    })
    .err("agg", "efail")
    .e("h3", "tcommit", "pg.tx.commit")
    .e("tcommit", "h4", "report.committed", { payload: "ok:boolean=true" })
    .err("tcommit", "efail")
    .e("h4", "r200", "http.respond")
    .e("htime", "trb", "pg.tx.rollback")
    .e("htime", "r504", "http.respond")
    .e("habort", "logab", "log")
    .e("efail", "trb2", "pg.tx.rollback")
    .e("efail", "r500", "http.respond")
    .e("r200", "fok", "onReport")
    .e("r504", "fok", "onReport")
    .e("r500", "fok", "onReport")
    .e("fok", "fs", "store.set");
  d.conds({});
  d.requests([req("r1", "ev", 0), req("r2", "ev", 25)]);
  d.m = {
    ...d.m,
    scenario: {
      ...d.m.scenario,
      faults: [
        {
          id: "f-abort",
          kind: "abort",
          target: "",
          rid: "r1",
          code: "",
          ms: 220,
          on: true,
        },
      ],
    },
  };
  return d.done();
}

export interface Demo {
  id: string;
  title: string;
  about: string;
  make: () => Model;
}

export const DEMOS: Demo[] = [
  {
    id: "login",
    title: "Login with rate limit",
    about:
      "Redis INCR + EXPIRE, a scrypt verify, the session in Redis; two users log in at once.",
    make: loginDemo,
  },
  {
    id: "todo",
    title: "Todo CRUD with cache",
    about:
      "A read-through cache, invalidation after a write, a Postgres transaction for reorder.",
    make: todoDemo,
  },
  {
    id: "chat",
    title: "Websocket chat with history",
    about:
      "A connection gets the last messages from Redis; a frame is stored, cached and broadcast.",
    make: chatDemo,
  },
  {
    id: "payment",
    title: "Payment webhook with retries and idempotency key",
    about:
      "A signature check, a Redis NX key, a flaky billing API that is retried, the key released on failure.",
    make: paymentDemo,
  },
  {
    id: "abort",
    title: "Client abort and timeout",
    about:
      "The client hangs up mid-query: the in-flight work is cancelled and the transaction rolled back; the other request is untouched.",
    make: abortDemo,
  },
];

export const demoOf = (id: string): Demo =>
  DEMOS.find((d) => d.id === id) ?? DEMOS[0];
