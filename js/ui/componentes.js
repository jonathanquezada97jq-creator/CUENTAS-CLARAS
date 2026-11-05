/**
 * Piezas de HTML que usan varias vistas: botones, bloques vacíos, nombres
 * de cuentas y tarjetas, la fila de un pago o de un movimiento y la boleta
 * de salario.
 *
 * Regla: todo texto que viene de la persona (nombres, notas) pasa por
 * `esc()` antes de entrar al HTML.
 */
import { escaparHtml as esc, dinero, redondear, sumar, aNumero } from '../utils/formato.js';
import { cuandoEs, diferenciaDias, fechaCorta, leerFecha, mesCorto, mesDe } from '../utils/fechas.js';
import { ICONOS } from './iconos.js';
import { calcularSalario, TIPO_SALARIO } from '../domain/salario.js';
import { descuentosDePlanilla, pagosAlMes, TIPO_PAGO } from '../domain/presupuesto.js';
import { cuotaDelMes } from '../domain/plazos.js';
import { idDeTarjeta, referenciaTarjeta } from '../domain/tarjetas.js';
import { EXTREMO, idDeCuenta, referenciaCuenta, tipoDeMovimiento, TIPO_MOVIMIENTO } from '../domain/cuentas.js';
import { AGUINALDO } from '../constants/ley-sv.js';
import { TIPOS_PAGO_TARJETA } from '../constants/catalogos.js';

/**
 * Botón que dispara una acción registrada (ver js/ui/acciones.js).
 * @param {string} texto
 * @param {string} accion  Valor de data-accion.
 * @param {{variante?: string, datos?: Object<string,string>, icono?: string, etiqueta?: string}} [opciones]
 *   variante: 'principal', 'fantasma chico'…; datos: atributos data-*.
 */
export function boton(texto, accion, { variante = '', datos = {}, icono = '', etiqueta = '' } = {}) {
  const clases = ['boton', ...variante.split(' ').filter(Boolean).map((v) => `boton--${v}`)];
  const atributos = Object.entries(datos)
    .map(([clave, valor]) => ` data-${clave}="${esc(valor)}"`)
    .join('');
  const aria = etiqueta ? ` aria-label="${esc(etiqueta)}"` : '';
  return `<button type="button" class="${clases.join(' ')}" data-accion="${accion}"${atributos}${aria}>${icono ? ICONOS[icono] : ''}${esc(texto)}</button>`;
}

/** Enlace con forma de botón para cambiar de pestaña. */
export function enlacePestana(texto, vista, variante = 'fantasma chico') {
  const clases = ['boton', ...variante.split(' ').map((v) => `boton--${v}`)];
  return `<a class="${clases.join(' ')}" href="#${vista}">${esc(texto)}</a>`;
}

/** Caja punteada para cuando todavía no hay nada. `texto` es HTML de confianza. */
export function bloqueVacio(texto, botones = '') {
  return `<div class="vacio"><p>${texto}</p>${botones ? `<div class="fila-botones">${botones}</div>` : ''}</div>`;
}

export function chip(texto, tono = '') {
  return `<span class="chip${tono ? ` chip--${tono}` : ''}">${esc(texto)}</span>`;
}

/** "Tarjeta BAC ••1107". */
export function nombreTarjeta(tarjeta) {
  return `Tarjeta ${tarjeta.banco}${tarjeta.ultimos ? ` ••${tarjeta.ultimos}` : ''}`;
}

/** "Banco Cuscatlán ••1421". */
export function nombreCuenta(cuenta) {
  return `${cuenta.banco}${cuenta.ultimos ? ` ••${cuenta.ultimos}` : ''}`;
}

const buscarPorId = (lista, id) => (lista || []).find((x) => x.id === id);

/** Nombre de una referencia: "tarjeta:<id>", "cuenta:<id>", "efectivo" o "externo". */
export function nombreDeReferencia(referencia, datos) {
  const idTarjeta = idDeTarjeta(referencia);
  if (idTarjeta) {
    const tarjeta = buscarPorId(datos.tarjetas, idTarjeta);
    return tarjeta ? nombreTarjeta(tarjeta) : 'Tarjeta borrada';
  }
  const idCuenta = idDeCuenta(referencia);
  if (idCuenta) {
    const cuenta = buscarPorId(datos.cuentas, idCuenta);
    return cuenta ? nombreCuenta(cuenta) : 'Cuenta borrada';
  }
  return referencia === EXTREMO.EFECTIVO ? 'Efectivo' : 'Otra cuenta o persona';
}

