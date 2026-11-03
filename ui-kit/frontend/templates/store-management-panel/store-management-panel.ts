import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import type { Column as BarColumn } from "../../blocks/bar-chart/chart.ts";
import {
  type Column,
  columnsOf,
  type Row,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  type Filter,
  filtersOf,
  type ToolbarAction,
  toolbarAction,
} from "../../blocks/filter-bar/filters.ts";
import type { Item } from "../../blocks/progress-list/items.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  advanceOrder,
  alerts,
  cancelOrder,
  dashboardCards,
  type Order,
  ORDER_COLUMNS,
  ORDER_FILTERS,
  ORDERS,
  orderFooter,
  orderRows,
  PRODUCT_COLUMNS,
  PRODUCT_FILTERS,
  PRODUCTS,
  type Product,
  productFooter,
  productRows,
  restock,
  restockAll,
  salesBars,
  statusItems,
  topAlerts,
  warehouseCards,
  WAREHOUSE_FILTERS,
  warehousePasses,
  warehouseRows,
} from "./catalog.ts";
import {
  closedSheet,
  draftOfProduct,
  newProductDraft,
  orderSheet,
  type ProductDraft,
  productSheet,
  saveProduct,
  type SheetState,
  validateProduct,
} from "./sheets.ts";
import view from "./store-management-panel.pavlus";

export interface StoreData {
  products: Product[];
  orders: Order[];
  pFilter: string;
  pQuery: string;
  pSort: Sort | null;
  wFilter: string;
  oFilter: string;
  oQuery: string;
  oSort: Sort | null;
}

export interface StoreViews {
  dashStats: Card[];
  salesCols: BarColumn[];
  statusBars: Item[];
  alertList: StatusRow[];
  alertCount: number;
  pFilters: Filter[];
  pCols: Column[];
  pList: Row[];
  pFooter: string;
  wStats: Card[];
  wFilters: Filter[];
  wList: StatusRow[];
  oFilters: Filter[];
  oCols: Column[];
  oList: Row[];
  oFooter: string;
}

export interface StoreState extends AppState, StoreData, StoreViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  productActions: ToolbarAction[];
  warehouseActions: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Store",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "k-ai-chart" },
      { id: "orders", label: "Orders", icon: "k-ai-truck" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { id: "products", label: "Products", icon: "k-ai-tag" },
      { id: "warehouse", label: "Warehouse", icon: "k-ai-warehouse" },
    ],
  },
];

/** Pure: every view worked out from the data (and the badges of the sidebar). */
export function derive(s: StoreData & { groups: NavGroup[] }) {
  const fresh = s.orders.filter((o) => o.status === "new").length;
  const low = alerts(s.products).length;
  return {
    dashStats: dashboardCards(s.orders, s.products),
    salesCols: salesBars(),
    statusBars: statusItems(s.orders),
    alertList: topAlerts(s.products),
    alertCount: low,
    pFilters: filtersOf(
      PRODUCT_FILTERS,
      s.pFilter,
      s.products,
      (x, id) => x.status === id,
    ),
    pCols: columnsOf(PRODUCT_COLUMNS, s.pSort),
    pList: productRows(s.products, s.pFilter, s.pQuery, s.pSort),
    pFooter: productFooter(s.products, s.pFilter),
    wStats: warehouseCards(s.products),
    wFilters: filtersOf(
      WAREHOUSE_FILTERS,
      s.wFilter,
      s.products.filter((x) => x.status !== "archived"),
      warehousePasses,
    ),
    wList: warehouseRows(s.products, s.wFilter),
    oFilters: filtersOf(
      ORDER_FILTERS,
      s.oFilter,
      s.orders,
      (x, id) => x.status === id,
    ),
    oCols: columnsOf(ORDER_COLUMNS, s.oSort),
    oList: orderRows(s.orders, s.products, s.oFilter, s.oQuery, s.oSort),
    oFooter: orderFooter(s.orders, s.products, s.oFilter),
    groups: withBadge(
      withBadge(s.groups, "orders", fresh ? String(fresh) : ""),
      "warehouse",
      low ? String(low) : "",
    ),
  };
}

const data: StoreData & { groups: NavGroup[] } = {
  products: PRODUCTS,
  orders: ORDERS,
  pFilter: "all",
  pQuery: "",
  pSort: null,
  wFilter: "all",
  oFilter: "all",
  oQuery: "",
  oSort: null,
  groups: GROUPS,
};

