import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pagosDelMes,
  resumenDelMes,
  planificarPago,
  ingresoTotalMensual,
  depositoPorPago,
  endeudamiento,
  nivelDeDeuda,
  proximosIngresos,
} from '../js/domain/presupuesto.js';

const HOY = new Date(2026, 9, 19); // 19 de octubre de 2026
const MES = '2026-10';

function datosDePrueba() {
  return {
    personas: [
      { id: 'ana', nombre: 'Ana', salarioBruto: 950, tipo: 'asalariado', frecuencia: 'quincenal' },
      { id: 'luis', nombre: 'Luis', salarioBruto: 600, tipo: 'asalariado', frecuencia: 'mensual', diaPago: 30 },
    ],
    ingresos: [{ id: 'r1', nombre: 'Remesa', monto: 150, frecuencia: 'mensual', dia: 5 }],
    tarjetas: [
      { id: 't1', banco: 'Banco Agrícola', limite: 1500, saldo: 185.4, pagoMinimo: 25, plan: 'total', corte: 20, pago: 5 },
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

test('ingreso del hogar: suma de los dos salarios netos y la remesa', () => {
  // Ana $950 → neto 804.69; Luis $600 → neto 538.50; remesa 150.
  assert.equal(ingresoTotalMensual(datosDePrueba()), 1493.19);
});

test('lo depositado descuenta la planilla de quien la tiene', () => {
  const datos = datosDePrueba();
  assert.equal(depositoPorPago(datos.personas[1], datos), 443.5); // 538.50 − 95
  assert.equal(depositoPorPago(datos.personas[0], datos), 402.35); // 804.69 / 2
});

test('la cuota a plazo de una tarjeta se suma al pago de esa tarjeta', () => {
  const pagos = pagosDelMes(datosDePrueba(), MES, HOY);
  const tarjeta = pagos.find((p) => p.clave === 'tarjeta_t1');
  assert.equal(tarjeta.monto, 220.4);
  assert.equal(tarjeta.cuotasIncluidas.length, 1);
  assert.ok(!pagos.some((p) => p.clave === 'plazo_cel'), 'no aparece sola');
  assert.deepEqual(
    pagos.map((p) => p.clave),
    ['tarjeta_t1', 'plazo_refri', 'fijo_luz', 'plazo_coop'],
  );
});

test('el resumen no resta lo gastado con tarjeta', () => {
  const r = resumenDelMes(datosDePrueba(), MES, HOY);
  assert.equal(r.compromisos, 396.15);
  assert.equal(r.gastosEfectivo, 20);
  assert.equal(r.gastosTarjeta, 15);
  assert.equal(r.disponible, 1077.04);
});

test('un plazo con una cuota pendiente no aparece el mes siguiente', () => {
  const pagos = pagosDelMes(datosDePrueba(), '2026-11', HOY);
  assert.ok(!pagos.some((p) => p.clave === 'plazo_refri'));
});

test('pagar la tarjeta resta del saldo y avanza la cuota del celular', () => {
  const plan = planificarPago(datosDePrueba(), MES, 'tarjeta_t1', HOY);
  assert.deepEqual(plan.tarjetas, [{ id: 't1', deltaSaldo: -185.4 }]);
  assert.deepEqual(plan.plazos, [{ id: 'cel', deltaPagadas: 1 }]);
  assert.deepEqual(plan.pagados.tarjeta_t1, {
    fecha: '2026-10-19',
    monto: 185.4,
    cuotas: 35,
    plazos: ['cel'],
  });
  assert.equal(plan.pagados.plazo_cel.via, 'tarjeta_t1');
});

test('desmarcar la tarjeta devuelve el saldo y la cuota', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = {
    tarjeta_t1: { fecha: '2026-10-05', monto: 185.4, cuotas: 35, plazos: ['cel'] },
    plazo_cel: { fecha: '2026-10-05', via: 'tarjeta_t1' },
  };
  datos.plazos[0].pagadas = 5;
  const plan = planificarPago(datos, MES, 'tarjeta_t1', HOY);
  assert.deepEqual(plan.tarjetas, [{ id: 't1', deltaSaldo: 185.4 }]);
  assert.deepEqual(plan.plazos, [{ id: 'cel', deltaPagadas: -1 }]);
  assert.equal(plan.pagados.tarjeta_t1, null);
  assert.equal(plan.pagados.plazo_cel, null);
});

test('pagar la última cuota avisa que el plazo terminó', () => {
  const plan = planificarPago(datosDePrueba(), MES, 'plazo_refri', HOY);
  assert.equal(plan.plazosTerminados[0].id, 'refri');
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

test('próximos ingresos ordenados desde hoy', () => {
  const lista = proximosIngresos(datosDePrueba(), HOY);
  assert.ok(lista.every((e) => e.fecha >= HOY));
  assert.equal(lista[0].tipo, 'salario');
  assert.equal(lista[0].fecha.getDate(), 30);
});