/**
 * Opciones para elegir con qué se pagó: efectivo, el débito de cada cuenta
 * y cada tarjeta de crédito.
 * @param {Object} datos
 * @param {{efectivo?: string, tarjetas?: boolean, prefijoCuenta?: string}} [opciones]
 */
export function opcionesDeMedio(datos, { efectivo = 'Efectivo', tarjetas = true, prefijoCuenta = 'Débito · ' } = {}) {
  return [
    ['efectivo', efectivo],
    ...(datos.cuentas || []).map((c) => [referenciaCuenta(c.id), `${prefijoCuenta}${nombreCuenta(c)}`]),
    ...(tarjetas ? datos.tarjetas.map((t) => [referenciaTarjeta(t.id), nombreTarjeta(t)]) : []),
  ];
}

/** Cifra grande con los centavos más pequeños. */
export function cifraGrande(valor) {
  const n = redondear(valor);
  const [enteros, centavos] = dinero(Math.abs(n)).split('.');
  return `${n < 0 ? '−' : ''}${enteros}<span class="resumen__centavos">.${centavos}</span>`;
}

/* ---------- Fila de un pago del mes ---------- */

function nombreDelPago(pago) {
  if (pago.tipo === TIPO_PAGO.TARJETA) return nombreTarjeta(pago.registro);
  if (pago.tipo === TIPO_PAGO.PLAZO) return pago.registro.descripcion;
  return pago.registro.nombre;
}

/** "en efectivo", "por planilla", "con Tarjeta BAC ••1107", "con débito de BAC ••8320". */
export function textoMedio(medio, datos) {
  if (idDeTarjeta(medio)) return `con ${nombreDeReferencia(medio, datos)}`;
  if (idDeCuenta(medio)) return `con débito de ${nombreDeReferencia(medio, datos)}`;
  return medio === 'planilla' ? 'por planilla' : 'en efectivo';
}

function detalleDeTarjetaPagada(pago, datos) {
  const partes = [];
  if (pago.registrado) {
    const como = TIPOS_PAGO_TARJETA[pago.tipoDePago] || 'Pagada';
    partes.push(idDeCuenta(pago.desde) ? `${como} desde ${nombreDeReferencia(pago.desde, datos)}` : como);
  }
  (pago.transferencias || []).forEach((m) => {
    partes.push(idDeCuenta(m.desde) ? `Transferencia desde ${nombreDeReferencia(m.desde, datos)}` : 'Transferencia');
  });
  return partes.join(' + ') || 'Pagada';
}

function detalleDelPago(pago, esMesActual, datos) {
  const r = pago.registro;
  if (pago.tipo === TIPO_PAGO.FIJO) {
    const medio = pago.pagado ? pago.medio : r.medio;
    let como = '';
    if (idDeCuenta(medio)) como = `desde ${nombreDeReferencia(medio, datos)}`;
    if (idDeTarjeta(medio)) como = `con ${nombreDeReferencia(medio, datos)}`;
    const delCorreo = pago.pagado && pago.delCorreo ? 'cobro automático (aviso del banco)' : '';
    return [r.categoria || 'Gasto fijo', como, delCorreo].filter(Boolean).join(' · ');
  }
  if (pago.tipo === TIPO_PAGO.PLAZO) {
    const estado = pago.pagado
      ? `pagada ${textoMedio(pago.medio, datos)}`
      : [esMesActual ? `cuota ${pago.numeroCuota} de ${r.total}` : 'cuota mensual', pago.porPlanilla ? 'por planilla' : '']
          .filter(Boolean)
          .join(' · ');
    return [r.acreedor, estado].filter(Boolean).join(' · ');
  }
  if (pago.pagado) return detalleDeTarjetaPagada(pago, datos);
  return pago.minimo ? `Contado · mínimo ${dinero(pago.minimo)}` : 'Pago de contado';
}

function chipDelPago(pago, hoy) {
  const dias = diferenciaDias(hoy, pago.fecha);
  if (pago.pagado) return chip('Pagado', 'bien');
  if (pago.porPlanilla) return chip('Planilla');
  if (dias < 0) return chip('Vencido', 'mal');
  if (dias <= 3) return chip(cuandoEs(pago.fecha, hoy), 'aviso');
  return chip(cuandoEs(pago.fecha, hoy));
}

