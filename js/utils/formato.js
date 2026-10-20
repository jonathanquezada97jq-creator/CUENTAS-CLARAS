/**
 * Funciones puras para números, dinero y texto seguro.
 * No tocan el DOM ni la base de datos, así que se pueden probar con Node.
 */

/** Redondea a centavos (2 decimales), también en los casos de medio centavo. */
export function redondear(valor) {
  const n = Number(valor) || 0;
  return (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-6)) / 100;
}

/** Convierte lo que escribe la persona ("$1,250.50", "", null) en número. */
export function aNumero(valor) {
  const n = parseFloat(String(valor ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Suma el valor que devuelve `obtener` para cada elemento de la lista. */
export function sumar(lista, obtener) {
  return lista.reduce((total, item) => total + (Number(obtener(item)) || 0), 0);
}

const FORMATO_DINERO = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const FORMATO_ENTERO = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** $1,234.56 (con signo menos tipográfico cuando es negativo). */
export function dinero(valor) {
  const n = redondear(valor);
  return `${n < 0 ? '−' : ''}$${FORMATO_DINERO.format(Math.abs(n))}`;
}

/** $1,235 (sin centavos). */
export function dineroEntero(valor) {
  const n = Math.round(Number(valor) || 0);
  return `${n < 0 ? '−' : ''}$${FORMATO_ENTERO.format(Math.abs(n))}`;
}

/** 0.256 → "26%". */
export function porcentaje(proporcion) {
  return `${Math.round((Number(proporcion) || 0) * 100)}%`;
}

const ENTIDADES_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para meterlo dentro de HTML. Todo dato de la persona pasa por aquí. */
export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c]);
}
