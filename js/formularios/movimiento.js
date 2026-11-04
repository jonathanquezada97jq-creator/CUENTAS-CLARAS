/**
 * Formulario de movimientos: transferir entre cuentas, pagar una tarjeta
 * desde una cuenta, anotar un depósito o un retiro. Los saldos de las
 * cuentas y tarjetas involucradas se ajustan al guardar (ver repositorio).
 *
 * Los movimientos guardan `desde` y `hacia` ("cuenta:<id>", "tarjeta:<id>",
 * "efectivo" o "externo"). El formulario tiene un campo por cada caso y
 * muestra solo los que tocan según el tipo elegido; `aMovimiento` los junta.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { avisar } from '../ui/aviso.js';
import { leer } from '../state/store.js';
import { borrarMovimiento, guardarMovimiento } from '../data/repositorio.js';
import {
  EXTREMO,
  idDeCuenta,
  movimientosDelMes,
  referenciaCuenta,
  tipoDeMovimiento,
  TIPO_MOVIMIENTO,
} from '../domain/cuentas.js';
import { referenciaTarjeta } from '../domain/tarjetas.js';
import { leerClavePago } from '../domain/presupuesto.js';
import { nombreCuenta, nombreDeReferencia, nombreTarjeta, tituloMovimiento } from '../ui/componentes.js';
import { dinero, redondear } from '../utils/formato.js';
import { fechaIso, leerFecha, mesDe } from '../utils/fechas.js';

const T = TIPO_MOVIMIENTO;

function campos(datos, fechaSugerida) {
  const cuentas = datos.cuentas.map((c) => [referenciaCuenta(c.id), nombreCuenta(c)]);
  const tarjetas = datos.tarjetas.map((t) => [referenciaTarjeta(t.id), nombreTarjeta(t)]);
  return [
    {
      nombre: 'tipo',
      etiqueta: '¿Qué pasó?',
      tipo: 'opciones',
      opciones: [
        [T.TRANSFERENCIA, 'Pasé dinero entre mis cuentas'],
        [T.PAGO_TARJETA, 'Pagué una tarjeta de crédito'],
        [T.DEPOSITO, 'Entró dinero a una cuenta'],
        [T.RETIRO, 'Saqué o envié dinero'],
      ],
      porDefecto: T.TRANSFERENCIA,
    },
    { nombre: 'monto', etiqueta: 'Monto', tipo: 'dinero', requerido: true, medio: true },
    { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, medio: true, porDefecto: fechaSugerida },
    {
      nombre: 'desdeCuenta',
      etiqueta: 'Sale de',
      tipo: 'lista',
      opciones: cuentas,
      mostrarSi: ['tipo', [T.TRANSFERENCIA, T.RETIRO]],
    },
    {
      nombre: 'haciaCuenta',
      etiqueta: 'Entra a',
      tipo: 'lista',
      opciones: cuentas,
      porDefecto: cuentas[1]?.[0] ?? cuentas[0]?.[0] ?? '',
      mostrarSi: ['tipo', [T.TRANSFERENCIA, T.DEPOSITO]],
    },
    {
      nombre: 'haciaTarjeta',
      etiqueta: 'Tarjeta que pagaron',
      tipo: 'lista',
      opciones: tarjetas,
      mostrarSi: ['tipo', T.PAGO_TARJETA],
    },
    {
      nombre: 'desdePago',
      etiqueta: '¿De dónde salió el dinero?',
      tipo: 'lista',
      opciones: [
        ...cuentas,
        [EXTREMO.EFECTIVO, 'Efectivo (en ventanilla)'],
        [EXTREMO.EXTERNO, 'Otra cuenta que no está en la app'],
      ],
      mostrarSi: ['tipo', T.PAGO_TARJETA],
    },
    {
      nombre: 'origenDeposito',
      etiqueta: '¿De dónde vino?',
      tipo: 'lista',
      opciones: [
        [EXTREMO.EXTERNO, 'Sueldo, otra persona u otro banco'],
        [EXTREMO.EFECTIVO, 'Lo depositaron en efectivo'],
      ],
      mostrarSi: ['tipo', T.DEPOSITO],
    },
    {
      nombre: 'destinoRetiro',
      etiqueta: '¿A dónde fue?',
      tipo: 'lista',
      opciones: [
        [EXTREMO.EFECTIVO, 'Lo sacaron en efectivo (cajero)'],
        [EXTREMO.EXTERNO, 'A otra persona o a otro banco'],
      ],
      mostrarSi: ['tipo', T.RETIRO],
    },
    { nombre: 'nota', etiqueta: 'Nota', ejemplo: 'Quincena, ahorro, pago del alquiler…' },
  ];
}

/** Campos del formulario → movimiento { fecha, monto, desde, hacia, nota }. */
function aMovimiento(v) {
  const extremos = {
    [T.TRANSFERENCIA]: [v.desdeCuenta, v.haciaCuenta],
    [T.PAGO_TARJETA]: [v.desdePago, v.haciaTarjeta],
    [T.DEPOSITO]: [v.origenDeposito, v.haciaCuenta],
    [T.RETIRO]: [v.desdeCuenta, v.destinoRetiro],
  }[v.tipo];
  return { fecha: v.fecha, monto: redondear(v.monto), desde: extremos[0], hacia: extremos[1], nota: v.nota };
}