/**
 * Fila con el círculo para marcar el pago.
 * @param {import('../domain/presupuesto.js').PagoDelMes} pago
 * @param {Date} hoy
 * @param {import('../domain/presupuesto.js').DatosHogar} datos  Para nombrar la tarjeta usada.
 */
export function filaPago(pago, hoy, datos) {
  const mes = mesDe(pago.fecha);
  const nombre = nombreDelPago(pago);
  const etiqueta = `${pago.pagado ? 'Desmarcar' : 'Marcar como pagado'}: ${nombre}`;
  return `<li class="pago${pago.pagado ? ' pago--hecho' : ''}">
    <button type="button" class="pago__marca" data-accion="marcar-pago" data-mes="${mes}" data-clave="${esc(pago.clave)}" aria-pressed="${pago.pagado}" aria-label="${esc(etiqueta)}">${ICONOS.check}</button>
    <div class="pago__fecha"><b>${pago.fecha.getDate()}</b><span>${mesCorto(pago.fecha)}</span></div>
    <div class="pago__principal">
      <div class="pago__nombre">${esc(nombre)}</div>
      <div class="pago__detalle">${esc(detalleDelPago(pago, mes === mesDe(hoy), datos))}</div>
    </div>
    <div class="pago__final"><span class="monto">${dinero(pago.monto)}</span>${chipDelPago(pago, hoy)}</div>
  </li>`;
}

/* ---------- Fila de un movimiento entre cuentas ---------- */

/** "Transferencia entre cuentas", "Pago de tarjeta", "Depósito", "Retiro en efectivo"… */
export function tituloMovimiento(movimiento) {
  switch (tipoDeMovimiento(movimiento)) {
    case TIPO_MOVIMIENTO.TRANSFERENCIA:
      return 'Transferencia entre cuentas';
    case TIPO_MOVIMIENTO.PAGO_TARJETA:
      return 'Pago de tarjeta';
    case TIPO_MOVIMIENTO.DEPOSITO:
      return movimiento.desde === EXTREMO.EFECTIVO ? 'Depósito en efectivo' : 'Entró dinero';
    default:
      return movimiento.hacia === EXTREMO.EFECTIVO ? 'Retiro en efectivo' : 'Salió dinero';
  }
}

/** Signo del monto: + si entra a una cuenta desde afuera, − si sale hacia afuera. */
function signoDeMovimiento(movimiento) {
  const tipo = tipoDeMovimiento(movimiento);
  if (tipo === TIPO_MOVIMIENTO.DEPOSITO) return '+';
  if (tipo === TIPO_MOVIMIENTO.RETIRO) return '−';
  return '';
}

/**
 * Fila de un movimiento: de dónde a dónde, la nota y quién lo anotó.
 * Tocarla abre el formulario para corregirlo; la X lo borra.
 */
export function filaMovimiento(movimiento, datos, mes) {
  const fecha = leerFecha(movimiento.fecha);
  const quien = movimiento.autor?.nombre ? ` · ${movimiento.autor.nombre.split(' ')[0]}` : '';
  const ruta = `${nombreDeReferencia(movimiento.desde, datos)} → ${nombreDeReferencia(movimiento.hacia, datos)}`;
  // Anotado a mano y confirmado después por el aviso del banco.
  const confirmado = movimiento.origen !== 'correo' && movimiento.referencias?.length ? 'confirmado por el banco' : '';
  const detalle = [fecha ? fechaCorta(fecha) : '', ruta, movimiento.nota, confirmado].filter(Boolean).join(' · ');
  const titulo = tituloMovimiento(movimiento);
  const repetido = movimiento.posibleRepetido ? ` ${chip('¿Repetido?', 'aviso')}` : '';
  return `<li class="lista__fila">
    <button type="button" class="lista__enlace" data-accion="editar-movimiento" data-mes="${esc(mes)}" data-id="${esc(movimiento.id)}"><div class="lista__titulo">${esc(titulo)}${repetido}</div><div class="lista__detalle">${esc(detalle + quien)}</div></button>
    <span class="monto">${signoDeMovimiento(movimiento)}${dinero(movimiento.monto)}</span>
    <button type="button" class="lista__borrar" data-accion="borrar-movimiento" data-mes="${esc(mes)}" data-id="${esc(movimiento.id)}" aria-label="Borrar ${esc(titulo)}">${ICONOS.cerrar}</button>
  </li>`;
}

