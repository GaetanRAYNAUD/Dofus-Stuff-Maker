import { ScheduledController } from '@cloudflare/workers-types';

const REPO = "dofusdude/dofus3-main";
const SUPPORTED_LANGS = ["fr", "en", "es", "pt", "de"] as const;
const DEFAULT_LANG = "fr";
const VERSION_CHECK_TTL_MS = 60 * 60 * 1000; // 1h between GitHub API calls

type Lang = (typeof SUPPORTED_LANGS)[number];

interface Env {
  KV: KVNamespace;
  ALLOWED_ORIGIN?: string;
  DEV?: string;
}

interface RefreshResult {
  data: TransformResult;
  etag: string;
}

// ─── Raw types (from GitHub release) ─────────────────────────────────────────

interface I18nString {
  de: string;
  en: string;
  es: string;
  fr: string;
  pt: string;
}

interface RawEffect {
  min: number;
  max: number;
  type: I18nString;
  min_max_irrelevant: number;
  templated: I18nString;
  element_id: number;
  is_meta: boolean;
  active: boolean;
}

interface RawItemType {
  id: number;
  name: I18nString;
  itemTypeId: number;
  superTypeId: number;
  categoryId: number;
}

interface RawConditionValue {
  element: string;
  element_id: number;
  operator: string;
  value: number;
  templated: I18nString;
}

interface RawCondition {
  value: RawConditionValue | null;
  is_operand: boolean;
  relation: string | null;
  children: RawCondition[] | null;
}

interface RawItem {
  ankama_id: number;
  type: RawItemType;
  description: I18nString;
  name: I18nString;
  image: string;
  conditions: RawCondition | null;
  level: number;
  used_in_recipes: unknown;
  characteristics: unknown;
  effects: RawEffect[] | null;
  dropMonsterIds: unknown;
  criticalHitBonus: number;
  maxCastPerTurn: number;
  apCost: number;
  range: number;
  minRange: number;
  criticalHitProbability: number;
  pods: number;
  iconId: number;
  parentSet: { id: number; name: string | null };
  hasParentSet: boolean;
}

interface RawSet {
  ankama_id: number;
  name: I18nString;
  items: number[];
  effects: Record<string, RawEffect[]> | null;
  level: number;
  contains_cosmetics: boolean;
  contains_cosmetics_only: boolean;
}

// ─── Output types ────────────────────────────────────────────────────────────

interface MappedEffect {
  id: number;
  min: number;
  max?: number;
}

interface MappedConditionLeaf {
  elementId: number;
  operator: string;
  value: number;
}

interface MappedConditionGroup {
  relation: string;
  children: MappedCondition[];
}

type MappedCondition = MappedConditionLeaf | MappedConditionGroup;

interface MappedItem {
  name: string;
  level: number;
  typeId: number;
  image: string;
  iconId: number;
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

interface MappedSetBonus {
  id: number;
  value: number;
}

interface MappedSet {
  name: string;
  level: number;
  items: number[];
  bonuses: Record<string, MappedSetBonus[]>;
}

interface TransformResult {
  version: string;
  lang: Lang;
  generatedAt: string;
  effectTypes: Record<number, string>;
  itemTypes: Record<number, string>;
  items: Record<number, MappedItem>;
  sets: Record<number, MappedSet>;
}

interface KVCacheEntry {
  data: TransformResult;
  etag: string;
  version: string;
}

interface KVReleaseEntry {
  release: GitHubRelease;
  checkedAt: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get("Origin");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const isDev = env.DEV === "true";
    const forceRefresh = isDev && url.searchParams.has("force");

    // Debug route to inspect KV contents (dev only)
    if (isDev && url.pathname === "/__debug/kv") {
      const keys = await env.KV.list();
      const values = await Promise.all(
        keys.keys.map(async ({ name }) => ({
          key: name,
          value: await env.KV.get(name, "json"),
        }))
      );
      return new Response(JSON.stringify(values, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const lang = resolveLang(req, url);
    const rawClientEtag = req.headers.get("If-None-Match");
    // Normalize weak ETags (W/"...") to strong form ("...") for comparison
    const clientEtag = rawClientEtag?.startsWith("W/") ? rawClientEtag.slice(2) : rawClientEtag;

    let refreshResult: RefreshResult;
    try {
      refreshResult = await refreshLang(env, ctx, lang, forceRefresh);
    } catch (err) {
      const cached = await env.KV.get<KVCacheEntry>(`dofus_${ lang }`, "json");
      if (cached) {
        console.warn("Refresh failed, using cached data:", (err as Error).message);
        return buildResponse(cached.data, cached.etag, env, req.method, origin);
      }
      return new Response(`Refresh failed: ${ (err as Error).message }`, { status: 502 });
    }

    // ETag match → browser already has the right version
    if (clientEtag === refreshResult.etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: refreshResult.etag, ...corsHeaders(env, origin) },
      });
    }

