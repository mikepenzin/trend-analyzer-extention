import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(root, "..");
const distDir = resolve(extensionDir, "dist");

// Load .env from extension root (if it exists) to get API_BASE_URL
let apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  try {
    const envText = await readFile(resolve(extensionDir, ".env"), "utf8");
    for (const line of envText.split("\n")) {
      const match = line.match(/^API_BASE_URL=(.+)$/);
      if (match) { apiBaseUrl = match[1].trim(); break; }
    }
  } catch { /* .env not present — fall through */ }
}
apiBaseUrl ??= "http://localhost:8787";
const define = { __API_BASE_URL__: JSON.stringify(apiBaseUrl) };

console.log(`[build] API_BASE_URL → ${apiBaseUrl}`);

await mkdir(resolve(distDir, "background"), { recursive: true });
await mkdir(resolve(distDir, "content"), { recursive: true });
await mkdir(resolve(distDir, "sidepanel"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(extensionDir, "background/service-worker.ts")],
    outfile: resolve(distDir, "background/service-worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114",
    define,
  }),
  build({
    entryPoints: [resolve(extensionDir, "content/extractor.ts")],
    outfile: resolve(distDir, "content/extractor.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114",
    define,
  }),
  build({
    entryPoints: [resolve(extensionDir, "sidepanel/sidepanel.ts")],
    outfile: resolve(distDir, "sidepanel/sidepanel.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114",
    define,
  })
]);
