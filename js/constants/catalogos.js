/**
 * Listas fijas que usan los formularios: categorías, bancos, tipos.
 * Para agregar una opción, se agrega aquí y aparece en toda la app.
 */

export const MESES = Object.freeze([
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]);

export const MESES_CORTOS = Object.freeze([
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]);

export const CATEGORIAS_GASTO = Object.freeze([
  'Súper y comida',
  'Comida fuera',
  'Transporte y gasolina',
  'Salud y farmacia',
  'Educación',
  'Hogar',
  'Ropa y cuidado personal',
  'Salidas y entretenimiento',
  'Familia y regalos',
  'Otros',
]);

export const CATEGORIAS_FIJO = Object.freeze([
  'Vivienda',
  'Servicios (luz, agua)',
  'Teléfono e internet',
  'Educación',
  'Seguros',
  'Suscripciones',
  'Familia',
  'Otros',
]);

export const BANCOS = Object.freeze([
  'Banco Agrícola', 'Banco Cuscatlán', 'Davivienda', 'BAC', 'Banco Promerica',
  'Banco Hipotecario', 'Banco Azul', 'Banco Atlántida', 'Banco Industrial',
  'Banco de América Central', 'Fedecrédito', 'Siman', 'Prado',
]);

export const ACREEDORES = Object.freeze([
  'La Curacao', 'Tropigas', 'Omnisport', 'Siman', 'Prado', 'Almacenes Vidrí',
  'Fondo Social para la Vivienda (FSV)', 'Cooperativa', 'Banco Agrícola',
  'Banco Cuscatlán', 'Davivienda', 'BAC',
]);

export const GASTOS_FIJOS_SUGERIDOS = Object.freeze([
  'Alquiler', 'Luz', 'Agua (ANDA)', 'Internet y cable', 'Plan de celular',
  'Colegiatura', 'Gas propano', 'Seguro', 'Streaming', 'Gimnasio',
]);

/** Colores de tarjeta: clave → nombre visible. La clave es una variable CSS (--tarjeta-<clave>). */
export const COLORES_TARJETA = Object.freeze({
  cobalto: 'Cobalto',
  vino: 'Vino',
  bosque: 'Bosque',
  grafito: 'Grafito',
  maiz: 'Maíz',
});

export const TIPOS_PLAZO = Object.freeze({
  tienda: 'Crédito en almacén',
  tasa0: 'Tasa cero',
  prestamo: 'Préstamo',
  extra: 'Extrafinanciamiento',
  otro: 'Otro',
});

export const TIPOS_INGRESO = Object.freeze({
  venta: 'Venta',
  servicio: 'Servicio o trabajo extra',
  remesa: 'Remesa',
  negocio: 'Negocio',
  alquiler: 'Alquiler',
  pension: 'Pensión',
  otro: 'Otro',
});

/** Frecuencia de otros ingresos. 'unica' lleva fecha en lugar de día. */
export const FRECUENCIAS_INGRESO = Object.freeze({
  unica: 'Una sola vez',
  mensual: 'Cada mes',
  quincenal: 'Cada quincena',
});

/** Cómo se pagó la tarjeta en un mes. */
export const TIPOS_PAGO_TARJETA = Object.freeze({
  contado: 'Pago de contado',
  minimo: 'Pago mínimo',
  otro: 'Otro monto',
});

export const TIPOS_SALARIO = Object.freeze({
  asalariado: 'En planilla (ISSS, AFP y renta)',
  servicios: 'Servicios profesionales (retención 10 %)',
  sin: 'Sin descuentos (negocio propio u otro)',
});
