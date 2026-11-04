/**
 * Pestaña Bancos: las cuentas de ahorro (con su débito y su saldo), lo que
 * se movió entre ellas este mes y las tarjetas de crédito (ver tarjetas.js).
 */
import { escaparHtml as esc, dinero, redondear, sumar, aNumero } from '../utils/formato.js';
import { mesDe, nombreDelMes } from '../utils/fechas.js';
import {
  flujoDeCuenta,
  ingresosDeLaCuenta,
  movimientosDelMes,
  referenciaCuenta,
  saldoEnCuentas,
  TIPO_MOVIMIENTO,
} from '../domain/cuentas.js';
import { depositoPorPago, diasDePago, pagosAlMes } from '../domain/presupuesto.js';
import { COLORES_TARJETA } from '../constants/catalogos.js';
import { boton, bloqueVacio, cifraGrande, enlacePestana, filaMovimiento } from '../ui/componentes.js';
import { seccionTarjetas } from './tarjetas.js';

/** Cuántos movimientos del mes se muestran aquí; el resto está en Pagos. */
const MAXIMO_MOVIMIENTOS = 5;

/** "Quincena de Jonathan (días 5 y 20)", "Remesa (día 5)". */
function textoDeIngresos(cuenta, datos) {
  const { personas, ingresos } = ingresosDeLaCuenta(cuenta, datos);
  const textos = [
    ...personas.map((p) => {
      const dias = diasDePago(p);
      return `${pagosAlMes(p) === 2 ? 'Quincena' : 'Salario'} de ${p.nombre} (${dias.length === 2 ? `días ${dias[0]} y ${dias[1]}` : `día ${dias[0]}`})`;
    }),
    ...ingresos.filter((i) => i.frecuencia !== 'unica').map((i) => `${i.nombre} (día ${i.dia})`),
  ];
  return textos.length ? `Aquí cae: ${textos.join(', ')}` : '';
}

/** Botones para anotar el sueldo que llegó a esta cuenta, uno por persona. */
function botonesDeSueldo(cuenta, datos, mes) {
  return ingresosDeLaCuenta(cuenta, datos)
    .personas.map((p) =>
      boton(`Llegó el sueldo de ${p.nombre.split(' ')[0]}`, 'nuevo-movimiento', {
        variante: 'chico',
        datos: {
          mes,
          tipo: TIPO_MOVIMIENTO.DEPOSITO,
          hacia: referenciaCuenta(cuenta.id),
          monto: String(depositoPorPago(p, datos)),
          nota: `${pagosAlMes(p) === 2 ? 'Quincena' : 'Salario'} de ${p.nombre}`,
        },
      }),
    )
    .join('');
}

function cuentaHtml(cuenta, datos, mes) {
  const color = cuenta.color in COLORES_TARJETA ? cuenta.color : 'bosque';
  const duena = datos.personas.find((p) => p.id === cuenta.personaId);
  const subtitulo = [cuenta.tipo === 'corriente' ? 'Corriente' : 'Ahorro', cuenta.nombre, duena?.nombre]
    .filter(Boolean)
    .join(' · ');
  const flujo = flujoDeCuenta(datos, mes, cuenta.id);
  const ingresos = textoDeIngresos(cuenta, datos);
  const partesDelFlujo = [
    flujo.entro > 0 ? `entró <b>${dinero(flujo.entro)}</b>` : '',
    flujo.salio > 0 ? `salió <b>${dinero(flujo.salio)}</b>` : '',
  ].filter(Boolean);
  return `<article class="cuenta cuenta--${color}">
    <div class="cuenta__arriba">
      <div><div class="cuenta__banco">${esc(cuenta.banco)}</div><div class="cuenta__nombre">${esc(subtitulo)}</div></div>
      <div class="cuenta__numeros">
        <div>•••• ${esc(cuenta.ultimos || '····')}</div>
        ${cuenta.debito ? `<div class="cuenta__debito">Débito ••${esc(cuenta.debito)}</div>` : ''}
      </div>
    </div>
    <div class="cuenta__saldo"><span class="cuenta__saldo-etiqueta">Saldo</span><b>${cifraGrande(aNumero(cuenta.saldo))}</b></div>
    ${partesDelFlujo.length ? `<div class="cuenta__flujo">En ${nombreDelMes(mes).split(' ')[0]}: ${partesDelFlujo.join(' · ')}</div>` : ''}
    ${ingresos ? `<p class="nota">${esc(ingresos)}</p>` : ''}
    <div class="cuenta__acciones">
      ${boton('Mover dinero', 'nuevo-movimiento', { variante: 'chico', datos: { mes, desde: referenciaCuenta(cuenta.id) } })}
      ${botonesDeSueldo(cuenta, datos, mes)}
      ${boton('Editar', 'editar-cuenta', { variante: 'fantasma chico', datos: { id: cuenta.id } })}
    </div>
  </article>`;
}

