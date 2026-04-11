// Types mirroring the TransformResult returned by the Cloudflare Worker.

export type Lang = "fr" | "en" | "es" | "pt" | "de";

// ─── Effects ──────────────────────────────────────────────────────────────────

export interface MappedEffect {
  /** Effect type id — key into DofusData.effectTypes */
  id: number;
  min: number;
  max?: number;
}

// ─── Conditions ───────────────────────────────────────────────────────────────

export interface MappedConditionLeaf {
  elementId: number;
  operator: string;
  value: number;
}

export interface MappedConditionGroup {
  relation: string;
  children: MappedCondition[];
}

export type MappedCondition = MappedConditionLeaf | MappedConditionGroup;

export function isConditionLeaf(c: MappedCondition): c is MappedConditionLeaf {
  return "elementId" in c;
}

export function isConditionGroup(c: MappedCondition): c is MappedConditionGroup {
  return "children" in c;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export interface MappedItem {
  name: string;
  level: number;
  /** Key into DofusData.itemTypes */
  typeId: number;
  image: string;
  iconId: number;
  /** null when the item belongs to no set */
  setId: number | null;
  effects: MappedEffect[];
  conditions?: MappedCondition;
  apCost?: number;
  minRange?: number;
  range?: number;
  criticalHitProbability?: number;
  criticalHitBonus?: number;
  maxCastPerTurn?: number;
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export interface MappedSetBonus {
  /** Effect type id */
  id: number;
  value: number;
}

export interface MappedSet {
  name: string;
  level: number;
  /** Ankama item ids that belong to this set */
  items: number[];
  /**
   * Set bonuses keyed by the number of equipped pieces.
   * e.g. { "2": [...], "3": [...] }
   */
  bonuses: Record<string, MappedSetBonus[]>;
}

// ─── Top-level payload ────────────────────────────────────────────────────────

export interface DofusData {
  version: string;
  lang: Lang;
  generatedAt: string;
  /** effectTypeId → human-readable label */
  effectTypes: Record<number, string>;
  /** itemTypeId → human-readable label */
  itemTypes: Record<number, string>;
  /** ankama_id → item */
  items: Record<number, MappedItem>;
  /** ankama_id → set */
  sets: Record<number, MappedSet>;
}
