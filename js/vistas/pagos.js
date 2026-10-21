/**
 * Pestaña Pagos: el mes completo. Pagos con fecha (cuotas, tarjetas, gastos
 * fijos), ingresos extra, gastos del día a día y la lista de gastos fijos.
 * Marcar pagos está en js/formularios/pago.js.
 */
import { escaparHtml as esc, dinero, porcentaje, redondear, aNumero } from '../utils/formato.js';
import { fechaCorta, leerFecha, mesDe, nombreDelMes, sumarMeses } from '../utils/fechas.js';
import { resumenDelMes, gastosDelMes } from '../domain/presupuesto.js';
import { TIPOS_INGRESO } from '../constants/catalogos.js';
import { boton, bloqueVacio, filaPago, textoMedio } from '../ui/componentes.js';
import { ICONOS } from '../ui/iconos.js';
import { avisar } from '../ui/aviso.js';
import { confirmarEnBoton } from '../ui/confirmar.js';
import { cambiar, leer } from '../state/store.js';
import { borrarGasto, observarMes } from '../data/repositorio.js';

function navegacion(mes, hoy) {
  const esActual = mes === mesDe(hoy);
  return `<div class="navegador-mes">
      <button type="button" class="boton-icono" data-accion="mes-anterior" aria-label="Mes anterior">${ICONOS.izquierda}</button>
      <h1>${nombreDelMes(mes)}</h1>
      <button type="button" class="boton-icono" data-accion="mes-siguiente" aria-label="Mes siguiente">${ICONOS.derecha}</button>
    </div>
    ${esActual ? '' : `<div style="text-align:center">${boton(`Volver a ${nombreDelMes(mesDe(hoy))}`, 'mes-actual', { variante: 'fantasma chico' })}</div>`}`;
}

function seccionPagos(r, hoy, datos) {
  const avance = r.compromisos > 0 ? r.pagado / r.compromisos : 0;
  return `<section class="seccion">
    <div class="indicadores"><span>Pagos <b>${dinero(r.compromisos)}</b></span><span>Pagado <b>${dinero(r.pagado)}</b></span><span>Falta <b>${dinero(r.pendiente)}</b></span></div>
    <div class="progreso" role="img" aria-label="Pagado ${porcentaje(avance)}"><span style="width:${(avance * 100).toFixed(1)}%"></span></div>
  </section>
  <section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Pagos del mes</h2></div>
    ${
      r.pagos.length
        ? `<ul class="pagos">${r.pagos.map((p) => filaPago(p, hoy, datos)).join('')}</ul>
           <p class="nota">Toquen el círculo al pagar. En las cuotas eligen el monto y si fue en efectivo o con tarjeta; en las tarjetas, si pagaron el contado, el mínimo u otro monto. Tocarlo otra vez lo desmarca.</p>`
        : bloqueVacio('Todavía no hay pagos para este mes. Agreguen gastos fijos, tarjetas o cuotas.', boton('Agregar gasto fijo', 'nuevo-fijo'))
    }
  </section>`;
}

