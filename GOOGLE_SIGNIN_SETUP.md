# Google Sign-In Configuration

## Setup Instructions

1. **Create Google OAuth 2.0 Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Enable **Google+ API**
   - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Choose **Web application**
   - Add authorized JavaScript origins: `http://localhost:3000`, `https://yourdomain.com`
   - Add authorized redirect URIs: `http://localhost:3000/callback`, `https://yourdomain.com/callback`
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
