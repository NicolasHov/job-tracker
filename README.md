# Compteur de silence — instructions de configuration

Deux parties :
1. Fonction serverless sur **Vercel** → parle à Notion, stocke le record dans Upstash Redis
2. Page statique sur **GitHub Pages** → affiche le compteur en noir/néon

Tout est gratuit (plans Hobby/Free de Vercel, Upstash, GitHub Pages).

---

## Étape 1 — Créer une intégration Notion

1. https://www.notion.so/my-integrations → "New integration"
2. Nommez-la (ex: "job-tracker-api"), associez-la à votre espace
3. Copiez le **"Internal Integration Secret"** → c'est votre `NOTION_API_KEY`

## Étape 2 — Partager votre base avec l'intégration

1. Ouvrez votre CRM Notion
2. "..." en haut à droite → "Connexions" → sélectionnez votre intégration
3. **Sans cette étape, l'API renvoie une erreur 403**

## Étape 3 — Récupérer l'ID de la base

URL de votre base : `https://www.notion.so/votre-espace/XXXXXXXX...?v=...`
L'ID = la suite de caractères entre le dernier `/` et le `?v=` (32 caractères)

## Étape 4 — Structure des colonnes Notion (déjà calé dans le code)

| Variable                | Valeur par défaut | Votre valeur |
|-------------------------|-------------------|--------------|
| Colonne date            | `Last Contact`    | ✅ déjà correct |
| Colonne statut          | `Status`          | ✅ déjà correct |
| Statut "En attente"     | `En attente`      | ✅ déjà correct |
| Statuts exclus du total | `Backlog`, `À faire` | ✅ déjà dans le code |

Le **compteur de jours** ne regarde que les lignes `Status = "En attente"`.
Le **total de candidatures** compte toutes les lignes sauf celles à `Backlog` ou `À faire`.

Si vous renommez une colonne dans Notion, mettez à jour la variable d'environnement correspondante dans Vercel (voir étape 6) sans toucher au code.

## Étape 5 — Créer une base Upstash Redis (record partagé)

Le record de silence doit être identique pour tous les visiteurs → stocké côté serveur.
Upstash Redis est gratuit jusqu'à 10 000 requêtes/jour (largement suffisant).

1. Créez un compte gratuit sur https://upstash.com
2. Créez une base Redis : "Create Database" → choisissez une région proche (ex: EU-West)
3. Dans votre tableau de bord Vercel : **Settings → Integrations → Upstash**
   - Installez l'intégration Upstash (gratuite)
   - Reliez votre base Redis à votre projet Vercel
   - Vercel ajoute automatiquement `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` comme variables d'environnement → vous n'avez rien d'autre à faire

Si Upstash n'est pas configuré, l'API continue de fonctionner (le record restera à 0 mais rien ne plante).

## Étape 6 — Déployer la fonction sur Vercel

1. Créez un repo GitHub avec le contenu de ce dossier (`job-tracker/`)
2. Importez ce repo dans Vercel (New Project → Import Git Repository)
3. Vercel installe automatiquement `@upstash/redis` via `package.json`
4. Settings → Environment Variables, ajoutez :
   - `NOTION_API_KEY` = votre clé de l'étape 1
   - `NOTION_DATABASE_ID` = l'ID de l'étape 3
5. Cliquez "Redeploy" après ajout des variables
6. Testez l'URL dans le navigateur : `https://votre-projet.vercel.app/api/stats`
   Vous devez voir un JSON avec `daysSinceContact`, `totalApplications`, `recordDays`

## Étape 7 — Connecter la page web à votre fonction

Dans `public/index.html`, modifiez :
```js
const API_URL = 'https://VOTRE-PROJET.vercel.app/api/stats';
```
→ remplacez par votre vraie URL Vercel.

## Étape 8 — Déployer sur GitHub Pages

1. Mettez le contenu de `public/` à la racine d'un repo GitHub (ou dans `/docs`)
2. Settings du repo → Pages → activez sur branche `main`, dossier racine (ou `/docs`)
3. URL finale : `https://votre-pseudo.github.io/nom-du-repo/`

## Étape 9 — Lien en bio Instagram

Ajoutez l'URL GitHub Pages en bio ou en story (@chomariat_lifestyle).

---

## Résumé des variables d'environnement Vercel

| Variable | Obligatoire | Description |
|---|---|---|
| `NOTION_API_KEY` | ✅ | Clé secrète de l'intégration Notion |
| `NOTION_DATABASE_ID` | ✅ | ID de votre base Notion |
| `UPSTASH_REDIS_REST_URL` | ✅ (record) | Ajouté auto par l'intégration Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ (record) | Ajouté auto par l'intégration Upstash |
| `NOTION_DATE_PROPERTY` | ❌ | Défaut : `Last Contact` |
| `NOTION_STATUS_PROPERTY` | ❌ | Défaut : `Status` |
| `NOTION_STATUS_VALUE` | ❌ | Défaut : `En attente` |
