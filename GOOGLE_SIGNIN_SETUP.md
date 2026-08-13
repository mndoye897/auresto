# Google Sign-In Configuration

## ⚠️ Erreur 400 : origin_mismatch

C'est la panne la plus fréquente. Message affiché :

> Vous ne pouvez pas vous connecter à cette application parce qu'elle ne
> respecte pas la politique OAuth 2.0 de Google. […] Erreur 400 : origin_mismatch

**Cause** : l'adresse depuis laquelle la page est servie n'est pas déclarée
dans la console Google Cloud. Ce n'est **pas** un problème de code : rien dans
ce dépôt ne peut le corriger, le réglage vit chez Google.

**Correction** — console Google Cloud → **APIs & Services** → **Credentials** →
cliquer sur le client OAuth `787540992072-…` → section **Authorized JavaScript
origins** → ajouter *exactement* :

| Environnement | Origine à déclarer |
|---|---|
| Développement local | `http://localhost:5500` |
| Développement local (variante) | `http://127.0.0.1:5500` |
| GitHub Pages | `https://mndoye897.github.io` |

Règles à respecter, sous peine que l'erreur persiste :

- L'origine est **protocole + domaine + port**, sans chemin ni barre finale.
  `http://localhost:5500` ✅ — `http://localhost:5500/` ❌ — `http://localhost:5500/auresto/` ❌
- Le port compte : `localhost:3000` et `localhost:5500` sont deux origines
  distinctes. Le port du serveur frontend est défini dans `.claude/launch.json`
  (actuellement **5500**) ; en changer impose de déclarer la nouvelle origine.
- La prise en compte par Google peut demander quelques minutes. Recharger
  ensuite avec le cache vidé.

## Setup Instructions

1. **Create Google OAuth 2.0 Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Enable **Google+ API**
   - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Choose **Web application**
   - Add authorized JavaScript origins: `http://localhost:5500`, `http://127.0.0.1:5500`, `http://localhost:3000`
   - Add authorized redirect URIs: `http://localhost:5500`, `http://127.0.0.1:5500`, `http://localhost:3000`
   - Copy the **Client ID**

2. **Add Client ID to frontend:**
   - Open `js/google-auth.js`
   - Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google Client ID:
     ```javascript
     const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
     ```

3. **Optionally set Backend Validation (for extra security):**
   - Add your Google Client ID to `backend/.env`:
     ```
     GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
     ```
   - Backend can then validate tokens via `POST /api/auth/google`

## How It Works

**Frontend:**
- User clicks "Se connecter avec Google" button on onboarding step 2
- Google OAuth popup opens for user authentication
- Upon success, user info (name, email) auto-fills the account form
- User data is saved to AurestoStore and synced to PostgreSQL via API

**Backend (Optional Token Validation):**
- Endpoint: `POST /api/auth/google`
- Body: `{ token, clientId }`
- Returns: `{ ok: true, user: { id, email, name, picture } }`

## Testing

1. Start frontend: `npm run dev` (or open `onboarding.html`)
2. Go to Step 2 (Create Account)
3. Click "Se connecter avec Google"
4. Complete Google authentication
5. Account details should auto-fill

## Security Notes

- Tokens are verified client-side by Google's library
- For production, validate tokens on the backend via `POST /api/auth/google`
- Store Google credentials securely in environment variables
- Use HTTPS in production
