/** Pestaña Cuotas: compras a plazo y préstamos, cuánto falta y cuándo terminan. */
import { escaparHtml as esc, dinero, redondear, sumar, aNumero } from '../utils/formato.js';
import { mesDe, nombreDelMes } from '../utils/fechas.js';
import {
  cuotasPagadas,
  cuotasPendientes,
  estaActivo,
  mesDeLaUltimaCuota,
  saldoPendiente,
  METODO,
} from '../domain/plazos.js';
import { idDeTarjeta } from '../domain/tarjetas.js';
import { clavePago } from '../domain/presupuesto.js';
import { TIPOS_PLAZO } from '../constants/catalogos.js';
import { boton, bloqueVacio, chip } from '../ui/componentes.js';

/** Hasta este número de cuotas se dibuja un cuadrito por cuota; arriba, una barra. */
const MAXIMO_CUADRITOS = 48;

function comoSePaga(plazo, datos) {
  if (plazo.metodo === METODO.PLANILLA) {
    const persona = datos.personas.find((p) => p.id === plazo.personaId) || datos.personas[0];
    return persona ? `Planilla de ${persona.nombre}` : 'Por planilla';
  }
  const idTarjeta = idDeTarjeta(plazo.metodo);
  if (idTarjeta) {
    const tarjeta = datos.tarjetas.find((t) => t.id === idTarjeta);
    return tarjeta ? `En tarjeta ${tarjeta.banco}` : 'En tarjeta';
  }
  return 'Pago directo';
}

function avance(plazo) {
  const total = Math.max(1, Math.round(aNumero(plazo.total)));
  const pagadas = cuotasPagadas(plazo);
  if (total > MAXIMO_CUADRITOS) {
    return `<div class="progreso"><span style="width:${((pagadas / total) * 100).toFixed(1)}%"></span></div>`;
  }
  const cuadritos = Array.from({ length: total }, (_, i) => `<i${i < pagadas ? ' class="pagada"' : ''}></i>`);
  return `<div class="plazo__cuotas" aria-hidden="true">${cuadritos.join('')}</div>`;
}

function plazoHtml(plazo, datos, mesActual) {
  const pendientes = cuotasPendientes(plazo);
  const pagadas = cuotasPagadas(plazo);
  const pagadaEsteMes = Boolean(datos.pagados?.[mesActual]?.[clavePago('plazo', plazo.id)]);
  const ultima = mesDeLaUltimaCuota(plazo, mesActual, pagadaEsteMes);
  const tasa = aNumero(plazo.tasa);
  const chipTasa = tasa > 0 ? chip(`${tasa}% anual`) : plazo.tipo === 'tasa0' ? chip('0% interés', 'bien') : '';
  const dia = idDeTarjeta(plazo.metodo) ? '' : ` · día ${esc(plazo.dia)}`;

  return `<article class="plazo">
    <div class="plazo__arriba">
      <div>
        <div class="plazo__titulo">${esc(plazo.descripcion)}</div>
        <div class="plazo__detalle">${plazo.acreedor ? `${esc(plazo.acreedor)} · ` : ''}${pagadas} de ${esc(plazo.total)} pagadas</div>
      </div>
      ${boton('Editar', 'editar-plazo', { variante: 'chico', datos: { id: plazo.id } })}
    </div>
    <div class="chips">${chip(TIPOS_PLAZO[plazo.tipo] || 'Cuota', 'acento')}${chip(comoSePaga(plazo, datos))}${chipTasa}</div>
    <div role="img" aria-label="${pagadas} de ${esc(plazo.total)} cuotas pagadas">${avance(plazo)}</div>
    <div class="plazo__pie">
      <span>Cuota <b>${dinero(plazo.cuota)}</b>${dia}</span>
      ${
        pendientes
          ? `<span>Falta <b>${dinero(saldoPendiente(plazo))}</b></span><span>Terminan en <b>${nombreDelMes(ultima)}</b></span>`
          : '<span><b>Terminado</b></span>'
      }
    </div>
  </article>`;
}

export function vistaCuotas(estado, hoy) {
  const { datos } = estado;
  if (!datos.plazos.length) {
    return `<section class="seccion"><h1 class="titulo-pagina">Cuotas y préstamos</h1></section>
      ${bloqueVacio('Agreguen lo que sacaron a plazos: electrodomésticos en almacenes, compras tasa cero, préstamos del banco o la cooperativa, extrafinanciamientos.', boton('Agregar cuota', 'nuevo-plazo', { variante: 'principal' }))}`;
  }
  const mesActual = mesDe(hoy);
  const activos = datos.plazos.filter(estaActivo).sort((a, b) => cuotasPendientes(a) - cuotasPendientes(b));
  const terminados = datos.plazos.filter((p) => !estaActivo(p));
  const alMes = redondear(sumar(activos, (p) => aNumero(p.cuota)));
  const deuda = redondear(sumar(activos, saldoPendiente));

  return `<section class="seccion">
      <div class="seccion__cabecera"><h1 class="titulo-pagina">Cuotas</h1>${boton('Agregar', 'nuevo-plazo', { variante: 'chico', icono: 'mas' })}</div>
      <div class="indicadores"><span>Al mes <b>${dinero(alMes)}</b></span><span>Deuda pendiente <b>${dinero(deuda)}</b></span><span>Activas <b>${activos.length}</b></span></div>
    </section>
    <section class="plazos">${activos.map((p) => plazoHtml(p, datos, mesActual)).join('') || bloqueVacio('No tienen cuotas activas.')}</section>
    ${terminados.length ? `<details class="terminados"><summary>Terminadas (${terminados.length})</summary><div class="plazos">${terminados.map((p) => plazoHtml(p, datos, mesActual)).join('')}</div></details>` : ''}
    <p class="nota">Las cuotas avanzan al marcarlas como pagadas en Pagos. Las que se cargan a tarjeta avanzan al marcar el pago de esa tarjeta.</p>`;
}
