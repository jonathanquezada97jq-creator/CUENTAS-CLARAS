/**
 * Formulario para anotar o corregir un gasto del día a día. Los gastos que
 * llegan solos del correo del banco (apps-script/) también se corrigen aquí:
 * por ejemplo, para cambiarles la categoría o la tarjeta.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { agregarGasto, borrarGasto, editarGasto } from '../data/repositorio.js';
import { CATEGORIAS_GASTO } from '../constants/catalogos.js';
import { gastosDelMes } from '../domain/presupuesto.js';
import { referenciaTarjeta } from '../domain/tarjetas.js';
import { nombreTarjeta } from '../ui/componentes.js';
import { avisar } from '../ui/aviso.js';
import { dinero, redondear } from '../utils/formato.js';
import { fechaIso, leerFecha, mesDe } from '../utils/fechas.js';

function campos(tarjetas, fechaSugerida) {
  return [
    { nombre: 'monto', etiqueta: 'Monto', tipo: 'dinero', requerido: true, medio: true },
    { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, medio: true, porDefecto: fechaSugerida },
    { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'lista', opciones: CATEGORIAS_GASTO, porDefecto: CATEGORIAS_GASTO[0] },
    {
      nombre: 'medio',
      etiqueta: 'Pagado con',
      tipo: 'lista',
      opciones: [['efectivo', 'Efectivo o débito'], ...tarjetas.map((t) => [referenciaTarjeta(t.id), nombreTarjeta(t)])],
      porDefecto: 'efectivo',
      ayuda: 'Lo que va a tarjeta se suma a su saldo.',
    },
    { nombre: 'nota', etiqueta: 'Nota', ejemplo: 'Súper, gasolina, pupusas…' },
  ];
}

function validar(v) {
  if (!(v.monto > 0)) return 'Escribí cuánto gastaron.';
  if (!leerFecha(v.fecha)) return 'Elegí una fecha.';
  return undefined;
}

/**
 * @param {string} [mes]  Mes que se está viendo; la fecha sugerida cae en ese mes.
 * @param {string} [idGasto]  Para corregir un gasto que ya existe.
 */
export function abrirFormularioGasto(mes, idGasto) {
  const { datos } = leer();
  const gasto = idGasto ? gastosDelMes(datos, mes).find((g) => g.id === idGasto) : null;
  const hoy = new Date();
  const fechaSugerida = !mes || mes === mesDe(hoy) ? fechaIso(hoy) : `${mes}-01`;
  const delCorreo = gasto?.origen === 'correo';
  const parecido = gasto?.posibleRepetido
    ? gastosDelMes(datos, mes).find((g) => g.id === gasto.posibleRepetido)
    : null;
  let intro = delCorreo ? 'Este gasto llegó solo del correo del banco. Revisen la categoría y la tarjeta.' : '';
  if (parecido) {
    intro = `Parece la misma compra que "${parecido.nota || parecido.categoria}" (${dinero(parecido.monto)}), anotada a mano. Si es la misma, eliminen una de las dos; si no, guarden y se quita la marca.`;
  }

  abrirFormulario({
    titulo: gasto ? 'Editar gasto' : 'Agregar gasto',
    intro,
    campos: campos(datos.tarjetas, fechaSugerida),
    valores: gasto || {},
    textoGuardar: gasto ? 'Guardar' : 'Agregar',
    validar,
    alGuardar: (v) => {
      const cambios = { ...v, monto: redondear(v.monto) };
      if (gasto) {
        editarGasto(gasto, cambios);
        avisar('Gasto actualizado.');
      } else {
        agregarGasto(cambios);
        avisar(`Gasto de ${dinero(v.monto)} agregado.`);
      }
    },
    alEliminar: gasto
      ? () => {
          borrarGasto(gasto);
          avisar('Gasto borrado.');
        }
      : null,
  });
}

export const acciones = {
  'nuevo-gasto': (boton) => abrirFormularioGasto(boton.dataset.mes),
  'editar-gasto': (boton) => abrirFormularioGasto(boton.dataset.mes, boton.dataset.id),
};
