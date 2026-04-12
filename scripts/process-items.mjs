#!/usr/bin/env node
/**
 * Fetches the latest dofusdude release, transforms items and sets for all
 * supported languages, and writes the result to front/public/data/items.json.
 *
 * Usage (from repo root):
 *   node scripts/process-items.mjs
 */

import { mkdir, writeFile } from "fs/promises";
import { dirname, join }    from "path";
import { fileURLToPath }    from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_FILE = join(REPO_ROOT, "public", "data", "items.json");

const REPO = "dofusdude/dofus3-main";
const SUPPORTED_LANGS = ["fr", "en", "es", "pt", "de"];

// ─── GitHub helpers ───────────────────────────────────────────────────────────

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github.v3+json", "User-Agent": "dofus-stuff-maker-ci",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function downloadAsset(release, filename) {
  const asset = release.assets.find((a) => a.name === filename);
  if (!asset) {
    throw new Error(`Asset "${filename}" not found in ${release.tag_name}`);
  }
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) {
    throw new Error(`Download of "${filename}" failed (${res.status})`);
  }
  return res.json();
}

// ─── Transformation ────────────────────────────────────────────────────────────
// Output uses I18nString objects for all localised fields so the frontend can
// pick the right language at runtime without re-fetching.

const EQUIPMENT_SUPER_TYPES = new Set([1, 2, 3, 4, 5, 7, 10, 11, 12, 13]);

function pickLangs(i18n) {
  const out = {};
  for (const lang of SUPPORTED_LANGS) {
    if (i18n?.[lang]) {
      out[lang] = i18n[lang];
    }
  }
  return out;
}

function mapEffect(e) {
  if (e.min_max_irrelevant === 0 && e.max) {
    return { id: e.element_id, min: e.min, max: e.max };
  }
  return { id: e.element_id, min: e.min };
}

function mapCondition(cond) {
  if (cond.is_operand && cond.value) {
    return {
      elementId: cond.value.element_id, operator: cond.value.operator, value: cond.value.value,
    };
  }

  return {
    relation: cond.relation, children: (cond.children ?? []).map(mapCondition),
  };
}

function transform(itemsRaw, setsRaw, version) {
  const effectTypes = {}; // id → { fr, en, … }
  const itemTypes = {}; // id → { fr, en, … }
  const items = {}; // ankama_id → MappedItem
  const sets = {}; // ankama_id → MappedSet

  // ── Items ──────────────────────────────────────────────────────────────────
  const keptItemIds = new Set();

  for (const item of itemsRaw) {
    if (!EQUIPMENT_SUPER_TYPES.has(item.type.superTypeId)) {
      continue;
    }

    keptItemIds.add(item.ankama_id);

    // Effects
    const effects = [];
    for (const e of item.effects ?? []) {
      effects.push(mapEffect(e));

      // Collect effect type i18n
      if (e.element_id != null && !(e.element_id in effectTypes)) {
        const names = pickLangs(e.type);
        if (Object.keys(names).length > 0) {
          effectTypes[e.element_id] = names;
        }
      }
    }

    const mapped = {
      name: pickLangs(item.name),
      level: item.level,
      typeId: item.type.id,
      iconId: item.iconId,
      image: item.image ?? null,
      setId: item.hasParentSet ? item.parentSet.id : null,
      effects,
    };

    if (item.conditions) {
      mapped.conditions = mapCondition(item.conditions);
    }
    if (item.apCost) {
      mapped.apCost = item.apCost;
    }
    if (item.minRange) {
      mapped.minRange = item.minRange;
    }
    if (item.range) {
      mapped.range = item.range;
    }
    if (item.criticalHitProbability) {
      mapped.criticalHitProbability = item.criticalHitProbability;
    }
    if (item.criticalHitBonus) {
      mapped.criticalHitBonus = item.criticalHitBonus;
    }
    if (item.maxCastPerTurn) {
      mapped.maxCastPerTurn = item.maxCastPerTurn;
    }

    items[item.ankama_id] = mapped;

    // Collect item type i18n
    if (!(item.type.id in itemTypes)) {
      const names = pickLangs(item.type.name);
      if (Object.keys(names).length > 0) {
        itemTypes[item.type.id] = names;
      }
    }
  }

  // ── Sets ───────────────────────────────────────────────────────────────────
  for (const s of setsRaw) {
    if (s.contains_cosmetics_only) {
      continue;
    }
    if (!s.items.some((id) => keptItemIds.has(id))) {
      continue;
    }

    const bonuses = {};
    if (s.effects) {
      for (const [count, effects] of Object.entries(s.effects)) {
        if (!effects?.length) {
          continue;
        }
        bonuses[count] = effects.map((e) => {
          // Collect effect type i18n from set bonuses too
          if (e.element_id != null && !(e.element_id in effectTypes)) {
            const names = pickLangs(e.type);
            if (Object.keys(names).length > 0) {
              effectTypes[e.element_id] = names;
            }
          }
          return { id: e.element_id, value: e.min };
        });
      }
    }

    sets[s.ankama_id] = {
      name: pickLangs(s.name), level: s.level, items: s.items, bonuses,
    };
  }

  return {
    version, effectTypes, itemTypes, items, sets,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching latest release…");
  const release = await fetchLatestRelease();
  console.log(`Release: ${release.tag_name}`);

  console.log("Downloading assets…");
  const [itemsRaw, setsRaw] = await Promise.all([downloadAsset(release, "MAPPED_ITEMS.json"), downloadAsset(release, "MAPPED_SETS.json"),]);
  console.log(`Items: ${itemsRaw.length}, Sets: ${setsRaw.length}`);

  console.log("Transforming…");
  const t0 = performance.now();
  const result = transform(itemsRaw, setsRaw, release.tag_name);
  console.log(`Transform done in ${(performance.now() - t0).toFixed(0)}ms`);
  console.log(`  → ${Object.keys(result.items).length} items, ${Object.keys(result.sets).length} sets`);

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(result));
  console.log(`Written: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
