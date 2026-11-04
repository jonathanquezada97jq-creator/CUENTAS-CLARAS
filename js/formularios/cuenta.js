/**
 * Formulario para agregar o editar una cuenta de banco (ahorro o corriente)
 * con su tarjeta de débito. Los últimos 4 dígitos sirven para que el lector
 * de avisos del banco reconozca la cuenta en las transferencias y en las
 * compras con débito.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { BANCOS, COLORES_TARJETA } from '../constants/catalogos.js';

function campos(personas) {
  return [
    { nombre: 'banco', etiqueta: 'Banco', sugerencias: BANCOS, requerido: true, ejemplo: 'Banco Cuscatlán' },
    {
      nombre: 'tipo',
      etiqueta: 'Tipo',
      tipo: 'lista',
      opciones: [['ahorro', 'Ahorro'], ['corriente', 'Corriente']],
      porDefecto: 'ahorro',
      medio: true,
    },
    { nombre: 'nombre', etiqueta: 'Apodo (opcional)', ejemplo: 'Nómina, Casa…', medio: true },
    {
      nombre: 'ultimos',
      etiqueta: 'Últimos 4 de la cuenta',
      ejemplo: '1421',
      maximo: 4,
      medio: true,
    },
    {
      nombre: 'debito',
      etiqueta: 'Últimos 4 del débito',
      ejemplo: '7788',
      maximo: 4,
      medio: true,
      ayuda: 'De la tarjeta de débito.',
    },
    {
      nombre: 'saldo',
      etiqueta: 'Saldo de hoy',
      tipo: 'dinero',
      ayuda: 'Lo que dice la banca en línea. Después sube y baja solo con lo que anoten.',
    },
    {
      nombre: 'personaId',
      etiqueta: '¿De quién es?',
      tipo: 'lista',
      opciones: [['', 'De los dos'], ...personas.map((p) => [p.id, p.nombre])],
      porDefecto: '',
    },
    { nombre: 'color', etiqueta: 'Color', tipo: 'colores', opciones: COLORES_TARJETA, porDefecto: 'bosque' },
  ];
}

function validar(v) {
  if (v.ultimos && !/^\d{4}$/.test(v.ultimos)) return 'Los últimos dígitos de la cuenta son 4 números.';
  if (v.debito && !/^\d{4}$/.test(v.debito)) return 'Los últimos dígitos del débito son 4 números.';
  if (v.ultimos && v.ultimos === v.debito) return 'La cuenta y el débito no suelen terminar igual: revisen los dígitos.';
  return undefined;
}

/** @param {string} [id]  Sin id, crea una cuenta nueva. */
export function abrirFormularioCuenta(id) {
  const { cuentas, personas } = leer().datos;
  const cuenta = id ? cuentas.find((c) => c.id === id) : null;
  abrirFormulario({
    titulo: cuenta ? 'Editar cuenta' : 'Nueva cuenta de banco',
    intro: cuenta
      ? 'Si el saldo no coincide con el banco, corríjanlo aquí.'
      : 'Con los últimos 4 dígitos, los avisos del banco por correo se anotan solos en esta cuenta.',
    campos: campos(personas),
    valores: cuenta || {},
    validar,
    alGuardar: (valores) => guardarRegistro('cuentas', { ...valores, saldo: valores.saldo || 0 }, cuenta?.id),
    alEliminar: cuenta ? () => eliminarRegistro('cuentas', cuenta.id) : null,
  });
}

export const acciones = {
  'nueva-cuenta': () => abrirFormularioCuenta(),
  'editar-cuenta': (boton) => abrirFormularioCuenta(boton.dataset.id),
};
