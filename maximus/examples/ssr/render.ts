/**
 * Server rendering without a DOM. No jsdom, no `document`: just Node.
 *
 *   node --experimental-strip-types examples/ssr/render.ts /products/3
 *   node --experimental-strip-types examples/ssr/render.ts /products/3 --stream
 */
import { renderToStream, renderToString } from "../../src/mod.ts";
import { delay } from "../shop/api.ts";
import { SsrApp } from "./app.ts";
import type { Hooks } from "./app.ts";

/** The HTML for `url` (state script included). */
export function renderPage(url: string, hooks?: Hooks): Promise<string> {
  return renderToString(() => SsrApp(hooks), { url });
}

/** The same page as a stream of chunks: the shell first, then each ready boundary, then the state. */
export function streamPage(url: string, hooks?: Hooks): ReadableStream<string> {
  return renderToStream(() => SsrApp(hooks), { url });
}

if (process.argv[1]?.endsWith("render.ts")) {
  const url = process.argv[2] ?? "/products/1";
  delay.ms = 30;
  if (process.argv.includes("--stream")) {
    for await (const chunk of streamPage(url)) {
      process.stdout.write(`${chunk}\n<!-- chunk -->\n`);
    }
  } else {
    console.log(await renderPage(url));
  }
}
