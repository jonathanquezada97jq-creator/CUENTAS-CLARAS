/**
 * Reglas de las compras a plazo y préstamos (registros de la colección "plazos").
 *
 * @typedef {Object} Plazo
 * @property {string} id
 * @property {string} descripcion  "Refrigeradora", "Préstamo personal"…
 * @property {string} [acreedor]  "La Curacao", "Cooperativa"…
 * @property {string} tipo  Clave de TIPOS_PLAZO.
 * @property {string} metodo  "efectivo", "planilla" o "tarjeta:<id>".
 * @property {string} [personaId]  De la planilla de quién se descuenta.
 * @property {number} cuota  Cuota mensual.
 * @property {number} total  Número total de cuotas.
 * @property {number} pagadas  Cuotas ya pagadas.
 * @property {number} dia  Día de pago.
 * @property {number} [tasa]  Tasa anual, solo informativa.
 * @property {string} [creado]  Mes en que se registró ("YYYY-MM").
 */
import { aNumero, redondear } from '../utils/formato.js';
import { sumarMeses } from '../utils/fechas.js';

export const METODO = Object.freeze({ DIRECTO: 'efectivo', PLANILLA: 'planilla' });

export const seDescuentaPorPlanilla = (plazo) => plazo.metodo === METODO.PLANILLA;

/** Cuotas pagadas, sin pasar del total (dos personas podrían marcar a la vez). */
export function cuotasPagadas(plazo) {
  const total = Math.round(aNumero(plazo.total));
  return Math.min(Math.max(0, Math.round(aNumero(plazo.pagadas))), total);
}

export function cuotasPendientes(plazo) {
  return Math.max(0, Math.round(aNumero(plazo.total)) - cuotasPagadas(plazo));
}

export const estaActivo = (plazo) => cuotasPendientes(plazo) > 0;

/** Lo que falta pagar en dinero. */
export const saldoPendiente = (plazo) => redondear(cuotasPendientes(plazo) * aNumero(plazo.cuota));

/**
 * Mes ("YYYY-MM") en que se paga la última cuota, o null si ya terminó.
 * @param {Plazo} plazo
 * @param {string} mesActual
 * @param {boolean} pagadaEsteMes  Si la cuota de este mes ya se marcó.
 */
export function mesDeLaUltimaCuota(plazo, mesActual, pagadaEsteMes) {
  const pendientes = cuotasPendientes(plazo);
  if (!pendientes) return null;
  return sumarMeses(mesActual, pendientes - (pagadaEsteMes ? 0 : 1));
}
