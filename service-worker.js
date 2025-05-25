// 🏕️ SMART TENT SERVICE WORKER - VERSION CORRIGÉE
const CACHE_VERSION = 'smart-tent-v1.0.1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_API = `${CACHE_VERSION}-api`;

// ✅ FICHIERS STATIQUES CORRIGÉS
const STATIC_FILES = [
  '/',
  '/index.html',
  '/sensor.html',
  '/history.html', 
  '/map.html',
  '/settings.html',
  '/dashboard.html',
  '/api.js',
  '/main.css',
  '/manifest.json'
  // Pas d'icônes pour éviter les erreurs 404
];

// URLs d'API à mettre en cache
const API_CACHE_PATTERNS = [
  /\/api\/realtime/,
  /\/api\/sensors/,
  /\/api\/history/,
  /\/api\/weather/,
  /\/api\/dashboard/
];

// 🚀 INSTALLATION
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('📦 Service Worker: Caching static files...');
      // Cache les fichiers un par un pour éviter les erreurs
      return Promise.allSettled(
        STATIC_FILES.map(file => 
          cache.add(file).catch(err => {
            console.warn(`⚠️ Failed to cache ${file}:`, err);
            return null;
          })
        )
      );
    }).then(() => {
      console.log('✅ Service Worker: Installation complete');
      self.skipWaiting();
    })
  );
});

// 🔄 ACTIVATION
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_STATIC && 
              cacheName !== CACHE_DYNAMIC && 
              cacheName !== CACHE_API) {
            console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// 📡 GESTION DES REQUÊTES
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-HTTP et Chrome extensions
  if (!request.url.startsWith('http') || 
      request.url.includes('chrome-extension://') ||
      request.url.includes('moz-extension://')) {
    return;
  }
  
  // 🎯 STRATÉGIE POUR APIs
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(networkFirstStrategy(request, CACHE_API));
    return;
  }
  
  // 🎯 STRATÉGIE POUR FICHIERS STATIQUES
  if (STATIC_FILES.some(file => url.pathname === file || url.pathname.endsWith(file))) {
    event.respondWith(cacheFirstStrategy(request, CACHE_STATIC));
    return;
  }
  
  // 🌐 STRATÉGIE POUR AUTRES RESSOURCES
  event.respondWith(staleWhileRevalidateStrategy(request, CACHE_DYNAMIC));
});

// 📋 STRATÉGIES DE CACHE

// Cache First: Fichiers statiques
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
    
  } catch (error) {
    console.warn('Cache First Strategy failed:', error);
    
    if (request.destination === 'document') {
      const fallback = await caches.match('/index.html');
      return fallback || new Response('Application hors ligne', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    return new Response('Ressource non disponible', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network First: APIs
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
    
  } catch (error) {
    console.warn('Network request failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Retourner des données par défaut pour les APIs
    return createOfflineApiResponse(request);
  }
}

// Stale While Revalidate: Autres ressources
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
}

// 📱 RÉPONSE API HORS LIGNE
function createOfflineApiResponse(request) {
  const url = new URL(request.url);
  
  if (url.pathname.includes('/api/realtime') || url.pathname.includes('/api/sensors')) {
    return new Response(JSON.stringify({
      success: true,
      raspberry_id: 'offline',
      timestamp: new Date().toISOString(),
      sensor_data: {
        temperature: 20,
        humidity: 50,
        gas_detection: 100,
        motion_interior: false,
        motion_exterior: false,
        luminosity: 300
      },
      gps_data: {
        latitude: 36.4,
        longitude: 10.6,
        altitude: 50,
        accuracy: 10
      },
      esp32_data: {},
      system: {
        signal_4g: 0,
        battery_level: 75,
        device_temperature: 35,
        uptime: '01:30:00'
      },
      offline: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache-Status': 'offline-default'
      }
    });
  }
  
  return new Response(JSON.stringify({
    error: 'Service hors ligne',
    message: 'Données non disponibles sans connexion',
    offline: true
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 🔔 NOTIFICATIONS PUSH
self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.warn('Push data parsing failed:', e);
    }
  }
  
  const options = {
    title: data.title || '🏕️ Smart Tent Alert',
    body: data.body || 'Nouvelle notification de votre tente',
    icon: '/logo.png',
    badge: '/logo.png',
    data: data.data || {},
    tag: data.tag || 'smart-tent-notification',
    requireInteraction: data.urgent || false,
    vibrate: data.urgent ? [300, 100, 300] : [100]
  };
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// 🎯 ACTIONS SUR NOTIFICATIONS
self.addEventListener('notificationclick', (event) => {
  console.log('🎯 Notification clicked:', event.action);
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/sensor.html')
  );
});

// 🔄 SYNCHRONISATION EN ARRIÈRE-PLAN
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-sensor-data') {
    event.waitUntil(syncSensorData());
  }
});

async function syncSensorData() {
  try {
    console.log('📊 Syncing cached sensor data...');
    // Implémenter la logique de sync si nécessaire
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

console.log('🏕️ Smart Tent Service Worker loaded successfully!');
