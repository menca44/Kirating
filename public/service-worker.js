// Nome della cache usata dalla PWA.
// Quando modifichi molto il sito, puoi cambiare questo nome per forzare l'aggiornamento.
const CACHE_NAME = "kirating-cache-v1";

// File principali che vogliamo salvare in cache.
// In questo modo l'app si apre più velocemente e può mostrare almeno le pagine base.
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/account.html",
  "/login.html",
  "/recensioni.html",
  "/ristorante.html",
  "/manifest.json",
  "/logo-kira.png",
  "/logo-cane.jpg",
  "/icon-192.png",
  "/icon-512.png"
  
];

// Evento install: viene eseguito quando il service worker viene installato.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(function (error) {
        console.error("Errore durante il salvataggio della cache:", error);
      })
  );

  // Attiva subito il nuovo service worker.
  self.skipWaiting();
});

// Evento activate: pulisce vecchie cache se in futuro cambi versione.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }

          return null;
        })
      );
    })
  );

  // Prende subito controllo delle pagine aperte.
  self.clients.claim();
});

// Evento fetch: intercetta le richieste del sito.
self.addEventListener("fetch", function (event) {
  const request = event.request;

  // Per le API dinamiche conviene usare sempre la rete,
  // perché ristoranti, login e recensioni devono essere aggiornati.
  if (
    request.url.includes("/restaurants") ||
    request.url.includes("/reviews") ||
    request.url.includes("/login") ||
    request.url.includes("/register") ||
    request.url.includes("/logout") ||
    request.url.includes("/me") ||
    request.url.includes("/geocode")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Per file statici e pagine HTML:
  // prova prima la rete, se non funziona usa la cache.
  event.respondWith(
    fetch(request)
      .then(function (networkResponse) {
        return caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(function () {
        return caches.match(request);
      })
  );
});