export const initial: StoreState = {
  screen: "dashboard",
  title: "Dashboard",
  navOpen: false,
  notice: "",
  user: { name: "Nora Quill", role: "Store manager", initials: "NQ" },
  actions: [
    {
      id: "product",
      label: "New product",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  productActions: [toolbarAction("add", "Add product")],
  warehouseActions: [
    toolbarAction("all", "Restock all low", "k-ai-arrow-down", "default"),
  ],
  ...data,
  ...derive(data),
  sheet: closedSheet(),
};

export class StorePanel extends AdminApp<StoreState> {
  view = view;

  /** Change some of the data; every view and badge follows. */
  _commit(state: StoreState, changes: Partial<StoreData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  _close(state: StoreState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  _newProduct(): Effect[] {
    return patch({
      screen: "products",
      title: "Products",
      sheet: productSheet("", newProductDraft()),
    });
  }

  "top.action"(): Effect[] {
    return this._newProduct();
  }

  // ---- products
  "pfilter.pick"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, { pFilter: msg.payload as string });
  }

  "pfilter.search"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, { pQuery: msg.event?.value ?? "" });
  }

  "pfilter.action"(): Effect[] {
    return this._newProduct();
  }

  "products.sort"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, {
      pSort: toggleSort(state.pSort, msg.payload as string),
    });
  }

  "products.act"(msg: Message, state: StoreState): Effect[] {
    return this._editProduct(state, (msg.payload as [string, string])[0]);
  }

  "products.pick"(msg: Message, state: StoreState): Effect[] {
    return this._editProduct(state, msg.payload as string);
  }

  _editProduct(state: StoreState, id: string): Effect[] {
    const found = state.products.find((x) => x.id === id);
    return found
      ? patch({ sheet: productSheet(found.id, draftOfProduct(found)) })
      : [];
  }

  // ---- warehouse
  "wfilter.pick"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, { wFilter: msg.payload as string });
  }

  "wfilter.action"(_msg: Message, state: StoreState): Effect[] {
    const need = alerts(state.products).length;
    if (need === 0) return notice("Nothing is low");
    return [
      ...this._commit(state, { products: restockAll(state.products) }),
      ...notice(`${need} products restocked`),
    ];
  }

  _restock(msg: Message, state: StoreState): Effect[] {
    const [id] = msg.payload as [string, string];
    const name = state.products.find((x) => x.id === id)?.name;
    return [
      ...this._commit(state, { products: restock(state.products, id) }),
      ...notice(`${name} restocked`),
    ];
  }

  "warehouse.act"(msg: Message, state: StoreState): Effect[] {
    return this._restock(msg, state);
  }

  "alerts.act"(msg: Message, state: StoreState): Effect[] {
    return this._restock(msg, state);
  }

  // ---- orders
  "ofilter.pick"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, { oFilter: msg.payload as string });
  }

  "ofilter.search"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, { oQuery: msg.event?.value ?? "" });
  }

  "orders.sort"(msg: Message, state: StoreState): Effect[] {
    return this._commit(state, {
      oSort: toggleSort(state.oSort, msg.payload as string),
    });
  }

  _advance(state: StoreState, id: string): Effect[] {
    const moved = advanceOrder(state.orders, state.products, id);
    if (moved.short.length > 0) {
      const s = moved.short[0];
      return notice(`Not enough ${s.name}: ${s.short} short`);
    }
    const order = moved.orders.find((x) => x.id === id);
    return [
      ...this._commit(state, {
        orders: moved.orders,
        products: moved.products,
      }),
      ...notice(`${order?.number} is ${order?.status}`),
    ];
  }

  "orders.act"(msg: Message, state: StoreState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    if (what === "cancel") {
      return [
        ...this._commit(state, { orders: cancelOrder(state.orders, id) }),
        ...notice("Order cancelled"),
      ];
    }
    return this._advance(state, id);
  }

  "orders.pick"(msg: Message, state: StoreState): Effect[] {
    const found = state.orders.find((x) => x.id === msg.payload);
    return found ? patch({ sheet: orderSheet(found, state.products) }) : [];
  }

  // ---- the sheet: a product form or an order
  "sheet.close"(_msg: Message, state: StoreState): Effect[] {
    return this._close(state);
  }

  "sheet.field"(msg: Message, state: StoreState): Effect[] {
    const draft: ProductDraft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: productSheet(state.sheet.id, draft) });
  }

  "sheet.press"(msg: Message, state: StoreState): Effect[] {
    const { id, draft, kind } = state.sheet;
    if (kind === "order") {
      if (msg.payload === "cancel") {
        return [
          ...this._commit(state, { orders: cancelOrder(state.orders, id) }),
          ...this._close(state),
          ...notice("Order cancelled"),
        ];
      }
      const moved = advanceOrder(state.orders, state.products, id);
      if (moved.short.length > 0) {
        return [...this._close(state), ...this._advance(state, id)];
      }
      const order = moved.orders.find((x) => x.id === id);
      return [
        ...this._commit(state, {
          orders: moved.orders,
          products: moved.products,
        }),
        ...patch({
          sheet: order ? orderSheet(order, moved.products) : state.sheet,
        }),
        ...notice(`${order?.number} is ${order?.status}`),
      ];
    }
    if (msg.payload === "delete") {
      return [
        ...this._commit(state, {
          products: state.products.filter((x) => x.id !== id),
        }),
        ...this._close(state),
        ...notice("Product deleted"),
      ];
    }
    const errors = validateProduct(draft, state.products, id);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: productSheet(id, draft, errors) });
    }
    return [
      ...this._commit(state, {
        products: saveProduct(state.products, draft, id),
      }),
      ...this._close(state),
      ...notice(id ? "Product saved" : "Product added"),
    ];
  }
}

export const page = new StorePanel();
