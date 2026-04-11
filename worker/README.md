# Dofus Worker

Cloudflare Worker qui sert les données Dofus (items + sets) depuis les releases GitHub
de [dofusdude/dofus3-main](https://github.com/dofusdude/dofus3-main).

## Ce que ça fait

- Proxy vers GitHub Releases (contourne les restrictions CORS du navigateur)
- Transforme les JSON bruts (`MAPPED_ITEMS.json`, `MAPPED_SETS.json`) en format allégé par langue
- Cache la version GitHub dans KV (1 appel max par heure, partagé entre tous les visiteurs)
- Cache le JSON transformé dans KV par langue
- Gestion du cache navigateur via `ETag` / `Cache-Control`
- Détection automatique de la langue via `Accept-Language` ou `?lang=`

## Prérequis

- [Node.js](https://nodejs.org) 18+
- Un compte [Cloudflare](https://cloudflare.com) (gratuit)

## Installation

```bash
cd worker
npm install
npx wrangler login
```

## Développement local

```bash
cd worker
npm run dev
```

Le Worker tourne sur `http://localhost:8787`. Le KV est simulé localement dans `.wrangler/state/`, aucun vrai ID
nécessaire.

## Déploiement en production

### 1. Créer le KV namespace

```bash
wrangler kv:namespace create KV
```

Récupérer l'`id` retourné et le coller dans `wrangler.prod.toml` :

```toml
[[kv_namespaces]]
binding = "KV"
id = "coller-lid-ici"
```

### 2. Configurer l'origine autorisée

Dans `wrangler.prod.toml`, remplacer l'URL par celle de ton site :

```toml
[vars]
ALLOWED_ORIGIN = "https://ton-domaine.com"
```

### 3. Déployer

```bash
wrangler deploy --config wrangler.prod.toml
```

Le Worker est accessible sur `https://dofus-worker.ton-sous-domaine.workers.dev`.

Pour l'associer à un sous-domaine personnalisé, aller dans le dashboard Cloudflare → Workers → ton worker → Settings →
Triggers → Custom Domains.

## Structure des fichiers

```
worker/
├── dofus-stuff-maker-worker.ts   # Code du Worker (TypeScript)
├── tsconfig.json                 # Config TypeScript
├── package.json                  # Dépendances (wrangler, types CF)
├── wrangler.toml                 # Config dev (versionné)
├── wrangler.prod.toml            # Config prod avec vrais IDs (gitignored)
└── README.md
```

## API

### `GET /`

Retourne le JSON transformé pour la langue détectée.

**Query params**

| Param  | Valeur                   | Description                                     |
|--------|--------------------------|-------------------------------------------------|
| `lang` | `fr` `en` `es` `pt` `de` | Force une langue (priorité sur Accept-Language) |

**Exemples**

```bash
# Langue détectée automatiquement depuis Accept-Language
curl https://dofus-worker.ton-sous-domaine.workers.dev

# Forcer l'anglais
curl https://dofus-worker.ton-sous-domaine.workers.dev?lang=en

# Avec ETag (304 si pas de nouvelle version)
curl -H 'If-None-Match: "3.5.1.2_fr"' https://dofus-worker.ton-sous-domaine.workers.dev
```

**Headers de réponse**

| Header          | Exemple                     | Description            |
|-----------------|-----------------------------|------------------------|
| `ETag`          | `"3.5.1.2_fr"`              | Version Dofus + langue |
| `Cache-Control` | `public, max-age=3600, ...` | Cache navigateur 1h    |

## Comportement du cache

```
Requête navigateur
  │
  ├─ Cache navigateur valide (< 1h)
  │    └─ Réponse locale, 0 appel réseau
  │
  └─ Cache expiré → appel Worker
       │
       ├─ KV "latest_release" < 1h
       │    └─ Version connue, pas d'appel GitHub
       │
       └─ KV périmé → appel GitHub API (1 fois/h max)
            │
            ├─ ETag identique    → 304, pas de transfert
            ├─ Version en KV     → 200 depuis KV
            └─ Nouvelle version  → fetch assets → transform → KV → 200
```

## Langues supportées

| Code | Langue            |
|------|-------------------|
| `fr` | Français (défaut) |
| `en` | Anglais           |
| `es` | Espagnol          |
| `pt` | Portugais         |
| `de` | Allemand          |