/** Movimiento guardado → valores de los campos, para editarlo. */
function aCampos(m) {
  return {
    ...m,
    tipo: tipoDeMovimiento(m),
    desdeCuenta: m.desde,
    haciaCuenta: m.hacia,
    haciaTarjeta: m.hacia,
    desdePago: m.desde,
    origenDeposito: m.desde,
    destinoRetiro: m.hacia,
  };
}

function validar(v) {
  if (!(v.monto > 0)) return 'Escribí el monto.';
  if (!leerFecha(v.fecha)) return 'Elegí la fecha.';
  const m = aMovimiento(v);
  if (!m.desde || !m.hacia) {
    return v.tipo === T.PAGO_TARJETA ? 'Primero agreguen la tarjeta en Bancos.' : 'Primero agreguen sus cuentas en Bancos.';
  }
  if (v.tipo === T.TRANSFERENCIA && m.desde === m.hacia) return 'La cuenta de donde sale y a donde entra tienen que ser distintas.';
  return undefined;
}

/** Explica de dónde salió un movimiento leído del correo, o con cuál se parece. */
function introDe(movimiento, datos, mes) {
  if (!movimiento) return 'Lo que anoten aquí sube o baja solo el saldo de las cuentas y tarjetas.';
  if (movimiento.posibleRepetido?.startsWith('pago:')) {
    const pago = datos.pagados?.[mes]?.[movimiento.posibleRepetido.slice('pago:'.length)];
    const { id } = leerClavePago(movimiento.posibleRepetido.slice('pago:'.length));
    const tarjeta = datos.tarjetas.find((t) => t.id === id);
    return `Parece el mismo pago${tarjeta ? ` de la ${nombreTarjeta(tarjeta)}` : ''} que marcaron a mano en Pagos${pago ? ` (${dinero(pago.monto)})` : ''}. Si es el mismo, eliminen este movimiento o desmarquen ese pago; si no, guarden y se quita la marca.`;
  }
  if (movimiento.posibleRepetido) {
    const otro = movimientosDelMes(datos, mes).find((m) => m.id === movimiento.posibleRepetido);
    if (otro) {
      return `Parece el mismo que "${tituloMovimiento(otro)}" de ${dinero(otro.monto)} (${nombreDeReferencia(otro.desde, datos)} → ${nombreDeReferencia(otro.hacia, datos)}). Si es el mismo, eliminen uno de los dos; si no, guarden y se quita la marca.`;
    }
  }
  if (movimiento.origen === 'correo') return 'Llegó solo del correo del banco. Revisen las cuentas; si algo no cuadra, corríjanlo aquí.';
  return '';
}

/**
 * @param {Object} [opciones]
 * @param {string} [opciones.mes]  Mes que se está viendo.
 * @param {string} [opciones.id]  Para corregir un movimiento que ya existe.
 * @param {Object} [opciones.valores]  Valores iniciales de un movimiento nuevo:
 *   tipo, desde, hacia, monto, nota.
 */
export function abrirFormularioMovimiento({ mes, id, valores = {} } = {}) {
  const { datos } = leer();
  const mesActual = mesDe(new Date());
  const movimiento = id ? movimientosDelMes(datos, mes).find((m) => m.id === id) : null;
  if (id && !movimiento) return;
  const fechaSugerida = !mes || mes === mesActual ? fechaIso(new Date()) : `${mes}-01`;
  const nuevo = { desde: '', hacia: '', ...valores };
  // Al pasar dinero desde una cuenta, se sugiere como destino otra cuenta distinta.
  if (!nuevo.hacia && idDeCuenta(nuevo.desde)) {
    nuevo.hacia = datos.cuentas.map((c) => referenciaCuenta(c.id)).find((r) => r !== nuevo.desde) || '';
  }
  const iniciales = movimiento
    ? aCampos(movimiento)
    : { ...aCampos(nuevo), tipo: valores.tipo || T.TRANSFERENCIA };

  abrirFormulario({
    titulo: movimiento ? 'Editar movimiento' : 'Anotar movimiento',
    intro: introDe(movimiento, datos, mes),
    campos: campos(datos, fechaSugerida),
    valores: iniciales,
    textoGuardar: movimiento ? 'Guardar' : 'Anotar',
    validar,
    alGuardar: (v) => {
      guardarMovimiento(aMovimiento(v), movimiento || undefined);
      avisar(movimiento ? 'Movimiento actualizado.' : `${tituloMovimiento(aMovimiento(v))}: ${dinero(v.monto)}.`);
    },
    alEliminar: movimiento
      ? () => {
          borrarMovimiento(movimiento);
          avisar('Movimiento borrado. Los saldos volvieron a como estaban.');
        }
      : null,
  });
}

export const acciones = {
  /** data-mes y, opcionales, data-tipo, data-desde, data-hacia, data-monto, data-nota. */
  'nuevo-movimiento': (boton) => {
    const { mes, tipo, desde, hacia, monto, nota } = boton.dataset;
    const valores = { tipo, desde, hacia, nota };
    if (monto) valores.monto = Number(monto);
    abrirFormularioMovimiento({ mes, valores });
  },
  'editar-movimiento': (boton) => abrirFormularioMovimiento({ mes: boton.dataset.mes, id: boton.dataset.id }),
};
