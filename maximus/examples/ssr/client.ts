import "../shop/style.css";
import { hydrate, render } from "../../src/mod.ts";
import { SsrApp } from "./app.ts";

const app = document.getElementById("app")!;
// opened without the server (e.g. `vite preview`): nothing to adopt, render normally
if (app.querySelector("[data-mx-i]")) hydrate(() => SsrApp(), app);
else render(() => SsrApp(), app);
