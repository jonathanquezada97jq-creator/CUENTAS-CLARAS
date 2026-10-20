/** Formulario de gastos fijos mensuales (alquiler, luz, agua, internet…). */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { CATEGORIAS_FIJO, GASTOS_FIJOS_SUGERIDOS } from '../constants/catalogos.js';
import { esDiaDelMes } from '../utils/fechas.js';

const CAMPOS = [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, sugerencias: GASTOS_FIJOS_SUGERIDOS, ejemplo: 'Luz' },
  { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'lista', opciones: CATEGORIAS_FIJO, porDefecto: CATEGORIAS_FIJO[1] },
  { nombre: 'monto', etiqueta: 'Monto aproximado', tipo: 'dinero', requerido: true, medio: true },
  { nombre: 'dia', etiqueta: 'Día de pago', tipo: 'dia', requerido: true, medio: true, ejemplo: '20' },
];

function validar(v) {
  if (!(v.monto > 0)) return 'El monto tiene que ser mayor a $0.';
  if (!esDiaDelMes(v.dia)) return 'El día tiene que estar entre 1 y 31.';
  return undefined;
}

export function abrirFormularioFijo(id) {
  const fijo = id ? leer().datos.fijos.find((f) => f.id === id) : null;
  abrirFormulario({
    titulo: fijo ? 'Editar gasto fijo' : 'Nuevo gasto fijo',
    intro: fijo
      ? ''
      : 'Lo que se paga todos los meses. Si lo cargan a una tarjeta, no lo agreguen aquí: ya va en el saldo.',
    campos: CAMPOS,
    valores: fijo || {},
    validar,
    alGuardar: (valores) => guardarRegistro('fijos', valores, fijo?.id),
    alEliminar: fijo ? () => eliminarRegistro('fijos', fijo.id) : null,
  });
}

export const acciones = {
  'nuevo-fijo': () => abrirFormularioFijo(),
  'editar-fijo': (boton) => abrirFormularioFijo(boton.dataset.id),
};
