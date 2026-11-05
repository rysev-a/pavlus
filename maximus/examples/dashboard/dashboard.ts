import { computed, html } from "../../src/mod.ts";
import type { Child } from "../../src/mod.ts";
import { BarChart, DonutChart, LineChart, fmt } from "./charts.ts";
import { SalesTable } from "./table.ts";
import { createFeed } from "./stream.ts";
import type { Feed } from "./stream.ts";

export function Dashboard(options: { feed?: Feed } = {}): Child {
  const feed = options.feed ?? createFeed();
  const revenue = computed(() =>
    feed.byRegion().reduce((n, r) => n + r.value, 0),
  );
  const orders = computed(() => feed.sales().length);

  return html`<header class="bar">
      <h1>Live sales</h1>
      <div class="controls">
        <button
          type="button"
          aria-pressed=${() => String(!feed.running())}
          @click=${() => feed.setRunning(!feed.running())}
        >
          ${() => (feed.running() ? "Pause" : "Resume")}
        </button>
        <label>
          Speed
          <select
            .value=${() => String(feed.intervalMs())}
            @change=${(e: Event) => feed.setInterval(Number((e.target as HTMLSelectElement).value))}
          >
            <option value="250">Fast</option>
            <option value="1000">Normal</option>
            <option value="3000">Slow</option>
          </select>
        </label>
        <button type="button" @click=${() => feed.reset()}>Reset</button>
      </div>
    </header>
    <p class="kpis">
      <span
        ><b>${() => "$" + Math.round(revenue()).toLocaleString("en")}</b>
        revenue</span
      >
      <span><b>${orders}</b> recent orders</span>
      <span role="status" class="muted"
        >${() => (feed.running() ? "live" : "paused")}</span
      >
    </p>
    <section class="grid">
      <article class="panel wide">
        <h2>Revenue per tick</h2>
        ${LineChart({ values: feed.perTick, label: "Revenue per tick", span: 40 })}
      </article>
      <article class="panel">
        <h2>By region</h2>
        ${BarChart({ data: feed.byRegion, label: "Revenue by region" })}
      </article>
      <article class="panel">
        <h2>By category</h2>
        ${DonutChart({ data: feed.byCategory, label: "Revenue by category" })}
      </article>
      <article class="panel wide">
        <h2>Latest sales</h2>
        <div class="scroll">${SalesTable({ sales: feed.sales })}</div>
      </article>
    </section>`;
}
