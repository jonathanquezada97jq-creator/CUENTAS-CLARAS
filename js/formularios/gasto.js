/** Formulario rápido para anotar un gasto del día a día. */
import { abrirFormulario } from '../ui/formulario.js';
import { leer } from '../state/store.js';
import { agregarGasto } from '../data/repositorio.js';
import { CATEGORIAS_GASTO } from '../constants/catalogos.js';
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

/** @param {string} [mes]  Mes que se está viendo; la fecha sugerida cae en ese mes. */
export function abrirFormularioGasto(mes) {
  const { datos } = leer();
  const hoy = new Date();
  const fechaSugerida = !mes || mes === mesDe(hoy) ? fechaIso(hoy) : `${mes}-01`;
  abrirFormulario({
    titulo: 'Agregar gasto',
    campos: campos(datos.tarjetas, fechaSugerida),
    textoGuardar: 'Agregar',
    validar: (v) => {
      if (!(v.monto > 0)) return 'Escribí cuánto gastaron.';
      if (!leerFecha(v.fecha)) return 'Elegí una fecha.';
      return undefined;
    },
    alGuardar: (v) => {
      agregarGasto({ ...v, monto: redondear(v.monto) });
      avisar(`Gasto de ${dinero(v.monto)} agregado.`);
    },
  });
}

export const acciones = {
  'nuevo-gasto': (boton) => abrirFormularioGasto(boton.dataset.mes),
};
