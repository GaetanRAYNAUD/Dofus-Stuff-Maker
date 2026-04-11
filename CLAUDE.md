# Dofus Stuff Maker

## Vue d'ensemble

Outil de création de stuff pour Dofus 3. Le projet contient pour l'instant un **Cloudflare Worker** (`worker/`) qui sert de proxy/cache entre le navigateur et les releases GitHub de [dofusdude/dofus3-main](https://github.com/dofusdude/dofus3-main).

## Architecture

### Worker (`worker/`)

- **Runtime** : Cloudflare Workers (TypeScript, compilé par wrangler)
- **Stockage** : Cloudflare KV (binding `KV`)
- **Source de données** : GitHub Releases API (`dofusdude/dofus3-main`) — fichiers `MAPPED_ITEMS.json` et `MAPPED_SETS.json`
- **Point d'entrée** : `worker/dofus-stuff-maker-worker.ts`

#### Fonctionnement
1. Reçoit une requête GET, détecte la langue (`?lang=` ou `Accept-Language`)
2. Vérifie la dernière release GitHub (cache KV 1h via `latest_release`)
3. Si même version → sert depuis KV ; sinon télécharge les assets, transforme via `transformOneLang()`, met en cache KV (TTL 7j)
4. Gère ETag/304 et Cache-Control (1h navigateur, stale-while-revalidate 24h)
5. Chaque langue est transformée/cachée indépendamment (lazy, au premier appel)

#### Transformation (`transformOneLang()`)
- Filtre les items par `superTypeId` (équipements uniquement, set `EQUIPMENT_SUPER_TYPES`)
- Extrait les effets, conditions, types d'effets et types d'items pour une seule langue
- Filtre les sets (exclut cosmétiques-only, garde uniquement ceux avec au moins un item retenu)
- Produit un `TransformResult` avec : `version`, `lang`, `generatedAt`, `effectTypes`, `itemTypes`, `items`, `sets`

#### Config
- `wrangler.toml` — config dev (versionné)
- `wrangler.prod.toml` — config prod avec vrais IDs KV et domaine (gitignored)
- Langues supportées : `fr` (défaut), `en`, `es`, `pt`, `de`

#### Routes dev
- `/__debug/kv` — inspecte le contenu KV (uniquement si `DEV=true`)
- `?force` — force le re-fetch GitHub (uniquement si `DEV=true`)

## Commandes

```bash
# Dev local
cd worker && wrangler dev

# Deploy prod
cd worker && wrangler deploy --config wrangler.prod.toml
```

## Stack

- **Frontend** : HTML/CSS + TypeScript (quelques fichiers JS compilés)
- **Hébergement front** : Cloudflare Pages
- **Pas de backend** — tout se passe dans le navigateur

## Conventions

- Code et commentaires en **anglais**
- Le worker est compilé par wrangler (TypeScript → JS, pas de bundler externe)
