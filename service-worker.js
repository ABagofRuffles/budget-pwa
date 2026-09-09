/* ============================================================================
   SERVICE WORKER - PROGRESSIVE WEB APP (PWA) SUPPORT
   ============================================================================
   This service worker enables offline functionality and caching for the
   QuickBudget application. It implements a caching strategy that allows
   the app to work even when the user is offline.
   ============================================================================ */

// Cache version identifier (increment when updating cached assets)
const CACHE = 'qb-cache-v3';

// List of core application files to cache during installation
const ASSETS = [
  './',              // Root/index page
  './index.html',    // Main HTML file
  './styles.css',    // Stylesheet
  './script.js',     // Application JavaScript
  './manifest.json'  // PWA manifest
];

/* ============================================================================
   INSTALL EVENT
   ============================================================================
   Fires when the service worker is first installed or updated.
   Caches all core application files for offline access.
   ============================================================================ */
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install event triggered');
  console.log('[Service Worker] Caching assets:', ASSETS.length, 'files');
  // Wait for all assets to be cached before completing installation
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        console.log('[Service Worker] Cache opened:', CACHE);
        return cache.addAll(ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] All assets cached successfully');
      })
      .catch(err => {
        console.error('[Service Worker] Install error:', err);
        // Continue installation even if caching fails
      })
  );
  // Immediately activate this service worker (skip waiting for old one)
  self.skipWaiting();
  console.log('[Service Worker] Skip waiting called');
});

/* ============================================================================
   ACTIVATE EVENT
   ============================================================================
   Fires when the service worker becomes active.
   Cleans up old cache versions to free up storage space.
   ============================================================================ */
self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activate event triggered');
  e.waitUntil(
    // Get all cache names
    caches.keys()
      .then(cacheNames => {
        console.log('[Service Worker] Found caches:', cacheNames);
        const oldCaches = cacheNames.filter(cacheName => cacheName !== CACHE);
        console.log('[Service Worker] Deleting old caches:', oldCaches.length);
        // Delete all caches except the current one
        return Promise.all(
          oldCaches.map(oldCache => {
            console.log('[Service Worker] Deleting cache:', oldCache);
            return caches.delete(oldCache);
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Cache cleanup completed');
      })
      .catch(err => {
        console.error('[Service Worker] Activate error:', err);
        // Continue activation even if cleanup fails
      })
  );
  // Take control of all clients immediately (don't wait for page reload)
  self.clients.claim();
  console.log('[Service Worker] Clients claimed');
});

/* ============================================================================
   FETCH EVENT
   ============================================================================
   Intercepts all network requests from the application.
   Implements a hybrid caching strategy:
   - HTML pages: Network-first (try network, fallback to cache if offline)
   - Other assets: Cache-first (use cache if available, fetch if not)
   ============================================================================ */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  
  // Don't intercept external CDN resources (let browser handle them directly)
  // This prevents service worker from interfering with CDN scripts like PDF.js
  const isExternalResource = url.origin !== self.location.origin;
  if (isExternalResource) {
    // Let external resources load directly without service worker interference
    console.log('[Service Worker] Skipping external resource:', url.origin);
    return;
  }
  
  console.log('[Service Worker] Intercepting request:', req.method, url.pathname);
  
  // Handle navigation requests (HTML pages)
  if (req.mode === 'navigate') {
    console.log('[Service Worker] Handling navigation request (network-first)');
    e.respondWith(
      // Try to fetch from network first
      fetch(req)
        .then(response => {
          console.log('[Service Worker] Navigation: network response received, status:', response.status);
          // If successful, cache a copy for future offline use
          const responseClone = response.clone();
          caches.open(CACHE)
            .then(cache => {
              console.log('[Service Worker] Caching navigation response');
              return cache.put('./', responseClone);
            })
            .catch(err => console.error('[Service Worker] Cache put error:', err));
          return response;
        })
        // If network fails (offline), serve from cache
        .catch(() => {
          console.log('[Service Worker] Navigation: network failed, trying cache');
          return caches.match('./')
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('[Service Worker] Navigation: serving from cache');
                return cachedResponse;
              }
              console.warn('[Service Worker] Navigation: cache miss, returning offline response');
              // Return a basic response if both network and cache fail
              return new Response('Offline', { 
                status: 503, 
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain' }
              });
            })
            .catch(() => {
              console.error('[Service Worker] Navigation: cache match failed');
              return new Response('Offline', { 
                status: 503, 
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain' }
              });
            });
        })
    );
  } 
  // Handle all other local requests (CSS, JS, images, etc.)
  else {
    // For JavaScript files, use network-first strategy (always get fresh code)
    // For other assets, use cache-first strategy
    const isJavaScript = req.url.endsWith('.js') || req.headers.get('content-type')?.includes('javascript');
    
    if (isJavaScript) {
      console.log('[Service Worker] Handling JS file (network-first):', url.pathname);
      // Network-first for JS files to ensure fresh code
      e.respondWith(
        fetch(req)
          .then(response => {
            console.log('[Service Worker] JS: network response received, status:', response.status);
            // Update cache with fresh version
            const responseClone = response.clone();
            caches.open(CACHE)
              .then(cache => {
                console.log('[Service Worker] Caching JS file');
                return cache.put(req, responseClone);
              })
              .catch(err => console.error('[Service Worker] Cache put error:', err));
            return response;
          })
          .catch(err => {
            console.error('[Service Worker] Fetch error for JS:', err);
            // Fallback to cache if network fails
            return caches.match(req)
              .then(cachedResponse => {
                if (cachedResponse) {
                  console.log('[Service Worker] Serving JS from cache due to network error');
                  return cachedResponse;
                }
                console.warn('[Service Worker] JS: cache miss, returning error response');
                return new Response('JavaScript file not available', { 
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' }
                });
              });
          })
      );
    } else {
      console.log('[Service Worker] Handling asset (cache-first):', url.pathname);
      // Cache-first for other assets (CSS, images, etc.)
      e.respondWith(
        // Check cache first
        caches.match(req)
          .then(cachedResponse => {
            // If found in cache, return it
            if (cachedResponse) {
              console.log('[Service Worker] Asset: serving from cache');
              return cachedResponse;
            }
            console.log('[Service Worker] Asset: cache miss, fetching from network');
            // Otherwise, fetch from network
            return fetch(req)
              .then(response => {
                console.log('[Service Worker] Asset: network response received, status:', response.status);
                // Cache the response for future use
                const responseClone = response.clone();
                caches.open(CACHE)
                  .then(cache => {
                    console.log('[Service Worker] Caching asset');
                    return cache.put(req, responseClone);
                  })
                  .catch(err => console.error('[Service Worker] Cache put error:', err));
                return response;
              })
              .catch(err => {
                console.error('[Service Worker] Fetch error:', err);
                // Return cached version if available, otherwise fail gracefully
                return cachedResponse || new Response('Not available', { 
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' }
                });
              });
          })
          .catch(err => {
            console.error('[Service Worker] Cache match error:', err);
            return new Response('Not available', { 
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          })
      );
    }
  }
});
