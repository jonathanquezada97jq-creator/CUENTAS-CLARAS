/** Formulario para agregar o editar una tarjeta de crédito. */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { BANCOS, COLORES_TARJETA } from '../constants/catalogos.js';
import { esDiaDelMes } from '../utils/fechas.js';

function campos(personas) {
  return [
    { nombre: 'banco', etiqueta: 'Banco o emisor', sugerencias: BANCOS, requerido: true, ejemplo: 'Banco Agrícola' },
    { nombre: 'nombre', etiqueta: 'Nombre de la tarjeta', ejemplo: 'Visa Clásica', medio: true },
    { nombre: 'ultimos', etiqueta: 'Últimos 4 dígitos', ejemplo: '4821', maximo: 4, medio: true },
    {
      nombre: 'titular',
      etiqueta: 'Titular (opcional)',
      sugerencias: personas.map((p) => p.nombre),
      ejemplo: personas[0]?.nombre ?? '',
    },
    { nombre: 'limite', etiqueta: 'Límite de crédito', tipo: 'dinero', requerido: true, medio: true },
    {
      nombre: 'saldo',
      etiqueta: 'Saldo que se debe hoy',
      tipo: 'dinero',
      medio: true,
      ayuda: 'Sin contar las compras a cuotas que aún no cobran.',
    },
    { nombre: 'corte', etiqueta: 'Día de corte', tipo: 'dia', requerido: true, medio: true, ejemplo: '20' },
    { nombre: 'pago', etiqueta: 'Día límite de pago', tipo: 'dia', requerido: true, medio: true, ejemplo: '5' },
    {
      nombre: 'pagoMinimo',
      etiqueta: 'Pago mínimo',
      tipo: 'dinero',
      medio: true,
      ayuda: 'Del estado de cuenta. Al pagar se elige contado, mínimo u otro monto.',
    },
    { nombre: 'tasa', etiqueta: 'Tasa anual (%)', tipo: 'porcentaje', medio: true, ejemplo: '34.9' },
    { nombre: 'color', etiqueta: 'Color', tipo: 'colores', opciones: COLORES_TARJETA, porDefecto: 'cobalto' },
  ];
}

function validar(v) {
  if (!(v.limite > 0)) return 'El límite tiene que ser mayor a $0.';
  if (!esDiaDelMes(v.corte) || !esDiaDelMes(v.pago)) return 'Los días tienen que estar entre 1 y 31.';
  if (v.ultimos && !/^\d{1,4}$/.test(v.ultimos)) return 'Los últimos dígitos solo llevan números.';
  return undefined;
}

/** @param {string} [id]  Sin id, crea una tarjeta nueva. */
export function abrirFormularioTarjeta(id) {
  const { tarjetas, personas } = leer().datos;
  const tarjeta = id ? tarjetas.find((t) => t.id === id) : null;
  abrirFormulario({
    titulo: tarjeta ? 'Editar tarjeta' : 'Nueva tarjeta de crédito',
    intro: tarjeta ? '' : 'Copiá los datos del último estado de cuenta.',
    campos: campos(personas),
    valores: tarjeta || {},
    validar,
    alGuardar: (valores) =>
      guardarRegistro('tarjetas', { ...valores, saldo: valores.saldo || 0 }, tarjeta?.id),
    alEliminar: tarjeta ? () => eliminarRegistro('tarjetas', tarjeta.id) : null,
  });
}

export const acciones = {
  'nueva-tarjeta': () => abrirFormularioTarjeta(),
  'editar-tarjeta': (boton) => abrirFormularioTarjeta(boton.dataset.id),
};
