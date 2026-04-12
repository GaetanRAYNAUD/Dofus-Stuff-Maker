import type { Lang } from "./types";

type Translations = Record<Lang, string>;

const UI = {
  slotHat:    { fr: "Chapeau",  en: "Hat",     es: "Sombrero", pt: "Chapéu",  de: "Hut"      },
  slotCape:   { fr: "Cape",     en: "Cloak",   es: "Capa",     pt: "Capa",    de: "Umhang"   },
  slotWeapon: { fr: "Arme",     en: "Weapon",  es: "Arma",     pt: "Arma",    de: "Waffe"    },
  slotShield: { fr: "Bouclier", en: "Shield",  es: "Escudo",   pt: "Escudo",  de: "Schild"   },
  slotPet:    { fr: "Familier", en: "Pet",     es: "Mascota",  pt: "Familiar", de: "Vertrauter" },
  slotAmulet: { fr: "Amulette", en: "Amulet",  es: "Amuleto",  pt: "Amuleto", de: "Amulett"  },
  slotRing:   { fr: "Anneau",   en: "Ring",    es: "Anillo",   pt: "Anel",    de: "Ring"     },
  slotBelt:   { fr: "Ceinture", en: "Belt",    es: "Cinturón", pt: "Cinto",   de: "Gürtel"   },
  slotBoots:  { fr: "Bottes",   en: "Boots",   es: "Botas",    pt: "Botas",   de: "Stiefel"  },
  slotDofus:  { fr: "Dofus",    en: "Dofus",   es: "Dofus",    pt: "Dofus",   de: "Dofus"    },
  loading:    { fr: "Chargement des données\u202f…", en: "Loading data\u2026", es: "Cargando datos\u2026", pt: "Carregando dados\u2026", de: "Daten werden geladen\u2026" },
  error:      { fr: "Erreur",   en: "Error",   es: "Error",    pt: "Erro",    de: "Fehler"   },
  statsEmpty: { fr: "Équipez des objets\npour voir les stats.", en: "Equip items\nto see stats.", es: "Equipa objetos\npara ver las stats.", pt: "Equipe itens\npara ver as stats.", de: "Rüste Gegenstände aus\num die Stats zu sehen." },
} satisfies Record<string, Translations>;

export type UIKey = keyof typeof UI;

export function t(key: UIKey, lang: Lang): string {
  return UI[key][lang];
}
