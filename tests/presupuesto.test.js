import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pagosDelMes,
  resumenDelMes,
  planificarPago,
  ingresoTotalMensual,
  ingresoDelMes,
  depositoPorPago,
  diasDePago,
  endeudamiento,
  nivelDeDeuda,
  proximosIngresos,
} from '../js/domain/presupuesto.js';

const HOY = new Date(2026, 9, 19); // 19 de octubre de 2026
const MES = '2026-10';

function datosDePrueba() {
  return {
    personas: [
      { id: 'ana', nombre: 'Ana', salarioBruto: 950, tipo: 'asalariado', frecuencia: 'quincenal', diaQuincena1: 5, diaQuincena2: 20 },
      { id: 'luis', nombre: 'Luis', salarioBruto: 600, tipo: 'asalariado', frecuencia: 'mensual', diaPago: 30 },
    ],
    ingresos: [
      { id: 'r1', nombre: 'Remesa', monto: 150, frecuencia: 'mensual', dia: 5 },
      { id: 'v1', nombre: 'Venta de ropa', monto: 40, frecuencia: 'unica', fecha: '2026-10-12' },
      { id: 'v2', nombre: 'Servicio', monto: 60, frecuencia: 'unica', fecha: '2026-11-03' },
    ],
    tarjetas: [
      { id: 't1', banco: 'Banco Agrícola', limite: 1500, saldo: 185.4, pagoMinimo: 25, tasa: 34.9, corte: 20, pago: 5 },
    ],
    plazos: [
      { id: 'cel', descripcion: 'Celular', metodo: 'tarjeta:t1', cuota: 35, total: 12, pagadas: 4, dia: 5 },
      { id: 'refri', descripcion: 'Refrigeradora', metodo: 'efectivo', cuota: 48.75, total: 24, pagadas: 23, dia: 12 },
      { id: 'coop', descripcion: 'Préstamo', metodo: 'planilla', personaId: 'luis', cuota: 95, total: 36, pagadas: 10, dia: 30 },
    ],
    fijos: [{ id: 'luz', nombre: 'Luz', monto: 32, dia: 20 }],
    pagados: {},
    gastos: { [MES]: [{ id: 'g1', monto: 20, medio: 'efectivo' }, { id: 'g2', monto: 15, medio: 'tarjeta:t1' }] },
  };
}

test('ingreso fijo del hogar: salarios netos y la remesa, sin ventas sueltas', () => {
  // Ana $950 → neto 804.69; Luis $600 → neto 538.50; remesa 150.
  assert.equal(ingresoTotalMensual(datosDePrueba()), 1493.19);
});

test('ingreso del mes suma las ventas y servicios de ese mes', () => {
  assert.equal(ingresoDelMes(datosDePrueba(), MES), 1533.19);
  assert.equal(ingresoDelMes(datosDePrueba(), '2026-11'), 1553.19);
});

test('días de pago: quincena con días elegidos', () => {
  const [ana, luis] = datosDePrueba().personas;
  assert.deepEqual(diasDePago(ana), [5, 20]);
  assert.deepEqual(diasDePago(luis), [30]);
  assert.deepEqual(diasDePago({ frecuencia: 'quincenal' }), [15, 30]);
});

test('lo depositado descuenta la planilla de quien la tiene', () => {
  const datos = datosDePrueba();
  assert.equal(depositoPorPago(datos.personas[1], datos), 443.5); // 538.50 − 95
  assert.equal(depositoPorPago(datos.personas[0], datos), 402.35); // 804.69 / 2
});

test('cada cuota sale por separado, también la que se paga con tarjeta', () => {
  const pagos = pagosDelMes(datosDePrueba(), MES, HOY);
  assert.deepEqual(
    pagos.map((p) => `${p.clave}:${p.monto}`),
    ['plazo_cel:35', 'tarjeta_t1:185.4', 'plazo_refri:48.75', 'fijo_luz:32', 'plazo_coop:95'],
  );
  assert.equal(pagos.find((p) => p.clave === 'tarjeta_t1').minimo, 25);
});

test('el resumen no resta lo que se carga a tarjeta', () => {
  const r = resumenDelMes(datosDePrueba(), MES, HOY);
  assert.equal(r.compromisos, 396.15);
  assert.equal(r.gastosEfectivo, 20);
  assert.equal(r.gastosTarjeta, 15);
  assert.equal(r.disponible, 1117.04); // 1533.19 − 396.15 − 20
});

test('pagar una cuota con más de lo que toca la abona completa', () => {
  const plan = planificarPago(datosDePrueba(), MES, 'plazo_refri', HOY, { monto: 48.75, medio: 'efectivo' });
  assert.deepEqual(plan.plazos, [{ id: 'refri', deltaAbonado: 48.75 }]);
  assert.deepEqual(plan.pagados.plazo_refri, { fecha: '2026-10-19', monto: 48.75, medio: 'efectivo' });
  assert.equal(plan.plazosTerminados[0].id, 'refri');
});

