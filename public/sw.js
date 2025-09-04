// NFL Confidence Pools Platform - Service Worker
// Simple service worker for PWA functionality

const CACHE_NAME = 'nfl-pools-v1.0.0';
const CACHE_ASSETS = [
    '/',
    '/css/main.css',
    '/css/themes.css',
    '/js/main.js',
    '/manifest.json'
    // Only cache local assets
];

// Install Event
self.addEventListener('install', (event) => {
    // Service Worker: Installed
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Service Worker: Caching Files
                // Cache files one by one to handle failures gracefully
                return Promise.allSettled(
                    CACHE_ASSETS.map(url => 
                        cache.add(url).catch(error => {
                            // Failed to cache file
                        })
                    )
                );
            })
            .then(() => {
                // Service Worker: Initial caching complete
                // Force the waiting service worker to become the active service worker
                self.skipWaiting();
            })
            .catch((error) => {
                // Service Worker: Cache setup failed
            })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    // Service Worker: Activated
    
    // Remove old caches and take control immediately
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            // Service Worker: Clearing Old Cache
                            return caches.delete(cache);
                        }
                    })
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ]).then(() => {
            // Service Worker: Now controlling all clients
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Only handle same-origin requests to avoid CSP issues
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    
    // Skip external CDN requests, socket.io, and API requests
    if (!isLocal || 
        event.request.url.includes('socket.io') || 
        event.request.url.includes('/api/') ||
        event.request.url.includes('cdn.jsdelivr.net') ||
        event.request.url.includes('cdnjs.cloudflare.com') ||
        event.request.url.includes('fonts.googleapis.com') ||
        event.request.url.includes('fonts.gstatic.com')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Check if we received a valid response
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                
                // Only cache local resources
                if (isLocal && !event.request.url.includes('/api/')) {
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        })
                        .catch((error) => {
                            // Cache put failed
                        });
                }
                
                return response;
            })
            .catch(() => {
                // If network fails, try to serve from cache (local resources only)
                if (isLocal) {
                    return caches.match(event.request)
                        .then((response) => {
                            if (response) {
                                return response;
                            }
                            
                            // Return offline page for navigation requests
                            if (event.request.mode === 'navigate') {
                                return caches.match('/');
                            }
                        });
                }
                
                // For external resources, just let the browser handle the error
                return fetch(event.request);
            })
    );
});

// Background sync for picks (if supported)
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync-picks') {
        event.waitUntil(syncPicks());
    }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/img/icons/icon-192x192.png',
            badge: '/img/icons/badge-72x72.png',
            vibrate: [100, 50, 100],
            data: data.data,
            actions: data.actions
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Check if a window is already open
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window if none found
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Helper function for syncing picks
async function syncPicks() {
    try {
        // Get pending picks from IndexedDB or localStorage
        const pendingPicks = await getPendingPicks();
        
        if (pendingPicks.length > 0) {
            // Send to server
            for (const pick of pendingPicks) {
                try {
                    const response = await fetch('/api/picks/sync', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(pick)
                    });
                    
                    if (response.ok) {
                        // Remove from pending picks
                        await removePendingPick(pick.id);
                    }
                } catch (error) {
                    // Failed to sync pick
                }
            }
        }
    } catch (error) {
        // Background sync failed
    }
}

// Helper functions for picks storage (simplified)
async function getPendingPicks() {
    // In a real implementation, use IndexedDB
    return JSON.parse(localStorage.getItem('pendingPicks') || '[]');
}

async function removePendingPick(pickId) {
    // In a real implementation, use IndexedDB
    const pending = await getPendingPicks();
    const filtered = pending.filter(pick => pick.id !== pickId);
    localStorage.setItem('pendingPicks', JSON.stringify(filtered));
}