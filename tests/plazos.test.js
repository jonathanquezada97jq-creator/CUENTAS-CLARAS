import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cuotaDelMes,
  cuotasPagadas,
  cuotasPendientes,
  estaActivo,
  mesDeLaUltimaCuota,
  montoPagado,
  saldoPendiente,
} from '../js/domain/plazos.js';

const refri = (extra = {}) => ({ cuota: 48.75, total: 24, pagadas: 10, ...extra });

test('sin abonos: cuenta por cuotas', () => {
  assert.equal(saldoPendiente(refri()), 682.5);
  assert.equal(cuotasPendientes(refri()), 14);
  assert.equal(cuotasPagadas(refri()), 10);
});

test('un abono mayor a la cuota baja lo que falta', () => {
  const p = refri({ abonado: 100 });
  assert.equal(montoPagado(p), 587.5);
  assert.equal(saldoPendiente(p), 582.5);
  assert.equal(cuotasPendientes(p), 12, '582.50 / 48.75 = 11.9 → 12 cuotas');
  assert.equal(cuotasPagadas(p), 12);
});

test('la última cuota es lo que falta si es menos que la cuota', () => {
  const p = refri({ pagadas: 23, abonado: 30 });
  assert.equal(saldoPendiente(p), 18.75);
  assert.equal(cuotaDelMes(p), 18.75);
});

test('terminado cuando no falta nada', () => {
  assert.equal(estaActivo(refri({ pagadas: 24 })), false);
  assert.equal(estaActivo(refri({ pagadas: 20, abonado: 195 })), false);
  assert.equal(cuotasPendientes(refri({ pagadas: 20, abonado: 500 })), 0, 'pagar de más no da negativo');
});

test('mes de la última cuota', () => {
  assert.equal(mesDeLaUltimaCuota(refri(), '2026-10', false), '2027-11');
  assert.equal(mesDeLaUltimaCuota(refri(), '2026-10', true), '2027-12');
  assert.equal(mesDeLaUltimaCuota(refri({ pagadas: 24 }), '2026-10', false), null);
});
