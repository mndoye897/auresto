// ============================================================
// Configuration API — Auresto
// ============================================================
// Ce fichier centralise la configuration du backend pour tous les
// contextes (développement local, GitHub Pages, Render, etc.)
//
// 👉 MODIFIEZ AURESTO_BACKEND_URL avec l'URL de votre backend Render :
//    Exemple : 'https://auresto-backend.onrender.com'
// ============================================================

// URL du backend en production (Render, Railway, Koyeb, etc.)
// Remplacez par l'URL de votre service Render après déploiement.
const AURESTO_BACKEND_URL = 'https://auresto.onrender.com';

// Détection de l'environnement :
// - localhost / 127.0.0.1 / fichier local → backend local :4000
// - sinon (GitHub Pages, domaine custom, etc.) → backend Render
const hostname = window.location.hostname;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || !hostname;

// Ne pas écraser si une valeur a déjà été définie (ex: injection dynamique)
if (!window.AURESTO_API_BASE) {
  window.AURESTO_API_BASE = isLocal ? 'http://localhost:4000' : AURESTO_BACKEND_URL;
}

console.log('[Auresto] API Base URL:', window.AURESTO_API_BASE);