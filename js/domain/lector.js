/**
 * Estado del lector de avisos del banco (apps-script/Codigo.gs) para
 * mostrarlo en la app. El lector corre en la cuenta de Google de cada
 * persona y deja en Firestore:
 *
 *   hogares/{hogar}/lectorCorreo/solicitud         lo que se pidió desde la app
 *     { id, mes, pedidoEn, pedidoPor }
 *   hogares/{hogar}/lectorCorreo/cuenta-<correo>   lo que hizo cada cuenta
 *     { cuenta, ultimaRevision, solicitud, mes, estado, nuevos, movimientos,
 *       yaEstaban, sinTarjeta, sinCuenta, ignorados, correosRevisados,
 *       posiblesRepetidos, mensaje }
 *   (nuevos = gastos nuevos; movimientos = transferencias nuevas)
 */

import { cambiosDeSaldo, combinarEfectos, efectoDeMedio, efectosDeMovimiento, efectosVacios } from './cuentas.js';

/** Debe coincidir con AJUSTES.minutosEntreRevisiones del script. */
export const MINUTOS_ENTRE_REVISIONES = 5;

/** Si una cuenta no revisa en este tiempo, su lector probablemente está apagado. */
export const MINUTOS_SIN_NOTICIAS = 30;

/** "jonathan.quezada@gmail.com" → "jonathan.quezada". */
export function nombreCorto(correo) {
  return String(correo || 'cuenta').split('@')[0];
}

