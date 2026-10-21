/**
 * El presupuesto del hogar: ingresos, pagos de cada mes, endeudamiento
 * y qué cambia al marcar un pago. Funciones puras: reciben los datos y
 * la fecha de hoy, y devuelven resultados.
 *
 * @typedef {Object} DatosHogar
 * @property {import('./salario.js').Persona[]} personas
 * @property {Object[]} ingresos  Otros ingresos: cada mes, cada quincena o de una sola vez.
 * @property {import('./tarjetas.js').Tarjeta[]} tarjetas
 * @property {import('./plazos.js').Plazo[]} plazos
 * @property {Object[]} fijos  Gastos fijos mensuales.
 * @property {Object<string, Object<string, Object>>} pagados
 *   Por mes ("YYYY-MM"): clave de pago → detalle del pago (ver planificarPago).
 * @property {Object<string, Object[]>} gastos  Por mes: gastos anotados.
 */
import { aNumero, redondear, sumar } from '../utils/formato.js';
import { fechaDePago, fechaIso, leerFecha, mesDe, mesesEntre, sumarMeses } from '../utils/fechas.js';
import { calcularSalario } from './salario.js';
import {
  cuotaDelMes,
  cuotasPagadas,
  cuotasPendientes,
  estaActivo,
  saldoPendiente,
  seDescuentaPorPlanilla,
  MEDIO_EFECTIVO,
  METODO,
} from './plazos.js';
import { idDeTarjeta, montoDeOpcion, opcionesDePago, referenciaTarjeta, TIPO_PAGO_TARJETA } from './tarjetas.js';

/** Arriba de estos porcentajes del ingreso, la deuda se considera de cuidado o alta. */
export const LIMITES_DEUDA = Object.freeze({ saludable: 0.3, maximo: 0.4 });

export const TIPO_PAGO = Object.freeze({ FIJO: 'fijo', PLAZO: 'plazo', TARJETA: 'tarjeta' });

/** Clave de un pago dentro de un mes: "fijo_<id>", "plazo_<id>", "tarjeta_<id>". */
export const clavePago = (tipo, id) => `${tipo}_${id}`;

export function leerClavePago(clave) {
  const separador = clave.indexOf('_');
  return { tipo: clave.slice(0, separador), id: clave.slice(separador + 1) };
}

const buscar = (lista, id) => lista.find((x) => x.id === id);
const pagadosDelMes = (datos, mes) => datos.pagados?.[mes] ?? {};
export const gastosDelMes = (datos, mes) => datos.gastos?.[mes] ?? [];

/** Un registro cuenta desde el mes en que se creó, no antes. */
export const estaVigente = (registro, mes) => !registro.creado || mes >= registro.creado;

/* ------------------------------------------------------------------ */
/* Ingresos                                                           */
/* ------------------------------------------------------------------ */

export const pagosAlMes = (persona) => (persona.frecuencia === 'mensual' ? 1 : 2);

/** Días del mes en que le pagan: [15, 30] por defecto si es quincenal. */
export function diasDePago(persona) {
  if (persona.frecuencia === 'mensual') return [Number(persona.diaPago) || 30];
  const primero = Number(persona.diaQuincena1) || 15;
  const segundo = Number(persona.diaQuincena2) || 30;
  return [primero, segundo].sort((a, b) => a - b);
}

/**
 * Plazos que se descuentan de la planilla de esta persona. Si un plazo no
 * dice de quién es, se asume que es de la primera persona registrada.
 */
export function descuentosDePlanilla(persona, datos) {
  const primera = datos.personas[0]?.id;
  return datos.plazos.filter(
    (p) =>
      seDescuentaPorPlanilla(p) &&
      estaActivo(p) &&
      (p.personaId ? p.personaId === persona.id : persona.id === primera),
  );
}

export function totalPlanilla(persona, datos) {
  return redondear(sumar(descuentosDePlanilla(persona, datos), cuotaDelMes));
}

/**
 * Salario neto mensual de la persona, antes de los descuentos por planilla
 * (esos aparecen como pagos del mes). Si la persona escribió lo que le
 * depositan, se usa eso.
 */
export function ingresoMensualDePersona(persona, datos) {
  const depositado = aNumero(persona.netoReal);
  if (depositado > 0) {
    return redondear(depositado * pagosAlMes(persona) + totalPlanilla(persona, datos));
  }
  return calcularSalario(persona).neto;
}

