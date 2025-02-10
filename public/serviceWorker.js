const CacheName = "transitview_v4";
const CacheAssets = [
    './css/app.css',
    './css/base.css',
    './css/home.css',
    './css/nav-bar.css',
    './css/responsive.css',

    './html/partials/nav-bar.html',
    './html/partials/title-bar.html',
    './html/partials/footer.html',
    './html/partials/routes-list.html',
    './html/status/404.html',
    './html/status/offline.html',
    './html/home.html',
    './html/routes.html',
    './html/settings.html',

    './js/status/404.js',
    './js/status/503.js',
    './js/home.js',
    './js/routes.js',
    './js/settings.js',
    './js/LocalDatabase.js',
    './js/IndexedDatabase.js',
    './js/utility.js',

    './icons/192.png',
    './icons/192-t.png',
    './icons/512.png',
    './icons/512-t.png',
    './icons/check-icon.png',
    './icons/cross-icon.png',
    './icons/dropdown-icon.png',
    './icons/dropup-icon.png',
    './icons/map-icon.png',
    './icons/routes-icon.png',
    './icons/settings-icon.png',

    './icons/nsw/bus.png',
    './icons/nsw/train.png',
    './icons/nsw/train_link.png',
    './icons/nsw/ferry.png',
    './icons/nsw/light_rail.png',
    './icons/nsw/metro.png',
    './icons/nsw/coach.png',

    './images/thumbnail3.png',

    './manifest.json',

    './',
    './routes',
    './settings',
];
const IgnoreCache = [
    "/api",
];
const DisabledOffline = [
    "/map",
    "/html/map.html",
];

async function cacheAll() {
    if (!navigator.onLine) { return; };
    try {
        const cache = await caches.open(CacheName);
        await cache.addAll(CacheAssets);
        return;
    } catch (error) {
        throw new Error(`Failed to cache ${error}`);
    };
};

async function checkCache(event) {
    try {
        if (DisabledOffline.some((ref) => event.request.url.startsWith(ref))) {
            throw new Error("Page not accessible offline");
        };
        const cache = await caches.open(CacheName);
        let response = await cache?.match(event.request);
        if (!response) {
            response = await fetch(event.request);
            if (!response || !response.ok) {
                throw new Error("No cache found and unable to fetch");
            };
        };
        return response;
    } catch (error) {
        // console.error(error);

        const cache = await caches.open(CacheName);
        const response = await cache.match("./html/status/offline.html");
        return response || new Response("No Internet", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
        });
    };
};

async function updateCaches() {
    caches.keys().then((keys) => {
        return Promise.all(keys.map(async (key) => {
            if (key != CacheName) { return await caches.delete(key); };
        }));
    }).then(() => {
        self.clients.claim();
    });
};

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(cacheAll().then(() => {
        console.log("ALL RESOURCES CACHED");
    }));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(updateCaches().then(() => {
        self.clients.claim();
        console.log("CACHE UPDATED");
    }));
});

self.addEventListener('fetch', (event) => {
    if (new URL(event.request.url).origin != self.location.origin ||
        IgnoreCache.some((path) => new URL(event.request.url).pathname.startsWith(path))) { return; };
    event.respondWith(checkCache(event));
});