function seccionCuentas(datos, mes) {
  const { cuentas } = datos;
  if (!cuentas.length) {
    return `<section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Cuentas de banco</h2></div>
      ${bloqueVacio(
        'Agreguen sus cuentas de ahorro con los últimos 4 dígitos de la cuenta y de su tarjeta de débito. Así eligen en qué cuenta les depositan el sueldo y desde cuál pagan las tarjetas, y los avisos de Transfer365 se anotan solos.',
        boton('Agregar cuenta', 'nueva-cuenta', { variante: 'principal' }),
      )}
    </section>`;
  }
  const ordenadas = [...cuentas].sort((a, b) => aNumero(b.saldo) - aNumero(a.saldo));
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Cuentas de banco</h2>${boton('Agregar', 'nueva-cuenta', { variante: 'chico', icono: 'mas' })}</div>
    <div class="cuentas">${ordenadas.map((c) => cuentaHtml(c, datos, mes)).join('')}</div>
  </section>`;
}

function seccionMovimientos(datos, mes) {
  if (!datos.cuentas.length) return '';
  const movimientos = [...movimientosDelMes(datos, mes)].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const mostrados = movimientos.slice(0, MAXIMO_MOVIMIENTOS);
  const anotar = boton('Anotar', 'nuevo-movimiento', { variante: 'principal chico', icono: 'mas', datos: { mes } });
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Movimientos de ${nombreDelMes(mes).split(' ')[0]}</h2>${anotar}</div>
    ${
      mostrados.length
        ? `<ul class="lista">${mostrados.map((m) => filaMovimiento(m, datos, mes)).join('')}</ul>
           ${movimientos.length > MAXIMO_MOVIMIENTOS ? `<div style="text-align:center">${enlacePestana(`Ver los ${movimientos.length} en Pagos`, 'pagos')}</div>` : ''}`
        : '<p class="nota">Transferencias entre sus cuentas, pagos de tarjeta, depósitos y retiros. Los avisos de Transfer365 que llegan por correo se anotan solos.</p>'
    }
  </section>`;
}

export function vistaBancos(estado, hoy) {
  const { datos } = estado;
  const mes = mesDe(hoy);
  const enCuentas = saldoEnCuentas(datos.cuentas);
  const deuda = redondear(sumar(datos.tarjetas, (t) => aNumero(t.saldo)));
  const indicadores = [
    datos.cuentas.length ? `<span>En cuentas <b>${dinero(enCuentas)}</b></span>` : '',
    datos.tarjetas.length ? `<span>Deben en tarjetas <b>${dinero(deuda)}</b></span>` : '',
  ].join('');
  return `<section class="seccion">
      <h1 class="titulo-pagina">Bancos</h1>
      <p class="texto-suave">Sus cuentas con su débito y las tarjetas de crédito. Lo que pagan desde una cuenta baja su saldo solo.</p>
      ${indicadores ? `<div class="indicadores">${indicadores}</div>` : ''}
    </section>
    ${seccionCuentas(datos, mes)}
    ${seccionMovimientos(datos, mes)}
    ${seccionTarjetas(datos, hoy)}`;
}
