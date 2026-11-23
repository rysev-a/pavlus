import "./styles.css";
import { createApp, paintOnWrite } from "@pavlus/client";
import {
  createCanvas3dPlugin,
  createCanvasPlugin,
  createStorePlugin,
  createTimePlugin,
  DomPlugin,
} from "@pavlus/client/plugins";
import { initialState, rubik, type RubikState } from "../app/app.ts";

// The application code is pure. The outside world is plugins, wired here:
// the DOM, the state, the clock, and the two canvases (the 3D plugin draws
// through the plain canvas plugin).
export const app = createApp<RubikState>({
  app: paintOnWrite(rubik),
  plugins: [
    createStorePlugin<RubikState>(initialState()),
    new DomPlugin(),
    createTimePlugin(),
    createCanvasPlugin(),
    createCanvas3dPlugin(),
  ],
  mount: "#app",
});
