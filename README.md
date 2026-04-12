# Dofus Stuff Maker

Outil de création de stuff pour Dofus 3.

## Architecture

```
src/              Sources TypeScript du front
public/
  data/
    items.json    Données générées automatiquement par le CI
  images/         Images des items téléchargées automatiquement par le CI
scripts/          Scripts CI (Node.js, sans dépendances)
build.mjs         Script de build esbuild
```

Application entièrement côté navigateur, déployée sur **GitHub Pages**.  
Il n'y a pas de backend — toutes les données sont pré-générées par le CI.

## Mise à jour des données

Un cron GitHub Actions tourne chaque jour à 15h UTC (`.github/workflows/check-new-dofus-version.yml`) :

1. **Détection de version** — interroge l'API GitHub Releases du dépôt [`dofusdude/dofus3-main`](https://github.com/dofusdude/dofus3-main) pour récupérer le tag de la dernière release.

2. **Transformation** (`scripts/process-items.mjs`) — télécharge les fichiers `MAPPED_ITEMS.json` et `MAPPED_SETS.json` depuis les assets de la release, filtre les équipements, et génère `public/data/items.json` avec toutes les langues embarquées (`fr`, `en`, `es`, `pt`, `de`).

3. **Téléchargement des images** (`scripts/download-images.mjs`) — télécharge les images manquantes dans `public/images/{id}.png` en lisant la liste d'items depuis le JSON généré à l'étape précédente. Les images déjà présentes sont ignorées.

4. **Commit automatique** — si `items.json` a changé, le workflow commit les fichiers modifiés avec le tag de version et pousse sur `main`.

Le workflow ne fait rien si la version n'a pas changé depuis le dernier run.

## Développement

```bash
npm install

# Build
npm run build

# Dev avec watch + serveur local
npm run dev

# Lancer les scripts CI manuellement
node scripts/process-items.mjs
node scripts/download-images.mjs
```
