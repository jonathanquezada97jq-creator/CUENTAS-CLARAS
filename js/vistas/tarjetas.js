/** Pestaña Tarjetas: saldo, fechas, uso del límite y costo de pagar solo el mínimo. */
import { escaparHtml as esc, dinero, dineroEntero, porcentaje, redondear, sumar, aNumero } from '../utils/formato.js';
import { cuandoEs, diferenciaDias, fechaCorta, mesDe, proximaFecha } from '../utils/fechas.js';
import { cuotasDeTarjeta, opcionesDePago, siPaganElMinimo, usoDeTarjeta } from '../domain/tarjetas.js';
import { estaActivo, saldoPendiente } from '../domain/plazos.js';
import { clavePago } from '../domain/presupuesto.js';
import { boton, bloqueVacio, chip } from '../ui/componentes.js';
import { COLORES_TARJETA, TIPOS_PAGO_TARJETA } from '../constants/catalogos.js';

function dato(nombre, valor) {
  return `<div><div class="datos__nombre">${nombre}</div><div class="datos__valor">${valor}</div></div>`;
}

function consejoDePago(tarjeta, fechaPago) {
  const { contado } = opcionesDePago(tarjeta);
  if (contado <= 0) return '<p class="nota">No deben nada en esta tarjeta.</p>';
  const contadoTexto = `<p class="nota">Si pagan el contado (<b>${dinero(contado)}</b>) antes del ${fechaCorta(fechaPago)}, no pagan intereses.</p>`;
  const minimo = siPaganElMinimo(tarjeta);
  if (!minimo) return contadoTexto;
  const plazo = minimo.liquidacion
    ? `Pagando solo el mínimo cada mes tardarían unos <b>${minimo.liquidacion.meses} meses</b> y pagarían cerca de <b>${dinero(minimo.liquidacion.intereses)}</b> en intereses.`
    : '<b>Con el mínimo la deuda no baja:</b> apenas cubre los intereses.';
  return `${contadoTexto}<p class="nota nota--aviso">Si pagan solo el mínimo quedan <b>${dinero(minimo.financiado)}</b> financiados: unos <b>${dinero(minimo.interesMes)}</b> de intereses el próximo mes. ${plazo}</p>`;
}

function chipDePagoDelMes(tarjeta, datos, hoy) {
  const registrado = datos.pagados?.[mesDe(hoy)]?.[clavePago('tarjeta', tarjeta.id)];
  const fechaPago = proximaFecha(tarjeta.pago, hoy);
  if (registrado) {
    const como = TIPOS_PAGO_TARJETA[registrado.tipo] || 'Pagada';
    return chip(`Este mes: ${como.toLowerCase()} ${dinero(registrado.monto)}`, 'bien');
  }
  const urgente = diferenciaDias(hoy, fechaPago) <= 3;
  return chip(`Pago ${cuandoEs(fechaPago, hoy).toLowerCase()}`, urgente ? 'aviso' : '');
}

function tarjetaHtml(tarjeta, datos, hoy) {
  const { plazos } = datos;
  const uso = usoDeTarjeta(tarjeta, plazos);
  const cuotas = cuotasDeTarjeta(tarjeta, plazos).filter(estaActivo);
  const pendienteEnCuotas = redondear(sumar(cuotas, saldoPendiente));
  const fechaCorte = proximaFecha(tarjeta.corte, hoy);
  const fechaPago = proximaFecha(tarjeta.pago, hoy);
  const color = tarjeta.color in COLORES_TARJETA ? tarjeta.color : 'cobalto';

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
      <div class="chips">${chipDePagoDelMes(tarjeta, datos, hoy)}</div>
      ${cuotas.length ? `<p class="nota">${cuotas.length} compra${cuotas.length > 1 ? 's' : ''} a cuotas se paga${cuotas.length > 1 ? 'n' : ''} normalmente con esta tarjeta: faltan <b>${dinero(pendienteEnCuotas)}</b>, que ya ocupan parte del límite.</p>` : ''}
      ${consejoDePago(tarjeta, fechaPago)}
      <div class="tarjeta__acciones">${boton('Editar o actualizar saldo', 'editar-tarjeta', { variante: 'chico', datos: { id: tarjeta.id } })}</div>
    </div>
  </article>`;
}

export function vistaTarjetas(estado, hoy) {
  const { datos } = estado;
  const { tarjetas, plazos } = datos;
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
    <section class="tarjetas">${ordenadas.map((t) => tarjetaHtml(t, datos, hoy)).join('')}</section>
    <p class="nota">El pago se marca en Pagos, y ahí eligen si fue el contado, el mínimo u otro monto. Lo que compran después del día de corte entra al siguiente estado de cuenta.</p>`;
}
