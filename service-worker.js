// 🏕️ SMART TENT SERVICE WORKER
// Version de l'app et du cache
const CACHE_VERSION = 'smart-tent-v1.0.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_API = `${CACHE_VERSION}-api`;

// Fichiers à mettre en cache immédiatement (cache statique)
const STATIC_FILES = [
  '/',
  'index.html',
  '/dashboard.html',
  '/history.html', 
  '/map.html',
  '/settings.html',
  '/api.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// URLs d'API à mettre en cache
const API_CACHE_PATTERNS = [
  /\/api\/sensors/,
  /\/api\/history/,
  /\/api\/weather/,
  /\/api\/dashboard/
];

// 🚀 INSTALLATION DU SERVICE WORKER
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('📦 Service Worker: Caching static files...');
      return cache.addAll(STATIC_FILES);
    }).then(() => {
      console.log('✅ Service Worker: Installation complete');
      // Force activation immédiate
      self.skipWaiting();
    })
  );
});

// 🔄 ACTIVATION DU SERVICE WORKER
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker: Activating...');
  
  event.waitUntil(
    // Nettoyer les anciens caches
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
      // Prendre le contrôle immédiatement
      return self.clients.claim();
    })
  );
});

// 📡 GESTION DES REQUÊTES (Stratégie de cache)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-HTTP
  if (!request.url.startsWith('http')) return;
  
  // 🎯 STRATÉGIE POUR LES FICHIERS STATIQUES
  if (STATIC_FILES.some(file => url.pathname.endsWith(file)) || 
      url.pathname.includes('/icons/')) {
    event.respondWith(cacheFirstStrategy(request, CACHE_STATIC));
    return;
  }
  
  // 📊 STRATÉGIE POUR LES APIs
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(networkFirstStrategy(request, CACHE_API));
    return;
  }
  
  // 🌐 STRATÉGIE POUR LES AUTRES RESSOURCES
  event.respondWith(staleWhileRevalidateStrategy(request, CACHE_DYNAMIC));
});

// 📋 STRATÉGIES DE CACHE

// Cache First: Fichiers statiques (HTML, CSS, JS, Icons)
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
    console.error('Cache First Strategy failed:', error);
    // Fallback vers une page hors ligne
    if (request.destination === 'document') {
      return caches.match('/index.html');
    }
    return new Response('Contenu non disponible hors ligne', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network First: APIs (données en temps réel)
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
      // Ajouter un header pour indiquer que c'est du cache
      const response = cachedResponse.clone();
      response.headers.set('X-Cache-Status', 'offline');
      return response;
    }
    
    // Retourner des données par défaut pour les APIs
    return createOfflineApiResponse(request);
  }
}

// Stale While Revalidate: Images, fonts, autres ressources
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

// 📱 CRÉER RÉPONSE API HORS LIGNE
function createOfflineApiResponse(request) {
  const url = new URL(request.url);
  
  // Données par défaut pour les capteurs
  if (url.pathname.includes('/api/sensors')) {
    return new Response(JSON.stringify({
      raspberry_id: 'offline',
      info: { name: 'Mode Hors Ligne', status: 'offline' },
      sensors: [
        { sensor_type: 'temperature', value: '--', unit: '°C' },
        { sensor_type: 'humidity', value: '--', unit: '%' },
        { sensor_type: 'gas', value: '--', unit: 'ppm' }
      ],
      timestamp: new Date().toISOString(),
      offline: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache-Status': 'offline-default'
      }
    });
  }
  
  // Réponse générique
  return new Response(JSON.stringify({
    error: 'Service hors ligne',
    message: 'Données non disponibles sans connexion',
    offline: true
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 🔔 GESTION DES NOTIFICATIONS PUSH
self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received');
  
  let data = {};
  if (event.data) {
    data = event.data.json();
  }
  
  const options = {
    title: data.title || '🏕️ Smart Tent Alert',
    body: data.body || 'Nouvelle notification de votre tente',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    image: data.image,
    data: data.data || {},
    actions: [
      {
        action: 'view',
        title: 'Voir détails',
        icon: '/icons/view-action.png'
      },
      {
        action: 'dismiss',
        title: 'Ignorer', 
        icon: '/icons/dismiss-action.png'
      }
    ],
    tag: data.tag || 'smart-tent-notification',
    requireInteraction: data.urgent || false,
    vibrate: data.urgent ? [300, 100, 300] : [100],
    timestamp: Date.now()
  };
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// 🎯 ACTIONS SUR NOTIFICATIONS
self.addEventListener('notificationclick', (event) => {
  console.log('🎯 Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    // Ouvrir l'app sur la page appropriée
    event.waitUntil(
      clients.openWindow('/index.html?alert=' + event.notification.tag)
    );
  } else if (event.action === 'dismiss') {
    // Log de l'action dismiss
    console.log('Notification dismissed by user');
  } else {
    // Clic sur la notification (pas sur les actions)
    event.waitUntil(
      clients.openWindow('/index.html')
    );
  }
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
    // Récupérer les données en attente depuis IndexedDB
    // Envoyer au serveur quand la connexion revient
    console.log('📊 Syncing cached sensor data...');
    
    // Ici vous pouvez implémenter la logique de sync
    // avec votre backend MongoDB
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

// 📊 GESTION DES ERREURS
self.addEventListener('error', (event) => {
  console.error('❌ Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Service Worker unhandled rejection:', event.reason);
});

console.log('🏕️ Smart Tent Service Worker loaded successfully!');