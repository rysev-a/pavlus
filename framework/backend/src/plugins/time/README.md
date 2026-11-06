# time plugin

Plugin `time` (own effect set, not the browser plugin of the same name).

| effect         | fields                              |
| -------------- | ----------------------------------- |
| `timer.after`  | `id?, ms, replyTo, payload?`        |
| `timer.every`  | `id?, ms, replyTo, payload?`        |
| `timer.cancel` | `id`                                |
| `cron`         | `id?, expr, tz?, replyTo, payload?` |
| `cron.cancel`  | `id`                                |

- Timer messages carry the ctx of the effect, so the flow continues with the same `rid`. Starting an `id` again replaces the timer. A request deadline is `timer.after` replying `request.timeout`.
- `cancel(rid)` clears that rid's timers, **not** cron jobs (they belong to the process).
- `cron`: 5 fields (minute hour day-of-month month day-of-week) with `*`, lists `1,5`, ranges `1-5`, steps `*/15` `10-30/5`, names (`jan`, `mon`), `7` = Sunday; day-of-month and day-of-week both restricted means either. `tz` is an IANA zone (default `UTC`); DST gaps are skipped. Every tick dispatches `replyTo` with a **fresh ctx** `{rid: "job:<id>:<time>", conn: "job"}` and payload `payload ?? {job, at}`.
- Tests inject a clock: `createTimePlugin({ clock: createFakeClock(t0) })`, then `clock.advance(ms)`.
- `nextCron(parseCron(expr), after, tz)` is exported for planning/inspection.
