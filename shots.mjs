// Capture the three Launch Radar screenshots with Playwright's headless shell.
// It serves the built out/ folder (dashboard plus data.js) on localhost and
// drives the real dashboard in a browser:
//   1-board.png    the ranked board with the integrity bar
//   2-detail.png   the detail drawer of the top-ranked protocol (row click)
//   3-filtered.png the board filtered to the RWA category (dropdown)
// Run from the repo root once `node main.ts` has written out/:
//   node shots.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const outPath = join(rootDir, "out");
const shotPath = join(rootDir, "screenshots");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

const staticServer = createServer(async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const file = join(outPath, requestPath === "" ? "dashboard/index.html" : requestPath);
  if (!file.startsWith(outPath) || !existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
const listenPort = staticServer.address().port;
const pageUrl = `http://127.0.0.1:${listenPort}/dashboard/index.html`;

const chrome = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
});
const tab = await chrome.newPage({ viewport: { width: 1440, height: 900 } });
tab.on("pageerror", (err) => console.error("page error:", err.message));
tab.on("console", (msg) => {
  if (msg.type() === "error") console.error("console error:", msg.text());
});

// 1. The board on its own.
await tab.goto(pageUrl, { waitUntil: "networkidle" });
await tab.waitForTimeout(600);
await tab.screenshot({ path: join(shotPath, "1-board.png") });

// 2. A protocol detail view: open the top-ranked row and wait for the drawer.
await tab.click("tbody tr.row:first-child");
await tab.waitForTimeout(600);
await tab.screenshot({ path: join(shotPath, "2-detail.png") });

// 3. A filtered view: reload, choose the RWA category, wait for the filtered table.
await tab.goto(pageUrl, { waitUntil: "networkidle" });
await tab.selectOption('select[aria-label="Category"]', "RWA");
await tab.waitForTimeout(600);
await tab.screenshot({ path: join(shotPath, "3-filtered.png") });

await chrome.close();
staticServer.close();
console.log("shots written to", shotPath);
