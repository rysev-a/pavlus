import "./style.css";
import { render } from "../../src/mod.ts";
import { App } from "./app.ts";
import { persistCart } from "./cart.ts";

render(() => {
  persistCart();
  return App();
}, document.getElementById("app")!);
