import { fetchDofusData } from "./api";
import type { UIKey } from "./i18n";
import { t } from "./i18n";
import type { DofusData, Lang, MappedItem } from "./types";

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

  const iconEl = document.createElement("span");
  iconEl.className = "slot-icon";
  iconEl.textContent = slot.icon;

  const labelEl = document.createElement("span");
  labelEl.className = "slot-label";
  labelEl.textContent = label;

  const unequipBtn = document.createElement("button");
  unequipBtn.className = "slot-unequip";
  unequipBtn.setAttribute("aria-label", "Retirer");
  unequipBtn.setAttribute("tabindex", "-1");
  unequipBtn.textContent = "✕";
  unequipBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.querySelector(".slot-item-img")?.remove();
    if (!el.querySelector(".slot-icon")) el.insertBefore(iconEl, unequipBtn);
    if (!el.querySelector(".slot-label")) el.insertBefore(labelEl, unequipBtn);
    el.classList.remove("slot--equipped");
    saveSlot(slot.id, null);
  });

  el.append(iconEl, labelEl, unequipBtn);
  return el;
}

function equipItem(slotId: string, itemId: number, item: MappedItem, lang: Lang): void {
  const slot = document.querySelector<HTMLElement>(`.slot[data-slot="${ slotId }"]`);
  if (!slot) {
    return;
  }

  const name = item.name[lang] ?? item.name["fr"] ?? "";

  slot.querySelector(".slot-icon")?.remove();
  slot.querySelector(".slot-label")?.remove();
  slot.querySelector(".slot-item-img")?.remove();

  const img = document.createElement("img");
  img.className = "slot-item-img";
  img.src = `./images/${ itemId }.png`;
  img.alt = name;
  img.title = `${ name } (niv. ${ item.level })`;

  const unequipBtn = slot.querySelector(".slot-unequip");
  if (unequipBtn) {
    slot.insertBefore(img, unequipBtn);
  } else {
    slot.appendChild(img);
  }

  slot.classList.add("slot--equipped");
  saveSlot(slotId, itemId);
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

// ─── Stuff persistence ────────────────────────────────────────────────────────

const STUFF_KEY = "dofus-stuff";

function saveSlot(slotId: string, itemId: number | null): void {
  const state: Record<string, number> = JSON.parse(localStorage.getItem(STUFF_KEY) ?? "{}");
  if (itemId === null) delete state[slotId];
  else state[slotId] = itemId;
  localStorage.setItem(STUFF_KEY, JSON.stringify(state));
}

function loadStuff(): Record<string, number> {
  return JSON.parse(localStorage.getItem(STUFF_KEY) ?? "{}");
}

// ─── Slot resolution ──────────────────────────────────────────────────────────

/** Returns the id of the best slot to equip the item into.
 *  Prefers the first empty matching slot, falls back to the first matching slot. */
function findTargetSlotId(item: MappedItem): string | null {
  const allSlots: SlotDef[] = [
    ...EQUIPMENT_SLOTS,
    ...Array.from({ length: DOFUS_COUNT }, (_, i) => ({
      id: `dofus${ i + 1 }`,
      icon: "◈",
      i18nKey: "slotDofus" as UIKey,
      typeIds: [23, 151, 217],
    })),
  ];

  const valid = allSlots.filter(s => s.typeIds.includes(item.typeId));
  if (valid.length === 0) {
    return null;
  }

  for (const s of valid) {
    const el = document.querySelector<HTMLElement>(`.slot[data-slot="${ s.id }"]`);
    if (el && !el.classList.contains("slot--equipped")) {
      return s.id;
    }
  }

  return valid[0]!.id;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function normalizeForSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[-_]/g, " ")           // treat dashes/underscores as spaces
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function initSearch(data: DofusData, lang: Lang): void {
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  const resultsList = document.getElementById("search-results") as HTMLUListElement | null;
  if (!input || !resultsList) {
    return;
  }

  input.placeholder = t("searchPlaceholder", lang);

  const itemEntries = Object.entries(data.items) as [string, MappedItem][];

  function showResults(query: string): void {
    const normalizedQuery = normalizeForSearch(query);

    if (normalizedQuery.length < 2) {
      resultsList!.hidden = true;
      return;
    }

    const matches = itemEntries
      .filter(([, item]) => {
        const name = item.name[lang] ?? item.name["fr"] ?? "";
        return normalizeForSearch(name).includes(normalizedQuery);
      })
      .sort(([, a], [, b]) => {
        // Exact prefix matches first, then by level descending
        const na = normalizeForSearch(a.name[lang] ?? a.name["fr"] ?? "");
        const nb = normalizeForSearch(b.name[lang] ?? b.name["fr"] ?? "");
        const aPrefix = na.startsWith(normalizedQuery) ? 0 : 1;
        const bPrefix = nb.startsWith(normalizedQuery) ? 0 : 1;
        if (aPrefix !== bPrefix) {
          return aPrefix - bPrefix;
        }
        return b.level - a.level;
      })
      .slice(0, 12);

    resultsList!.innerHTML = "";

    if (matches.length === 0) {
      const li = document.createElement("li");
      li.className = "search-no-result";
      li.textContent = t("searchNoResult", lang);
      resultsList!.appendChild(li);
      resultsList!.hidden = false;
      return;
    }

    for (const [idStr, item] of matches) {
      const id = Number(idStr);
      const name = item.name[lang] ?? item.name["fr"] ?? "";
      const setName = item.setId !== null
        ? (data.sets[item.setId]?.name[lang] ?? data.sets[item.setId]?.name["fr"] ?? null)
        : null;

      const li = document.createElement("li");
      li.className = "search-result-item";

      const metaHtml = [
        setName ? `<span class="meta-set">${ setName }</span>` : null,
        `${ t("searchLevel", lang) } ${ item.level }`,
      ].filter(Boolean).join(" · ");

      const canEquip = findTargetSlotId(item) !== null;

      li.innerHTML = `
        <img class="search-result-img" src="./images/${ id }.png" alt="${ name }">
        <div class="search-result-info">
          <div class="search-result-name">${ name }</div>
          <div class="search-result-meta">${ metaHtml }</div>
        </div>
        ${ canEquip ? `<button class="search-result-equip">${ t("searchEquip", lang) }</button>` : "" }
      `;

      if (canEquip) {
        li.querySelector<HTMLButtonElement>(".search-result-equip")!
          .addEventListener("click", (e) => {
            e.stopPropagation();
            const slotId = findTargetSlotId(item);
            if (slotId) {
              equipItem(slotId, id, item, lang);
              resultsList!.hidden = true;
              input!.value = "";
            }
          });
      }

      resultsList!.appendChild(li);
    }

    resultsList!.hidden = false;
  }

  input.addEventListener("input", () => showResults(input.value));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      resultsList!.hidden = true;
      input.blur();
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!input.contains(e.target as Node) && !resultsList!.contains(e.target as Node)) {
      resultsList!.hidden = true;
    }
  });
}

