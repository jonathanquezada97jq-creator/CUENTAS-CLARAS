/**
 * Formulario de otros ingresos: los que se repiten (remesa, alquiler) y los
 * de una sola vez (una venta, un servicio). Los de una sola vez llevan fecha
 * y solo cuentan en ese mes.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { avisar } from '../ui/aviso.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { FRECUENCIAS_INGRESO, TIPOS_INGRESO } from '../constants/catalogos.js';
import { dinero } from '../utils/formato.js';
import { esDiaDelMes, fechaIso, leerFecha, mesDe } from '../utils/fechas.js';

function campos(fechaSugerida) {
  return [
    { nombre: 'nombre', etiqueta: 'Descripción', requerido: true, ejemplo: 'Venta de ropa, servicio de diseño, remesa…' },
    { nombre: 'monto', etiqueta: 'Monto', tipo: 'dinero', requerido: true, medio: true },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'lista', opciones: TIPOS_INGRESO, porDefecto: 'venta', medio: true },
    { nombre: 'frecuencia', etiqueta: '¿Se repite?', tipo: 'opciones', opciones: FRECUENCIAS_INGRESO, porDefecto: 'unica' },
    {
      nombre: 'fecha',
      etiqueta: 'Fecha',
      tipo: 'fecha',
      requerido: true,
      porDefecto: fechaSugerida,
      mostrarSi: ['frecuencia', 'unica'],
    },
    {
      nombre: 'dia',
      etiqueta: 'Día en que llega',
      tipo: 'dia',
      requerido: true,
      ejemplo: '5',
      mostrarSi: ['frecuencia', ['mensual', 'quincenal']],
    },
  ];
}

function validar(v) {
  if (!(v.monto > 0)) return 'El monto tiene que ser mayor a $0.';
  if (v.frecuencia === 'unica' && !leerFecha(v.fecha)) return 'Elegí la fecha.';
  if (v.frecuencia !== 'unica' && !esDiaDelMes(v.dia)) return 'El día tiene que estar entre 1 y 31.';
  return undefined;
}

/**
 * @param {string} [id]  Para editar uno existente.
 * @param {{mes?: string, frecuencia?: string}} [opciones]
 *   mes: el que se está viendo (la fecha sugerida cae en ese mes);
 *   frecuencia: la opción que aparece elegida al crear uno nuevo.
 */
export function abrirFormularioIngreso(id, { mes, frecuencia = 'unica' } = {}) {
  const ingreso = id ? leer().datos.ingresos.find((i) => i.id === id) : null;
  const hoy = new Date();
  const fechaSugerida = !mes || mes === mesDe(hoy) ? fechaIso(hoy) : `${mes}-01`;
  const nuevo = { frecuencia, tipo: frecuencia === 'unica' ? 'venta' : 'remesa' };
  abrirFormulario({
    titulo: ingreso ? 'Editar ingreso' : 'Agregar ingreso',
    intro: ingreso ? '' : 'Una venta, un servicio, una remesa. Si se repite cada mes o cada quincena, marcalo abajo.',
    campos: campos(fechaSugerida),
    valores: ingreso || nuevo,
    validar,
    alGuardar: (valores) => {
      guardarRegistro('ingresos', valores, ingreso?.id);
      if (!ingreso) avisar(`Ingreso de ${dinero(valores.monto)} agregado.`);
    },
    alEliminar: ingreso ? () => eliminarRegistro('ingresos', ingreso.id) : null,
  });
}

export const acciones = {
  'nuevo-ingreso': () => abrirFormularioIngreso(undefined, { frecuencia: 'mensual' }),
  'nuevo-ingreso-unico': (boton) => abrirFormularioIngreso(undefined, { mes: boton.dataset.mes }),
  'editar-ingreso': (boton) => abrirFormularioIngreso(boton.dataset.id),
};
