/** Pestaña Tarjetas: saldo, fechas, uso del límite y costo de no pagar todo. */
import { escaparHtml as esc, dinero, dineroEntero, porcentaje, redondear, sumar, aNumero } from '../utils/formato.js';
import { cuandoEs, diferenciaDias, fechaCorta, proximaFecha } from '../utils/fechas.js';
import {
  cuotasDeTarjeta,
  interesDelProximoMes,
  pagoSegunPlan,
  saldoFinanciado,
  simularLiquidacion,
  usoDeTarjeta,
} from '../domain/tarjetas.js';
import { estaActivo } from '../domain/plazos.js';
import { boton, bloqueVacio, chip } from '../ui/componentes.js';
import { COLORES_TARJETA } from '../constants/catalogos.js';

const TEXTO_PLAN = {
  total: () => 'Pagan todo',
  minimo: () => 'Pagan el mínimo',
  fijo: (t) => `Pagan ${dinero(t.planMonto)}`,
};

function dato(nombre, valor) {
  return `<div><div class="datos__nombre">${nombre}</div><div class="datos__valor">${valor}</div></div>`;
}

function consejoDePago(tarjeta, fechaPago) {
  const pago = pagoSegunPlan(tarjeta);
  if (tarjeta.plan === 'total') {
    return `<p class="nota">Si pagan <b>${dinero(pago)}</b> antes del ${fechaCorta(fechaPago)}, no pagan intereses.</p>`;
  }
  const financiado = saldoFinanciado(tarjeta);
  if (!(financiado > 0) || !aNumero(tarjeta.tasa)) return '';
  const simulacion = simularLiquidacion(aNumero(tarjeta.saldo), aNumero(tarjeta.tasa), pago);
  const proximo = `<p class="nota nota--aviso">Quedarían <b>${dinero(financiado)}</b> financiados: unos <b>${dinero(interesDelProximoMes(tarjeta))}</b> de intereses el próximo mes.</p>`;
  const plazo = simulacion
    ? `<p class="nota nota--aviso">Pagando <b>${dinero(pago)}</b> al mes tardarían unos <b>${simulacion.meses} meses</b> en terminar y pagarían cerca de <b>${dinero(simulacion.intereses)}</b> en intereses.</p>`
    : `<p class="nota nota--aviso"><b>Con ${dinero(pago)} al mes la deuda no baja:</b> apenas cubre los intereses.</p>`;
  return proximo + plazo;
}

function tarjetaHtml(tarjeta, plazos, hoy) {
  const uso = usoDeTarjeta(tarjeta, plazos);
  const cuotas = cuotasDeTarjeta(tarjeta, plazos).filter(estaActivo);
  const cuotaMensual = redondear(sumar(cuotas, (p) => aNumero(p.cuota)));
  const fechaCorte = proximaFecha(tarjeta.corte, hoy);
  const fechaPago = proximaFecha(tarjeta.pago, hoy);
  const color = tarjeta.color in COLORES_TARJETA ? tarjeta.color : 'cobalto';
  const urgente = diferenciaDias(hoy, fechaPago) <= 3;
  const plan = (TEXTO_PLAN[tarjeta.plan] || TEXTO_PLAN.total)(tarjeta);

  return `<article class="tarjeta">
    <div class="tarjeta__frente tarjeta__frente--${color}">
      <div class="tarjeta__arriba">
        <div><div class="tarjeta__banco">${esc(tarjeta.banco)}</div><div class="tarjeta__nombre">${esc(tarjeta.nombre || 'Tarjeta de crédito')}</div></div>
        <div class="tarjeta__numero">•••• ${esc(tarjeta.ultimos || '····')}</div>
      </div>
      <div class="tarjeta__saldo">
        <div class="tarjeta__saldo-etiqueta">Saldo${tarjeta.titular ? ` · ${esc(tarjeta.titular)}` : ''}</div>
        <div class="tarjeta__saldo-valor">${dinero(tarjeta.saldo)} <small>de ${dineroEntero(tarjeta.limite)}</small></div>
        <div class="tarjeta__uso" role="img" aria-label="Usado ${porcentaje(uso.proporcion)}"><span style="width:${Math.min(100, uso.proporcion * 100).toFixed(1)}%"></span></div>
      </div>
    </div>
    <div class="tarjeta__cuerpo">
      <div class="datos">
        ${dato('Corte', fechaCorta(fechaCorte))}
        ${dato('Pagar antes', fechaCorta(fechaPago))}
        ${dato('Disponible', dinero(uso.disponible))}
        ${dato('Pago mínimo', aNumero(tarjeta.pagoMinimo) ? dinero(tarjeta.pagoMinimo) : '—')}
        ${dato('Tasa anual', aNumero(tarjeta.tasa) ? `${aNumero(tarjeta.tasa)}%` : '—')}
        ${dato('Uso', porcentaje(uso.proporcion))}
      </div>
      <div class="chips">${chip(`Pago ${cuandoEs(fechaPago, hoy).toLowerCase()}`, urgente ? 'aviso' : '')}${chip(plan, 'acento')}</div>
      ${cuotas.length ? `<p class="nota">${cuotas.length} compra${cuotas.length > 1 ? 's' : ''} a cuotas en esta tarjeta: <b>${dinero(cuotaMensual)}</b> al mes, <b>${dinero(uso.enCuotas)}</b> pendientes.</p>` : ''}
      ${consejoDePago(tarjeta, fechaPago)}
      <div class="tarjeta__acciones">${boton('Editar o actualizar saldo', 'editar-tarjeta', { variante: 'chico', datos: { id: tarjeta.id } })}</div>
    </div>
  </article>`;
}

export function vistaTarjetas(estado, hoy) {
  const { tarjetas, plazos } = estado.datos;
  if (!tarjetas.length) {
    return `<section class="seccion"><h1 class="titulo-pagina">Tarjetas de crédito</h1></section>
      ${bloqueVacio('Agreguen sus tarjetas con los datos del estado de cuenta: límite, saldo, día de corte y fecha de pago.', boton('Agregar tarjeta', 'nueva-tarjeta', { variante: 'principal' }))}`;
  }
  const saldo = redondear(sumar(tarjetas, (t) => aNumero(t.saldo)));
  const usado = redondear(sumar(tarjetas, (t) => usoDeTarjeta(t, plazos).usado));
  const limite = redondear(sumar(tarjetas, (t) => aNumero(t.limite)));
  const ordenadas = [...tarjetas].sort((a, b) => proximaFecha(a.pago, hoy) - proximaFecha(b.pago, hoy));
  return `<section class="seccion">
      <div class="seccion__cabecera"><h1 class="titulo-pagina">Tarjetas</h1>${boton('Agregar', 'nueva-tarjeta', { variante: 'chico', icono: 'mas' })}</div>
      <div class="indicadores"><span>Saldo total <b>${dinero(saldo)}</b></span><span>Usado con cuotas <b>${dinero(usado)}</b></span><span>Límite <b>${dineroEntero(limite)}</b></span></div>
    </section>
    <section class="tarjetas">${ordenadas.map((t) => tarjetaHtml(t, plazos, hoy)).join('')}</section>
    <p class="nota">Lo que compran después del día de corte entra al siguiente estado de cuenta. Comprando justo después del corte tienen más días para pagar sin intereses.</p>`;
}
