# 🚀 Guide de Déploiement Gratuit — Auresto

Ce guide explique comment héberger gratuitement votre application Auresto :
- **Frontend** (pages HTML/CSS/JS) → **GitHub Pages** (100% gratuit, illimité)
- **Backend** (Node.js + Socket.io) → **Render** (750h/mois gratuites)

---

## 📋 Prérequis

1. Un compte **GitHub** → https://github.com/signup
2. Un compte **Render** → https://render.com (se connecter avec GitHub)
3. **Git** installé sur votre machine → https://git-scm.com/downloads

---

## 🗂️ Étape 1 : Créer le dépôt GitHub

1. Allez sur https://github.com/new
2. Nom du dépôt : `auresto` (ou autre nom)
3. Cochez **Public** (nécessaire pour GitHub Pages gratuit)
4. Cliquez **Create repository**

---

## 💻 Étape 2 : Pousser le code sur GitHub

Ouvrez un terminal dans le dossier du projet :

```bash
# Initialiser le dépôt git (si pas déjà fait)
git init

# Ajouter tous les fichiers
git add .

# Premier commit
git commit -m "Initial commit Auresto"

# Ajouter le dépôt distant (remplacez USERNAME par votre nom GitHub)
git remote add origin https://github.com/USERNAME/auresto.git

# Pousser le code
git push -u origin main
```

---

## 🌐 Étape 3 : Activer GitHub Pages (Frontend)

1. Allez sur votre dépôt GitHub → **Settings**
2. Dans le menu de gauche, cliquez sur **Pages**
3. Sous **Build and deployment** :
   - **Source** : `Deploy from a branch`
   - **Branch** : `main` / `/(root)`
4. Cliquez **Save**
5. Attendez 1-2 minutes, votre site sera disponible à :
   `https://USERNAME.github.io/auresto/`

> ⚠️ **Important** : Le fichier `.nojekyll` est déjà créé pour que GitHub Pages ne traite pas les fichiers comme du Jekyll.

---

## ⚙️ Étape 4 : Déployer le Backend sur Render

### 4.1 Créer une base de données PostgreSQL gratuite

1. Allez sur https://render.com → **New** → **PostgreSQL**
2. Choisissez le plan **Free**
3. Nom : `auresto-db`
4. Cliquez **Create Database**
5. Copiez la **Internal Database URL** (ou External si vous voulez y accéder depuis votre machine)

### 4.2 Créer le Web Service

1. Allez sur https://render.com → **New** → **Web Service**
2. Connectez votre dépôt GitHub `auresto`
3. **Name** : `auresto-backend`
4. **Root Directory** : `backend`
5. **Runtime** : `Node`
6. **Build Command** : `npm install`
7. **Start Command** : `node server.js`
8. **Instance Type** : `Free`
9. Cliquez **Create Web Service**

### 4.3 Configurer les variables d'environnement

Dans l'onglet **Environment** de votre service Render, ajoutez :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | La URL PostgreSQL de Render (étape 4.1) |
| `PORT` | `10000` |
| `NODE_ENV` | `production` |
| `OWNER_SECRET` | Une longue chaîne aléatoire (ex: `auresto_secret_2026_xyz...`) |
| `GOOGLE_CLIENT_ID` | Votre Google Client ID (si utilisé) |

### 4.4 Déployer

1. Cliquez **Deploy** (ou **Manual Deploy** → **Deploy latest commit**)
2. Attendez que le build se termine (2-5 minutes)
3. Votre backend sera disponible à : `https://auresto-backend.onrender.com`

---

## 🔗 Étape 5 : Connecter le Frontend au Backend

Le frontend détecte automatiquement l'URL du backend. Pour le mode production, modifiez le fichier `js/store.js` :

```js
// Actuellement (ligne 7-11) :
window.AURESTO_API_BASE = window.AURESTO_API_BASE || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname
    ? 'http://localhost:4000'
    : window.location.origin
);
```

**Remplacez par** (pour pointer vers votre backend Render) :

```js
window.AURESTO_API_BASE = window.AURESTO_API_BASE || 'https://auresto-backend.onrender.com';
```

> 💡 **Astuce** : Gardez la détection automatique pour le développement local, et utilisez un fichier de configuration séparé pour la production.

---

## ✅ Vérification finale

1. **Frontend** : Ouvrez `https://USERNAME.github.io/auresto/` → le dashboard doit s'afficher
2. **Backend** : Ouvrez `https://auresto-backend.onrender.com/health` → doit retourner `{"ok":true,"socket":true}`
3. **Test complet** : Ouvrez le client, commandez un plat → la notification doit apparaître dans le dashboard

---

## 🆓 Limites du plan gratuit

| Service | Limite |
|---|---|
| **GitHub Pages** | 1 Go de stockage, 100 Go de bande passante/mois |
| **Render (Web)** | 750 heures/mois (le serveur s'endort après 15 min d'inactivité) |
| **Render (PostgreSQL)** | 1 Go de stockage, expire après 30 jours (recréer si besoin) |

---

## 🔄 Mise à jour du site

Après chaque modification du code :

```bash
git add .
git commit -m "Description des changements"
git push
```

- **Frontend** : GitHub Pages se met à jour automatiquement (1-2 min)
- **Backend** : Render se met à jour automatiquement (2-5 min)

---

## 🛠️ Dépannage

| Problème | Solution |
|---|---|
| Le site ne se charge pas | Vérifiez que le fichier `.nojekyll` existe à la racine |
| Le backend ne répond pas | Vérifiez les logs dans Render → l'onglet **Logs** |
| Erreur de connexion DB | Vérifiez que `DATABASE_URL` est correctement configurée |
| Le serveur s'endort | C'est normal sur le plan gratuit — il se réveille à la première requête (10-30s) |
| CORS error | Vérifiez que le backend autorise les origines (déjà configuré avec `cors()`) |