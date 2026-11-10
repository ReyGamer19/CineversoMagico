/* Cineverso Mágico · Service Worker
 * - Hace que el navegador ofrezca "Instalar app".
 * - Guarda en el dispositivo los archivos de la app y las portadas para que abra mucho más rápido.
 * - Nunca guarda videos, transmisiones en vivo ni datos de cuentas (/api).
 */
var VERSION = "cv-v2";
var STATIC_CACHE = VERSION + "-static";
var PAGE_CACHE = VERSION + "-pages";
var IMG_CACHE = VERSION + "-img";
var MAX_IMAGES = 300;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(PAGE_CACHE).then(function (c) {
      return c.addAll(["/", "/tv.html"]).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function trimCache(name, max) {
  caches.open(name).then(function (c) {
    c.keys().then(function (keys) {
      if (keys.length > max) {
        for (var i = 0; i < keys.length - max; i++) c.delete(keys[i]);
      }
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.get("range")) return; // videos: siempre directo
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  var path = url.pathname;

  // Nunca cachear: API, videos, transmisiones en vivo
  if (url.origin === self.location.origin && path.indexOf("/api/") === 0) return;
  if (/\.(mp4|m3u8|ts|m4s|mkv|webm|mp3|aac)(\?|$)/i.test(path)) return;

  // Archivos de la app (_next/static): nunca cambian -> primero caché
  if (url.origin === self.location.origin && path.indexOf("/_next/static/") === 0) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // Páginas: primero red (siempre lo más nuevo), si no hay internet o tarda, la copia guardada
  if (req.mode === "navigate" || (url.origin === self.location.origin && /\.html$/.test(path))) {
    event.respondWith(
      new Promise(function (resolve) {
        var done = false;
        var timer = setTimeout(function () {
          caches.match(req, { ignoreSearch: true }).then(function (hit) {
            if (hit && !done) { done = true; resolve(hit); }
          });
        }, 4000);
        fetch(req).then(function (res) {
          clearTimeout(timer);
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(PAGE_CACHE).then(function (c) { c.put(req, copy); });
          }
          if (!done) { done = true; resolve(res); }
        }).catch(function () {
          clearTimeout(timer);
          caches.match(req, { ignoreSearch: true }).then(function (hit) {
            if (!done) { done = true; resolve(hit || Response.error()); }
          });
        });
      })
    );
    return;
  }

  // Portadas e íconos: primero caché, se actualiza en segundo plano
  if (req.destination === "image" || /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i.test(path) || url.hostname === "images.unsplash.com") {
    event.respondWith(
      caches.open(IMG_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === "opaque")) { c.put(req, res.clone()); trimCache(IMG_CACHE, MAX_IMAGES); }
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
  }
});

// ---------- Notificaciones push ----------
self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  var opts = {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/" },
    vibrate: [80, 40, 80]
  };
  if (d.image) opts.image = d.image;
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  event.waitUntil(self.registration.showNotification(d.title || "Cineverso Mágico", opts));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.location.origin) === 0 && "focus" in c) {
          if ("navigate" in c) { try { c.navigate(url); } catch (e) {} }
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
