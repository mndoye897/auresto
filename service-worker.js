const CACHE = 'auresto-v26';
const ASSETS = [
  './',
  './index.html',
  './onboarding.html',
  './dashboard.html',
  './orders.html',
  './marketing.html',
  './avis.html',
  './menu-customization.html',
  './table-editor.html',
  './client.html',
  './kitchen.html',
  './settings.html',
  './suspended.html',
  './styles.css',
  './app.js',
  './css/app-shared.css',
  './css/onboarding.css',
  './css/dashboard.css',
  './css/orders.css',
  './css/marketing.css',
  './css/avis.css',
  './css/menu-customization.css',
  './css/table-editor.css',
  './css/client.css',
  './css/kitchen.css',
  './css/settings.css',
  './js/store.js',
  './js/icons.js',
  './js/dish-images.js',
  './js/onboarding.js',
  './js/hours-picker.js',
  './js/menu-ai.js',
  './js/dashboard.js',
  './js/orders.js',
  './js/marketing.js',
  './js/avis.js',
  './js/menu-customization.js',
  './js/table-editor.js',
  './js/client.js',
  './js/kitchen.js',
  './js/settings.js',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/hero-poster.jpg',
  './assets/bg-restaurant.png',
  './assets/bg-dash.png',
  './assets/scan-qr-cafe.mp4'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  // addAll échoue en bloc si une seule URL est absente : on met en cache
  // fichier par fichier pour rester tolérant aux ressources manquantes.
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(url => cache.add(url).catch(() => null)))
    )
  );
});

self.addEventListener('activate', event =>
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);

// Les pages, styles et scripts doivent toujours refléter la dernière version
// déployée : réseau d'abord, cache en repli (hors-ligne). Le reste (images,
// polices, médias) reste en cache d'abord pour la rapidité.
function isFreshnessCritical(request) {
  if (request.mode === 'navigate') return true;
  return ['document', 'style', 'script'].includes(request.destination);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Ne jamais s'interposer sur une autre origine. Le repli de ce worker sert
  // './index.html' quand une requête échoue : appliqué à accounts.google.com,
  // cela injectait notre propre page dans l'iframe et la fenêtre de connexion
  // Google, qui cassaient sans message clair. Les ressources tierces doivent
  // aller au réseau sans passer par nous.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (isFreshnessCritical(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached =>
      cached ||
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html'))
    )
  );
});
