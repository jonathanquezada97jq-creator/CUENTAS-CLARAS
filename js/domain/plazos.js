/**
 * Reglas de las compras a plazo y préstamos (registros de la colección "plazos").
 *
 * Lo pagado se lleva en dinero, no en número de cuotas, para que un abono
 * mayor a la cuota baje lo que falta:
 *   pagado    = cuotas pagadas antes de usar la app × cuota + abonos registrados en la app
 *   pendiente = total de cuotas × cuota − pagado
 *   cuotas pendientes = pendiente ÷ cuota, redondeado hacia arriba
 *
 * @typedef {Object} Plazo
 * @property {string} id
 * @property {string} descripcion  "Refrigeradora", "Préstamo personal"…
 * @property {string} [acreedor]  "La Curacao", "Cooperativa"…
 * @property {string} tipo  Clave de TIPOS_PLAZO.
 * @property {string} metodo  Cómo se paga normalmente: "efectivo", "planilla"
 *   o "tarjeta:<id>". Al marcar la cuota se puede elegir otro medio.
 * @property {string} [personaId]  De la planilla de quién se descuenta.
 * @property {number} cuota  Cuota mensual.
 * @property {number} total  Número total de cuotas.
 * @property {number} pagadas  Cuotas que ya estaban pagadas al registrar el plazo.
 * @property {number} [abonado]  Dinero pagado desde la app (suma de pagos y abonos).
 * @property {number} dia  Día de pago.
 * @property {number} [tasa]  Tasa anual, solo informativa.
 * @property {string} [creado]  Mes en que se registró ("YYYY-MM").
 */
import { aNumero, redondear } from '../utils/formato.js';
import { sumarMeses } from '../utils/fechas.js';

export const METODO = Object.freeze({ DIRECTO: 'efectivo', PLANILLA: 'planilla' });

/** Medio de pago guardado en cada pago de cuota. */
export const MEDIO_EFECTIVO = 'efectivo';

/** Diferencia menor a medio centavo se considera cero. */
const CASI_CERO = 0.004;

export const seDescuentaPorPlanilla = (plazo) => plazo.metodo === METODO.PLANILLA;

const totalDeCuotas = (plazo) => Math.max(0, Math.round(aNumero(plazo.total)));

/** Lo que cuesta el plazo completo: total de cuotas × cuota. */
export function montoTotal(plazo) {
  return redondear(totalDeCuotas(plazo) * aNumero(plazo.cuota));
}

/** Dinero ya pagado, sin pasar del total. */
export function montoPagado(plazo) {
  const previas = Math.min(Math.max(0, Math.round(aNumero(plazo.pagadas))), totalDeCuotas(plazo));
  const pagado = previas * aNumero(plazo.cuota) + aNumero(plazo.abonado);
  return redondear(Math.min(montoTotal(plazo), Math.max(0, pagado)));
}

/** Lo que falta pagar en dinero. */
export function saldoPendiente(plazo) {
  return redondear(Math.max(0, montoTotal(plazo) - montoPagado(plazo)));
}

export function cuotasPendientes(plazo) {
  const cuota = aNumero(plazo.cuota);
  const pendiente = saldoPendiente(plazo);
  if (cuota <= 0 || pendiente <= CASI_CERO) return 0;
  return Math.ceil(pendiente / cuota - 1e-9);
}

/** Cuotas que ya se cubrieron (un abono grande puede cubrir varias). */
export const cuotasPagadas = (plazo) => totalDeCuotas(plazo) - cuotasPendientes(plazo);

export const estaActivo = (plazo) => saldoPendiente(plazo) > CASI_CERO;

/** Lo que toca pagar este mes: la cuota, o lo que falte si es menos. */
export function cuotaDelMes(plazo) {
  return redondear(Math.min(aNumero(plazo.cuota), saldoPendiente(plazo)));
}

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
