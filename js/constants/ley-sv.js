/**
 * Cifras de ley de El Salvador que usa la app para calcular salarios.
 *
 * REVISAR CADA AÑO. Las tablas de renta, el salario mínimo y la exención
 * del aguinaldo cambian por decreto. Si algo cambia, se actualiza aquí y
 * en las pruebas de `tests/salario.test.js`; ningún otro archivo guarda
 * estas cifras.
 *
 * Fuentes:
 * - Renta: Decreto Ejecutivo N.º 10 del 30 de abril de 2025 (tablas de
 *   retención mensual, base exenta de $550).
 * - ISSS: Ley del Seguro Social, art. 29 (3 % del trabajador, base máxima $1,000).
 * - AFP: Ley Integral del Sistema de Pensiones (7.25 % del trabajador).
 * - Aguinaldo: Código de Trabajo, arts. 196 a 202; exención de renta 2026
 *   aprobada por disposición transitoria (septiembre de 2026).
 */

/** Cotización del trabajador al ISSS. */
export const ISSS = Object.freeze({ tasa: 0.03, baseMaxima: 1000 });

/**
 * Cotización del trabajador a la AFP. Algunas fuentes indican que no hay
 * techo; el tope solo afecta salarios mayores a $7,045.06.
 */
export const AFP = Object.freeze({ tasa: 0.0725, baseMaxima: 7045.06 });

/**
 * Tabla de retención mensual de renta para salarios.
 * Renta = (base − sobreExceso) × porcentaje + cuotaFija.
 * La base es el salario menos ISSS y AFP.
 */
export const TABLA_RENTA_MENSUAL = Object.freeze([
  { tramo: 'I', hasta: 550, porcentaje: 0, sobreExceso: 0, cuotaFija: 0 },
  { tramo: 'II', hasta: 895.24, porcentaje: 0.1, sobreExceso: 550, cuotaFija: 17.67 },
  { tramo: 'III', hasta: 2038.1, porcentaje: 0.2, sobreExceso: 895.24, cuotaFija: 60 },
  { tramo: 'IV', hasta: Infinity, porcentaje: 0.3, sobreExceso: 2038.1, cuotaFija: 288.57 },
]);

/** Retención por servicios profesionales (sin ISSS ni AFP). */
export const RETENCION_SERVICIOS = 0.1;

/**
 * Deducción fija de $1,600 anuales (art. 29 num. 7 de la Ley de Renta)
 * para quien gana hasta $9,100 al año. El tramo II de la tabla no la
 * incluye; algunas planillas la aplican y otras no.
 */
export const DEDUCCION_FIJA = Object.freeze({ anual: 1600, ingresoAnualMaximo: 9100 });

/** Salario mínimo de comercio, industria y servicios (vigente desde junio 2025). */
export const SALARIO_MINIMO_COMERCIO = 408.8;

export const AGUINALDO = Object.freeze({
  /** Días de salario según años de servicio continuo (art. 198). */
  escala: Object.freeze([
    { desdeAnios: 10, dias: 21 },
    { desdeAnios: 3, dias: 19 },
    { desdeAnios: 1, dias: 15 },
  ]),
  /** Con menos de un año se paga la parte proporcional de estos días. */
  diasBaseProporcional: 15,
  /** Fecha de referencia para contar los años de servicio. */
  diaReferencia: { mes: 11, dia: 12 }, // 12 de diciembre (mes 0 = enero)
  /** Exención de renta del aguinaldo; se aprueba año con año. */
  exencionRenta: Object.freeze({ anio: 2026, hasta: 1500 }),
  periodoDePago: Object.freeze({ anio: 2026, desde: '1 de octubre', hasta: '20 de diciembre' }),
});