// ─── Language selector ────────────────────────────────────────────────────────

const LANG_FLAG_FILE: Record<Lang, string> = {
  fr: "fr", en: "gb", es: "es", pt: "pt", de: "de",
};

const LANG_NAMES: Record<Lang, string> = {
  fr: "Français", en: "English", es: "Español", pt: "Português", de: "Deutsch",
};

function flagImg(lang: Lang, cls: string): string {
  return `<img class="${ cls }" src="./flags/${ LANG_FLAG_FILE[lang] }.svg" alt="${ lang }">`;
}

function initLangSelector(currentLang: Lang): void {
  const container = document.getElementById("lang-selector");
  if (!container) return;

  const btn = document.createElement("button");
  btn.className = "lang-current";
  btn.innerHTML = flagImg(currentLang, "lang-flag-img");

  const dropdown = document.createElement("ul");
  dropdown.className = "lang-dropdown";
  dropdown.hidden = true;

  for (const lang of SUPPORTED_LANGS) {
    const li = document.createElement("li");
    li.className = "lang-option";
    if (lang === currentLang) li.classList.add("lang-option--active");
    li.innerHTML = `${ flagImg(lang, "lang-flag-img") }<span>${ LANG_NAMES[lang] }</span>`;
    li.addEventListener("click", () => {
      localStorage.setItem("lang", lang);
      location.reload();
    });
    dropdown.appendChild(li);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });

  document.addEventListener("pointerdown", (e) => {
    if (!container.contains(e.target as Node)) dropdown.hidden = true;
  });

  container.append(btn, dropdown);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function detectLang(): Lang {
  const stored = localStorage.getItem("lang");
  if (stored && SUPPORTED_LANGS.includes(stored as Lang)) return stored as Lang;
  const code = navigator.language.split("-")[0]?.toLowerCase() ?? "";
  return (SUPPORTED_LANGS.includes(code as Lang) ? code : "fr") as Lang;
}

async function init(): Promise<void> {
  const loading = document.getElementById("loading")!;
  const app = document.getElementById("app")!;
  const loadingLabel = loading.querySelector<HTMLElement>(".loading-label")!;

  const lang = detectLang();

  // Apply i18n to static elements immediately (before fetch)
  initLangSelector(lang);
  loadingLabel.textContent = t("loading", lang);
  const dividerLabel = document.getElementById("dofus-divider-label");
  if (dividerLabel) dividerLabel.textContent = t("slotDofus", lang);
  const panelTitle = document.getElementById("panel-title");
  if (panelTitle) panelTitle.textContent = t("statsTitle", lang);
  const statsEmptyText = document.getElementById("stats-empty-text");
  if (statsEmptyText) statsEmptyText.innerHTML = t("statsEmpty", lang).replace("\n", "<br>");

  try {
    const data = await fetchDofusData();

    renderEquipmentGrid(lang);
    renderDofusRow(lang);
    initSearch(data, lang);

    // Restore saved stuff
    for (const [slotId, itemId] of Object.entries(loadStuff())) {
      const item = data.items[Number(itemId)];
      if (item) equipItem(slotId, Number(itemId), item, lang);
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
