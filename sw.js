/* =====================================================================
   ACL · service worker
   Es lo que hace que la app se instale en el celular y abra sin señal.

   Cómo funciona, en criollo:
   - La primera vez que abrís la app con internet, guarda una copia de la
     página, del ícono y de las dos librerías que trae de afuera.
   - Después, cuando la abrís sin señal, sirve esa copia guardada.
   - Los datos de Supabase NUNCA se guardan acá: para eso está la copia
     local que hace la propia app.

   Si algún día cambiás el archivo index.html, subí también este archivo
   con el número de VERSION cambiado (v2, v3…). Eso obliga al celular a
   bajar la versión nueva en lugar de seguir mostrando la vieja.
   ===================================================================== */

var VERSION = "acl-v2";
var BASICOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.png"
];

/* Instalación: guardar la copia de arranque. */
self.addEventListener("install", function (ev) {
  ev.waitUntil(
    caches.open(VERSION).then(function (c) {
      // addAll falla entero si un archivo no está; los agregamos de a uno
      return Promise.all(BASICOS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Activación: borrar las copias de versiones anteriores. */
self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function esExterno(url) {
  return url.hostname === "cdn.jsdelivr.net" ||
         url.hostname === "fonts.googleapis.com" ||
         url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (x) { return; }

  /* Supabase: siempre a la red, nunca en caché. */
  if (url.hostname.indexOf("supabase.co") >= 0) return;

  /* Abrir la app: primero la red (para tomar cambios), y si no hay señal,
     la copia guardada. */
  if (req.mode === "navigate") {
    ev.respondWith(
      fetch(req).then(function (r) {
        var copia = r.clone();
        caches.open(VERSION).then(function (c) { c.put("./index.html", copia); });
        return r;
      }).catch(function () {
        return caches.match("./index.html").then(function (r) {
          return r || caches.match("./");
        });
      })
    );
    return;
  }

  /* Librerías y tipografías de afuera: servir la copia y refrescarla atrás. */
  if (esExterno(url)) {
    ev.respondWith(
      caches.match(req).then(function (hit) {
        var red = fetch(req).then(function (r) {
          if (r && (r.status === 200 || r.type === "opaque")) {
            var copia = r.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copia); });
          }
          return r;
        }).catch(function () { return hit; });
        return hit || red;
      })
    );
    return;
  }

  /* Archivos propios (íconos, manifest): copia primero. */
  if (url.origin === self.location.origin) {
    ev.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) {
          if (r && r.status === 200) {
            var copia = r.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copia); });
          }
          return r;
        });
      }).catch(function () { return caches.match("./index.html"); })
    );
  }
});
