/**
 * Cuentas de banco (ahorro o corriente, con su tarjeta de débito) y los
 * movimientos de dinero: transferencias entre cuentas, pagos de tarjeta
 * desde una cuenta, depósitos y retiros.
 *
 * Toda forma de pagar algo deja su huella en un saldo:
 *   - con tarjeta de crédito  → sube lo que se debe en la tarjeta
 *   - con débito o desde una cuenta → baja lo que hay en la cuenta
 *   - en efectivo → no toca ningún saldo
 * Esas huellas se calculan aquí como "efectos" y el repositorio las escribe
 * con `increment`, junto con el registro que las causó.
 *
 * @typedef {Object} Cuenta  Registro de la colección "cuentas".
 * @property {string} id
 * @property {string} banco
 * @property {string} [nombre]  "Ahorro", "Cuenta de la casa"…
 * @property {'ahorro'|'corriente'} [tipo]
 * @property {string} [ultimos]  Últimos 4 dígitos de la cuenta.
 * @property {string} [debito]  Últimos 4 dígitos de su tarjeta de débito.
 * @property {number} saldo  Lo que hay hoy en la cuenta.
 * @property {string} [personaId]  De quién es.
 * @property {string} [color]  Clave de COLORES_TARJETA.
 *
 * @typedef {Object} Movimiento  Registro de la colección "movimientos".
 * @property {string} id
 * @property {string} fecha  "YYYY-MM-DD".
 * @property {string} mes  "YYYY-MM" (para leer un mes a la vez).
 * @property {number} monto
 * @property {string} desde  "cuenta:<id>", "efectivo" o "externo".
 * @property {string} hacia  "cuenta:<id>", "tarjeta:<id>", "efectivo" o "externo".
 * @property {string} [nota]
 * @property {'correo'} [origen]  Lo anotó el lector de avisos del banco.
 * @property {string} [referencia]  Número de referencia del banco.
 * @property {string} [posibleRepetido]  Id de otro movimiento que parece el mismo,
 *   o "pago:tarjeta_<id>" si parece el pago de tarjeta marcado a mano.
 * @property {boolean} [descartado]  Vino del correo y se borró en la app.
 */
import { aNumero, redondear, sumar } from '../utils/formato.js';
import { idDeTarjeta, referenciaTarjeta } from './tarjetas.js';

const PREFIJO = 'cuenta:';

/** Como `referenciaTarjeta`: los gastos, cuotas y movimientos guardan "cuenta:<id>". */
export const referenciaCuenta = (id) => `${PREFIJO}${id}`;

/** "cuenta:abc" → "abc"; cualquier otro valor → null. */
export function idDeCuenta(referencia) {
  return typeof referencia === 'string' && referencia.startsWith(PREFIJO)
    ? referencia.slice(PREFIJO.length)
    : null;
}

/** Extremos de un movimiento que no son una cuenta ni una tarjeta registrada. */
export const EXTREMO = Object.freeze({
  /** Billetes: un retiro en el cajero o un pago en ventanilla. */
  EFECTIVO: 'efectivo',
  /** Otra persona, una empresa o una cuenta que no está en la app. */
  EXTERNO: 'externo',
});

export const TIPO_MOVIMIENTO = Object.freeze({
  TRANSFERENCIA: 'transferencia', // de una cuenta mía a otra mía
  PAGO_TARJETA: 'pago-tarjeta', // a una tarjeta de crédito
  DEPOSITO: 'deposito', // entra a una cuenta desde afuera
  RETIRO: 'retiro', // sale de una cuenta hacia afuera o a efectivo
});

/** Qué tipo de movimiento es según de dónde sale y a dónde va. */
export function tipoDeMovimiento(movimiento) {
  if (idDeTarjeta(movimiento.hacia)) return TIPO_MOVIMIENTO.PAGO_TARJETA;
  const desde = idDeCuenta(movimiento.desde);
  const hacia = idDeCuenta(movimiento.hacia);
  if (desde && hacia) return TIPO_MOVIMIENTO.TRANSFERENCIA;
  if (hacia) return TIPO_MOVIMIENTO.DEPOSITO;
  return TIPO_MOVIMIENTO.RETIRO;
}

/** Cuenta cuyos últimos 4 dígitos (de la cuenta o de su tarjeta de débito) coinciden. */
export function buscarCuentaPorUltimos(cuentas, ultimos) {
  const clave = String(ultimos || '').padStart(4, '0');
  if (!ultimos) return null;
  const igual = (valor) => valor && String(valor).padStart(4, '0') === clave;
  return cuentas.find((c) => igual(c.ultimos)) || cuentas.find((c) => igual(c.debito)) || null;
}

/**
 * Clave para comparar nombres de banco escritos distinto:
 * "Banco Cuscatlán" y "CUSCATLAN" → "cuscatlan"; "Banco de América Central" → "bac".
 */
