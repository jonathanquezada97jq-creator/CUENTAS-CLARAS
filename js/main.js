/**
 * Punto de entrada (lo carga index.html).
 *
 * Orden de arranque:
 *   1. Prepara la interfaz (acciones, hoja inferior, pestañas).
 *   2. Si falta la configuración de Firebase, muestra cómo hacerla.
 *   3. Si no, escucha la sesión. Al entrar alguien, empieza a sincronizar
 *      los datos del hogar; al salir, los borra de la memoria.
 */
import { FIREBASE_CONFIG } from './config.js';
import { cambiar, leer, suscribir, vaciarDatos } from './state/store.js';
import { dibujar, iniciarInterfaz } from './app.js';
import { observarSesion } from './data/sesion.js';
import {
  actualizarIndicadorDeGuardado,
  detenerSincronizacion,
  iniciarSincronizacion,
  observarMes,
} from './data/repositorio.js';
import { avisar } from './ui/aviso.js';
import { mesDe, sumarMeses } from './utils/fechas.js';

const faltaConfigurar = () =>
  Object.values(FIREBASE_CONFIG).some((valor) => /TU-PROYECTO|PEGA_AQUI/.test(String(valor)));

function alNoTenerPermiso() {
  detenerSincronizacion();
  cambiar((e) => {
    e.sesion = 'sin-permiso';
  });
}

function alFallarEscritura(error) {
  avisar(
    error?.code === 'permission-denied'
      ? 'Esta cuenta no tiene permiso para guardar.'
      : 'No se pudo guardar. Revisá la conexión e intentá de nuevo.',
  );
}

function alCambiarSesion(usuario) {
  if (!usuario) {
    detenerSincronizacion();
    vaciarDatos();
    cambiar((e) => {
      e.sesion = 'fuera';
      e.usuario = null;
    });
    return;
  }

  cambiar((e) => {
    e.sesion = 'dentro';
    e.usuario = usuario;
    e.guardado = 'al-dia';
  });
  iniciarSincronizacion({ alNoTenerPermiso, alFallarEscritura });
  const mesActual = mesDe(new Date());
  [mesActual, sumarMeses(mesActual, 1), leer().mesVista].forEach(observarMes);
}

iniciarInterfaz();
suscribir(dibujar);
dibujar(leer());
document.documentElement.dataset.iniciada = 'si';

// Necesario para instalar la app en el teléfono y abrirla sin señal (ver sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Sin service worker:', error));
}

if (faltaConfigurar()) {
  cambiar((e) => {
    e.sesion = 'sin-config';
  });
} else {
  observarSesion(alCambiarSesion);
  window.addEventListener('online', actualizarIndicadorDeGuardado);
  window.addEventListener('offline', actualizarIndicadorDeGuardado);
}