/* ---------- Boleta de salario ---------- */

function lineaBoleta(concepto, valor, variante = '') {
  const clase = variante ? ` boleta__linea--${variante}` : '';
  return `<div class="boleta__linea${clase}"><span class="boleta__concepto">${concepto}</span><span class="boleta__puntos"></span><span class="boleta__valor">${valor}</span></div>`;
}

const resta = (n) => `−${dinero(n)}`;

/**
 * Boleta estimada con los descuentos de ley de una persona.
 * @param {import('../domain/salario.js').Persona} persona
 * @param {import('../domain/presupuesto.js').DatosHogar} datos
 */
export function boletaSalario(persona, datos) {
  const s = calcularSalario(persona);
  const encabezado = '<div class="boleta__encabezado"><span>Boleta estimada</span><span>Mensual</span></div>';
  if (!s.bruto) {
    return `<div class="boleta">${encabezado}<p class="nota">Escribí el salario bruto para ver los descuentos de ley.</p></div>`;
  }

  const lineas = [lineaBoleta('Salario bruto', dinero(s.bruto))];
  if (persona.tipo === TIPO_SALARIO.SERVICIOS) {
    lineas.push(lineaBoleta('Retención de renta 10 %', resta(s.renta), 'resta'));
  } else if (persona.tipo !== TIPO_SALARIO.SIN_DESCUENTOS) {
    lineas.push(lineaBoleta(`ISSS 3 %${s.bruto > 1000 ? ' (tope)' : ''}`, resta(s.isss), 'resta'));
    lineas.push(lineaBoleta('AFP 7.25 %', resta(s.afp), 'resta'));
    const conceptoRenta = `Renta · tramo ${s.tramo}${s.conDeduccion ? ' (con deducción)' : ''}`;
    lineas.push(
      s.renta
        ? lineaBoleta(conceptoRenta, resta(s.renta), 'resta')
        : lineaBoleta(conceptoRenta, dinero(0), 'suave'),
    );
  }
  lineas.push(lineaBoleta('Salario neto', dinero(s.neto), 'total'));

  const planilla = descuentosDePlanilla(persona, datos);
  planilla.forEach((p) =>
    lineas.push(lineaBoleta(`Planilla: ${esc(p.descripcion)}`, resta(cuotaDelMes(p)), 'resta')),
  );
  const deposito = redondear(s.neto - sumar(planilla, cuotaDelMes));
  if (planilla.length) lineas.push(lineaBoleta('Depósito del mes', dinero(deposito)));
  if (pagosAlMes(persona) === 2) {
    lineas.push(lineaBoleta('Por quincena', dinero(deposito / 2), 'suave'));
  }
  if (aNumero(persona.netoReal) > 0) {
    lineas.push(lineaBoleta('Según su boleta, por pago', dinero(persona.netoReal)));
  }
  return `<div class="boleta">${encabezado}${lineas.join('')}</div>`;
}

/* ---------- Aguinaldo ---------- */

export function motivoAguinaldo(aguinaldo) {
  if (aguinaldo.proporcional) return 'proporcional, menos de 1 año de servicio';
  return `${aguinaldo.anios} ${aguinaldo.anios === 1 ? 'año' : 'años'} de servicio`;
}

export function textoAguinaldo(aguinaldo, anio) {
  const periodo = AGUINALDO.periodoDePago;
  if (periodo.anio !== anio || aguinaldo.exentoHasta === null) {
    return `Se paga a más tardar el ${periodo.hasta}. No lleva ISSS ni AFP.`;
  }
  const renta =
    aguinaldo.excedente > 0
      ? `Pasa del límite exento de ${dinero(aguinaldo.exentoHasta)}: los ${dinero(aguinaldo.excedente)} de diferencia pueden llevar retención de renta.`
      : `Está exento de renta (hasta ${dinero(aguinaldo.exentoHasta)}) y no lleva ISSS ni AFP.`;
  return `Se paga entre el ${periodo.desde} y el ${periodo.hasta}. ${renta}`;
}