export function claveDeBanco(nombre) {
  const texto = String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/america central|credomatic/.test(texto)) return 'bac';
  return texto
    .replace(/\bbanco\b|\bb\./g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function saldoEnCuentas(cuentas) {
  return redondear(sumar(cuentas, (c) => aNumero(c.saldo)));
}

/** Salarios y otros ingresos que se depositan en esta cuenta. */
export function ingresosDeLaCuenta(cuenta, datos) {
  return {
    personas: datos.personas.filter((p) => p.cuentaId === cuenta.id),
    ingresos: datos.ingresos.filter((i) => i.cuentaId === cuenta.id),
  };
}

/* ------------------------------------------------------------------ */
/* Movimientos del mes                                                */
/* ------------------------------------------------------------------ */

/** Movimientos del mes, sin los descartados (ver `descartado`). */
export const movimientosDelMes = (datos, mes) =>
  (datos.movimientos?.[mes] ?? []).filter((m) => !m.descartado);

/** Movimientos del mes que pagan esta tarjeta (transferencias a la tarjeta). */
export function pagosATarjeta(datos, mes, idTarjeta) {
  const referencia = referenciaTarjeta(idTarjeta);
  return movimientosDelMes(datos, mes).filter((m) => m.hacia === referencia);
}

/** Movimientos del mes que salen o entran a esta cuenta. */
export function movimientosDeCuenta(datos, mes, idCuenta) {
  const referencia = referenciaCuenta(idCuenta);
  return movimientosDelMes(datos, mes).filter((m) => m.desde === referencia || m.hacia === referencia);
}

/**
 * Lo que entró y salió de una cuenta en el mes: transferencias y depósitos,
 * compras con su débito y pagos marcados en Pagos que salieron de ella.
 * @returns {{entro:number, salio:number}}
 */
export function flujoDeCuenta(datos, mes, idCuenta) {
  const referencia = referenciaCuenta(idCuenta);
  let entro = 0;
  let salio = 0;
  movimientosDelMes(datos, mes).forEach((m) => {
    if (m.hacia === referencia) entro += aNumero(m.monto);
    if (m.desde === referencia) salio += aNumero(m.monto);
  });
  (datos.gastos?.[mes] ?? [])
    .filter((g) => !g.descartado && g.medio === referencia)
    .forEach((g) => {
      salio += aNumero(g.monto);
    });
  Object.values(datos.pagados?.[mes] ?? {}).forEach((pago) => {
    if (pago && (pago.medio === referencia || pago.desde === referencia)) salio += aNumero(pago.monto);
  });
  return { entro: redondear(entro), salio: redondear(salio) };
}

/* ------------------------------------------------------------------ */
/* Efectos sobre los saldos                                           */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{cuentas: Object<string, number>, tarjetas: Object<string, number>}} Efectos
 *   Cuánto sube (+) o baja (−) el saldo de cada cuenta y tarjeta, por id.
 */

export const efectosVacios = () => ({ cuentas: {}, tarjetas: {} });

function sumarEfecto(efectos, coleccion, id, delta) {
  if (!id || !delta) return;
  efectos[coleccion][id] = (efectos[coleccion][id] || 0) + delta;
}

/**
 * Lo que pasa con los saldos al pagar `monto` con un medio:
 * con tarjeta sube su deuda; con una cuenta (débito) baja su dinero.
 * `signo` -1 deshace el pago (al borrarlo o desmarcarlo).
 * @returns {Efectos}
 */
export function efectoDeMedio(medio, monto, signo = 1) {
  const efectos = efectosVacios();
  const valor = aNumero(monto) * signo;
  sumarEfecto(efectos, 'tarjetas', idDeTarjeta(medio), valor);
  sumarEfecto(efectos, 'cuentas', idDeCuenta(medio), -valor);
  return efectos;
}

/**
 * Lo que pasa con los saldos por un movimiento: la cuenta de donde sale
 * baja; la cuenta a donde llega sube; la tarjeta a donde llega debe menos.
 * @returns {Efectos}
 */
export function efectosDeMovimiento(movimiento, signo = 1) {
  const efectos = efectosVacios();
  const valor = aNumero(movimiento.monto) * signo;
  sumarEfecto(efectos, 'cuentas', idDeCuenta(movimiento.desde), -valor);
  sumarEfecto(efectos, 'cuentas', idDeCuenta(movimiento.hacia), valor);
  sumarEfecto(efectos, 'tarjetas', idDeTarjeta(movimiento.hacia), -valor);
  return efectos;
}

/** Suma varios efectos en uno. */
export function combinarEfectos(...lista) {
  const total = efectosVacios();
  lista.forEach((efectos) => {
    ['cuentas', 'tarjetas'].forEach((coleccion) => {
      Object.entries(efectos[coleccion]).forEach(([id, delta]) => sumarEfecto(total, coleccion, id, delta));
    });
  });
  return total;
}

/**
 * Efectos listos para escribir: solo cuentas y tarjetas que existen (escribir
 * en una que se borró haría fallar toda la escritura) y sin cambios de cero.
 * @param {Efectos} efectos
 * @param {{cuentas?: Object[], tarjetas: Object[]}} datos
 * @returns {{cuentas: {id:string, deltaSaldo:number}[], tarjetas: {id:string, deltaSaldo:number}[]}}
 */
export function cambiosDeSaldo(efectos, datos) {
  const lista = (coleccion) =>
    Object.entries(efectos[coleccion])
      .map(([id, delta]) => ({ id, deltaSaldo: redondear(delta) }))
      .filter(({ id, deltaSaldo }) => deltaSaldo !== 0 && (datos[coleccion] || []).some((r) => r.id === id));
  return { cuentas: lista('cuentas'), tarjetas: lista('tarjetas') };
}