test('pagar una cuota con tarjeta la suma al saldo de la tarjeta', () => {
  const plan = planificarPago(datosDePrueba(), MES, 'plazo_cel', HOY, { monto: 50, medio: 'tarjeta:t1' });
  assert.deepEqual(plan.plazos, [{ id: 'cel', deltaAbonado: 50 }]);
  assert.deepEqual(plan.tarjetas, [{ id: 't1', deltaSaldo: 50 }]);
});

test('la cuota pagada con tarjeta no se resta dos veces del mes', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = { plazo_cel: { fecha: '2026-10-05', monto: 35, medio: 'tarjeta:t1' } };
  const r = resumenDelMes(datos, MES, HOY);
  assert.equal(r.pagadoConTarjeta, 35);
  assert.equal(r.disponible, 1152.04);
});

test('desmarcar una cuota devuelve el abono y el saldo de la tarjeta', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = { plazo_cel: { fecha: '2026-10-05', monto: 50, medio: 'tarjeta:t1' } };
  const plan = planificarPago(datos, MES, 'plazo_cel', HOY);
  assert.equal(plan.desmarcado, true);
  assert.deepEqual(plan.plazos, [{ id: 'cel', deltaAbonado: -50 }]);
  assert.deepEqual(plan.tarjetas, [{ id: 't1', deltaSaldo: -50 }]);
  assert.equal(plan.pagados.plazo_cel, null);
});

test('pagar la tarjeta: contado, mínimo u otro monto', () => {
  const datos = datosDePrueba();
  const contado = planificarPago(datos, MES, 'tarjeta_t1', HOY, { tipo: 'contado' });
  assert.deepEqual(contado.tarjetas, [{ id: 't1', deltaSaldo: -185.4 }]);
  assert.deepEqual(contado.pagados.tarjeta_t1, { fecha: '2026-10-19', monto: 185.4, tipo: 'contado' });
  const minimo = planificarPago(datos, MES, 'tarjeta_t1', HOY, { tipo: 'minimo' });
  assert.deepEqual(minimo.tarjetas, [{ id: 't1', deltaSaldo: -25 }]);
  const otro = planificarPago(datos, MES, 'tarjeta_t1', HOY, { tipo: 'otro', monto: 100 });
  assert.equal(otro.pagados.tarjeta_t1.monto, 100);
  assert.equal(otro.plazos.length, 0, 'ya no toca las cuotas');
});

test('la tarjeta pagada muestra lo que se pagó', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = { tarjeta_t1: { fecha: '2026-10-05', monto: 25, tipo: 'minimo' } };
  const pago = pagosDelMes(datos, MES, HOY).find((p) => p.clave === 'tarjeta_t1');
  assert.equal(pago.monto, 25);
  assert.equal(pago.tipoDePago, 'minimo');
});

test('desmarcar un pago de tarjeta de la primera versión revierte sus cuotas', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = {
    tarjeta_t1: { fecha: '2026-10-05', monto: 185.4, cuotas: 35, plazos: ['cel'] },
    plazo_cel: { fecha: '2026-10-05', via: 'tarjeta_t1' },
  };
  const plan = planificarPago(datos, MES, 'tarjeta_t1', HOY);
  assert.deepEqual(plan.tarjetas, [{ id: 't1', deltaSaldo: 185.4 }]);
  assert.deepEqual(plan.plazos, [{ id: 'cel', deltaPagadas: -1 }]);
  assert.equal(plan.pagados.plazo_cel, null);
  const cuota = planificarPago(datos, MES, 'plazo_cel', HOY);
  assert.ok(cuota.bloqueado, 'la cuota sola no se desmarca');
});

test('un registro borrado no genera plan', () => {
  assert.equal(planificarPago(datosDePrueba(), MES, 'fijo_noexiste', HOY), null);
});

test('endeudamiento y nivel', () => {
  const e = endeudamiento(datosDePrueba());
  assert.equal(e.cuotas, 178.75);
  assert.equal(e.minimos, 25);
  assert.equal(nivelDeDeuda(0.2), 'saludable');
  assert.equal(nivelDeDeuda(0.35), 'cuidado');
  assert.equal(nivelDeDeuda(0.5), 'alto');
});

test('próximos ingresos con los días de quincena elegidos y ventas futuras', () => {
  const lista = proximosIngresos(datosDePrueba(), HOY);
  assert.ok(lista.every((e) => e.fecha >= HOY));
  const primeros = lista.slice(0, 3).map((e) => `${e.fecha.getDate()}/${e.fecha.getMonth() + 1} ${e.tipo}`);
  assert.deepEqual(primeros, ['20/10 salario', '30/10 salario', '3/11 unico']);
});
