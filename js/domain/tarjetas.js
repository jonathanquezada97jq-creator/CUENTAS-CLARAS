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
 * @property {'total'|'minimo'|'fijo'} plan  Cuánto se piensa pagar cada mes.
 * @property {number} [planMonto]  Monto cuando el plan es "fijo".
 * @property {string} color  Clave de COLORES_TARJETA.
 */
import { aNumero, redondear, sumar } from '../utils/formato.js';
import { cuotasPendientes } from './plazos.js';

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

/** Lo que se piensa pagar este mes según el plan elegido, sin pasar del saldo. */
export function pagoSegunPlan(tarjeta) {
  const saldo = Math.max(0, aNumero(tarjeta.saldo));
  if (tarjeta.plan === 'minimo') return redondear(Math.min(aNumero(tarjeta.pagoMinimo), saldo));
  if (tarjeta.plan === 'fijo') return redondear(Math.min(aNumero(tarjeta.planMonto), saldo));
  return redondear(saldo);
}

/**
 * Cuánto del límite está ocupado, contando las cuotas futuras.
 * @returns {{enCuotas:number, usado:number, disponible:number, proporcion:number}}
 */
export function usoDeTarjeta(tarjeta, plazos) {
  const enCuotas = redondear(
    sumar(cuotasDeTarjeta(tarjeta, plazos), (p) => cuotasPendientes(p) * aNumero(p.cuota)),
  );
  const usado = redondear(aNumero(tarjeta.saldo) + enCuotas);
  const limite = aNumero(tarjeta.limite);
  return {
    enCuotas,
    usado,
    disponible: redondear(limite - usado),
    proporcion: limite > 0 ? usado / limite : 0,
  };
}

/** Saldo que queda financiado después del pago del plan. */
export function saldoFinanciado(tarjeta) {
  return redondear(Math.max(0, aNumero(tarjeta.saldo) - pagoSegunPlan(tarjeta)));
}

/** Interés aproximado del próximo mes sobre lo que queda financiado. */
export function interesDelProximoMes(tarjeta) {
  return redondear((saldoFinanciado(tarjeta) * aNumero(tarjeta.tasa)) / 1200);
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
