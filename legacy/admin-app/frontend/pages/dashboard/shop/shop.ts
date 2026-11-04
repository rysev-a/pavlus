import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./shop.pavlus";

export interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
}

export interface ShopState {
  items: Product[];
  status: "idle" | "loading" | "failed";
}

export const initialShop: ShopState = { items: [], status: "idle" };

/** The `/dashboard/shop` page: the catalogue, loaded when the route enters. */
export class Shop extends Component<ShopState> {
  view = view;

  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "products",
        url: "/api/products",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  // Entered by the router: start loading the products.
  enter(): Effect[] {
    return this.load();
  }

  loaded(msg: Message): Effect[] {
    return [
      store.set("items", (msg.payload as { data: Product[] }).data),
      store.set("status", "idle"),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }
}

export const shop = new Shop();
