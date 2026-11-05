# Performance

## What is fast, and why

- **No diffing.** A binding subscribes to the signals it reads and updates one DOM node. Updating one label in a 1000-row table touches one text node and does not look at the other 999 rows.
- **Components run once.** There is no re-render; the cost of an update is proportional to the number of *bindings that depend on what changed*.
- **Static HTML is parsed once** per call site and cloned (`<template>` clone), bindings are located by tree-walk index.
- **Keyed lists** (`each`) trim the common prefix/suffix, then compute a longest-increasing-subsequence so the minimum number of DOM moves happens. Rows are created once per key; data changes flow through accessors.
- **Event delegation.** Common events share one listener per type on `document`; a row costs a property assignment, not an `addEventListener`.
- **Batched, deduplicated updates.** Writes inside a `batch` (all event handlers) run each dependent effect once. A computed whose value did not change stops propagation.
- **Render effects first.** DOM bindings flush before user effects, so there is no layout thrash from effects reading stale DOM.

## Benchmark numbers

`npm run bench` runs `bench/run.ts`: a 1000-row keyed table (three bindings per row, one `class` binding that reads a shared "selected" signal) in jsdom, 25 timed iterations plus 3 warm-ups, median reported. Re-run for this document on node v22.23.4, jsdom 30:

| scenario | median | min | max |
| --- | ---: | ---: | ---: |
| create 1000 rows | 62.7 ms | 57.6 ms | 88.5 ms |
| update one row (label signal) | 0.002 ms | 0.002 ms | 0.140 ms |
| update all 1000 labels (batched) | 1.55 ms | 1.41 ms | 3.22 ms |
| select row (1000 class bindings re-evaluated) | 0.99 ms | 0.61 ms | 5.17 ms |
| swap rows 2 and N-1 | 0.48 ms | 0.25 ms | 0.61 ms |
| remove one row (middle) | 0.098 ms | 0.092 ms | 0.196 ms |
| append 1 row | 0.14 ms | 0.13 ms | 0.26 ms |
| clear all rows | 4.94 ms | 3.99 ms | 7.98 ms |

### Caveats: read this before quoting any number

- **jsdom is not a browser.** It has no layout, style or paint, and its DOM is plain JavaScript objects. These numbers measure Maximus's JavaScript plus jsdom's per-call cost. They are useful to compare scenarios with each other and to catch regressions. They do **not** predict browser frame times and must not be compared with js-framework-benchmark results.
- There are no comparisons with other frameworks here because none were run under the same harness. Claims like "faster than X" are not made.
- "Update one row" at 0.002 ms is below what the harness can resolve meaningfully; read it as "constant and tiny", not as a precise figure.
- Numbers vary by machine and run (see min/max). Treat differences under about 2x as noise.
- The harness runs in a single process after warm-ups; GC pauses are inside the max column.

What the table does show: update cost does not grow with list size when one row changes; the expensive operations are the ones that create or destroy DOM (create, clear), as expected.

## Size

Measured with `vite build` (library mode, ES, minified) and gzip level 9, bundles of the shipped modules with everything exported (no tree-shaking, except the last row):

| bundle | minified | gzip |
| --- | ---: | ---: |
| core | 8.7 kB | **2.9 kB** |
| core + dom | 36.2 kB | **11.1 kB** |
| core + dom + store | 39.9 kB | **12.1 kB** |
| everything in `maximus` (includes `testing`) | 41.7 kB | 12.8 kB |
| counter app (`signal`, `html`, `render`), tree-shaken | 24.9 kB | **7.9 kB** |

The design target was core <= 4 kB (met) and core + dom <= 9 kB gzip (**not met**: 11.1 kB). The template scanner and the error messages dominate. A tree-shaken counter is 7.9 kB because the scanner and `html` are needed by any app. Compared with a typical virtual-DOM runtime this is competitive; compared with Solid's compiled output (a few kB) or Svelte's (near-zero runtime for tiny apps) it is larger. See [comparison](./comparison.md).

Wave 2 modules (resource, router, form, ssr) will add to these numbers; they are not included.

## Practical advice

- Prefer `each` over mapping arrays into a child: `${() => items().map(...)}` re-creates every row on every change.
- Prefer many small bindings to one big function: `${() => a() + b()}` re-runs when either changes; two bindings re-run independently.
- Use stores (or signals as fields) for rows whose fields change often so that only the changed text node updates.
- Use `batch` when you write several signals outside an event handler (timers, promise callbacks).
- Use `untrack`/`peek` for reads that should not subscribe.
- Computeds are cached: compute filtered/sorted lists once with `computed`, not inside each binding.
- Measure in a real browser before optimising anything; the numbers above are only a regression guard.
