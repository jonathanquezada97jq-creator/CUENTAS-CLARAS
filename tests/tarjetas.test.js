import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pagoSegunPlan,
  usoDeTarjeta,
  simularLiquidacion,
  idDeTarjeta,
  referenciaTarjeta,
} from '../js/domain/tarjetas.js';

const tarjeta = (extra = {}) => ({
  id: 't1',
  limite: 1500,
  saldo: 600,
  pagoMinimo: 45,
  tasa: 37.5,
  plan: 'total',
  ...extra,
});

test('pago según el plan elegido', () => {
  assert.equal(pagoSegunPlan(tarjeta()), 600);
  assert.equal(pagoSegunPlan(tarjeta({ plan: 'minimo' })), 45);
  assert.equal(pagoSegunPlan(tarjeta({ plan: 'fijo', planMonto: 100 })), 100);
  assert.equal(pagoSegunPlan(tarjeta({ plan: 'fijo', planMonto: 900 })), 600, 'no pasa del saldo');
});

test('el uso cuenta las cuotas que faltan por cobrar', () => {
  const plazos = [{ id: 'p1', metodo: 'tarjeta:t1', cuota: 35, total: 12, pagadas: 4 }];
  const uso = usoDeTarjeta(tarjeta({ saldo: 200 }), plazos);
  assert.equal(uso.enCuotas, 280);
  assert.equal(uso.usado, 480);
  assert.equal(uso.disponible, 1020);
});

test('simulación de pagar solo una parte', () => {
  assert.deepEqual(simularLiquidacion(610, 37.5, 45), { meses: 18, intereses: 195.73 });
  assert.equal(simularLiquidacion(610, 37.5, 15), null, 'el pago no cubre los intereses');
  assert.deepEqual(simularLiquidacion(100, 0, 30), { meses: 4, intereses: 0 });
});

test('referencias a tarjeta', () => {
  assert.equal(referenciaTarjeta('abc'), 'tarjeta:abc');
  assert.equal(idDeTarjeta('tarjeta:abc'), 'abc');
  assert.equal(idDeTarjeta('efectivo'), null);
  assert.equal(idDeTarjeta(undefined), null);
});
