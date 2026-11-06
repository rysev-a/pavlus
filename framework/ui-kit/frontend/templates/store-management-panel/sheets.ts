import {
  button,
  type Detail,
  detail,
  type Field,
  field,
  positive,
  selectField,
  type SheetButton,
} from "../../blocks/record-sheet/sheet.ts";
import {
  CATEGORIES,
  type Order,
  orderTotal,
  type Product,
  productName,
  STATUS_TONE,
  STEP_LABEL,
  usdc,
} from "./catalog.ts";

export interface ProductDraft {
  name: string;
  sku: string;
  category: string;
  price: string;
  stock: string;
  reorder: string;
  status: string;
}

/** What the sheet holds: a product being edited, or an order being looked at. */
export interface SheetState {
  open: boolean;
  kind: "product" | "order";
  /** The id of the product or the order; empty for a new product. */
  id: string;
  draft: ProductDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export const newProductDraft = (): ProductDraft => ({
  name: "",
  sku: "",
  category: CATEGORIES[0],
  price: "",
  stock: "0",
  reorder: "10",
  status: "draft",
});

export const draftOfProduct = (x: Product): ProductDraft => ({
  name: x.name,
  sku: x.sku,
  category: x.category,
  price: String(x.price),
  stock: String(x.stock),
  reorder: String(x.reorder),
  status: x.status,
});

const isCount = (text: string): boolean => {
  const n = positive(text, true);
  return n !== null && Number.isInteger(n);
};

/** Pure: what is wrong with the product form, by field. */
export function validateProduct(
  d: ProductDraft,
  list: Product[],
  id: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Enter the name of the product.";
  const sku = d.sku.trim();
  if (!sku) errors.sku = "Enter a SKU.";
  else if (
    list.some((x) => x.id !== id && x.sku.toLowerCase() === sku.toLowerCase())
  ) {
    errors.sku = "Another product has this SKU.";
  }
  if (positive(d.price) === null)
    errors.price = "The price must be above zero.";
  if (!isCount(d.stock))
    errors.stock = "Stock is a whole number, zero or more.";
  if (!isCount(d.reorder)) errors.reorder = "Use a whole number, zero or more.";
  return errors;
}

export function nextProductId(list: Product[]): string {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
  return `p${max + 1}`;
}

/** Pure: the list with the product of the form saved (a new one when `id` is empty). */
export function saveProduct(
  list: Product[],
  d: ProductDraft,
  id: string,
): Product[] {
  const next: Product = {
    id: id || nextProductId(list),
    name: d.name.trim(),
    sku: d.sku.trim(),
    category: d.category,
    price: Number(d.price),
    stock: Number(d.stock),
    reorder: Number(d.reorder),
    status: d.status as Product["status"],
  };
  return id ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
}

export function productFields(
  d: ProductDraft,
  errors: Record<string, string> = {},
): Field[] {
  const fields = [
    field("name", "Name", d.name, { placeholder: "Product name" }),
    field("sku", "SKU", d.sku, { placeholder: "AB-0001" }),
    selectField(
      "category",
      "Category",
      d.category,
      CATEGORIES.map((c) => [c, c]),
    ),
    field("price", "Price", d.price, { kind: "number", hint: "In dollars." }),
    field("stock", "Stock", d.stock, { kind: "number" }),
    field("reorder", "Reorder level", d.reorder, {
      kind: "number",
      hint: "At or below this the product is low.",
    }),
    selectField("status", "Status", d.status, [
      ["active", "Active"],
      ["draft", "Draft"],
      ["archived", "Archived"],
    ]),
  ];
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function productSheet(
  id: string,
  d: ProductDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    kind: "product",
    id,
    draft: d,
    title: id ? `Edit ${d.name || "product"}` : "New product",
    description: id
      ? "Change the details and save."
      : "It stays a draft until you make it active.",
    fields: productFields(d, errors),
    details: [],
    buttons: id
      ? [
          button("delete", "Delete", "destructive"),
          button("save", "Save changes"),
        ]
      : [button("save", "Add product")],
  };
}

export function orderSheet(order: Order, products: Product[]): SheetState {
  const step = STEP_LABEL[order.status];
  return {
    open: true,
    kind: "order",
    id: order.id,
    draft: newProductDraft(),
    title: `Order ${order.number}`,
    description: `${order.customer}, ${order.placed}`,
    fields: [],
    details: [
      ...order.lines.map((l) => {
        const price = products.find((x) => x.id === l.product)?.price ?? 0;
        return detail(
          `${l.qty} × ${productName(products, l.product)}`,
          usdc(l.qty * price),
        );
      }),
      detail("Total", usdc(orderTotal(order, products)), "info"),
      detail("Status", order.status, STATUS_TONE[order.status]),
    ],
    buttons: [
      ...(order.status === "new"
        ? [button("cancel", "Cancel order", "outline")]
        : []),
      ...(step ? [button("advance", step)] : []),
    ],
  };
}

export const closedSheet = (): SheetState => ({
  ...productSheet("", newProductDraft()),
  open: false,
});
