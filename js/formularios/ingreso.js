/** Formulario de otros ingresos (remesas, ventas, alquileres…). */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { TIPOS_INGRESO } from '../constants/catalogos.js';
import { esDiaDelMes } from '../utils/fechas.js';

const CAMPOS = [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, ejemplo: 'Remesa de mi hermano' },
  { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'lista', opciones: TIPOS_INGRESO, porDefecto: 'remesa' },
  { nombre: 'monto', etiqueta: 'Monto', tipo: 'dinero', requerido: true, medio: true },
  {
    nombre: 'frecuencia',
    etiqueta: 'Cada cuánto',
    tipo: 'lista',
    opciones: [['mensual', 'Mensual'], ['quincenal', 'Quincenal']],
    porDefecto: 'mensual',
    medio: true,
  },
  { nombre: 'dia', etiqueta: 'Día en que llega', tipo: 'dia', requerido: true, ejemplo: '5' },
];

function validar(v) {
  if (!(v.monto > 0)) return 'El monto tiene que ser mayor a $0.';
  if (!esDiaDelMes(v.dia)) return 'El día tiene que estar entre 1 y 31.';
  return undefined;
}

export function abrirFormularioIngreso(id) {
  const ingreso = id ? leer().datos.ingresos.find((i) => i.id === id) : null;
  abrirFormulario({
    titulo: ingreso ? 'Editar ingreso' : 'Otro ingreso',
    intro: ingreso ? '' : 'Remesas, ventas, alquileres o cualquier entrada que se repite.',
    campos: CAMPOS,
    valores: ingreso || {},
    validar,
    alGuardar: (valores) => guardarRegistro('ingresos', valores, ingreso?.id),
    alEliminar: ingreso ? () => eliminarRegistro('ingresos', ingreso.id) : null,
  });
}

export const acciones = {
  'nuevo-ingreso': () => abrirFormularioIngreso(),
  'editar-ingreso': (boton) => abrirFormularioIngreso(boton.dataset.id),
};
