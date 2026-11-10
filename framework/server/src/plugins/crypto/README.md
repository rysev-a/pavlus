# crypto plugin

Plugin `crypto`: password hashing and random tokens as effects, so handlers stay pure. Node's `scrypt` runs on the libuv thread pool, so it never blocks the dispatch queue; the answer comes back as a message with the effect's ctx.

```ts
import { cryptoEffector as crypto } from "@pavlus/server/plugins/crypto";
return [crypto.hash(password, { replyTo: "hashed", onError: "failed" })]; // -> { hash }
return [crypto.verify(password, storedHash, { replyTo: "verified" })]; // -> { ok: boolean }
return [crypto.randomToken({ replyTo: "token", bytes: 32 })]; // -> { token } (base64url)
```

- hash format: `scrypt$N$r$p$salt$key` (base64url). It is self-describing, so raising the cost later keeps old hashes verifiable. Defaults N=16384, r=8, p=1, 32-byte key, 16-byte random salt; `createCryptoPlugin({ N, r, p, keyLength })` (tests use a small `N`).
- `verify` compares in constant time; a malformed hash is `{ ok: false }`, not an error.
- errors go to `onError` as `{ code: "CRYPTO", message }` (fallback message id `crypto.error`).
- `cancel(rid)` discards the answers of that request (the derivation itself cannot be interrupted).
- `plugin.stats()` -> `{ inflight, done, cancelled }`.
