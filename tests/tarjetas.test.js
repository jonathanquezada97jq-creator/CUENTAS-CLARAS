import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  opcionesDePago,
  montoDeOpcion,
  siPaganElMinimo,
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
  ...extra,
});

test('opciones de pago: contado y mínimo', () => {
  assert.deepEqual(opcionesDePago(tarjeta()), { contado: 600, minimo: 45 });
  assert.deepEqual(opcionesDePago(tarjeta({ pagoMinimo: '' })), { contado: 600, minimo: null });
  assert.deepEqual(opcionesDePago(tarjeta({ saldo: 30 })), { contado: 30, minimo: 30 }, 'el mínimo no pasa del saldo');
});

test('monto según la opción elegida al pagar', () => {
  assert.equal(montoDeOpcion(tarjeta(), 'contado'), 600);
  assert.equal(montoDeOpcion(tarjeta(), 'minimo'), 45);
  assert.equal(montoDeOpcion(tarjeta(), 'otro', 120.5), 120.5);
});

test('qué pasa si solo pagan el mínimo', () => {
  const r = siPaganElMinimo(tarjeta({ saldo: 610 }));
  assert.equal(r.financiado, 565);
  assert.equal(r.interesMes, 17.66);
  assert.deepEqual(r.liquidacion, { meses: 18, intereses: 195.73 });
  assert.equal(siPaganElMinimo(tarjeta({ tasa: '' })), null);
});

test('el uso cuenta las cuotas que faltan de compras hechas con la tarjeta', () => {
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
