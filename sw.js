const CACHE_NAME = 'resit-ai-cache-v2.5';

// 1. Paksa Service Worker baru terus hidup serta-merta tanpa tunggu app ditutup
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Padam dan bersihkan semua simpanan cache versi lapuk
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Rampas kawalan app serta-merta
  );
});

// 3. Strategi Network-First: Tanya GitHub dulu! Kalau tiada line baru guna cache
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  // Jangan sentuh atau cache permintaan API Cloud Run
  if (event.request.url.includes('run.app')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Simpan salinan paling segar ke dalam cache
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Jika pengguna tiada internet langsung di kawasan luar, baru baca fail cache
        return caches.match(event.request);
      })
  );
});
