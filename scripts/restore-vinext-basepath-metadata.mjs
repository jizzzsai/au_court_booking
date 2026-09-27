import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const basePath = process.env.SITE_BASE_PATH ?? "";
if (!basePath) process.exit(0);

if (!/^\/[a-zA-Z0-9/_-]+$/.test(basePath) || basePath.endsWith("/")) {
  throw new Error(`Invalid SITE_BASE_PATH: ${basePath}`);
}

// vinext 1.0.0-beta.2 builds assets beneath the base path but sometimes drops
// these exports from the bundled entry. Its production static-file server needs
// both values to locate the generated CSS, JS, and font files.
const entryPath = resolve("dist/server/index.js");
const entry = await readFile(entryPath, "utf8");
if (entry.includes("__assetPrefix") || entry.includes("__basePath")) {
  throw new Error("Check the vinext build entry before restoring base-path metadata: exports already exist");
}

await appendFile(
  entryPath,
  `\nexport const __assetPrefix = ${JSON.stringify(basePath)};\nexport const __basePath = ${JSON.stringify(basePath)};\n`,
);
console.log(`[build] Restored vinext static-asset metadata for ${basePath}`);
