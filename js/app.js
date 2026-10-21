/**
 * La interfaz: decide qué pantalla se ve, dibuja la pestaña activa y
 * conecta los botones con sus acciones.
 *
 * Para agregar una pestaña nueva:
 *   1. Crear `js/vistas/<nombre>.js` con una función que devuelva HTML.
 *   2. Agregarla en VISTAS (abajo) y su enlace `<a href="#<nombre>">` en index.html.
 */
import { cambiar, datosListos } from './state/store.js';
import { escucharAcciones, registrarAcciones } from './ui/acciones.js';
import { prepararHoja, acciones as accionesHoja } from './ui/hoja.js';
import { inicioDelDia } from './utils/fechas.js';

import { vistaInicio } from './vistas/inicio.js';
import { vistaPagos, acciones as accionesPagos } from './vistas/pagos.js';
import { vistaTarjetas } from './vistas/tarjetas.js';
import { vistaCuotas } from './vistas/cuotas.js';
import { vistaIngresos } from './vistas/ingresos.js';
import {
  pantallaCargando,
  pantallaEntrada,
  pantallaSinConfiguracion,
  pantallaSinPermiso,
  acciones as accionesPantallas,
} from './vistas/pantallas.js';
import { acciones as accionesAjustes } from './vistas/ajustes.js';

import { acciones as accionesTarjeta } from './formularios/tarjeta.js';
import { acciones as accionesPlazo } from './formularios/plazo.js';
import { acciones as accionesFijo } from './formularios/fijo.js';
import { acciones as accionesIngreso } from './formularios/ingreso.js';
import { acciones as accionesPersona } from './formularios/persona.js';
import { acciones as accionesGasto } from './formularios/gasto.js';
import { acciones as accionesPago } from './formularios/pago.js';

/** Pestañas: nombre en la dirección (#pagos) → función que arma su HTML. */
export const VISTAS = Object.freeze({
  inicio: vistaInicio,
  pagos: vistaPagos,
  tarjetas: vistaTarjetas,
  cuotas: vistaCuotas,
  ingresos: vistaIngresos,
});

const TEXTO_GUARDADO = {
  'al-dia': 'Guardado',
  guardando: 'Guardando…',
  'sin-conexion': 'Sin señal: se guarda al volver',
  error: 'No se pudo guardar',
};

function htmlPrincipal(estado, hoy) {
  switch (estado.sesion) {
    case 'sin-config':
      return pantallaSinConfiguracion();
    case 'fuera':
      return pantallaEntrada();
    case 'sin-permiso':
      return pantallaSinPermiso(estado.usuario);
    case 'dentro': {
      if (!datosListos()) return pantallaCargando();
      const vista = VISTAS[estado.vista] || vistaInicio;
      return vista(estado, hoy);
    }
    default:
      return pantallaCargando();
  }
}

let ultimoHtml = '';

/** Redibuja todo lo que depende del estado. Se llama después de cada cambio. */
export function dibujar(estado) {
  const dentro = estado.sesion === 'dentro';

  document.getElementById('pestanas').hidden = !(dentro && datosListos());
  document.getElementById('boton-ajustes').hidden = !dentro;

  const indicador = document.getElementById('indicador-guardado');
  indicador.hidden = !dentro;
  indicador.dataset.estado = estado.guardado;
  indicador.textContent = TEXTO_GUARDADO[estado.guardado] ?? '';

  document.querySelectorAll('.pestanas__boton').forEach((enlace) => {
    const activa = enlace.getAttribute('href') === `#${estado.vista}`;
    enlace.setAttribute('aria-current', activa ? 'page' : 'false');
  });

  // Solo se reemplaza el contenido si cambió, para no perder el foco ni el scroll.
  const html = htmlPrincipal(estado, inicioDelDia());
  if (html !== ultimoHtml) {
    document.getElementById('vista').innerHTML = html;
    ultimoHtml = html;
  }
}

const vistaDeLaDireccion = () => {
  const nombre = window.location.hash.slice(1);
  return nombre in VISTAS ? nombre : 'inicio';
};

/** Registra acciones y eventos generales. Se llama una vez al arrancar. */
export function iniciarInterfaz() {
  [
    accionesHoja,
    accionesPantallas,
    accionesAjustes,
    accionesPagos,
    accionesTarjeta,
    accionesPlazo,
    accionesFijo,
    accionesIngreso,
    accionesPersona,
    accionesGasto,
    accionesPago,
  ].forEach(registrarAcciones);
  escucharAcciones(document);
  prepararHoja();

  cambiar((e) => {
    e.vista = vistaDeLaDireccion();
  });
  window.addEventListener('hashchange', () => {
    cambiar((e) => {
      e.vista = vistaDeLaDireccion();
    });
    window.scrollTo(0, 0);
  });
}
