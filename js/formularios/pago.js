/**
 * Marcar pagos del mes.
 *
 * - Gasto fijo y cuota por planilla: se marcan con un toque (el fijo sale
 *   de la cuenta que tenga elegida, si tiene).
 * - Cuota: se abre una ventana con el monto ya puesto (se puede subir para
 *   abonar más) y el medio: efectivo, débito de una cuenta o una tarjeta.
 * - Tarjeta: se abre una ventana para elegir contado, mínimo u otro monto
 *   y de qué cuenta salió el dinero.
 * - Si ya estaba pagado, el toque lo desmarca y revierte los saldos. Una
 *   tarjeta pagada con una transferencia se quita desde Movimientos.
 */
import { abrirFormulario } from '../ui/formulario.js';
import { avisar } from '../ui/aviso.js';
import { leer } from '../state/store.js';
import { alternarPago } from '../data/repositorio.js';
import { pagosDelMes, TIPO_PAGO } from '../domain/presupuesto.js';
import { cuotaDelMes, saldoPendiente, MEDIO_EFECTIVO } from '../domain/plazos.js';
import { opcionesDePago, TIPO_PAGO_TARJETA } from '../domain/tarjetas.js';
import { claveDeBanco, referenciaCuenta } from '../domain/cuentas.js';
import { nombreCuenta, nombreTarjeta, opcionesDeMedio } from '../ui/componentes.js';
import { dinero, redondear } from '../utils/formato.js';
import { fechaIso, inicioDelDia, leerFecha, mesDe } from '../utils/fechas.js';

/** Fecha que se sugiere: hoy si es el mes actual; si no, la fecha del pago. */
function fechaSugerida(pago) {
  const hoy = inicioDelDia();
  return mesDe(pago.fecha) === mesDe(hoy) ? fechaIso(hoy) : fechaIso(pago.fecha);
}

/** Aplica el pago (o lo desmarca) y avisa qué pasó. */
function registrarPago(mes, clave, detalle) {
  const plan = alternarPago(mes, clave, detalle);
  if (!plan) return;
  if (plan.bloqueado) {
    avisar(plan.bloqueado, 4500);
  } else if (plan.desmarcado) {
    avisar('Pago desmarcado.');
  } else if (plan.plazosTerminados.length) {
    avisar(`¡Terminaron de pagar ${plan.plazosTerminados.map((p) => p.descripcion).join(' y ')}!`);
  } else if (plan.montoPagado > 0) {
    avisar(`Pago de ${dinero(plan.montoPagado)} registrado.`);
  }
}

const validarFecha = (v) => (leerFecha(v.fecha) ? undefined : 'Elegí la fecha del pago.');

/** Ventana para pagar una cuota: monto (se puede abonar más) y medio de pago. */
export function abrirPagoCuota(mes, pago) {
  const { datos } = leer();
  const plazo = pago.registro;
  const pendiente = saldoPendiente(plazo);
  const hayCuentas = datos.cuentas.length > 0;
  const medios = opcionesDeMedio(datos, { efectivo: hayCuentas ? 'Efectivo' : 'Efectivo, débito o transferencia' });
  // Se sugiere cómo la pagan normalmente, si esa tarjeta o cuenta todavía existe.
  const medioSugerido = medios.some(([valor]) => valor === plazo.metodo) ? plazo.metodo : MEDIO_EFECTIVO;

  abrirFormulario({
    titulo: `Pagar: ${plazo.descripcion}`,
    intro: `Cuota ${pago.numeroCuota} de ${plazo.total} · faltan ${dinero(pendiente)} en total.`,
    campos: [
      {
        nombre: 'monto',
        etiqueta: 'Monto pagado',
        tipo: 'dinero',
        requerido: true,
        porDefecto: cuotaDelMes(plazo),
        ayuda: `La cuota es ${dinero(plazo.cuota)}. Si abonan más, se descuenta de lo que falta.`,
      },
      {
        nombre: 'medio',
        etiqueta: 'Pagado con',
        tipo: 'lista',
        opciones: medios,
        porDefecto: medioSugerido,
        ayuda: datos.tarjetas.length || hayCuentas
          ? 'Con tarjeta se suma a su saldo; con débito se resta de la cuenta.'
          : '',
      },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, porDefecto: fechaSugerida(pago) },
    ],
    textoGuardar: 'Registrar pago',
    validar: (v) => {
      if (!(v.monto > 0)) return 'Escribí cuánto pagaron.';
      if (v.monto > pendiente + 0.004) return `Solo faltan ${dinero(pendiente)} para terminar.`;
      return validarFecha(v);
    },
    alGuardar: (v) =>
      registrarPago(mes, pago.clave, { monto: redondear(v.monto), medio: v.medio, fecha: v.fecha }),
  });
}

