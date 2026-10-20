/**
 * Respaldo de los datos en un texto JSON que se puede copiar y guardar.
 * También lee el respaldo de la primera versión de la app (la que se
 * usaba dentro de Claude), para pasar esos datos a esta versión.
 */
import { aNumero } from '../utils/formato.js';

export const VERSION_RESPALDO = 2;
export const COLECCIONES_PRINCIPALES = Object.freeze([
  'personas',
  'ingresos',
  'tarjetas',
  'plazos',
  'fijos',
]);

/** Campos que pone la base de datos y no hace falta respaldar. */
const CAMPOS_INTERNOS = ['actualizado', 'creadoEn'];

function sinCamposInternos(registro) {
  const copia = { ...registro };
  CAMPOS_INTERNOS.forEach((campo) => delete copia[campo]);
  return copia;
}

const esIdValido = (id) => typeof id === 'string' && id.length > 0 && !id.includes('/');
const conIdValido = (lista) =>
  (Array.isArray(lista) ? lista : []).filter((x) => x && esIdValido(x.id));
const esMes = (texto) => /^\d{4}-\d{2}$/.test(texto);

/**
 * Arma el objeto de respaldo.
 * @param {Object} todo  {personas, ingresos, tarjetas, plazos, fijos, meses, gastos}
 *   donde `meses` es mes → {pagados} y `gastos` es una lista.
 * @param {string} fecha  "YYYY-MM-DD".
 */
export function crearRespaldo(todo, fecha) {
  const respaldo = { app: 'cuentas-claras', version: VERSION_RESPALDO, fecha };
  COLECCIONES_PRINCIPALES.forEach((nombre) => {
    respaldo[nombre] = (todo[nombre] || []).map(sinCamposInternos);
  });
  respaldo.meses = todo.meses || {};
  respaldo.gastos = (todo.gastos || []).map(sinCamposInternos);
  return respaldo;
}

/**
 * @typedef {Object} RespaldoLeido
 * @property {Object<string, Object[]>} colecciones  personas, ingresos, tarjetas, plazos, fijos.
 * @property {Object<string, {pagados:Object}>} meses
 * @property {Object[]} gastos  Cada uno con su campo `mes`.
 */

/**
 * Valida y normaliza un respaldo (de esta versión o de la primera).
 * @param {Object} objeto  El JSON ya convertido en objeto.
 * @param {{nombrePersona?: string}} [opciones]  Nombre para el salario que
 *   traía la primera versión (que no guardaba nombres).
 * @returns {RespaldoLeido}
 * @throws {Error} si el objeto no es un respaldo de Cuentas Claras.
 */
export function leerRespaldo(objeto, { nombrePersona = 'Persona 1' } = {}) {
  if (objeto && objeto.version === VERSION_RESPALDO) return leerVersion2(objeto);
  if (objeto && objeto.main && objeto.main.perfil) return convertirVersion1(objeto, nombrePersona);
  throw new Error('Ese texto no es un respaldo de Cuentas Claras.');
}

function leerVersion2(respaldo) {
  const colecciones = {};
  COLECCIONES_PRINCIPALES.forEach((nombre) => {
    colecciones[nombre] = conIdValido(respaldo[nombre]);
  });
  const meses = {};
  Object.entries(respaldo.meses || {}).forEach(([mes, contenido]) => {
    if (esMes(mes)) meses[mes] = { pagados: contenido?.pagados || {} };
  });
  const gastos = conIdValido(respaldo.gastos).filter((g) => esMes(g.mes));
  return { colecciones, meses, gastos };
}

/**
 * La primera versión guardaba un solo perfil de salario y las claves de
 * pago como "fijo:<id>". Aquí el perfil pasa a ser una persona y las
 * claves pasan a "fijo_<id>".
 */
function convertirVersion1({ main, meses = {} }, nombrePersona) {
  const perfil = main.perfil || {};
  const idPersona = 'persona-1';
  const tieneSalario = aNumero(perfil.salarioBruto) > 0 || aNumero(perfil.netoReal) > 0;
  const personas = tieneSalario ? [{ ...perfil, id: idPersona, nombre: nombrePersona }] : [];
  const plazos = conIdValido(main.plazos).map((p) =>
    p.metodo === 'planilla' && tieneSalario ? { ...p, personaId: idPersona } : p,
  );
  const claveNueva = (vieja) => String(vieja).replace(':', '_');

  const mesesNuevos = {};
  const gastos = [];
  Object.entries(meses).forEach(([mes, contenido]) => {
    if (!esMes(mes)) return;
    const pagados = {};
    Object.entries(contenido?.pagados || {}).forEach(([clave, valor]) => {
      const { f, via, ...resto } = valor || {};
      pagados[claveNueva(clave)] = {
        ...resto,
        ...(f ? { fecha: f } : {}),
        ...(via ? { via: claveNueva(via) } : {}),
      };
    });
    mesesNuevos[mes] = { pagados };
    conIdValido(contenido?.gastos).forEach((g) => {
      const mesDelGasto = String(g.fecha || '').slice(0, 7);
      gastos.push({ ...g, mes: esMes(mesDelGasto) ? mesDelGasto : mes });
    });
  });

  return {
    colecciones: {
      personas,
      ingresos: conIdValido(main.ingresos),
      tarjetas: conIdValido(main.tarjetas),
      plazos,
      fijos: conIdValido(main.fijos),
    },
    meses: mesesNuevos,
    gastos,
  };
}
