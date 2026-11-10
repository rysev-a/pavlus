# redis plugin

Plugin `redis`: an own RESP2 client (RESP3 with `?protocol=3`) over `node:net` / `node:tls`, no dependencies.

```ts
createRedisPlugin({
  url: "redis://:password@host:6379/2",
  commandTimeoutMs: 5000,
  reconnect: { minMs: 50, maxMs: 5000 },
});
```

`rediss://` uses TLS. Options: `offlineQueue` (default true, `maxOfflineQueue` 1000), `connectTimeoutMs`, `reconnect: false | {minMs, maxMs, factor, jitter, maxAttempts}`, `protocol: 3`.

| effect              | fields                                                                  | reply                                                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `redis.cmd`         | `args: [...]`, `timeoutMs?`, `binary?`, `as?: "hash"\|"scores"\|"bool"` | the value (string / number / null / array)                                                                          |
| `redis.pipeline`    | `cmds: [[...], ...]`                                                    | `{results: [{ok: true, value} \| {ok: false, error}]}`                                                              |
| `redis.multi`       | `cmds`                                                                  | same as pipeline; `{results: null}` if EXEC was aborted                                                             |
| `redis.subscribe`   | `channel` or `pattern`, `onMessage`, `binary?`                          | `{subscribed}`; later `onMessage` messages `{channel, message, pattern?}` carrying the **subscribing effect's ctx** |
| `redis.unsubscribe` | `channel` or `pattern`, `onMessage?`                                    | `{unsubscribed}`; removes the subscriptions of the same `connId` (else `rid`)                                       |
| `redis.publish`     | `channel, message`                                                      | receivers count                                                                                                     |

Typed builders in `redisEffector`: `get set(ex,px,nx,xx,keepTtl,get) del exists incr incrBy decr expire pexpire ttl hget hset hgetall hdel lpush rpush lpop rpop lrange llen sadd srem smembers zadd zrange(withScores) mget mset eval evalsha pipeline multi subscribe psubscribe unsubscribe punsubscribe publish cmd`.

- Replies are utf8 strings; set `binary: true` to get Buffers. Arguments may be strings, numbers or Buffers.
- **Pipelining**: commands issued in the same tick share one packet; replies are matched in order.
- **Errors** reach `onError` as `{code, message}`: the server's error word (`ERR`, `WRONGTYPE`, `NOAUTH`...), or `TIMEOUT`, `CONNECTION`. A timed-out command's reply is still read off the wire and discarded (a blocked command such as `BLPOP` therefore holds the connection until the server answers; give it a shorter server-side timeout).
- **Timeouts**: `timeoutMs` / `commandTimeoutMs`, shortened by `ctx.deadline`.
- **Reconnect**: exponential backoff with jitter. In-flight commands fail with `CONNECTION`, commands issued while down wait in the offline queue, subscriptions are re-established. A wrong password is fatal (no retry loop).
- **cancel(rid)**: pending/queued commands of the rid are dropped without a reply; its subscriptions are removed (and `UNSUBSCRIBE` sent when it was the last).
- `plugin.metrics()`, `plugin.ready()`, `plugin.client` (`RedisClient.call(args)` for direct use).

`resp.ts` holds the encoder and the incremental `RespParser` (fuzz-tested across random chunk boundaries). `testserver.ts` starts a throwaway `redis-server` for tests; tests are skipped when the binary is missing.
