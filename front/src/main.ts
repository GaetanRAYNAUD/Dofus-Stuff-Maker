import { fetchDofusData } from "./api";
import type { Lang, MappedItem } from "./types";

const SUPPORTED_LANGS: Lang[] = ["fr", "en", "es", "pt", "de"];

interface SlotDef {
  id: string;
  label: string;
  icon: string;
}

const EQUIPMENT_SLOTS: SlotDef[] = [
  // Left column (top → bottom)
  { id: "hat", label: "Chapeau", icon: "◈" },
  { id: "cape", label: "Cape", icon: "◈" },
  { id: "weapon", label: "Arme", icon: "◈" },
  { id: "shield", label: "Bouclier", icon: "◈" },
  { id: "pet", label: "Familier", icon: "◈" },
  // Right column (top → bottom)
  { id: "amulet", label: "Amulette", icon: "◈" },
  { id: "ring1", label: "Anneau", icon: "◈" },
  { id: "ring2", label: "Anneau", icon: "◈" },
  { id: "belt", label: "Ceinture", icon: "◈" },
  { id: "boots", label: "Bottes", icon: "◈" },
];

const DOFUS_COUNT = 6;

// ─── Rendering ────────────────────────────────────────────────────────────────

function createSlot({ id, label, icon }: SlotDef): HTMLElement {
  const el = document.createElement("div");
  el.className = "slot";
  el.dataset["slot"] = id;
  el.setAttribute("aria-label", label);
  el.innerHTML = `<span class="slot-icon">${ icon }</span><span class="slot-label">${ label }</span>`;
  return el;
}

function equipItem(slotId: string, item: MappedItem): void {
  const slot = document.querySelector<HTMLElement>(`.slot[data-slot="${ slotId }"]`);
  if (!slot) {
    return;
  }

  slot.classList.add("slot--equipped");
  slot.innerHTML = `<img class="slot-item-img" src="${ item.image }" alt="${ item.name }" title="${ item.name } (niv. ${ item.level })">`;
}

function renderEquipmentGrid(): void {
  const grid = document.getElementById("equipment-grid")!;
  for (const slot of EQUIPMENT_SLOTS) {
    grid.appendChild(createSlot(slot));
  }
}

function renderDofusRow(): void {
  const row = document.getElementById("dofus-row")!;
  for (let i = 1; i <= DOFUS_COUNT; i++) {
    row.appendChild(createSlot({ id: `dofus${ i }`, label: "Dofus", icon: "◈" }));
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
  const loadingLabel = loading.querySelector(".loading-label")!;

  try {
    const lang = detectLang();
    const data = await fetchDofusData(lang);

    renderEquipmentGrid();
    renderDofusRow();

    // Hardcoded test: amulet 6742
    const testAmulet = data.items[6742];
    if (testAmulet) {
      equipItem("amulet", testAmulet);
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
    loadingLabel.textContent = `Erreur : ${ (err as Error).message }`;
    loadingLabel.style.color = "#c83020";
  }
}

init();
