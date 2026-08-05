Auresto backend
================

Prérequis
- Node.js + npm
- `psql` (Postgres client) accessible depuis la ligne de commande
- Une base Postgres nommée `auresto` (tu as indiqué qu'elle existe)

Configuration
1. Copier `.env.example` en `.env` et adapter la variable `DATABASE_URL` si besoin.

Exemple `.env`:

DATABASE_URL=postgresql://admin:admin123@localhost:5432/auresto

Appliquer la migration et démarrer (PowerShell)

```powershell
cd backend
.\migrate.ps1
```

Si tu préfères appliquer la migration manuellement:

```powershell
# depuis le dossier backend
psql "postgresql://admin:admin123@localhost:5432/auresto" -f migrations/001_create_schema.sql
npm install
npm run dev
```

Points importants
- Le schéma utilise une colonne `location` de type `GEOGRAPHY(POINT,4326)` qui nécessite l'extension PostGIS. Si PostGIS n'est pas installée, modifie `migrations/001_create_schema.sql` pour utiliser `latitude`/`longitude` numériques à la place.
- Le serveur écoute par défaut sur le port défini dans `.env` ou `4000`.
- Le frontend peut pointer vers l'API en définissant `window.AURESTO_API_BASE = 'http://localhost:4000'` avant d'utiliser `AurestoStore.syncToServer()`.