/**
 * Cuenta que se sugiere para pagar una tarjeta: una del mismo banco (pagar
 * la tarjeta BAC desde la cuenta BAC) o, si no hay, la primera.
 */
function cuentaSugerida(tarjeta, cuentas) {
  const banco = claveDeBanco(tarjeta.banco);
  const delMismoBanco = banco ? cuentas.find((c) => claveDeBanco(c.banco) === banco) : null;
  const cuenta = delMismoBanco || cuentas[0];
  return cuenta ? referenciaCuenta(cuenta.id) : MEDIO_EFECTIVO;
}

/** Ventana para pagar una tarjeta: contado, mínimo u otro monto, y desde dónde. */
export function abrirPagoTarjeta(mes, pago) {
  const { cuentas } = leer().datos;
  const tarjeta = pago.registro;
  const { contado, minimo } = opcionesDePago(tarjeta);
  const opciones = [[TIPO_PAGO_TARJETA.CONTADO, 'Pago de contado', dinero(contado)]];
  if (minimo !== null) opciones.push([TIPO_PAGO_TARJETA.MINIMO, 'Pago mínimo', dinero(minimo)]);
  opciones.push([TIPO_PAGO_TARJETA.OTRO, 'Otro monto']);

  abrirFormulario({
    titulo: `Pagar ${nombreTarjeta(tarjeta)}`,
    intro: `Saldo de ${dinero(contado)}. Lo que paguen se resta del saldo.`,
    campos: [
      { nombre: 'tipo', etiqueta: '¿Cuánto pagaron?', tipo: 'opciones', opciones, porDefecto: TIPO_PAGO_TARJETA.CONTADO },
      {
        nombre: 'monto',
        etiqueta: 'Monto pagado',
        tipo: 'dinero',
        requerido: true,
        mostrarSi: ['tipo', TIPO_PAGO_TARJETA.OTRO],
      },
      ...(cuentas.length
        ? [
            {
              nombre: 'desde',
              etiqueta: '¿De dónde salió el dinero?',
              tipo: 'lista',
              opciones: [
                ...cuentas.map((c) => [referenciaCuenta(c.id), nombreCuenta(c)]),
                [MEDIO_EFECTIVO, 'Efectivo u otra cuenta'],
              ],
              porDefecto: cuentaSugerida(tarjeta, cuentas),
              ayuda: 'Se resta del saldo de esa cuenta.',
            },
          ]
        : []),
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, porDefecto: fechaSugerida(pago) },
    ],
    textoGuardar: 'Registrar pago',
    validar: (v) => {
      if (v.tipo === TIPO_PAGO_TARJETA.OTRO) {
        if (!(v.monto > 0)) return 'Escribí cuánto pagaron.';
        if (v.monto > contado + 0.004) return `El saldo es ${dinero(contado)}; no pueden pagar más.`;
      }
      return validarFecha(v);
    },
    alGuardar: (v) =>
      registrarPago(mes, pago.clave, {
        tipo: v.tipo,
        monto: redondear(v.monto || 0),
        desde: v.desde || MEDIO_EFECTIVO,
        fecha: v.fecha,
      }),
  });
}

export const acciones = {
  'marcar-pago': (boton) => {
    const { mes, clave } = boton.dataset;
    const pago = pagosDelMes(leer().datos, mes, inicioDelDia()).find((p) => p.clave === clave);
    if (!pago) return;
    if (pago.pagado) {
      if (pago.tipo === TIPO_PAGO.TARJETA && !pago.registrado) {
        // Se pagó con una transferencia: se quita borrando el movimiento, no aquí.
        avisar('Esta tarjeta se pagó con una transferencia. Para quitarla, bórrenla en Movimientos (abajo, en Pagos).', 5000);
        return;
      }
      registrarPago(mes, clave);
      return;
    }
    if (pago.tipo === TIPO_PAGO.TARJETA) {
      abrirPagoTarjeta(mes, pago);
      return;
    }
    if (pago.tipo === TIPO_PAGO.PLAZO && !pago.porPlanilla) {
      abrirPagoCuota(mes, pago);
      return;
    }
    registrarPago(mes, clave);
  },
};