    return buildResponse(refreshResult.data, refreshResult.etag, env, req.method, origin);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const langIndex = new Date().getUTCHours() % SUPPORTED_LANGS.length;
    const lang = SUPPORTED_LANGS[langIndex];
    console.log(`Cron: refreshing lang=${ lang }`);

    try {
      await refreshLang(env, ctx, lang, true);
      console.log(`Cron: ${ lang } refreshed successfully`);
    } catch (err) {
      console.error(`Cron: ${ lang } refresh failed:`, (err as Error).message);
    }
  }
} satisfies ExportedHandler<Env>;

// ─── Core refresh logic ─────────────────────────────────────────────────────

async function refreshLang(env: Env, ctx: ExecutionContext, lang: Lang, forceRefresh: boolean): Promise<RefreshResult> {
  const cacheKey = `dofus_${ lang }`;

  const release = forceRefresh ? await fetchLatestRelease() : await getLatestRelease(env);

  const latestVersion = release.tag_name;
  const etag = `"${ latestVersion }_${ lang }"`;

  // Check KV cache
  const cached = forceRefresh ? null : await env.KV.get<KVCacheEntry>(cacheKey, "json");
  if (cached && cached.version === latestVersion) {
    return { data: cached.data, etag };
  }

  // Download & transform
  console.log(`New version: ${ latestVersion }, transforming lang=${ lang }`);
  const [itemsRaw, setsRaw] = await Promise.all([
                                                  downloadAsset<RawItem[]>(release, "MAPPED_ITEMS.json"),
                                                  downloadAsset<RawSet[]>(release, "MAPPED_SETS.json"),
                                                ]);
  const t0 = performance.now();
  const result = transformOneLang(itemsRaw, setsRaw, latestVersion, lang);
  console.log(`Transform (${ lang }): ${ (performance.now() - t0).toFixed(1) }ms`);

  // Store in KV (fire & forget)
  const kvPayload: KVCacheEntry = { data: result, etag, version: latestVersion };
  const kvPromise = env.KV.put(cacheKey, JSON.stringify(kvPayload), {
    expirationTtl: 60 * 60 * 24 * 7,
  }).catch((e) => console.error("KV write failed:", e));
  ctx.waitUntil(kvPromise);

  return { data: result, etag };
}

// ─── JSON response ───────────────────────────────────────────────────────────

function buildResponse(data: TransformResult, etag: string, env: Env, method: string, origin: string | null): Response {
  return new Response(method === "HEAD" ? null : JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      ETag: etag,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...corsHeaders(env, origin),
    },
  });
}

function corsHeaders(env: Env, requestOrigin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(",").map((o) => o.trim()) : null;

  let origin: string;
  if (!allowed) {
    origin = "*";
  } else if (requestOrigin && allowed.includes(requestOrigin)) {
    origin = requestOrigin;
  } else {
    origin = allowed[0]!;
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    ...(origin !== "*" && { Vary: "Origin" }),
  };
}

// ─── Language resolution ─────────────────────────────────────────────────────

function resolveLang(req: Request, url: URL): Lang {
  const queryLang = url.searchParams.get("lang");
  if (queryLang && (SUPPORTED_LANGS as readonly string[]).includes(queryLang)) {
    return queryLang as Lang;
  }

  const acceptLang = req.headers.get("Accept-Language") ?? "";
  for (const part of acceptLang.split(",")) {
    const code = part.trim().split(";")[0].split("-")[0].toLowerCase();
    if ((SUPPORTED_LANGS as readonly string[]).includes(code)) {
      return code as Lang;
    }
  }

  return DEFAULT_LANG;
}

// ─── GitHub helpers ──────────────────────────────────────────────────────────

async function getLatestRelease(env: Env): Promise<GitHubRelease> {
  const cached = await env.KV.get<KVReleaseEntry>("latest_release", "json");

  if (cached && Date.now() - cached.checkedAt < VERSION_CHECK_TTL_MS) {
    return cached.release;
  }

  const release = await fetchLatestRelease();

  await env.KV.put("latest_release", JSON.stringify({ release, checkedAt: Date.now() } satisfies KVReleaseEntry));

  return release;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const res = await fetch(`https://api.github.com/repos/${ REPO }/releases/latest`, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dofus-worker",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${ res.status }: ${ await res.text() }`);
  }
  return res.json() as Promise<GitHubRelease>;
}

