/** Formulario para compras a plazo, préstamos y descuentos por planilla. */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { ACREEDORES, TIPOS_PLAZO } from '../constants/catalogos.js';
import { METODO } from '../domain/plazos.js';
import { referenciaTarjeta } from '../domain/tarjetas.js';
import { nombreTarjeta } from '../ui/componentes.js';
import { esDiaDelMes } from '../utils/fechas.js';
import { aNumero, dinero } from '../utils/formato.js';

function campos({ tarjetas, personas }) {
  const metodos = [
    [METODO.DIRECTO, 'En efectivo, débito o transferencia'],
    [METODO.PLANILLA, 'Descuento por planilla'],
    ...tarjetas.map((t) => [referenciaTarjeta(t.id), `Con la ${nombreTarjeta(t).toLowerCase()}`]),
  ];
  return [
    { nombre: 'descripcion', etiqueta: '¿Qué es?', requerido: true, ejemplo: 'Refrigeradora, celular, préstamo…' },
    { nombre: 'acreedor', etiqueta: '¿Con quién?', sugerencias: ACREEDORES, ejemplo: 'La Curacao' },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'lista', opciones: TIPOS_PLAZO, porDefecto: 'tienda' },
    {
      nombre: 'metodo',
      etiqueta: '¿Cómo la pagan normalmente?',
      tipo: 'lista',
      opciones: metodos,
      porDefecto: METODO.DIRECTO,
      ayuda: 'Es solo la opción sugerida: al marcar cada cuota pueden elegir efectivo o tarjeta y abonar más.',
    },
    {
      nombre: 'personaId',
      etiqueta: '¿De la planilla de quién?',
      tipo: 'lista',
      opciones: personas.map((p) => [p.id, p.nombre]),
      porDefecto: personas[0]?.id ?? '',
      mostrarSi: ['metodo', METODO.PLANILLA],
    },
    { nombre: 'cuota', etiqueta: 'Cuota mensual', tipo: 'dinero', requerido: true, medio: true },
    { nombre: 'dia', etiqueta: 'Día de pago', tipo: 'dia', requerido: true, medio: true, ejemplo: '15' },
    { nombre: 'total', etiqueta: 'Total de cuotas', tipo: 'entero', requerido: true, medio: true, ejemplo: '24' },
    {
      nombre: 'pagadas',
      etiqueta: 'Cuotas pagadas antes',
      tipo: 'entero',
      medio: true,
      porDefecto: 0,
      ayuda: 'Las que ya llevaban pagadas al anotarla aquí.',
    },
    {
      nombre: 'tasa',
      etiqueta: 'Tasa anual % (opcional)',
      tipo: 'porcentaje',
      ejemplo: '0',
      ayuda: 'Dejalo en blanco o en 0 si es tasa cero.',
    },
  ];
}

function validar(v) {
  if (!(v.cuota > 0)) return 'La cuota tiene que ser mayor a $0.';
  if (!(v.total >= 1)) return 'El total de cuotas tiene que ser al menos 1.';
  if ((v.pagadas || 0) > v.total) return 'No pueden llevar más cuotas pagadas que el total.';
  if (!esDiaDelMes(v.dia)) return 'El día tiene que estar entre 1 y 31.';
  return undefined;
}

export function abrirFormularioPlazo(id) {
  const { datos } = leer();
  const plazo = id ? datos.plazos.find((p) => p.id === id) : null;
  const abonado = aNumero(plazo?.abonado);
  abrirFormulario({
    titulo: plazo ? 'Editar cuota' : 'Nueva compra a plazo o préstamo',
    intro: abonado > 0 ? `Pagado desde la app: ${dinero(abonado)}. Eso se suma a las cuotas pagadas antes.` : '',
    campos: campos(datos),
    valores: plazo || {},
    validar,
    alGuardar: (valores) =>
      guardarRegistro('plazos', { ...valores, pagadas: valores.pagadas || 0 }, plazo?.id),
    alEliminar: plazo ? () => eliminarRegistro('plazos', plazo.id) : null,
  });
}

export const acciones = {
  'nuevo-plazo': () => abrirFormularioPlazo(),
  'editar-plazo': (boton) => abrirFormularioPlazo(boton.dataset.id),
};
