/**
 * Hoja inferior: la ventana que sube desde abajo para formularios y ajustes.
 * Hay una sola en la página (#hoja en index.html).
 */
const fondo = () => document.getElementById('hoja');
const panel = () => document.getElementById('hoja-panel');
let focoAnterior = null;

/**
 * Muestra la hoja con el HTML indicado y devuelve el panel para conectar eventos.
 * @param {string} html
 * @param {{titulo?: string}} [opciones]
 */
export function abrirHoja(html, { titulo = 'Ventana' } = {}) {
  focoAnterior = document.activeElement;
  const contenedor = panel();
  contenedor.innerHTML = html;
  contenedor.setAttribute('aria-label', titulo);
  fondo().hidden = false;
  document.body.classList.add('bloqueado');
  contenedor.scrollTop = 0;
  contenedor.focus({ preventScroll: true });
  return contenedor;
}

export function cerrarHoja() {
  fondo().hidden = true;
  panel().innerHTML = '';
  document.body.classList.remove('bloqueado');
  focoAnterior?.focus?.({ preventScroll: true });
}

export const hojaAbierta = () => !fondo().hidden;

/** Cierra al tocar fuera del panel o con Escape. Se llama una vez al iniciar. */
export function prepararHoja() {
  fondo().addEventListener('click', (evento) => {
    if (evento.target === fondo()) cerrarHoja();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && hojaAbierta()) cerrarHoja();
  });
}

export const acciones = {
  'cerrar-hoja': cerrarHoja,
};
