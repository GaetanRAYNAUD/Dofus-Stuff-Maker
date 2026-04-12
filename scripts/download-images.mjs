#!/usr/bin/env node
/**
 * Downloads item images from the Dofus worker and stores them locally.
 *
 * Usage (from repo root):
 *   node scripts/download-images.mjs          # skip already-present files
 *   node scripts/download-images.mjs --force  # re-download everything
 */

import { access, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, extname, join }             from "path";
import { fileURLToPath }                      from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, "..");
const IMAGES_DIR = join(REPO_ROOT, "public", "images");
const ITEMS_FILE = join(REPO_ROOT, "public", "data", "items.json");
const MANIFEST   = join(IMAGES_DIR, "manifest.json");
const CONCURRENCY = 3;
const FORCE       = process.argv.includes("--force");

// ─── Read items from local JSON ───────────────────────────────────────────────

async function fetchItems() {
  const raw = await readFile(ITEMS_FILE, "utf8");
  const data = JSON.parse(raw);
  return data.items; // Record<id, MappedItem>
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

async function runConcurrent(items, fn, limit) {
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      await fn(queue.shift());
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ─── Download one image ───────────────────────────────────────────────────────

async function downloadOne(id, imageUrl, stats, manifest) {
  const ext      = extname(new URL(imageUrl).pathname) || ".png";
  const filename = `${id}${ext}`;
  const filepath = join(IMAGES_DIR, filename);
  const relative = `images/${filename}`;

  if (!FORCE) {
    try {
      await access(filepath);
      manifest[id] = relative;
      stats.skipped++;
      printProgress(stats);
      return;
    } catch {
      // Not present — fall through to download
    }
  }

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    await writeFile(filepath, Buffer.from(buf));
    manifest[id] = relative;
    stats.downloaded++;
  } catch (err) {
    stats.errors++;
    console.error(`\n  ✗ item ${id}: ${err.message}`);
  }

  printProgress(stats);
}

// ─── Progress ─────────────────────────────────────────────────────────────────

function printProgress({ downloaded, skipped, errors, total }) {
  const done = downloaded + skipped + errors;
  process.stdout.write(
    `\r  ${done}/${total} traitées — ${downloaded} téléchargées, ${skipped} déjà présentes, ${errors} erreurs   `,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    // First run — empty manifest
  }

  console.log("Fetching item list from worker…");
  const items = await fetchItems();
  const entries = Object.entries(items);

  console.log(`${entries.length} items trouvés\n`);

  const stats = { downloaded: 0, skipped: 0, errors: 0, total: entries.length };

  const downloadable = entries.filter(([, item]) => item.image);
  stats.total = downloadable.length;

  const skipped = entries.length - downloadable.length;
  if (skipped > 0) console.log(`  (${skipped} items skipped — no image URL)\n`);

  await runConcurrent(
    downloadable,
    ([id, item]) => downloadOne(id, item.image, stats, manifest),
    CONCURRENCY,
  );

  process.stdout.write("\n\n");
  console.log(`Terminé : ${stats.downloaded} téléchargées, ${stats.skipped} ignorées, ${stats.errors} erreurs`);

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Manifest : ${MANIFEST}`);
}

main().catch((err) => {
  console.error("Fatal :", err);
  process.exit(1);
});
