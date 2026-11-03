/**
 * Estado del lector de avisos del banco (apps-script/Codigo.gs) para
 * mostrarlo en la app. El lector corre en la cuenta de Google de cada
 * persona y deja en Firestore:
 *
 *   hogares/{hogar}/lectorCorreo/solicitud         lo que se pidió desde la app
 *     { id, mes, pedidoEn, pedidoPor }
 *   hogares/{hogar}/lectorCorreo/cuenta-<correo>   lo que hizo cada cuenta
 *     { cuenta, ultimaRevision, solicitud, mes, estado, nuevos, yaEstaban,
 *       sinTarjeta, ignorados, correosRevisados, posiblesRepetidos, mensaje }
 */

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
            yaEstaban: Number(c.yaEstaban) || 0,
            sinTarjeta: Number(c.sinTarjeta) || 0,
            correosRevisados: Number(c.correosRevisados) || 0,
            posiblesRepetidos: Array.isArray(c.posiblesRepetidos) ? c.posiblesRepetidos : [],
            mensaje: c.mensaje || '',
          }
        : null,
    };
  });
  const ocupado = cuentas.some(
    (c) => !c.apagado && (c.estado === 'esperando' || c.estado === 'revisando'),
  );
  return { instalado: cuentas.length > 0, pedido, ocupado, cuentas };
}
