/**
 * Formulario de gastos fijos mensuales (alquiler, luz, universidad, internet…).
 * Pueden pagarse en efectivo, desde una cuenta o con tarjeta de crédito (cobro
 * automático). Si el banco avisa el cobro por correo, el lector de avisos
 * marca el fijo como pagado (ver apps-script/Codigo.gs, buscarFijoDelCobro).
 */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { guardarRegistro, eliminarRegistro } from '../data/repositorio.js';
import { CATEGORIAS_FIJO, GASTOS_FIJOS_SUGERIDOS } from '../constants/catalogos.js';
import { MEDIO_EFECTIVO } from '../domain/plazos.js';
import { opcionesDeMedio } from '../ui/componentes.js';
import { esDiaDelMes } from '../utils/fechas.js';

function campos(datos) {
  const lista = [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, sugerencias: GASTOS_FIJOS_SUGERIDOS, ejemplo: 'Luz' },
    { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'lista', opciones: CATEGORIAS_FIJO, porDefecto: CATEGORIAS_FIJO[1] },
    { nombre: 'monto', etiqueta: 'Monto aproximado', tipo: 'dinero', requerido: true, medio: true },
    { nombre: 'dia', etiqueta: 'Día de pago', tipo: 'dia', requerido: true, medio: true, ejemplo: '20' },
  ];
  if (datos.cuentas.length || datos.tarjetas.length) {
    const medios = opcionesDeMedio(datos, { efectivo: 'En efectivo o en ventanilla', prefijoCuenta: 'Desde la cuenta ' }).map(
      ([valor, texto]) => [valor, valor.startsWith('tarjeta:') ? `Cargo automático · ${texto}` : texto],
    );
    lista.push(
      {
        nombre: 'medio',
        etiqueta: '¿Cómo lo pagan?',
        tipo: 'lista',
        opciones: medios,
        porDefecto: MEDIO_EFECTIVO,
        ayuda: 'Al marcarlo pagado se resta de la cuenta o se suma a la tarjeta.',
      },
      {
        nombre: 'comercio',
        etiqueta: 'Cómo aparece en el correo del banco (opcional)',
        ejemplo: 'UDB, TIGO, NETFLIX',
        ayuda: 'Cuando llegue el aviso del cobro, se marca pagado solo. Si lo dejan vacío, se reconoce por el nombre o por el monto exacto cerca del día de pago.',
        mostrarSi: ['medio', medios.map(([valor]) => valor).filter((valor) => valor !== MEDIO_EFECTIVO)],
      },
    );
  }
  return lista;
}

function validar(v) {
  if (!(v.monto > 0)) return 'El monto tiene que ser mayor a $0.';
  if (!esDiaDelMes(v.dia)) return 'El día tiene que estar entre 1 y 31.';
  return undefined;
}

export function abrirFormularioFijo(id) {
  const { datos } = leer();
  const fijo = id ? datos.fijos.find((f) => f.id === id) : null;
  abrirFormulario({
    titulo: fijo ? 'Editar gasto fijo' : 'Nuevo gasto fijo',
    intro: fijo
      ? ''
      : 'Lo que se paga todos los meses. Si se cobra solo a una tarjeta o a una cuenta (universidad, internet, streaming), elijan cuál: al llegar el aviso del banco se marca pagado, sin anotarlo dos veces.',
    campos: campos(datos),
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
