/**
 * The paging of the public lists (the original teamUP's `paging.rs`): a
 * `Paging` knows the page, the page count and the total; `links` builds the
 * pager — the same order, the same gaps and the same "page 1 has a clean
 * address" rule.
 */

export const CATALOG_PER_PAGE = 24; // projects
export const DIRECTORY_PER_PAGE = 48; // members

export interface Paging {
  /** The page to show, 1-based. */
  page: number;
  /** The number of pages (at least 1). */
  pages: number;
  /** The number of items in the whole list. */
  total: number;
  perPage: number;
}

/** The page of a raw query (`page=3`), 0 when there is none. */
export function requestedPage(rawQuery: string | undefined): number {
  if (!rawQuery) return 0;
  for (const pair of rawQuery.split("&")) {
    if (!pair.startsWith("page=")) continue;
    const n = Number(pair.slice("page=".length));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

/** The paging of a list: the page is clamped into the range. */
export function pagingOf(
  total: number,
  requested: number,
  perPage: number,
): Paging {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(requested, 1), pages);
  return { page, pages, total, perPage };
}

/** The half-open range of the items of this page. */
export function rangeOf(paging: Paging): { from: number; to: number } {
  const from = Math.min((paging.page - 1) * paging.perPage, paging.total);
  return { from, to: Math.min(from + paging.perPage, paging.total) };
}

export interface PageLink {
  label: string;
  href: string;
  /** The page this link points at is the one being shown. */
  current: boolean;
  /** The link is a "…" between two distant pages. */
  gap: boolean;
}

/**
 * The pager of a list. The order: "‹ Previous", the page numbers (the first,
 * the last and the ones within ±2 of the current), the "…" gaps, "Next ›".
 * An empty list of links when there is one page only.
 */
export function links(
  paging: Paging,
  path: string,
  rawQuery: string | undefined,
  labels: { previous: string; next: string },
): PageLink[] {
  if (paging.pages <= 1) return [];
  const out: PageLink[] = [];
  if (paging.page > 1) {
    out.push({
      label: `‹ ${labels.previous}`,
      href: hrefOf(path, rawQuery, paging.page - 1),
      current: false,
      gap: false,
    });
  }
  let last = 0;
  for (let n = 1; n <= paging.pages; n++) {
    const shown =
      n === 1 || n === paging.pages || Math.abs(n - paging.page) <= 2;
    if (!shown) continue;
    if (last && n - last > 1) {
      out.push({ label: "…", href: "", current: false, gap: true });
    }
    out.push({
      label: String(n),
      href: hrefOf(path, rawQuery, n),
      current: n === paging.page,
      gap: false,
    });
    last = n;
  }
  if (paging.page < paging.pages) {
    out.push({
      label: `${labels.next} ›`,
      href: hrefOf(path, rawQuery, paging.page + 1),
      current: false,
      gap: false,
    });
  }
  return out;
}

/**
 * The address of a page: the query without its `page=` pair, then `page=N`
 * (only when the page is not the first — the first page keeps the clean
 * address of the list).
 */
export function hrefOf(
  path: string,
  rawQuery: string | undefined,
  page: number,
): string {
  const kept = (rawQuery ?? "")
    .split("&")
    .filter((pair) => pair.length > 0 && !pair.startsWith("page="));
  if (page > 1) kept.push(`page=${page}`);
  return kept.length ? `${path}?${kept.join("&")}` : path;
}
