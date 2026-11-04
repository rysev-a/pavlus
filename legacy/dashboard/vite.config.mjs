// @ts-check
import { pavlus } from "@service-laboratory/pavlus/vite";

// Compiles *.pavlus templates into pure render/diff functions. `/api` goes
// to the admin-app backend (`npm run dev` there, port 3000).
export default {
  plugins: [pavlus()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
};