function seccionIngresosExtra(r, mes) {
  const lista = [...r.ingresosUnicos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const total = redondear(lista.reduce((t, i) => t + aNumero(i.monto), 0));
  const agregar = boton('Agregar', 'nuevo-ingreso-unico', { variante: 'chico', icono: 'mas', datos: { mes } });
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Ingresos extra${lista.length ? ` · ${dinero(total)}` : ''}</h2>${agregar}</div>
    ${
      lista.length
        ? `<ul class="lista">${lista
            .map((i) => {
              const fecha = leerFecha(i.fecha);
              return `<li class="lista__fila"><button type="button" class="lista__enlace" data-accion="editar-ingreso" data-id="${esc(i.id)}"><div class="lista__titulo">${esc(i.nombre)}</div><div class="lista__detalle">${fecha ? fechaCorta(fecha) : ''} · ${esc(TIPOS_INGRESO[i.tipo] || 'Ingreso')}</div></button><span class="monto">+${dinero(i.monto)}</span></li>`;
            })
            .join('')}</ul>`
        : '<p class="nota">Ventas, servicios o cualquier entrada de una sola vez. Se suman a lo que entra este mes.</p>'
    }
  </section>`;
}

function seccionGastos(datos, mes) {
  const gastos = [...gastosDelMes(datos, mes)].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const total = redondear(gastos.reduce((t, g) => t + aNumero(g.monto), 0));

  const porCategoria = {};
  gastos.forEach((g) => {
    porCategoria[g.categoria] = redondear((porCategoria[g.categoria] || 0) + aNumero(g.monto));
  });
  const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const mayor = categorias[0]?.[1] || 1;

  const filas = gastos
    .map((g) => {
      const fecha = leerFecha(g.fecha);
      const quien = g.autor?.nombre ? ` · ${g.autor.nombre.split(' ')[0]}` : '';
      const titulo = g.nota || g.categoria;
      return `<li class="lista__fila">
        <div class="lista__principal"><div class="lista__titulo">${esc(titulo)}</div><div class="lista__detalle">${fecha ? fechaCorta(fecha) : ''} · ${esc(g.categoria)} · ${esc(textoMedio(g.medio, datos.tarjetas))}${esc(quien)}</div></div>
        <span class="monto">${dinero(g.monto)}</span>
        <button type="button" class="lista__borrar" data-accion="borrar-gasto" data-mes="${mes}" data-id="${esc(g.id)}" aria-label="Borrar gasto ${esc(titulo)}">${ICONOS.cerrar}</button>
      </li>`;
    })
    .join('');

  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Gastos del día a día · ${dinero(total)}</h2>${boton('Agregar', 'nuevo-gasto', { variante: 'principal chico', icono: 'mas', datos: { mes } })}</div>
    ${
      categorias.length
        ? `<div class="panel categorias">${categorias
            .map(
              ([nombre, valor]) => `<div class="categoria"><span>${esc(nombre)}</span><b class="monto">${dinero(valor)}</b><div class="categoria__barra"><span style="width:${((valor / mayor) * 100).toFixed(1)}%"></span></div></div>`,
            )
            .join('')}</div>`
        : ''
    }
    ${gastos.length ? `<ul class="lista">${filas}</ul>` : '<p class="nota">Anoten lo que gastan en efectivo o con tarjeta. Lo que va a tarjeta se suma a su saldo.</p>'}
  </section>`;
}

function seccionFijos(datos) {
  const fijos = [...datos.fijos].sort((a, b) => aNumero(a.dia) - aNumero(b.dia));
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Gastos fijos</h2>${boton('Agregar', 'nuevo-fijo', { variante: 'chico', icono: 'mas' })}</div>
    ${
      fijos.length
        ? `<ul class="lista">${fijos
            .map(
              (f) => `<li class="lista__fila"><button type="button" class="lista__enlace" data-accion="editar-fijo" data-id="${esc(f.id)}"><div class="lista__titulo">${esc(f.nombre)}</div><div class="lista__detalle">Día ${esc(f.dia)} · ${esc(f.categoria)}</div></button><span class="monto">${dinero(f.monto)}</span></li>`,
            )
            .join('')}</ul>`
        : '<p class="nota">Alquiler, luz, agua, internet, colegiatura: todo lo que se repite cada mes.</p>'
    }
  </section>`;
}

export function vistaPagos(estado, hoy) {
  const { datos, mesVista } = estado;
  const r = resumenDelMes(datos, mesVista, hoy);
  return `<section class="seccion">${navegacion(mesVista, hoy)}</section>
    ${seccionPagos(r, hoy, datos)}
    ${seccionIngresosExtra(r, mesVista)}
    ${seccionGastos(datos, mesVista)}
    ${seccionFijos(datos)}`;
}

function cambiarMes(nuevoMes) {
  observarMes(nuevoMes);
  cambiar((e) => {
    e.mesVista = nuevoMes;
  });
}

export const acciones = {
  'mes-anterior': () => cambiarMes(sumarMeses(leer().mesVista, -1)),
  'mes-siguiente': () => cambiarMes(sumarMeses(leer().mesVista, 1)),
  'mes-actual': () => cambiarMes(mesDe(new Date())),
  'borrar-gasto': (elemento) => {
    const { mes, id } = elemento.dataset;
    const gasto = gastosDelMes(leer().datos, mes).find((g) => g.id === id);
    if (!gasto) return;
    confirmarEnBoton(
      elemento,
      () => {
        borrarGasto(gasto);
        avisar('Gasto borrado.');
      },
      { pregunta: '¿Borrar?', esperaMs: 3000 },
    );
  },
};