/** Lo que cae en la cuenta en cada pago (quincena o mes). */
export function depositoPorPago(persona, datos) {
  const depositado = aNumero(persona.netoReal);
  if (depositado > 0) return redondear(depositado);
  const neto = calcularSalario(persona).neto - totalPlanilla(persona, datos);
  return redondear(neto / pagosAlMes(persona));
}

/** Ingresos que no se repiten: una venta, un servicio. Llevan `fecha`. */
export const esIngresoUnico = (ingreso) => ingreso.frecuencia === 'unica';

export function ingresosRecurrentesMensuales(datos) {
  return redondear(
    sumar(
      datos.ingresos.filter((i) => !esIngresoUnico(i)),
      (i) => aNumero(i.monto) * (i.frecuencia === 'quincenal' ? 2 : 1),
    ),
  );
}

export function ingresosUnicosDelMes(datos, mes) {
  return datos.ingresos.filter((i) => esIngresoUnico(i) && String(i.fecha || '').startsWith(mes));
}

/** Lo que entra todos los meses: salarios y otros ingresos que se repiten. */
export function ingresoTotalMensual(datos) {
  const salarios = sumar(datos.personas, (p) => ingresoMensualDePersona(p, datos));
  return redondear(salarios + ingresosRecurrentesMensuales(datos));
}

/** Lo que entra en un mes concreto: lo de todos los meses más los ingresos únicos de ese mes. */
export function ingresoDelMes(datos, mes) {
  const unicos = sumar(ingresosUnicosDelMes(datos, mes), (i) => aNumero(i.monto));
  return redondear(ingresoTotalMensual(datos) + unicos);
}

/** Próximos depósitos de salario y otros ingresos, desde hoy. */
export function proximosIngresos(datos, hoy, mesesAdelante = 2) {
  const eventos = [];
  const mesActual = mesDe(hoy);
  const limite = fechaDePago(sumarMeses(mesActual, mesesAdelante - 1), 31);

  for (let k = 0; k < mesesAdelante; k += 1) {
    const mes = sumarMeses(mesActual, k);
    datos.personas.forEach((persona) => {
      if (!(aNumero(persona.salarioBruto) > 0 || aNumero(persona.netoReal) > 0)) return;
      const monto = depositoPorPago(persona, datos);
      diasDePago(persona).forEach((dia) =>
        eventos.push({ tipo: 'salario', persona, monto, fecha: fechaDePago(mes, dia) }),
      );
    });
    datos.ingresos
      .filter((i) => !esIngresoUnico(i))
      .forEach((ingreso) => {
        const dia = Number(ingreso.dia) || 1;
        const dias = ingreso.frecuencia === 'quincenal' ? [dia, Math.min(dia + 15, 31)] : [dia];
        dias.forEach((d) =>
          eventos.push({ tipo: 'extra', ingreso, monto: aNumero(ingreso.monto), fecha: fechaDePago(mes, d) }),
        );
      });
  }

  datos.ingresos.filter(esIngresoUnico).forEach((ingreso) => {
    const fecha = leerFecha(ingreso.fecha);
    if (fecha && fecha <= limite) eventos.push({ tipo: 'unico', ingreso, monto: aNumero(ingreso.monto), fecha });
  });

  return eventos.filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha - b.fecha);
}

/* ------------------------------------------------------------------ */
/* Pagos del mes                                                      */
/* ------------------------------------------------------------------ */

/** Si la cuota de este plazo se cobra en el mes indicado. */
export function plazoCorreEnMes(plazo, mes, datos, hoy) {
  const clave = clavePago(TIPO_PAGO.PLAZO, plazo.id);
  if (pagadosDelMes(datos, mes)[clave]) return true;
  if (!estaVigente(plazo, mes)) return false;
  const mesActual = mesDe(hoy);
  const adelante = mesesEntre(mesActual, mes);
  if (adelante <= 0) return estaActivo(plazo);
  const pagadaEsteMes = Boolean(pagadosDelMes(datos, mesActual)[clave]);
  return cuotasPendientes(plazo) - (pagadaEsteMes ? 0 : 1) >= adelante;
}

