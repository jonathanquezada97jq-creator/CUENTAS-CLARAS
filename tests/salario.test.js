import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSalario, calcularAguinaldo, calcularRenta } from '../js/domain/salario.js';

const enPlanilla = (salarioBruto, extra = {}) => ({ salarioBruto, tipo: 'asalariado', ...extra });

// Montos de referencia publicados con la tabla de retención vigente desde mayo de 2025.
const CASOS = [
  { bruto: 408.8, isss: 12.26, afp: 29.64, renta: 0, neto: 366.9, tramo: 'I' },
  { bruto: 600, isss: 18, afp: 43.5, renta: 0, neto: 538.5, tramo: 'I' },
  { bruto: 750, isss: 22.5, afp: 54.38, renta: 29.98, neto: 643.14, tramo: 'II' },
  { bruto: 800, isss: 24, afp: 58, renta: 34.47, neto: 683.53, tramo: 'II' },
  { bruto: 1000, isss: 30, afp: 72.5, renta: 60.45, neto: 837.05, tramo: 'III' },
  { bruto: 1500, isss: 30, afp: 108.75, renta: 153.2, neto: 1208.05, tramo: 'III' },
  { bruto: 2000, isss: 30, afp: 145, renta: 245.95, neto: 1579.05, tramo: 'III' },
];

for (const caso of CASOS) {
  test(`salario de $${caso.bruto} en planilla`, () => {
    const r = calcularSalario(enPlanilla(caso.bruto));
    assert.equal(r.isss, caso.isss);
    assert.equal(r.afp, caso.afp);
    assert.equal(r.renta, caso.renta);
    assert.equal(r.neto, caso.neto);
    assert.equal(r.tramo, caso.tramo);
  });
}

test('el ISSS no pasa de $30 al mes', () => {
  assert.equal(calcularSalario(enPlanilla(5000)).isss, 30);
});

test('tramo IV arriba de $2,038.10 gravados', () => {
  const r = calcularSalario(enPlanilla(3000));
  assert.equal(r.tramo, 'IV');
  assert.equal(r.renta, 502.89);
});

test('la renta empieza a retenerse arriba de $550', () => {
  assert.deepEqual(calcularRenta(550), { tramo: 'I', monto: 0 });
  assert.equal(calcularRenta(550.01).tramo, 'II');
});

test('deducción de $1,600 solo si gana hasta $9,100 al año', () => {
  assert.equal(calcularSalario(enPlanilla(700, { deduccion1600: true })).renta, 0);
  assert.equal(calcularSalario(enPlanilla(700)).renta, 25.5);
  assert.equal(calcularSalario(enPlanilla(800, { deduccion1600: true })).renta, 34.47);
});

test('servicios profesionales: 10 % de retención y sin ISSS ni AFP', () => {
  const r = calcularSalario({ salarioBruto: 1000, tipo: 'servicios' });
  assert.equal(r.isss, 0);
  assert.equal(r.afp, 0);
  assert.equal(r.renta, 100);
  assert.equal(r.neto, 900);
});

test('sin descuentos: el neto es el bruto', () => {
  assert.equal(calcularSalario({ salarioBruto: 650, tipo: 'sin' }).neto, 650);
});

test('aguinaldo según años de servicio al 12 de diciembre', () => {
  const persona = (fechaIngreso) => enPlanilla(950, { fechaIngreso });
  assert.equal(calcularAguinaldo(persona('2024-03-01'), 2026).dias, 15);
  assert.equal(calcularAguinaldo(persona('2022-03-01'), 2026).dias, 19);
  assert.equal(calcularAguinaldo(persona('2016-12-12'), 2026).dias, 21);
  assert.equal(calcularAguinaldo(persona('2016-12-13'), 2026).dias, 19);
});

test('aguinaldo de 19 días con $950', () => {
  const ag = calcularAguinaldo(enPlanilla(950, { fechaIngreso: '2022-03-01' }), 2026);
  assert.equal(ag.monto, 601.67);
  assert.equal(ag.exentoHasta, 1500);
  assert.equal(ag.excedente, 0);
});

test('aguinaldo proporcional con menos de un año', () => {
  const ag = calcularAguinaldo(enPlanilla(950, { fechaIngreso: '2026-06-12' }), 2026);
  assert.equal(ag.proporcional, true);
  assert.ok(ag.dias > 7 && ag.dias < 8);
});

test('sin fecha de ingreso o fuera de planilla no hay aguinaldo', () => {
  assert.equal(calcularAguinaldo(enPlanilla(950), 2026), null);
  assert.equal(
    calcularAguinaldo({ salarioBruto: 950, tipo: 'servicios', fechaIngreso: '2020-01-01' }, 2026),
    null,
  );
});
