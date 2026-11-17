// token-radar-01 entry point. Node 22, standard library only.
//
// The run, in order: read the sealed snapshot, score every pre-token
// protocol with the model in lib/model.ts, write the ranked board and the
// dashboard dataset into the output directory, copy the dashboard and the
// screenshots there, then write dossier.json last with the vendored make.fun
// helper. The dossier is derived from the finished output, so it goes last.
//
// The dashboard itself is a static page (dashboard/index.html, app.css and
// app.js) that reads data.js, which this file writes from the same board the
// judge grades. No framework, no network.
//
// Outside the grading container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { boardIssue, buildRadar, dataScript, describeBands, parseSnapshot, summarizeBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

/** Caps the scorer enforces (see reference/gate.json): the text cap shapes the dossier bytes, the rest refuse outright. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read a `--key <value>` argument, or fall back when it is absent. */
function flagValue(key: string, fallback: string): string {
  const pos = process.argv.indexOf(`--${key}`);
  if (pos >= 0 && pos + 1 < process.argv.length) return process.argv[pos + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${key}=`));
  if (joined === undefined) return fallback;
  return joined.slice(key.length + 3);
}

const inputOpt = flagValue("input", "/input");
const snapshotPath = inputOpt.endsWith(".json") ? inputOpt : join(inputOpt, "snapshot.json");
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: cannot find a snapshot at ${snapshotPath}; pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = flagValue("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

const snap = parseSnapshot(readFileSync(snapshotPath, "utf8"));
const { board, radar } = buildRadar(snap);
const problem = boardIssue(board, snap);
if (problem !== null) {
  process.stderr.write(`token radar: the board fails the gate: ${problem}\n`);
  process.exit(1);
}
const boardTotals = summarizeBoard(board, snap);
process.stdout.write(
  `token radar: board value $${boardTotals.total_implied_value_usd.toLocaleString("en-US")} across ${boardTotals.rows} rows, median $${boardTotals.median_implied_value_usd.toLocaleString("en-US")}; ${boardTotals.watchlist_rows} watchlist rows; top category ${boardTotals.top_category ?? "none"}\n` +
    `token radar: value bands: ${describeBands(board)}\n`,
);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "board.json"), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, "data.js"), dataScript(radar));

/** Copy a directory's plain files into `dest`, skipping dotfiles, and return the names copied. */
function copyPlainFiles(src: string, dest: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(src)) {
    if (entry.startsWith(".")) continue;
    const full = join(src, entry);
    if (!statSync(full).isFile()) continue;
    copyFileSync(full, join(dest, entry));
    names.push(entry);
  }
  return names;
}

copyPlainFiles(join(rootDir, "dashboard"), join(outDir, "dashboard"));
const shots = copyPlainFiles(join(rootDir, "screenshots"), join(outDir, "screenshots"));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ has ${shots.length} image${shots.length === 1 ? "" : "s"}; hand in 3: the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const shot of shots) {
  if (!SHOT_NAME.test(shot)) {
    process.stderr.write(`token radar: screenshots/${shot}: names are letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Dossier last: the scorer rebuilds it from this output and compares bytes.
writeFileSync(join(outDir, "dossier.json"), buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_CAP, screenshots: SHOT_LIMITS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, "board.json")}, ${join(outDir, "data.js")}, ${join(outDir, "dashboard")} (3 files), ${join(outDir, "screenshots")} (${shots.length} images) and ${join(outDir, "dossier.json")}\n`,
);