/** Timestamp de Firestore, texto ISO o Date → milisegundos (o null). */
export function milisegundos(valor) {
  if (!valor) return null;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  const n = Date.parse(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {Object} EstadoDeCuenta
 * @property {string} cuenta
 * @property {string} nombre
 * @property {'sin-pedido'|'esperando'|'revisando'|'listo'|'error'} estado
 * @property {number|null} minutos  Minutos desde su última revisión.
 * @property {boolean} apagado  Si hace mucho que no revisa.
 * @property {Object|null} resultado  Conteos del pedido, si ya terminó.
 * @property {string[]} pendientes  Avisos que no se pudieron anotar (sin leer o
 *   de cuentas que no están en la app), aunque no haya un pedido.
 */

/**
 * Qué está haciendo el lector de cada cuenta respecto al mes que se ve.
 * @param {{solicitud: Object|null, cuentas: Object[]}} lector
 * @param {string} mes  "YYYY-MM".
 * @param {number} ahora  Milisegundos.
 * @returns {{instalado:boolean, pedido:Object|null, ocupado:boolean, cuentas:EstadoDeCuenta[]}}
 */
export function estadoDelLector(lector, mes, ahora) {
  const pedido = lector?.solicitud && lector.solicitud.mes === mes ? lector.solicitud : null;
  const cuentas = (lector?.cuentas || []).map((c) => {
    const ultima = milisegundos(c.ultimaRevision);
    const minutos = ultima === null ? null : Math.max(0, Math.round((ahora - ultima) / 60000));
    const apagado = minutos === null || minutos > MINUTOS_SIN_NOTICIAS;
    let estado = 'sin-pedido';
    if (pedido) estado = c.solicitud === pedido.id ? c.estado || 'revisando' : 'esperando';
    const terminado = estado === 'listo' || estado === 'error';
    return {
      cuenta: c.cuenta,
      nombre: nombreCorto(c.cuenta),
      estado,
      minutos,
      apagado,
      resultado: terminado
        ? {
            nuevos: Number(c.nuevos) || 0,
            movimientos: Number(c.movimientos) || 0,
            fijos: Number(c.fijos) || 0,
            enlazados: Number(c.enlazados) || 0,
            yaEstaban: Number(c.yaEstaban) || 0,
            sinTarjeta: Number(c.sinTarjeta) || 0,
            sinCuenta: Number(c.sinCuenta) || 0,
            sinLeer: Number(c.sinLeer) || 0,
            correosRevisados: Number(c.correosRevisados) || 0,
            posiblesRepetidos: Array.isArray(c.posiblesRepetidos) ? c.posiblesRepetidos : [],
            mensaje: c.mensaje || '',
          }
        : null,
      pendientes: Array.isArray(c.avisosPendientes) ? c.avisosPendientes.filter((t) => typeof t === 'string') : [],
    };
  });
  const ocupado = cuentas.some(
    (c) => !c.apagado && (c.estado === 'esperando' || c.estado === 'revisando'),
  );
  return { instalado: cuentas.length > 0, pedido, ocupado, cuentas };
}

/* ------------------------------------------------------------------ */
/* Borrar lo leído de un mes para que el lector lo vuelva a leer       */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} PlanDeRelectura
 * @property {string[]} borrarGastos  Ids de gastos que vinieron del correo (también los ya borrados).
 * @property {string[]} desenlazarGastos  Gastos anotados a mano: se les quita el aviso enlazado.
 * @property {string[]} borrarMovimientos
 * @property {string[]} desenlazarMovimientos
 * @property {string[]} desmarcarPagos  Claves de pagos que marcó el lector (gastos fijos).
 * @property {string[]} desenlazarPagos  Pagos marcados a mano con un aviso enlazado.
 * @property {{cuentas: {id:string, deltaSaldo:number}[], tarjetas: {id:string, deltaSaldo:number}[]}} saldos
 *   Lo que se devuelve a cada cuenta y tarjeta.
 * @property {{gastos:number, movimientos:number, pagos:number}} conteo  Lo que se va a volver a leer (visible).
 */

/**
 * Qué hay que hacer para que el lector vuelva a leer un mes desde cero:
 *   - Lo que anotó el lector se borra y se devuelve su saldo. Lo que ya se
 *     había borrado en la app (queda "descartado" para que no vuelva) se borra
 *     del todo, así el lector lo puede anotar otra vez.
 *   - Los gastos fijos que marcó el lector se desmarcan (y se devuelve el saldo).
 *   - Lo anotado a mano se queda; solo se le quita el aviso enlazado, para
 *     que el lector lo vuelva a enlazar en lugar de repetirlo.
 * @param {Object} datos  Estado de la app (con todos los gastos y movimientos del mes, incluso los descartados).
 * @param {string} mes  "YYYY-MM".
 * @returns {PlanDeRelectura}
 */
export function planDeRelectura(datos, mes) {
  const plan = {
    borrarGastos: [],
    desenlazarGastos: [],
    borrarMovimientos: [],
    desenlazarMovimientos: [],
    desmarcarPagos: [],
    desenlazarPagos: [],
    conteo: { gastos: 0, movimientos: 0, pagos: 0 },
  };
  const efectos = [efectosVacios()];

  (datos.gastos?.[mes] ?? []).forEach((g) => {
    if (g.origen === 'correo') {
      plan.borrarGastos.push(g.id);
      // Al borrarlo en la app ya se había devuelto su saldo; si sigue visible, se devuelve ahora.
      if (!g.descartado) {
        efectos.push(efectoDeMedio(g.medio, g.monto, -1));
        plan.conteo.gastos += 1;
      }
    } else if (g.correoId) {
      if (g.descartado) plan.borrarGastos.push(g.id);
      else plan.desenlazarGastos.push(g.id);
    }
  });

  (datos.movimientos?.[mes] ?? []).forEach((m) => {
    const enlazado = (m.referencias?.length ?? 0) > 0 || (m.lados?.length ?? 0) > 0;
    if (m.origen === 'correo') {
      plan.borrarMovimientos.push(m.id);
      if (!m.descartado) {
        efectos.push(efectosDeMovimiento(m, -1));
        plan.conteo.movimientos += 1;
      }
    } else if (enlazado) {
      if (m.descartado) plan.borrarMovimientos.push(m.id);
      else plan.desenlazarMovimientos.push(m.id);
    }
  });

  Object.entries(datos.pagados?.[mes] ?? {}).forEach(([clave, pago]) => {
    if (!pago) return;
    if (pago.origen === 'correo') {
      plan.desmarcarPagos.push(clave);
      if (pago.monto !== undefined) efectos.push(efectoDeMedio(pago.medio, pago.monto, -1));
      plan.conteo.pagos += 1;
    } else if (pago.correo) {
      plan.desenlazarPagos.push(clave);
    }
  });

  plan.saldos = cambiosDeSaldo(combinarEfectos(...efectos), datos);
  return plan;
}

/** Si el plan no tiene nada que hacer. */
export const relecturaVacia = (plan) =>
  ['borrarGastos', 'desenlazarGastos', 'borrarMovimientos', 'desenlazarMovimientos', 'desmarcarPagos', 'desenlazarPagos'].every(
    (lista) => plan[lista].length === 0,
  );
