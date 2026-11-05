import { computed, each, html, signal } from "../../src/mod.ts";
import type { Accessor, Child } from "../../src/mod.ts";
import type { Sale } from "./stream.ts";

type Column = "id" | "region" | "category" | "amount";
const columns: { key: Column; label: string; numeric?: boolean }[] = [
  { key: "id", label: "#", numeric: true },
  { key: "region", label: "Region" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", numeric: true },
];

/**
 * A sortable table. Rows are keyed by sale id, so when new sales arrive or the
 * order changes the existing `<tr>` elements are moved, never recreated
 * (focus and hover state in a row survive a re-sort).
 */
export function SalesTable(props: { sales: Accessor<readonly Sale[]> }): Child {
  const sortBy = signal<Column>("id");
  const dir = signal<1 | -1>(-1);

  const sorted = computed(() => {
    const k = sortBy();
    const d = dir();
    return [...props.sales()].sort((a, b) => {
      const x = a[k];
      const y = b[k];
      const c =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return (c || a.id - b.id) * d;
    });
  });

  const toggle = (k: Column): void => {
    if (sortBy.peek() === k) dir.update((d) => (d === 1 ? -1 : 1));
    else {
      sortBy.set(k);
      dir.set(k === "amount" || k === "id" ? -1 : 1);
    }
  };

  return html`<table class="sales">
    <caption class="sr">
      Recent sales, sortable by column
    </caption>
    <thead>
      <tr>
        ${columns.map(
          (c) =>
            html`<th
              scope="col"
              class=${c.numeric ? "num" : ""}
              aria-sort=${() =>
                sortBy() !== c.key
                  ? "none"
                  : dir() === 1
                    ? "ascending"
                    : "descending"}
            >
              <button type="button" @click=${() => toggle(c.key)}>
                ${c.label}
                <span aria-hidden="true"
                  >${() =>
                    sortBy() === c.key ? (dir() === 1 ? "▲" : "▼") : ""}</span
                >
              </button>
            </th>`,
        )}
      </tr>
    </thead>
    <tbody>
      ${each(
        sorted,
        (s) => s.id,
        (s) =>
          html`<tr>
            <td class="num">${() => s().id}</td>
            <td>${() => s().region}</td>
            <td>${() => s().category}</td>
            <td class="num">$${() => s().amount}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}
