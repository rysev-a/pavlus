import { render } from "../../src/mod.ts";
import { Dashboard } from "./dashboard.ts";

render(() => Dashboard(), document.getElementById("app")!);
