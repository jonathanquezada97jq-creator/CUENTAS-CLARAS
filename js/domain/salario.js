/**
 * Cálculo del salario neto y del aguinaldo según la ley salvadoreña.
 * Funciones puras: reciben datos y devuelven resultados, sin efectos.
 */
import {
  ISSS,
  AFP,
  TABLA_RENTA_MENSUAL,
  RETENCION_SERVICIOS,
  DEDUCCION_FIJA,
  AGUINALDO,
} from '../constants/ley-sv.js';
import { redondear, aNumero } from '../utils/formato.js';
import { leerFecha, diferenciaDias } from '../utils/fechas.js';

/** Valores posibles del campo `tipo` de una persona. */
export const TIPO_SALARIO = Object.freeze({
  PLANILLA: 'asalariado',
  SERVICIOS: 'servicios',
  SIN_DESCUENTOS: 'sin',
});

/**
 * @typedef {Object} Persona
 * @property {string} id
 * @property {string} nombre
 * @property {number|string} salarioBruto  Salario mensual antes de descuentos.
 * @property {'asalariado'|'servicios'|'sin'} [tipo]  Por defecto, en planilla.
 * @property {'quincenal'|'mensual'} [frecuencia]  Por defecto, quincenal.
 * @property {number} [diaPago]  Día de pago cuando es mensual.
 * @property {string} [fechaIngreso]  "YYYY-MM-DD"; se usa para el aguinaldo.
 * @property {boolean} [deduccion1600]  Aplicar la deducción fija anual.
 * @property {number|string} [netoReal]  Lo que le depositan por pago, según su boleta.
 */

/**
 * @typedef {Object} DesgloseSalario
 * @property {number} bruto
 * @property {number} isss
 * @property {number} afp
 * @property {number} gravado  Bruto menos ISSS y AFP.
 * @property {number} base  Lo que se busca en la tabla de renta.
 * @property {number} renta
 * @property {string} tramo  "I" a "IV", o "10%" para servicios.
 * @property {number} neto  Mensual, antes de descuentos por planilla.
 * @property {boolean} conDeduccion  Si se aplicó la deducción de $1,600.
 */

/** Retención mensual de renta para una base gravada. */
export function calcularRenta(base) {
  const fila = TABLA_RENTA_MENSUAL.find((f) => base <= f.hasta);
  const monto = fila.porcentaje
    ? redondear((base - fila.sobreExceso) * fila.porcentaje + fila.cuotaFija)
    : 0;
  return { tramo: fila.tramo, monto };
}

/**
 * Desglose mensual del salario de una persona.
 * @param {Persona} persona
 * @returns {DesgloseSalario}
 */
export function calcularSalario(persona) {
  const bruto = aNumero(persona.salarioBruto);
  const desglose = {
    bruto,
    isss: 0,
    afp: 0,
    gravado: bruto,
    base: bruto,
    renta: 0,
    tramo: '',
    neto: bruto,
    conDeduccion: false,
  };

  if (persona.tipo === TIPO_SALARIO.SIN_DESCUENTOS) return desglose;

  if (persona.tipo === TIPO_SALARIO.SERVICIOS) {
    desglose.renta = redondear(bruto * RETENCION_SERVICIOS);
    desglose.tramo = '10%';
    desglose.neto = redondear(bruto - desglose.renta);
    return desglose;
  }

  desglose.isss = redondear(Math.min(bruto, ISSS.baseMaxima) * ISSS.tasa);
  desglose.afp = redondear(Math.min(bruto, AFP.baseMaxima) * AFP.tasa);
  desglose.gravado = redondear(bruto - desglose.isss - desglose.afp);
  desglose.base = desglose.gravado;

  const aplicaDeduccion =
    Boolean(persona.deduccion1600) && bruto * 12 <= DEDUCCION_FIJA.ingresoAnualMaximo;
  if (aplicaDeduccion) {
    desglose.base = redondear(Math.max(0, desglose.gravado - DEDUCCION_FIJA.anual / 12));
    desglose.conDeduccion = true;
  }

  const renta = calcularRenta(desglose.base);
  desglose.renta = renta.monto;
  desglose.tramo = renta.tramo;
  desglose.neto = redondear(bruto - desglose.isss - desglose.afp - desglose.renta);
  return desglose;
}

/**
 * @typedef {Object} Aguinaldo
 * @property {number} anios  Años completos de servicio al 12 de diciembre.
 * @property {number} dias  Días de salario que le tocan.
 * @property {boolean} proporcional  Si tiene menos de un año.
 * @property {number} salarioDiario
 * @property {number} monto
 * @property {number|null} exentoHasta  Exención de renta de ese año, si la hay.
 * @property {number} excedente  Parte que pasa de la exención.
 */

/**
 * Aguinaldo estimado de una persona en planilla para el año indicado.
 * Devuelve null si no aplica o faltan datos (salario o fecha de ingreso).
 * @param {Persona} persona
 * @param {number} anio
 * @returns {Aguinaldo|null}
 */
export function calcularAguinaldo(persona, anio) {
  const enPlanilla = !persona.tipo || persona.tipo === TIPO_SALARIO.PLANILLA;
  const bruto = aNumero(persona.salarioBruto);
  const ingreso = leerFecha(persona.fechaIngreso);
  if (!enPlanilla || !bruto || !ingreso) return null;

  const { mes, dia } = AGUINALDO.diaReferencia;
  const referencia = new Date(anio, mes, dia);
  if (ingreso > referencia) return null;

  let anios = referencia.getFullYear() - ingreso.getFullYear();
  const cumplioEsteAnio =
    referencia.getMonth() > ingreso.getMonth() ||
    (referencia.getMonth() === ingreso.getMonth() && referencia.getDate() >= ingreso.getDate());
  if (!cumplioEsteAnio) anios -= 1;

  let dias;
  const proporcional = anios < 1;
  if (proporcional) {
    const trabajados = Math.min(diferenciaDias(ingreso, referencia) + 1, 365);
    dias = redondear((AGUINALDO.diasBaseProporcional * trabajados) / 365);
  } else {
    dias = AGUINALDO.escala.find((fila) => anios >= fila.desdeAnios).dias;
  }

  const monto = redondear((bruto / 30) * dias);
  const exentoHasta =
    AGUINALDO.exencionRenta.anio === anio ? AGUINALDO.exencionRenta.hasta : null;

  return {
    anios,
    dias,
    proporcional,
    salarioDiario: redondear(bruto / 30),
    monto,
    exentoHasta,
    excedente: exentoHasta === null ? 0 : redondear(Math.max(0, monto - exentoHasta)),
  };
}