/**
 * Medio con que se pagó una cuota. Los pagos de la primera versión de la
 * app no lo guardaban: si venían "vía" una tarjeta, se toma esa tarjeta.
 */
function medioDelPago(detalle) {
  if (detalle.medio) return detalle.medio;
  if (detalle.via) return referenciaTarjeta(leerClavePago(detalle.via).id);
  return null;
}

/**
 * @typedef {Object} PagoDelMes
 * @property {string} clave
 * @property {'fijo'|'plazo'|'tarjeta'} tipo
 * @property {Object} registro  El gasto fijo, plazo o tarjeta.
 * @property {number} monto  Lo que toca pagar, o lo que se pagó si ya está marcado.
 * @property {Date} fecha
 * @property {boolean} pagado
 * @property {number} [numeroCuota]  Plazos: número de la cuota de este mes.
 * @property {boolean} [porPlanilla]  Plazos descontados del salario.
 * @property {string|null} [medio]  Plazos pagados: "efectivo", "planilla" o "tarjeta:<id>".
 * @property {number|null} [minimo]  Tarjetas: pago mínimo.
 * @property {string|null} [tipoDePago]  Tarjetas pagadas: 'contado', 'minimo' u 'otro'.
 */

/**
 * Lista ordenada por fecha de todo lo que hay que pagar en el mes. Cada
 * cuota sale por separado, aunque se pague con tarjeta.
 * @returns {PagoDelMes[]}
 */
export function pagosDelMes(datos, mes, hoy) {
  const pagados = pagadosDelMes(datos, mes);
  const lista = [];

  datos.fijos
    .filter((fijo) => estaVigente(fijo, mes))
    .forEach((fijo) => {
      lista.push({
        clave: clavePago(TIPO_PAGO.FIJO, fijo.id),
        tipo: TIPO_PAGO.FIJO,
        registro: fijo,
        monto: aNumero(fijo.monto),
        dia: fijo.dia,
      });
    });

  datos.plazos.forEach((plazo) => {
    if (!plazoCorreEnMes(plazo, mes, datos, hoy)) return;
    const clave = clavePago(TIPO_PAGO.PLAZO, plazo.id);
    const registrado = pagados[clave];
    lista.push({
      clave,
      tipo: TIPO_PAGO.PLAZO,
      registro: plazo,
      monto: registrado ? redondear(aNumero(registrado.monto ?? plazo.cuota)) : cuotaDelMes(plazo),
      dia: plazo.dia,
      numeroCuota: Math.min(
        cuotasPagadas(plazo) + (registrado ? 0 : 1),
        Math.round(aNumero(plazo.total)),
      ),
      porPlanilla: seDescuentaPorPlanilla(plazo),
      medio: registrado ? medioDelPago(registrado) : null,
    });
  });

  datos.tarjetas
    .filter((tarjeta) => estaVigente(tarjeta, mes))
    .forEach((tarjeta) => {
      const clave = clavePago(TIPO_PAGO.TARJETA, tarjeta.id);
      const registrado = pagados[clave];
      const { contado, minimo } = opcionesDePago(tarjeta);
      if (!registrado && contado <= 0) return;
      lista.push({
        clave,
        tipo: TIPO_PAGO.TARJETA,
        registro: tarjeta,
        monto: registrado ? redondear(aNumero(registrado.monto)) : contado,
        dia: tarjeta.pago,
        minimo,
        tipoDePago: registrado ? (registrado.tipo ?? null) : null,
      });
    });

  return lista
    .map((pago) => ({
      ...pago,
      fecha: fechaDePago(mes, pago.dia),
      pagado: Boolean(pagados[pago.clave]),
    }))
    .sort((a, b) => a.fecha - b.fecha || a.clave.localeCompare(b.clave));
}

