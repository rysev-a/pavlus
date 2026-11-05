# dashboard

A live sales dashboard: three SVG charts, a stream of events and a sortable table. No chart library: everything is the `svg` template tag reading signals.

```sh
cd examples/dashboard
npx vite build && npx vite preview --port 4302
```

- `charts.ts`: `LineChart` (path and area from a rolling series, nice axis ticks), `BarChart` (keyed bars, direct value labels) and `DonutChart` (arc lengths from `stroke-dasharray`, with a legend). Each is a function that runs once; a new data point updates attributes, not nodes. Colours are CSS variables (colour-blind-safe palette, dark mode); each chart has `role="img"` and a text summary in `aria-label`.
- `stream.ts`: `createFeed()` simulates a sales stream (seeded random numbers). The timer is created in an `effect` and torn down with `onCleanup`, so pause/resume and speed changes re-arm it, and unmounting the dashboard leaves no interval behind.
- `table.ts`: a keyed (`each` by sale id) sortable table with `aria-sort` buttons in the headers; sorting or new rows move existing `<tr>` elements instead of recreating them.
- Verified by `dashboard.test.ts` (vitest, jsdom, fake timers) and `e2e.cjs` (Playwright against the preview).
