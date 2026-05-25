#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const indexPath = join(distDir, "index.html");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

console.log("\n== Static App Smoke ==");

try {
  await access(indexPath);
} catch {
  fail("dist/index.html was not created. Run npm run build first.");
}

const html = await readFile(indexPath, "utf8");

if (!html.includes('<div id="root"></div>')) {
  fail("dist/index.html is missing the React root.");
}

if (!html.includes("assets/")) {
  fail("dist/index.html does not reference built assets.");
}

console.log("PASS: Built app includes React root and bundled assets.");
