/**
 * A 60-line HTTP server: it renders the page for each request into the HTML
 * that `vite build` produced, so the browser can hydrate it.
 *
 *   cd examples/ssr && npx vite build
 *   node --experimental-strip-types server.ts      # http://localhost:4400/products/3
 *   (add ?stream to see streaming)
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { delay } from "../shop/api.ts";
import { renderPage, streamPage } from "./render.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const port = Number(process.env.PORT ?? 4400);
delay.ms = 80;

const MARK = "<!--ssr-outlet-->";
const types: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // static files from the build
  const file = normalize(join(dist, url.pathname));
  if (
    url.pathname.startsWith("/assets/") &&
    file.startsWith(dist) &&
    existsSync(file)
  ) {
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(res);
    return;
  }
  const template = readFileSync(join(dist, "index.html"), "utf8");
  const [head, tail] = template.split(MARK) as [string, string];
  try {
    if (url.searchParams.has("stream")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.write(head);
      for await (const chunk of streamPage(url.pathname + url.search))
        res.write(chunk);
      res.end(tail);
    } else {
      const body = await renderPage(url.pathname + url.search);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(head + body + tail);
    }
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(e));
  }
}).listen(port, () => console.log(`http://localhost:${port}/products/3`));
