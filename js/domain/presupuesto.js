/**
 * El presupuesto del hogar: ingresos, pagos de cada mes, endeudamiento
 * y qué cambia al marcar un pago. Funciones puras: reciben los datos y
 * la fecha de hoy, y devuelven resultados.
 *
 * @typedef {Object} DatosHogar
 * @property {import('./salario.js').Persona[]} personas
 * @property {Object[]} ingresos  Otros ingresos (remesas, ventas…).
 * @property {import('./tarjetas.js').Tarjeta[]} tarjetas
 * @property {import('./plazos.js').Plazo[]} plazos
 * @property {Object[]} fijos  Gastos fijos mensuales.
 * @property {Object<string, Object<string, Object>>} pagados
 *   Por mes ("YYYY-MM"): clave de pago → detalle del pago.
 * @property {Object<string, Object[]>} gastos  Por mes: gastos anotados.
 */
import { aNumero, redondear, sumar } from '../utils/formato.js';
import { fechaDePago, fechaIso, mesDe, mesesEntre, sumarMeses } from '../utils/fechas.js';
import { calcularSalario } from './salario.js';
import {
  cuotasPagadas,
  cuotasPendientes,
  estaActivo,
  seDescuentaPorPlanilla,
} from './plazos.js';
import { cuotasDeTarjeta, idDeTarjeta, pagoSegunPlan } from './tarjetas.js';

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
  return redondear(sumar(descuentosDePlanilla(persona, datos), (p) => aNumero(p.cuota)));
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

export function ingresosExtraMensuales(datos) {
  return redondear(
    sumar(datos.ingresos, (i) => aNumero(i.monto) * (i.frecuencia === 'quincenal' ? 2 : 1)),
  );
}

export function ingresoTotalMensual(datos) {
  const salarios = sumar(datos.personas, (p) => ingresoMensualDePersona(p, datos));
  return redondear(salarios + ingresosExtraMensuales(datos));
}

