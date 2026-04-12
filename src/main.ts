import { fetchDofusData } from "./api";
import type { UIKey } from "./i18n";
import { t } from "./i18n";
import type { Lang, MappedItem } from "./types";

const SUPPORTED_LANGS: Lang[] = ["fr", "en", "es", "pt", "de"];

interface SlotDef {
  id: string;
  icon: string;
  i18nKey: UIKey;
  /** itemType ids accepted by this slot */
  typeIds: number[];
}

const EQUIPMENT_SLOTS: SlotDef[] = [
  // Left column (top → bottom)
  { id: "hat", icon: "◈", i18nKey: "slotHat", typeIds: [16] },
  { id: "cape", icon: "◈", i18nKey: "slotCape", typeIds: [17] },
  { id: "weapon", icon: "◈", i18nKey: "slotWeapon", typeIds: [2, 3, 4, 5, 6, 7, 8, 19, 114, 271] },
  { id: "shield", icon: "◈", i18nKey: "slotShield", typeIds: [82] },
  { id: "pet", icon: "◈", i18nKey: "slotPet", typeIds: [18, 121, 331, 332, 333] },
  // Right column (top → bottom)
  { id: "amulet", icon: "◈", i18nKey: "slotAmulet", typeIds: [1] },
  { id: "ring1", icon: "◈", i18nKey: "slotRing", typeIds: [9] },
  { id: "ring2", icon: "◈", i18nKey: "slotRing", typeIds: [9] },
  { id: "belt", icon: "◈", i18nKey: "slotBelt", typeIds: [10] },
  { id: "boots", icon: "◈", i18nKey: "slotBoots", typeIds: [11] },
];

const DOFUS_COUNT = 6;

// ─── Rendering ────────────────────────────────────────────────────────────────

function createSlot(slot: SlotDef, lang: Lang): HTMLElement {
  const label = t(slot.i18nKey, lang);
  const el = document.createElement("div");
  el.className = "slot";
  el.dataset["slot"] = slot.id;
  el.setAttribute("aria-label", label);
  el.innerHTML = `<span class="slot-icon">${ slot.icon }</span><span class="slot-label">${ label }</span>`;
  return el;
}

function equipItem(slotId: string, itemId: number, item: MappedItem, lang: Lang): void {
  const slot = document.querySelector<HTMLElement>(`.slot[data-slot="${ slotId }"]`);
  if (!slot) {
    return;
  }

  const name = item.name[lang] ?? item.name["fr"] ?? "";
  slot.classList.add("slot--equipped");
  slot.innerHTML = `<img class="slot-item-img" src="./images/${ itemId }.png" alt="${ name }" title="${ name } (niv. ${ item.level })">`;
}

function renderEquipmentGrid(lang: Lang): void {
  const grid = document.getElementById("equipment-grid")!;
  for (const slot of EQUIPMENT_SLOTS) {
    grid.appendChild(createSlot(slot, lang));
  }
}

function renderDofusRow(lang: Lang): void {
  const row = document.getElementById("dofus-row")!;
  for (let i = 1; i <= DOFUS_COUNT; i++) {
    row.appendChild(createSlot({ id: `dofus${ i }`, icon: "◈", i18nKey: "slotDofus", typeIds: [23, 151, 217] }, lang));
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function detectLang(): Lang {
  const code = navigator.language.split("-")[0]?.toLowerCase() ?? "";
  return (SUPPORTED_LANGS.includes(code as Lang) ? code : "fr") as Lang;
}

async function init(): Promise<void> {
  const loading = document.getElementById("loading")!;
  const app = document.getElementById("app")!;
  const loadingLabel = loading.querySelector<HTMLElement>(".loading-label")!;

  const lang = detectLang();

  try {
    const data = await fetchDofusData();

    renderEquipmentGrid(lang);
    renderDofusRow(lang);

    // Hardcoded test items
    const testAmulet = data.items[6742];
    if (testAmulet) {
      equipItem("amulet", 6742, testAmulet, lang);
    }

    const testRing = data.items[6743];
    if (testRing) {
      equipItem("ring1", 6743, testRing, lang);
    }

    const testBelt = data.items[6745];
    if (testBelt) {
      equipItem("belt", 6745, testBelt, lang);
    }

    const versionEl = document.getElementById("app-version");
    if (versionEl) {
      versionEl.textContent = `v${ data.version }`;
    }

    console.log(`Loaded ${ Object.keys(data.items).length } items, ${ Object.keys(data.sets).length } sets`);

    loading.hidden = true;
    app.hidden = false;
  } catch (err) {
    console.error(err);
    loadingLabel.textContent = `${ t("error", lang) } : ${ (err as Error).message }`;
    loadingLabel.style.color = "#c83020";
  }
}

void init();
