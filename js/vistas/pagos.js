/**
 * Pestaña Pagos: el mes completo. Pagos con fecha (cuotas, tarjetas, gastos
 * fijos), ingresos extra, gastos del día a día y la lista de gastos fijos.
 * Marcar pagos está en js/formularios/pago.js.
 */
import { escaparHtml as esc, dinero, porcentaje, redondear, aNumero } from '../utils/formato.js';
import { fechaCorta, leerFecha, mesDe, nombreDelMes, sumarMeses } from '../utils/fechas.js';
import { resumenDelMes, gastosDelMes } from '../domain/presupuesto.js';
import { TIPOS_INGRESO } from '../constants/catalogos.js';
import { estadoDelLector, MINUTOS_ENTRE_REVISIONES, MINUTOS_SIN_NOTICIAS } from '../domain/lector.js';
import { boton, bloqueVacio, chip, filaPago, textoMedio } from '../ui/componentes.js';
import { ICONOS } from '../ui/iconos.js';
import { avisar } from '../ui/aviso.js';
import { confirmarEnBoton } from '../ui/confirmar.js';
import { cambiar, leer } from '../state/store.js';
import { borrarGasto, observarMes, pedirRevisionDeCorreos } from '../data/repositorio.js';

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
        <button type="button" class="lista__enlace" data-accion="editar-gasto" data-mes="${mes}" data-id="${esc(g.id)}"><div class="lista__titulo">${esc(titulo)}${g.posibleRepetido ? ` ${chip('¿Repetido?', 'aviso')}` : ''}</div><div class="lista__detalle">${fecha ? fechaCorta(fecha) : ''} · ${esc(g.categoria)} · ${esc(textoMedio(g.medio, datos.tarjetas))}${esc(quien)}</div></button>
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

function textoDeCuenta(c) {
  const ultima = c.minutos === null ? 'todavía no ha revisado' : c.minutos < 1 ? 'revisó hace un momento' : `revisó hace ${c.minutos} min`;
  if (c.estado === 'revisando') return 'Revisando los correos del mes…';
  if (c.estado === 'esperando') {
    return c.apagado
      ? `No ha revisado en más de ${MINUTOS_SIN_NOTICIAS} minutos: su lector puede estar apagado.`
      : `Pedido enviado. Lo revisa en los próximos ${MINUTOS_ENTRE_REVISIONES} minutos.`;
  }
  if (c.estado === 'error') return `No se pudo revisar: ${c.resultado.mensaje || 'error desconocido'}`;
  if (c.estado === 'listo') {
    const r = c.resultado;
    const partes = [`${r.nuevos} ${r.nuevos === 1 ? 'nuevo' : 'nuevos'}`, `${r.yaEstaban} ya estaban`];
    if (r.sinTarjeta) partes.push(`${r.sinTarjeta} con tarjeta no registrada`);
    return `Listo: ${partes.join(' · ')}.`;
  }
  return c.apagado ? `Su lector puede estar apagado (${ultima}).` : `Anota solo las compras nuevas · ${ultima}.`;
}

const CHIP_DE_ESTADO = {
  revisando: ['Revisando', 'aviso'],
  esperando: ['En cola', ''],
  listo: ['Listo', 'bien'],
  error: ['Error', 'mal'],
};

function seccionLector(estado, mes, hoy) {
  const lector = estadoDelLector(estado.lector, mes, Date.now());
  const nombre = nombreDelMes(mes).split(' ')[0];
  if (!lector.instalado) {
    return `<section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Avisos del banco</h2></div>
      <p class="nota">Todavía no hay un lector de correos instalado. Con él, las compras con tarjeta que el banco avisa por correo se anotan solas. Los pasos están en <b>docs/AVISOS-DEL-BANCO.md</b>.</p>
    </section>`;
  }
  const esFuturo = mes > mesDe(hoy);
  const repetidos = lector.cuentas.flatMap((c) => c.resultado?.posiblesRepetidos || []);
  const cuentas = lector.cuentas
    .map((c) => {
      const [texto, tono] = CHIP_DE_ESTADO[c.estado] || (c.apagado ? ['Apagado', 'mal'] : ['Activo', 'bien']);
      return `<li class="lista__fila"><div class="lista__principal"><div class="lista__titulo">${esc(c.nombre)}</div><div class="lista__detalle">${esc(textoDeCuenta(c))}</div></div>${chip(texto, tono)}</li>`;
    })
    .join('');
  const boton = esFuturo
    ? ''
    : `<button type="button" class="boton boton--principal" data-accion="revisar-correos" data-mes="${mes}"${lector.ocupado ? ' disabled' : ''}>${lector.ocupado ? 'Revisando los correos…' : `Buscar gastos de ${nombre} en los correos`}</button>`;
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Avisos del banco</h2></div>
    <p class="nota">Las compras con tarjeta que el banco avisa por correo se anotan solas. Si falta alguna de ${nombre}, pidan que se revisen todos los correos del mes: no se repiten las que ya están.</p>
    ${boton}
    <ul class="lista">${cuentas}</ul>
    ${repetidos.length ? `<p class="nota nota--aviso"><b>Revisen ${repetidos.length === 1 ? 'esta compra' : 'estas compras'}:</b> ${repetidos.length === 1 ? 'parece' : 'parecen'} anotada${repetidos.length === 1 ? '' : 's'} a mano también (${esc(repetidos.join('; '))}). Están marcadas con "¿Repetido?" en los gastos; si sobra, tóquenla y elimínenla.</p>` : ''}
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
    ${seccionLector(estado, mesVista, hoy)}
    ${seccionFijos(datos)}`;
}

function cambiarMes(nuevoMes) {
  observarMes(nuevoMes);
  cambiar((e) => {
    e.mesVista = nuevoMes;
  });
}

export const acciones = {
  'revisar-correos': (boton) => {
    pedirRevisionDeCorreos(boton.dataset.mes);
    avisar('Pedido enviado. En unos minutos aparecen los gastos que falten.', 4000);
  },
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
