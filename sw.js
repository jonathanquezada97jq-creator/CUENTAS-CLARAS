/**
 * Service worker: permite instalar la app en el teléfono y abrirla aunque
 * no haya señal.
 *
 * Estrategia "primero la red": siempre intenta bajar la versión más nueva
 * de GitHub; si no hay conexión, usa la última copia guardada. Así los
 * cambios que se suben a GitHub llegan solos y no queda una versión vieja
 * pegada.
 *
 * No toca Firestore ni la entrada con Google: esas peticiones van directo
 * a la red (Firestore ya guarda su propia copia sin conexión).
 *
 * Si cambiás la forma de guardar en caché, subí el número de VERSION para
 * que se borre la caché anterior.
 */
const VERSION = 'cuentas-claras-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function debeGuardarse(url) {
  if (url.origin === self.location.origin) return true; // archivos de la app
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) return true; // SDK
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'; // letras
}

async function primeroLaRed(peticion) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    if (peticion.mode === 'navigate') {
      const inicio = (await cache.match('./')) || (await cache.match('./index.html'));
      if (inicio) return inicio;
    }
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  if (!debeGuardarse(new URL(request.url))) return;
  evento.respondWith(primeroLaRed(request));
});
