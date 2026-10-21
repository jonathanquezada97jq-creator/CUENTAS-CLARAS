/**
 * Reglas de las tarjetas de crédito.
 *
 * @typedef {Object} Tarjeta
 * @property {string} id
 * @property {string} banco
 * @property {string} [nombre]  "Visa Clásica".
 * @property {string} [ultimos]  Últimos 4 dígitos.
 * @property {string} [titular]
 * @property {number} limite
 * @property {number} saldo  Lo que se debe hoy, sin las cuotas que aún no cobran.
 * @property {number} [pagoMinimo]
 * @property {number} [tasa]  Tasa de interés anual en %.
 * @property {number} corte  Día de corte.
 * @property {number} pago  Día límite de pago.
 * @property {string} color  Clave de COLORES_TARJETA.
 *
 * Cuánto se paga cada mes (contado, mínimo u otro monto) no se guarda en la
 * tarjeta: se elige al marcar el pago y queda en el mes (ver presupuesto.js).
 */
import { aNumero, redondear, sumar } from '../utils/formato.js';
import { saldoPendiente } from './plazos.js';

const PREFIJO = 'tarjeta:';

/**
 * Los plazos y gastos guardan "tarjeta:<id>" en su campo `metodo` o `medio`
 * para decir que se cargan a esa tarjeta.
 */
export const referenciaTarjeta = (id) => `${PREFIJO}${id}`;

/** "tarjeta:abc" → "abc"; cualquier otro valor → null. */
export function idDeTarjeta(referencia) {
  return typeof referencia === 'string' && referencia.startsWith(PREFIJO)
    ? referencia.slice(PREFIJO.length)
    : null;
}

/** Plazos que se cargan a esta tarjeta. */
export function cuotasDeTarjeta(tarjeta, plazos) {
  const referencia = referenciaTarjeta(tarjeta.id);
  return plazos.filter((p) => p.metodo === referencia);
}

/** Formas de pagar la tarjeta que se ofrecen al marcar el pago. */
export const TIPO_PAGO_TARJETA = Object.freeze({
  CONTADO: 'contado',
  MINIMO: 'minimo',
  OTRO: 'otro',
});

/**
 * Montos para pagar la tarjeta este mes.
 * @returns {{contado:number, minimo:number|null}}  contado = todo el saldo;
 *   minimo = pago mínimo registrado (sin pasar del saldo), o null si no hay.
 */
export function opcionesDePago(tarjeta) {
  const contado = redondear(Math.max(0, aNumero(tarjeta.saldo)));
  const minimo = aNumero(tarjeta.pagoMinimo);
  return { contado, minimo: minimo > 0 ? redondear(Math.min(minimo, contado)) : null };
}

/** Monto de un pago según la opción elegida ('contado', 'minimo' u 'otro'). */
export function montoDeOpcion(tarjeta, tipo, montoOtro) {
  const { contado, minimo } = opcionesDePago(tarjeta);
  if (tipo === TIPO_PAGO_TARJETA.MINIMO) return minimo ?? 0;
  if (tipo === TIPO_PAGO_TARJETA.OTRO) return redondear(Math.max(0, aNumero(montoOtro)));
  return contado;
}

/**
 * Cuánto del límite está ocupado, contando las cuotas futuras.
 * @returns {{enCuotas:number, usado:number, disponible:number, proporcion:number}}
 */
export function usoDeTarjeta(tarjeta, plazos) {
  // Lo que falta de compras a plazo hechas con esta tarjeta (tasa cero, por ejemplo).
  const enCuotas = redondear(sumar(cuotasDeTarjeta(tarjeta, plazos), saldoPendiente));
  const usado = redondear(aNumero(tarjeta.saldo) + enCuotas);
  const limite = aNumero(tarjeta.limite);
  return {
    enCuotas,
    usado,
    disponible: redondear(limite - usado),
    proporcion: limite > 0 ? usado / limite : 0,
  };
}

/**
 * Qué pasa si solo se paga el mínimo: lo que queda financiado, el interés
 * del próximo mes y cuánto tardarían en terminar pagando el mínimo cada mes.
 * @returns {{financiado:number, interesMes:number, liquidacion:{meses:number, intereses:number}|null}|null}
 *   null si no hay pago mínimo, tasa o saldo por encima del mínimo.
 */
export function siPaganElMinimo(tarjeta) {
  const { contado, minimo } = opcionesDePago(tarjeta);
  const tasa = aNumero(tarjeta.tasa);
  if (minimo === null || !tasa || contado <= minimo) return null;
  const financiado = redondear(contado - minimo);
  return {
    financiado,
    interesMes: redondear((financiado * tasa) / 1200),
    liquidacion: simularLiquidacion(contado, tasa, minimo),
  };
}

/**
 * Meses e intereses para terminar de pagar una deuda con un pago fijo
 * (amortización con interés mensual = tasa anual / 12).
 * @returns {{meses:number, intereses:number}|null}  null si el pago no
 *   alcanza a cubrir los intereses y la deuda nunca baja.
 */
export function simularLiquidacion(saldo, tasaAnual, pagoMensual) {
  const tasaMensual = aNumero(tasaAnual) / 1200;
  if (saldo <= 0) return { meses: 0, intereses: 0 };
  if (pagoMensual <= 0) return null;
  if (tasaMensual === 0) return { meses: Math.ceil(saldo / pagoMensual), intereses: 0 };
  if (pagoMensual <= saldo * tasaMensual) return null;
  const meses = -Math.log(1 - (tasaMensual * saldo) / pagoMensual) / Math.log(1 + tasaMensual);
  return { meses: Math.ceil(meses), intereses: redondear(meses * pagoMensual - saldo) };
}
