// Bundles the two browser files into website/assets/js.
// They are plain scripts (IIFE), not ES modules, so the site also works when
// index.html is opened from disk (file://), where browsers block module scripts.
// Run: cd tools && npm install && npm run build
import { build } from "esbuild";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../website/assets/js/", import.meta.url));

// File name -> global that holds the module (use `Global.default(...)`).
const globals = { paint: "PhilosophiaPaint", scroll: "PhilosophiaScroll" };

for (const [name, globalName] of Object.entries(globals)) {
  const file = `${out}${name}.js`;
  await build({
    entryPoints: [fileURLToPath(new URL(`./src/${name}.js`, import.meta.url))],
    outfile: file,
    bundle: true,
    minify: true,
    format: "iife",
    globalName,
    target: "es2020",
    legalComments: "none",
    logLevel: "warning",
  });
  const bytes = readFileSync(file);
  console.log(
    `${name}.js  ${statSync(file).size} B  gzip ${gzipSync(bytes).length} B  brotli ${brotliCompressSync(bytes).length} B`,
  );
}
