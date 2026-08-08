# 🔧 Correction de l'erreur Google OAuth `origin_mismatch`

## 📋 Le problème

Quand vous cliquez sur "Se connecter avec Google", vous obtenez :
```
Accès bloqué : erreur d'autorisation
Erreur 400 : origin_mismatch
```

Cela signifie que l'URL de votre site (l'origine) n'est pas enregistrée dans la console Google Cloud pour votre OAuth Client ID.

---

## ✅ Solution étape par étape

### 1. Ouvrir la console Google Cloud

Allez sur : **https://console.cloud.google.com/**

### 2. Sélectionner le bon projet

En haut de la page, cliquez sur le sélecteur de projet et choisissez le projet qui contient votre OAuth Client ID.

### 3. Accéder aux identifiants OAuth

1. Menu de gauche → **APIs & Services** → **Credentials** (Identifiants)
2. Dans la section **OAuth 2.0 Client IDs**, cliquez sur votre client Web (celui avec l'ID `787540992072-...`)

### 4. Ajouter les origines JavaScript autorisées

Dans la section **Authorized JavaScript origins** (Origines JavaScript autorisées), ajoutez :

| Environnement | Origine à ajouter |
|---|---|
| **GitHub Pages** | `https://mndoye897.github.io` |
| **Local (développement)** | `http://localhost:3000` |
| **Local (autre port)** | `http://localhost:4000` |
| **Local (serveur Python)** | `http://localhost:8000` |
| **Local (fichier)** | `http://localhost` |

> ⚠️ **IMPORTANT** : N'ajoutez PAS `/auresto/` à la fin. L'origine est uniquement le domaine (protocole + domaine + port), pas le chemin.

### 5. Ajouter les URI de redirection autorisés

Dans la section **Authorized redirect URIs** (URI de redirection autorisés), ajoutez :

| Environnement | URI à ajouter |
|---|---|
| **GitHub Pages** | `https://mndoye897.github.io/auresto/` |
| **Local** | `http://localhost:3000/callback` |
| **Local (serveur Python)** | `http://localhost:8000/callback` |

### 6. Enregistrer

Cliquez sur **Save** (Enregistrer) en bas de la page.

### 7. Attendre la propagation

Google peut prendre **quelques minutes** (jusqu'à 5 minutes) pour propager les changements.

### 8. Réessayer

Rechargez votre site et réessayez de vous connecter avec Google.

---

## 🧪 Vérification rapide

Pour vérifier que l'origine est correctement configurée :

1. Ouvrez votre site : `https://mndoye897.github.io/auresto/`
2. Ouvrez la console du navigateur (F12)
3. Tapez : `window.location.origin`
4. Le résultat doit être : `https://mndoye897.github.io`
5. Vérifiez que cette valeur est bien dans les **Authorized JavaScript origins**

---

## 🆘 Si le problème persiste

### Vérifiez que le Client ID est correct

Dans `js/google-auth.js`, le Client ID actuel est :
```js
const GOOGLE_CLIENT_ID = '787540992072-bb32pg57psks7hqcmqf44ciq6l1g1ln3.apps.googleusercontent.com';
```

Vérifiez que c'est bien le même Client ID que celui affiché dans la console Google Cloud.

### Vérifiez que l'application est en mode "Production"

1. Dans la console Google Cloud → **OAuth consent screen** (Écran de consentement OAuth)
2. Si l'application est en mode **Testing**, seuls les utilisateurs ajoutés comme testeurs peuvent se connecter
3. Cliquez sur **Publish app** (Publier l'application) pour passer en mode Production
4. Ou ajoutez votre email (`mndoye897@gmail.com`) comme utilisateur testeur

### Vérifiez que le domaine est vérifié

Si vous utilisez un domaine personnalisé, il doit être vérifié dans Google Cloud :
1. **OAuth consent screen** → **Audience** → **Verify domain**
2. Suivez les instructions de vérification du domaine

---

## 📝 Résumé des origines à ajouter

```
https://mndoye897.github.io
http://localhost:3000
http://localhost:4000
http://localhost:8000
http://localhost
```

Et les URI de redirection :
```
https://mndoye897.github.io/auresto/
http://localhost:3000/callback
http://localhost:8000/callback