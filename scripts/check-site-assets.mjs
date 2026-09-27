import assert from "node:assert/strict";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000/";
const response = await fetch(siteUrl);
assert.equal(response.status, 200, `Website returned ${response.status}`);

const html = await response.text();
const assetPaths = [...new Set(
  [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.includes("/_next/static/")),
)];

assert.ok(assetPaths.some((path) => path.endsWith(".css")), "No CSS asset in page HTML");
assert.ok(assetPaths.some((path) => path.endsWith(".js")), "No JavaScript asset in page HTML");

for (const assetPath of assetPaths) {
  const url = new URL(assetPath, siteUrl);
  const asset = await fetch(url);
  assert.equal(asset.status, 200, `${url} returned ${asset.status}`);
  const contentType = asset.headers.get("content-type") ?? "";
  if (assetPath.endsWith(".css")) assert.match(contentType, /^text\/css/);
  if (assetPath.endsWith(".js")) assert.match(contentType, /^application\/javascript/);
  if (assetPath.endsWith(".woff2")) assert.match(contentType, /^font\/woff2/);
}

console.log(`Website and ${assetPaths.length} CSS, JavaScript, and font assets loaded successfully.`);