async function downloadAsset<T>(release: GitHubRelease, filename: string): Promise<T> {
  const asset = release.assets.find((a) => a.name === filename);
  if (!asset) {
    throw new Error(`Asset "${ filename }" not found in ${ release.tag_name }`);
  }

  const res = await fetch(asset.browser_download_url);
  if (!res.ok) {
    throw new Error(`Download of "${ filename }" failed (${ res.status })`);
  }

  return res.json() as Promise<T>;
}

// ─── Transformation (single language, zero-copy where possible) ─────────────

const EQUIPMENT_SUPER_TYPES = new Set([1, 2, 3, 4, 5, 7, 10, 11, 12, 13]);
const EMPTY_EFFECTS: readonly MappedEffect[] = Object.freeze([]);

function mapEffect(e: RawEffect): MappedEffect {
  if (e.min_max_irrelevant === 0 && e.max) {
    return { id: e.element_id, min: e.min, max: e.max };
  }
  return { id: e.element_id, min: e.min };
}

function mapCondition(cond: RawCondition): MappedCondition {
  if (cond.is_operand && cond.value) {
    return {
      elementId: cond.value.element_id,
      operator: cond.value.operator,
      value: cond.value.value,
    };
  }

  const rawChildren = cond.children ?? [];
  const childrenLen = rawChildren.length;
  const mappedChildren = new Array(childrenLen);

  for (let i = 0; i < childrenLen; i++) {
    mappedChildren[i] = mapCondition(rawChildren[i]);
  }

  return {
    relation: cond.relation!,
    children: mappedChildren,
  };
}

/**
 * Transform raw data for a SINGLE language.
 *
 */
function transformOneLang(
  itemsRaw: RawItem[],
  setsRaw: RawSet[],
  version: string,
  lang: Lang,
): TransformResult {
  const effectTypes: Record<number, string> = {};
  const itemTypes: Record<number, string> = {};
  const items: Record<number, MappedItem> = {};
  const sets: Record<number, MappedSet> = {};

  // ── Items ──────────────────────────────────────────────────────────────────
  const keptItemIds = new Set<number>();

  for (let i = 0, len = itemsRaw.length; i < len; i++) {
    const item = itemsRaw[i];
    if (!EQUIPMENT_SUPER_TYPES.has(item.type.superTypeId)) {
      continue;
    }

    keptItemIds.add(item.ankama_id);

    // Map effects in a single pass: build MappedEffect[] + collect effectTypes
    let effects: MappedEffect[] | readonly MappedEffect[];
    const rawEffects = item.effects;
    if (rawEffects && rawEffects.length > 0) {
      const arr = new Array<MappedEffect>(rawEffects.length);
      for (let j = 0, elen = rawEffects.length; j < elen; j++) {
        const e = rawEffects[j];
        arr[j] = mapEffect(e);
        const eid = e.element_id;
        if (eid != null && !(eid in effectTypes)) {
          const t = e.type?.[lang];
          if (t) {
            effectTypes[eid] = t;
          }
        }
      }
      effects = arr;
    } else {
      effects = EMPTY_EFFECTS;
    }

    const mapped: MappedItem = {
      name: item.name[lang],
      level: item.level,
      typeId: item.type.id,
      image: item.image,
      iconId: item.iconId,
      setId: item.hasParentSet ? item.parentSet.id : null,
      effects: effects as MappedEffect[],
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

    if (!(item.type.id in itemTypes) && item.type.name?.[lang]) {
      itemTypes[item.type.id] = item.type.name[lang];
    }
  }

  // ── Sets ───────────────────────────────────────────────────────────────────
  for (let i = 0, len = setsRaw.length; i < len; i++) {
    const s = setsRaw[i];
    if (s.contains_cosmetics_only) {
      continue;
    }

    // Check if at least one item in the set was kept
    let hasKept = false;
    for (let j = 0, slen = s.items.length; j < slen; j++) {
      if (keptItemIds.has(s.items[j])) {
        hasKept = true;
        break;
      }
    }
    if (!hasKept) {
      continue;
    }

    const bonuses: Record<string, MappedSetBonus[]> = {};
    if (s.effects) {
      for (const count in s.effects) {
        const effects = s.effects[count];
        if (!effects?.length) {
          continue;
        }

        const mapped = new Array<MappedSetBonus>(effects.length);
        for (let k = 0, klen = effects.length; k < klen; k++) {
          const e = effects[k];
          mapped[k] = { id: e.element_id, value: e.min };
          if (!(e.element_id in effectTypes) && e.type?.[lang]) {
            effectTypes[e.element_id] = e.type[lang];
          }
        }
        bonuses[count] = mapped;
      }
    }

    sets[s.ankama_id] = {
      name: s.name[lang],
      level: s.level,
      items: s.items,
      bonuses,
    };
  }

  return {
    version,
    lang,
    generatedAt: new Date().toISOString(),
    effectTypes,
    itemTypes,
    items,
    sets,
  };
}
