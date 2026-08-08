const CACHE = 'auresto-v21';
const ASSETS = [
  './',
  './index.html',
  './onboarding.html',
  './dashboard.html',
  './menu-customization.html',
  './client.html',
  './kitchen.html',
  './settings.html',
  './suspended.html',
  './qr-codes.html',
  './styles.css',
  './app.js',
  './css/app-shared.css',
  './css/onboarding.css',
  './css/dashboard.css',
  './css/menu-customization.css',
  './css/client.css',
  './css/kitchen.css',
  './css/settings.css',
  './css/qr-codes.css',
  './js/store.js',
  './js/icons.js',
  './js/dish-images.js',
  './js/onboarding.js',
  './js/hours-picker.js',
  './js/menu-ai.js',
  './js/dashboard.js',
  './js/menu-customization.js',
  './js/client.js',
  './js/kitchen.js',
  './js/settings.js',
  './js/qr-codes.js',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/hero-poster.jpg',
  './assets/scan-qr-cafe.mp4'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