/** Totales del mes para el resumen de Inicio y Pagos. */
export function resumenDelMes(datos, mes, hoy) {
  const pagos = pagosDelMes(datos, mes, hoy);
  const gastos = gastosDelMes(datos, mes);
  const conTarjeta = (medio) => Boolean(idDeTarjeta(medio));
  const ingreso = ingresoDelMes(datos, mes);
  const compromisos = redondear(sumar(pagos, (p) => p.monto));
  const pagado = redondear(sumar(pagos.filter((p) => p.pagado), (p) => p.monto));
  // Cuotas pagadas con tarjeta: pasan al saldo de la tarjeta y se cubren al pagarla.
  const pagadoConTarjeta = redondear(
    sumar(pagos.filter((p) => p.pagado && conTarjeta(p.medio)), (p) => p.monto),
  );
  const gastosEfectivo = redondear(
    sumar(gastos.filter((g) => !conTarjeta(g.medio)), (g) => aNumero(g.monto)),
  );
  const gastosTarjeta = redondear(
    sumar(gastos.filter((g) => conTarjeta(g.medio)), (g) => aNumero(g.monto)),
  );
  return {
    pagos,
    ingreso,
    ingresosUnicos: ingresosUnicosDelMes(datos, mes),
    compromisos,
    pagado,
    pendiente: redondear(compromisos - pagado),
    pagadoConTarjeta,
    gastosEfectivo,
    gastosTarjeta,
    // Lo que se carga a tarjeta no se resta aquí: se paga cuando llega el pago de la tarjeta.
    disponible: redondear(ingreso - (compromisos - pagadoConTarjeta) - gastosEfectivo),
  };
}

/** Cuotas y pagos mínimos al mes comparados con el ingreso fijo. */
export function endeudamiento(datos) {
  const ingreso = ingresoTotalMensual(datos);
  const cuotas = redondear(sumar(datos.plazos.filter(estaActivo), cuotaDelMes));
  const minimos = redondear(
    sumar(datos.tarjetas, (t) => opcionesDePago(t).minimo ?? 0),
  );
  const total = redondear(cuotas + minimos);
  return { cuotas, minimos, total, proporcion: ingreso > 0 ? total / ingreso : 0 };
}

/** 'saludable' | 'cuidado' | 'alto'. */
export function nivelDeDeuda(proporcion) {
  if (proporcion < LIMITES_DEUDA.saludable) return 'saludable';
  if (proporcion <= LIMITES_DEUDA.maximo) return 'cuidado';
  return 'alto';
}

/* ------------------------------------------------------------------ */
/* Marcar un pago                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} DetalleDePago  Lo que la persona eligió al pagar.
 * @property {number} [monto]  Cuotas: lo pagado (puede ser más que la cuota). Tarjetas: si tipo es 'otro'.
 * @property {string} [medio]  Cuotas: "efectivo" o "tarjeta:<id>".
 * @property {'contado'|'minimo'|'otro'} [tipo]  Tarjetas.
 * @property {string} [fecha]  "YYYY-MM-DD"; por defecto, hoy.
 */

/**
 * @typedef {Object} PlanDePago
 * @property {Object<string, Object|null>} pagados  Claves a guardar en el mes (null = borrar).
 * @property {{id:string, deltaSaldo:number}[]} tarjetas  Cambios al saldo de tarjetas.
 * @property {{id:string, deltaAbonado?:number, deltaPagadas?:number}[]} plazos  Cambios a las cuotas.
 * @property {number} montoPagado  Lo que se pagó (0 al desmarcar).
 * @property {boolean} desmarcado  Si el plan quita un pago que ya estaba marcado.
 * @property {Object[]} plazosTerminados  Plazos que quedan pagados por completo.
 * @property {string} [bloqueado]  Si no se puede hacer, el motivo para mostrar.
 */

function planVacio() {
  return {
    pagados: {},
    tarjetas: [],
    plazos: [],
    montoPagado: 0,
    desmarcado: false,
    plazosTerminados: [],
  };
}

function planDeFijo(datos, clave, id, existente, fecha) {
  if (!buscar(datos.fijos, id)) return null;
  const plan = planVacio();
  plan.desmarcado = Boolean(existente);
  plan.pagados[clave] = existente ? null : { fecha };
  return plan;
}

