/**
 * Formulario del salario de una persona del hogar. Mientras se escribe,
 * muestra la boleta con ISSS, AFP y renta.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { TIPOS_SALARIO } from '../constants/catalogos.js';
import { SALARIO_MINIMO_COMERCIO } from '../constants/ley-sv.js';
import { boletaSalario } from '../ui/componentes.js';
import { dinero } from '../utils/formato.js';
import { esDiaDelMes } from '../utils/fechas.js';

const CAMPOS = [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, ejemplo: 'Ana' },
  {
    nombre: 'salarioBruto',
    etiqueta: 'Salario bruto mensual',
    tipo: 'dinero',
    ayuda: `Antes de descuentos. Mínimo de comercio y servicios: ${dinero(SALARIO_MINIMO_COMERCIO)}.`,
  },
  { nombre: 'tipo', etiqueta: '¿Cómo le pagan?', tipo: 'lista', opciones: TIPOS_SALARIO, porDefecto: 'asalariado' },
  {
    nombre: 'frecuencia',
    etiqueta: 'Frecuencia de pago',
    tipo: 'lista',
    opciones: [['quincenal', 'Quincenal (dos pagos al mes)'], ['mensual', 'Mensual (un pago)']],
    porDefecto: 'quincenal',
  },
  {
    nombre: 'diaQuincena1',
    etiqueta: 'Día del primer pago',
    tipo: 'dia',
    medio: true,
    porDefecto: 15,
    mostrarSi: ['frecuencia', 'quincenal'],
  },
  {
    nombre: 'diaQuincena2',
    etiqueta: 'Día del segundo pago',
    tipo: 'dia',
    medio: true,
    porDefecto: 30,
    mostrarSi: ['frecuencia', 'quincenal'],
    ayuda: 'Si cae en 31 o fin de mes, poné 30.',
  },
  { nombre: 'diaPago', etiqueta: 'Día de pago', tipo: 'dia', porDefecto: 30, mostrarSi: ['frecuencia', 'mensual'] },
  {
    nombre: 'fechaIngreso',
    etiqueta: 'Fecha en que entró a su trabajo',
    tipo: 'fecha',
    mostrarSi: ['tipo', 'asalariado'],
    ayuda: 'Sirve para calcular el aguinaldo.',
  },
  {
    nombre: 'netoReal',
    etiqueta: 'Lo que le depositan por pago (opcional)',
    tipo: 'dinero',
    ayuda: 'Copialo de la boleta. Si lo llenás, se usa ese monto en vez del cálculo.',
  },
  {
    nombre: 'deduccion1600',
    etiqueta:
      'Aplicar la deducción fija de $1,600 al año (si gana hasta $9,100 al año). Algunas planillas la aplican; revisá la boleta.',
    tipo: 'casilla',
    mostrarSi: ['tipo', 'asalariado'],
  },
];

function validar(v) {
  if (!(v.salarioBruto > 0) && !(v.netoReal > 0)) {
    return 'Escribí el salario bruto o lo que le depositan.';
  }
  if (v.frecuencia === 'mensual' && v.diaPago !== '' && !esDiaDelMes(v.diaPago)) {
    return 'El día de pago tiene que estar entre 1 y 31.';
  }
  if (v.frecuencia === 'quincenal') {
    if (!esDiaDelMes(v.diaQuincena1) || !esDiaDelMes(v.diaQuincena2)) {
      return 'Los días de pago tienen que estar entre 1 y 31.';
    }
    if (v.diaQuincena1 === v.diaQuincena2) return 'Los dos días de pago tienen que ser distintos.';
  }
  return undefined;
}

export function abrirFormularioPersona(id) {
  const { datos } = leer();
  const persona = id ? datos.personas.find((p) => p.id === id) : null;
  abrirFormulario({
    titulo: persona ? `Salario de ${persona.nombre}` : 'Agregar a alguien del hogar',
    intro: persona ? '' : 'Cada persona con su salario. Calculamos ISSS, AFP y renta.',
    campos: CAMPOS,
    valores: persona || {},
    validar,
    vistaPrevia: (valores) => boletaSalario({ ...persona, ...valores, id: persona?.id }, datos),
    alGuardar: (valores) => guardarRegistro('personas', valores, persona?.id),
    alEliminar: persona ? () => eliminarRegistro('personas', persona.id) : null,
  });
}

export const acciones = {
  'nueva-persona': () => abrirFormularioPersona(),
  'editar-persona': (boton) => abrirFormularioPersona(boton.dataset.id),
};
