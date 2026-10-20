/**
 * Estado de la app en memoria. Hay una sola fuente de verdad:
 *
 *   Firestore ──(repositorio)──▶ store ──(app.js)──▶ vistas
 *
 * El repositorio escribe aquí lo que llega de la base de datos; las vistas
 * solo leen. Para cambiar algo se usa `cambiar(fn)`, que agrupa varios
 * cambios seguidos en un solo redibujo.
 */
import { mesDe } from '../utils/fechas.js';

/** Colecciones que se cargan completas al entrar. */
export const COLECCIONES = Object.freeze(['personas', 'ingresos', 'tarjetas', 'plazos', 'fijos']);

function datosVacios() {
  return {
    personas: [],
    ingresos: [],
    tarjetas: [],
    plazos: [],
    fijos: [],
    pagados: {}, // mes → { clave de pago → detalle }
    gastos: {}, // mes → [gastos]
  };
}

const estado = {
  /** 'cargando' | 'sin-config' | 'fuera' | 'dentro' | 'sin-permiso' */
  sesion: 'cargando',
  /** { uid, nombre, correo } cuando hay sesión. */
  usuario: null,
  /** 'al-dia' | 'guardando' | 'sin-conexion' | 'error' */
  guardado: 'al-dia',
  /** Pestaña visible: 'inicio' | 'pagos' | 'tarjetas' | 'cuotas' | 'ingresos'. */
  vista: 'inicio',
  /** Mes que se ve en la pestaña Pagos. */
  mesVista: mesDe(new Date()),
  /** Qué colecciones ya llegaron por primera vez. */
  cargadas: new Set(),
  datos: datosVacios(),
};

const oyentes = new Set();
let avisoPendiente = false;

/** Estado actual. Tratalo como de solo lectura fuera de `cambiar`. */
export function leer() {
  return estado;
}

/** Aplica un cambio y programa un redibujo. */
export function cambiar(modificar) {
  modificar(estado);
  if (avisoPendiente) return;
  avisoPendiente = true;
  queueMicrotask(() => {
    avisoPendiente = false;
    oyentes.forEach((oyente) => oyente(estado));
  });
}

/** Registra una función que se llama después de cada cambio. */
export function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Si ya llegaron todas las colecciones principales. */
export function datosListos() {
  return COLECCIONES.every((nombre) => estado.cargadas.has(nombre));
}

/** Borra lo que hay en memoria (al cerrar sesión). */
export function vaciarDatos() {
  cambiar((e) => {
    e.datos = datosVacios();
    e.cargadas = new Set();
  });
}