function planDePlazo(datos, clave, id, existente, fecha, detalle) {
  const plazo = buscar(datos.plazos, id);
  if (!plazo) return null;
  const plan = planVacio();

  if (existente) {
    if (existente.via) {
      plan.bloqueado = 'Esta cuota se marcó junto con la tarjeta. Desmarcá el pago de la tarjeta.';
      return plan;
    }
    plan.desmarcado = true;
    plan.pagados[clave] = null;
    if (existente.monto !== undefined) {
      const monto = redondear(aNumero(existente.monto));
      plan.plazos.push({ id, deltaAbonado: -monto });
      const idTarjeta = idDeTarjeta(existente.medio);
      if (idTarjeta && buscar(datos.tarjetas, idTarjeta)) {
        plan.tarjetas.push({ id: idTarjeta, deltaSaldo: -monto });
      }
    } else if (Math.round(aNumero(plazo.pagadas)) > 0) {
      // Pago marcado con la primera versión: contaba cuotas, no dinero.
      plan.plazos.push({ id, deltaPagadas: -1 });
    }
    return plan;
  }

  const monto = redondear(detalle.monto ?? cuotaDelMes(plazo));
  const medio = detalle.medio || (seDescuentaPorPlanilla(plazo) ? METODO.PLANILLA : MEDIO_EFECTIVO);
  plan.pagados[clave] = { fecha, monto, medio };
  if (monto > 0) plan.plazos.push({ id, deltaAbonado: monto });
  const idTarjeta = idDeTarjeta(medio);
  if (idTarjeta && buscar(datos.tarjetas, idTarjeta) && monto > 0) {
    plan.tarjetas.push({ id: idTarjeta, deltaSaldo: monto });
  }
  if (estaActivo(plazo) && redondear(saldoPendiente(plazo) - monto) <= 0) {
    plan.plazosTerminados.push(plazo);
  }
  plan.montoPagado = monto;
  return plan;
}

function planDeTarjeta(datos, clave, id, existente, fecha, detalle) {
  const tarjeta = buscar(datos.tarjetas, id);
  if (!tarjeta) return null;
  const plan = planVacio();

  if (existente) {
    plan.desmarcado = true;
    plan.pagados[clave] = null;
    const monto = redondear(aNumero(existente.monto));
    if (monto > 0) plan.tarjetas.push({ id, deltaSaldo: monto });
    // La primera versión pagaba cuotas junto con la tarjeta: se revierten también.
    (existente.plazos || [])
      .map((idPlazo) => buscar(datos.plazos, idPlazo))
      .filter(Boolean)
      .forEach((p) => {
        if (Math.round(aNumero(p.pagadas)) > 0) plan.plazos.push({ id: p.id, deltaPagadas: -1 });
        plan.pagados[clavePago(TIPO_PAGO.PLAZO, p.id)] = null;
      });
    return plan;
  }

  const tipo = detalle.tipo || TIPO_PAGO_TARJETA.CONTADO;
  const monto = montoDeOpcion(tarjeta, tipo, detalle.monto);
  plan.pagados[clave] = { fecha, monto, tipo };
  if (monto > 0) plan.tarjetas.push({ id, deltaSaldo: -monto });
  plan.montoPagado = monto;
  return plan;
}

/**
 * Calcula qué cambia al marcar o desmarcar un pago, sin escribir nada.
 * El repositorio aplica el plan en una sola escritura.
 *
 * - Gasto fijo: solo se marca.
 * - Cuota: suma lo pagado (`abonado`), que puede ser más que la cuota. Si
 *   se pagó con tarjeta, ese monto pasa al saldo de la tarjeta.
 * - Tarjeta: resta del saldo el contado, el mínimo u otro monto.
 * - Si ya estaba marcado, se desmarca y se revierte con lo que se guardó.
 *
 * @param {DatosHogar} datos
 * @param {string} mes  "YYYY-MM".
 * @param {string} clave  Clave del pago (ver clavePago).
 * @param {Date} hoy
 * @param {DetalleDePago} [detalle]
 * @returns {PlanDePago|null}  null si el registro ya no existe.
 */
export function planificarPago(datos, mes, clave, hoy, detalle = {}) {
  const existente = pagadosDelMes(datos, mes)[clave];
  const { tipo, id } = leerClavePago(clave);
  const fecha = detalle.fecha || fechaIso(hoy);
  if (tipo === TIPO_PAGO.FIJO) return planDeFijo(datos, clave, id, existente, fecha);
  if (tipo === TIPO_PAGO.PLAZO) return planDePlazo(datos, clave, id, existente, fecha, detalle);
  if (tipo === TIPO_PAGO.TARJETA) return planDeTarjeta(datos, clave, id, existente, fecha, detalle);
  return null;
}
