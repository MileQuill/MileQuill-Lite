/* The release tool injects the full asset hashes so a partial update cannot replace a working shell. */
const release = {"version":"37b8bf34cf9496dbae9fb50c","assets":{"index.html":"69a94916fae0f9c05ea2540ae90284b1cb1af5e8d4376c4f1dd2f2c85f8f3011","styles.css":"a7d940c36e6be8dbbee85c32f4e827dd7e7d3148476abf7012ca8c5bb3e43b1d","app.js":"d76a526509abb50825ebc6a84579ea6fc3f0137f5a3612f7e9e2dd522922a4c6","model.js":"20f69661e198455b6018e3829d9c5f496e659c6efdcba1a472f1220e490a25d5","db.js":"38e3fad86aec341e5454748ee10f91a2410c8783294d1836d49d897b55517f0d","offline.js":"4fd327ec66adfe97362e4dff77e3621f23b57fc59940967fe446867e9201b101","manifest.webmanifest":"b5922854f8720e99b30b3eb108f505044c915966d6c0f705737ed03e22e22387","assets/icon-192.png":"94711cf804eb2bee2302d6a559e72d6df896bc5ebf38727f91d9efeea2bbc5ef","assets/icon-512.png":"a915300b2516ae65d524913deeeb83a0c52cc67dca2a5d081ca8260b7c4b3568","assets/maskable-512.png":"d1939d05f039b4daf3f40f8ada19e7c82945f6f1a8d033131d20bbd960a05b31","assets/touch.png":"6982ef95bdddc9ba367d050c639768649265da8a9ade08c01408813d897f7ba6"}};
const scope = new URL(self.registration.scope);
const prefix = "milequill-lite-static|" + encodeURIComponent(scope.pathname) + "|";
const cacheName = prefix + release.version;
const assets = new Map(Object.entries(release.assets).map(([path, hash]) => [new URL(path, scope).href, hash]));
const indexURL = new URL("index.html", scope).href;

async function verifyAndCache(cache, url, hash) {
  const response = await fetch(url, { cache: "no-store", redirect: "error" });
  if (response.status !== 200) throw new Error("Missing MileQuill Lite asset.");
  const copy = response.clone();
  const bytes = url.endsWith(".png") ? await copy.arrayBuffer()
    : new TextEncoder().encode((await copy.text()).replace(/\r\n/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== hash) throw new Error("MileQuill Lite release files do not match.");
  await cache.put(url, response);
}

async function install() {
  const cache = await caches.open(cacheName);
  const results = await Promise.allSettled([...assets].map(([url, hash]) => verifyAndCache(cache, url, hash)));
  if (results.some(result => result.status === "rejected")) {
    await caches.delete(cacheName);
    throw new Error("MileQuill Lite could not cache the complete release.");
  }
}

self.addEventListener("install", event => event.waitUntil(install()));

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data === "milequill-lite:apply-update") event.waitUntil(self.skipWaiting());
});

async function serve(url) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(url);
  if (response) return response;
  // Cache entries can be evicted by the browser. Repair only the exact release asset.
  await verifyAndCache(cache, url, assets.get(url));
  return cache.match(url);
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.search || url.origin !== scope.origin) return;
  const home = event.request.mode === "navigate" && url.pathname === scope.pathname;
  const asset = home ? indexURL : url.href;
  if (assets.has(asset)) event.respondWith(serve(asset));
});
