/* Urbex Master Atlas — offline cache.
   Map tiles you've already viewed keep working without a connection,
   and the app shell loads offline / as an installed PWA. */
const SHELL_CACHE = "urbex-shell-v1";
const TILE_CACHE  = "urbex-tiles-v1";
const MEDIA_CACHE = "urbex-media-v1";
const TILE_LIMIT  = 4000;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./anniversary-copy.js",
  "./anniversary.js",
  "./fallback-site.jpg",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => ![SHELL_CACHE, TILE_CACHE, MEDIA_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles(){
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  if (keys.length > TILE_LIMIT) await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map(k => c.delete(k)));
}

async function cacheFirst(name, req, trim){
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque"){
    c.put(req, res.clone());
    if (trim) trimTiles();
  }
  return res;
}

async function staleWhileRevalidate(name, req){
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // live APIs: always network (auth + freshness matter)
  if (["api.github.com", "nominatim.openstreetmap.org", "router.project-osrm.org"].includes(u.hostname)) return;
  if (u.hostname.endsWith("tile.openstreetmap.org")){ e.respondWith(cacheFirst(TILE_CACHE, e.request, true)); return; }
  if (u.hostname === "raw.githubusercontent.com"){ e.respondWith(cacheFirst(MEDIA_CACHE, e.request, false)); return; }
  if (u.hostname === "cdnjs.cloudflare.com"){ e.respondWith(staleWhileRevalidate(SHELL_CACHE, e.request)); return; }
  if (u.origin === location.origin){ e.respondWith(staleWhileRevalidate(SHELL_CACHE, e.request)); return; }
});
