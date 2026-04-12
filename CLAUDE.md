# Dofus Stuff Maker

## Vue d'ensemble

Outil de création de stuff pour Dofus 3. Les données sont générées automatiquement par un cron GitHub Actions depuis les releases de [dofusdude/dofus3-main](https://github.com/dofusdude/dofus3-main) et servies comme fichiers statiques avec le front.

## Architecture

```
scripts/          Scripts CI (Node.js, sans dépendances)
src/              Sources TypeScript du front
  types.ts        Types (DofusData, MappedItem, etc.)
  api.ts          Chargement du JSON local
  main.ts         Point d'entrée UI
public/           Assets statiques
  data/
    items.json    Généré par le CI (toutes les langues embarquées)
  images/         Images des items téléchargées par le CI ({id}.png)
build.mjs         Script de build esbuild
index.html        Page principale
style.css         Styles
```

## Pipeline de mise à jour des données

Cron quotidien à 15h UTC (`.github/workflows/check-new-dofus-version.yml`) :

1. **`scripts/process-items.mjs`** — interroge l'API GitHub Releases, télécharge `MAPPED_ITEMS.json` et `MAPPED_SETS.json`, transforme et filtre les données, écrit `public/data/items.json`
2. **`scripts/download-images.mjs`** — lit `items.json` et télécharge les images manquantes dans `public/images/{id}.png`
3. Le workflow commit et pousse uniquement si `items.json` a changé (nouvelle version détectée)

### Transformation (`scripts/process-items.mjs`)
- Filtre les items par `superTypeId` (équipements uniquement, set `EQUIPMENT_SUPER_TYPES`)
- Filtre les sets (exclut cosmétiques-only, garde uniquement ceux avec au moins un item retenu)
- Toutes les langues (`fr`, `en`, `es`, `pt`, `de`) sont embarquées dans un seul fichier — les champs localisés (`name`, `effectTypes`, `itemTypes`) sont des objets `{ fr, en, … }` plutôt que des strings
- Produit : `version`, `generatedAt`, `effectTypes`, `itemTypes`, `items`, `sets`

## Frontend

- Application entièrement côté navigateur, déployée sur **GitHub Pages**
- Charge `./data/items.json` au démarrage (cache HTTP navigateur)
- Détecte la langue via `navigator.language`, résout les strings i18n à l'affichage
- Les images sont référencées en local : `./images/{id}.png`
- Pas de backend, pas d'appel réseau externe à l'exécution

## Commandes

```bash
# Build du front (depuis la racine)
npm run build

# Dev avec watch + serveur local
npm run dev

# Lancer les scripts CI manuellement
node scripts/process-items.mjs
node scripts/download-images.mjs
```

## Conventions

- Code et commentaires en **anglais**
- Le front est compilé par esbuild (TypeScript → JS)