/** Próximos depósitos de salario y otros ingresos, desde hoy. */
export function proximosIngresos(datos, hoy, mesesAdelante = 2) {
  const eventos = [];
  const mesActual = mesDe(hoy);
  for (let k = 0; k < mesesAdelante; k += 1) {
    const mes = sumarMeses(mesActual, k);
    datos.personas.forEach((persona) => {
      if (!(aNumero(persona.salarioBruto) > 0 || aNumero(persona.netoReal) > 0)) return;
      const dias = pagosAlMes(persona) === 2 ? [15, 31] : [Number(persona.diaPago) || 31];
      const monto = depositoPorPago(persona, datos);
      dias.forEach((dia) =>
        eventos.push({ tipo: 'salario', persona, monto, fecha: fechaDePago(mes, dia) }),
      );
    });
    datos.ingresos.forEach((ingreso) => {
      const dia = Number(ingreso.dia) || 1;
      const dias = ingreso.frecuencia === 'quincenal' ? [dia, Math.min(dia + 15, 31)] : [dia];
      dias.forEach((d) =>
        eventos.push({
          tipo: 'extra',
          ingreso,
          monto: aNumero(ingreso.monto),
          fecha: fechaDePago(mes, d),
        }),
      );
    });
  }
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
 * @typedef {Object} PagoDelMes
 * @property {string} clave
 * @property {'fijo'|'plazo'|'tarjeta'} tipo
 * @property {Object} registro  El gasto fijo, plazo o tarjeta.
 * @property {number} monto
 * @property {Date} fecha
 * @property {boolean} pagado
 * @property {number} [numeroCuota]  Plazos: número de la cuota de este mes.
 * @property {boolean} [porPlanilla]  Plazos descontados del salario.
 * @property {Object[]} [cuotasIncluidas]  Tarjetas: plazos que se cobran en ella.
 */

/**
 * Lista ordenada por fecha de todo lo que hay que pagar en el mes.
 * Los plazos cargados a una tarjeta no salen solos: se suman al pago de esa tarjeta.
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
    if (idDeTarjeta(plazo.metodo) || !plazoCorreEnMes(plazo, mes, datos, hoy)) return;
    const clave = clavePago(TIPO_PAGO.PLAZO, plazo.id);
    lista.push({
      clave,
      tipo: TIPO_PAGO.PLAZO,
      registro: plazo,
      monto: aNumero(plazo.cuota),
      dia: plazo.dia,
      numeroCuota: Math.min(
        cuotasPagadas(plazo) + (pagados[clave] ? 0 : 1),
        Math.round(aNumero(plazo.total)),
      ),
      porPlanilla: seDescuentaPorPlanilla(plazo),
    });
  });

  datos.tarjetas
    .filter((tarjeta) => estaVigente(tarjeta, mes))
    .forEach((tarjeta) => {
      const clave = clavePago(TIPO_PAGO.TARJETA, tarjeta.id);
      const registrado = pagados[clave];
      const cuotasIncluidas = registrado
        ? datos.plazos.filter((p) => (registrado.plazos || []).includes(p.id))
        : cuotasDeTarjeta(tarjeta, datos.plazos).filter((p) =>
            plazoCorreEnMes(p, mes, datos, hoy),
          );
      const monto = registrado
        ? redondear(aNumero(registrado.monto) + aNumero(registrado.cuotas))
        : redondear(pagoSegunPlan(tarjeta) + sumar(cuotasIncluidas, (p) => aNumero(p.cuota)));
      if (!registrado && monto <= 0) return;
      lista.push({
        clave,
        tipo: TIPO_PAGO.TARJETA,
        registro: tarjeta,
        monto,
        dia: tarjeta.pago,
        cuotasIncluidas,
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
  const conTarjeta = (g) => Boolean(idDeTarjeta(g.medio));
  const ingreso = ingresoTotalMensual(datos);
  const compromisos = redondear(sumar(pagos, (p) => p.monto));
  const pagado = redondear(sumar(pagos.filter((p) => p.pagado), (p) => p.monto));
  const gastosEfectivo = redondear(
    sumar(gastos.filter((g) => !conTarjeta(g)), (g) => aNumero(g.monto)),
  );
  const gastosTarjeta = redondear(sumar(gastos.filter(conTarjeta), (g) => aNumero(g.monto)));
  return {
    pagos,
    ingreso,
    compromisos,
    pagado,
    pendiente: redondear(compromisos - pagado),
    gastosEfectivo,
    gastosTarjeta,
    // Lo gastado con tarjeta no se resta aquí: se paga cuando llega el pago de la tarjeta.
    disponible: redondear(ingreso - compromisos - gastosEfectivo),
  };
}

/** Cuotas y pagos mínimos al mes comparados con el ingreso. */
export function endeudamiento(datos) {
  const ingreso = ingresoTotalMensual(datos);
  const cuotas = redondear(sumar(datos.plazos.filter(estaActivo), (p) => aNumero(p.cuota)));
  const minimos = redondear(
    sumar(
      datos.tarjetas.filter((t) => aNumero(t.saldo) > 0),
      (t) => aNumero(t.pagoMinimo),
    ),
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
 * @typedef {Object} PlanDePago
 * @property {Object<string, Object|null>} pagados  Claves a guardar en el mes (null = borrar).
 * @property {{id:string, deltaSaldo:number}[]} tarjetas  Cambios al saldo de tarjetas.
 * @property {{id:string, deltaPagadas:number}[]} plazos  Cambios a las cuotas pagadas.
 * @property {number} montoRebajado  Lo que se restó del saldo de una tarjeta.
 * @property {Object[]} plazosTerminados  Plazos que quedan pagados por completo.
 */

/**
 * Calcula qué cambia al marcar o desmarcar un pago, sin escribir nada.
 * El repositorio aplica el plan en una sola escritura.
 *
 * - Gasto fijo: solo se marca.
 * - Plazo: avanza (o retrocede) una cuota.
 * - Tarjeta: resta del saldo el pago del plan y avanza una cuota de cada
 *   plazo cargado a ella. Al desmarcar, se revierte con lo que se guardó.
 *
 * @returns {PlanDePago|null}  null si el registro ya no existe.
 */
export function planificarPago(datos, mes, clave, hoy) {
  const pagados = pagadosDelMes(datos, mes);
  const existente = pagados[clave];
  const { tipo, id } = leerClavePago(clave);
  const fecha = fechaIso(hoy);
  const plan = { pagados: {}, tarjetas: [], plazos: [], montoRebajado: 0, plazosTerminados: [] };

  if (tipo === TIPO_PAGO.FIJO) {
    if (!buscar(datos.fijos, id)) return null;
    plan.pagados[clave] = existente ? null : { fecha };
    return plan;
  }

  if (tipo === TIPO_PAGO.PLAZO) {
    const plazo = buscar(datos.plazos, id);
    if (!plazo) return null;
    if (existente) {
      plan.pagados[clave] = null;
      if (cuotasPagadas(plazo) > 0) plan.plazos.push({ id, deltaPagadas: -1 });
    } else {
      plan.pagados[clave] = { fecha };
      if (estaActivo(plazo)) {
        plan.plazos.push({ id, deltaPagadas: 1 });
        if (cuotasPendientes(plazo) === 1) plan.plazosTerminados.push(plazo);
      }
    }
    return plan;
  }

  if (tipo === TIPO_PAGO.TARJETA) {
    const tarjeta = buscar(datos.tarjetas, id);
    if (!tarjeta) return null;

    if (existente) {
      plan.pagados[clave] = null;
      const monto = redondear(aNumero(existente.monto));
      if (monto > 0) plan.tarjetas.push({ id, deltaSaldo: monto });
      (existente.plazos || [])
        .map((idPlazo) => buscar(datos.plazos, idPlazo))
        .filter(Boolean)
        .forEach((p) => {
          if (cuotasPagadas(p) > 0) plan.plazos.push({ id: p.id, deltaPagadas: -1 });
          plan.pagados[clavePago(TIPO_PAGO.PLAZO, p.id)] = null;
        });
      return plan;
    }

    const monto = pagoSegunPlan(tarjeta);
    const incluidas = cuotasDeTarjeta(tarjeta, datos.plazos).filter(
      (p) =>
        estaActivo(p) &&
        plazoCorreEnMes(p, mes, datos, hoy) &&
        !pagados[clavePago(TIPO_PAGO.PLAZO, p.id)],
    );
    incluidas.forEach((p) => {
      plan.plazos.push({ id: p.id, deltaPagadas: 1 });
      plan.pagados[clavePago(TIPO_PAGO.PLAZO, p.id)] = { fecha, via: clave };
      if (cuotasPendientes(p) === 1) plan.plazosTerminados.push(p);
    });
    plan.pagados[clave] = {
      fecha,
      monto,
      cuotas: redondear(sumar(incluidas, (p) => aNumero(p.cuota))),
      plazos: incluidas.map((p) => p.id),
    };
    if (monto > 0) plan.tarjetas.push({ id, deltaSaldo: -monto });
    plan.montoRebajado = monto;
    return plan;
  }

  return null;
}
