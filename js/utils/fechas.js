/**
 * Funciones puras de fechas. Un "mes" se representa como texto "YYYY-MM"
 * (por ejemplo "2026-10") y una fecha completa como "YYYY-MM-DD".
 * Las funciones que dependen del día de hoy lo reciben como parámetro
 * (`hoy`) para poder probarlas.
 */
import { MESES, MESES_CORTOS } from '../constants/catalogos.js';

const dosDigitos = (n) => String(n).padStart(2, '0');
const MS_POR_DIA = 86_400_000;

/** Copia de la fecha con la hora en 00:00. */
export function inicioDelDia(fecha = new Date()) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Date → "YYYY-MM". */
export function mesDe(fecha) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`;
}

/** Date → "YYYY-MM-DD". */
export function fechaIso(fecha) {
  return `${mesDe(fecha)}-${dosDigitos(fecha.getDate())}`;
}

/** "YYYY-MM-DD" → Date, o null si el texto no es una fecha. */
export function leerFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** sumarMeses("2026-11", 3) → "2027-02". Acepta números negativos. */
export function sumarMeses(mes, cantidad) {
  const [anio, numero] = mes.split('-').map(Number);
  const total = anio * 12 + (numero - 1) + cantidad;
  return `${Math.floor(total / 12)}-${dosDigitos((total % 12) + 1)}`;
}

/** Meses de diferencia: mesesEntre("2026-10", "2027-01") → 3. */
export function mesesEntre(desde, hasta) {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function diasDelMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  return new Date(anio, numero, 0).getDate();
}

/**
 * Fecha de un pago que cae cada mes en `dia`. Si el mes no tiene ese día
 * (31 en febrero), se usa el último día del mes.
 */
export function fechaDePago(mes, dia) {
  const [anio, numero] = mes.split('-').map(Number);
  const d = Math.min(Math.max(1, Math.round(Number(dia)) || 1), diasDelMes(mes));
  return new Date(anio, numero - 1, d);
}

/** Días enteros de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diferenciaDias(desde, hasta) {
  return Math.round((hasta - desde) / MS_POR_DIA);
}

/** Próxima vez que llega el día `dia` del mes, contando hoy. */
export function proximaFecha(dia, hoy) {
  const esteMes = fechaDePago(mesDe(hoy), dia);
  return esteMes >= hoy ? esteMes : fechaDePago(sumarMeses(mesDe(hoy), 1), dia);
}

export const esDiaDelMes = (dia) => Number.isInteger(Number(dia)) && dia >= 1 && dia <= 31;

/** "2026-10" → "octubre 2026". */
export function nombreDelMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  return `${MESES[numero - 1]} ${anio}`;
}

/** Date → "20 oct". */
export function fechaCorta(fecha) {
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]}`;
}

export const mesCorto = (fecha) => MESES_CORTOS[fecha.getMonth()];

/** "Hoy", "Mañana", "En 5 días", "Hace 2 días". */
export function cuandoEs(fecha, hoy) {
  const n = diferenciaDias(hoy, fecha);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  return n > 1 ? `En ${n} días` : `Hace ${-n} días`;
}
