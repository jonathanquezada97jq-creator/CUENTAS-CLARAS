import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarCuentaPorUltimos,
  cambiosDeSaldo,
  claveDeBanco,
  combinarEfectos,
  efectoDeMedio,
  efectosDeMovimiento,
  flujoDeCuenta,
  idDeCuenta,
  ingresosDeLaCuenta,
  movimientosDelMes,
  pagosATarjeta,
  referenciaCuenta,
  saldoEnCuentas,
  tipoDeMovimiento,
  TIPO_MOVIMIENTO,
} from '../js/domain/cuentas.js';
import { pagosDelMes, planificarPago, resumenDelMes } from '../js/domain/presupuesto.js';
import { crearRespaldo, leerRespaldo } from '../js/domain/respaldo.js';

const HOY = new Date(2026, 10, 3); // 3 de noviembre de 2026
const MES = '2026-11';

function datosDePrueba() {
  return {
    personas: [{ id: 'jona', nombre: 'Jonathan', salarioBruto: 900, frecuencia: 'quincenal', cuentaId: 'cusca' }],
    ingresos: [{ id: 'r1', nombre: 'Remesa', monto: 100, frecuencia: 'mensual', dia: 5, cuentaId: 'bac' }],
    tarjetas: [{ id: 'atl', banco: 'Banco Atlántida', ultimos: '4200', limite: 1000, saldo: 300, pagoMinimo: 25, pago: 10 }],
    cuentas: [
      { id: 'cusca', banco: 'Banco Cuscatlán', ultimos: '1421', debito: '7788', saldo: 500 },
      { id: 'bac', banco: 'BAC', ultimos: '8320', saldo: 200 },
    ],
    plazos: [{ id: 'refri', descripcion: 'Refrigeradora', metodo: 'cuenta:cusca', cuota: 50, total: 10, pagadas: 2, dia: 15 }],
    fijos: [
      { id: 'luz', nombre: 'Luz', monto: 30, dia: 20, medio: 'cuenta:bac' },
      { id: 'agua', nombre: 'Agua', monto: 10, dia: 22 },
    ],
    pagados: {},
    gastos: {},
    movimientos: {},
  };
}

test('referencias de cuenta', () => {
  assert.equal(referenciaCuenta('abc'), 'cuenta:abc');
  assert.equal(idDeCuenta('cuenta:abc'), 'abc');
  assert.equal(idDeCuenta('tarjeta:abc'), null);
  assert.equal(idDeCuenta('efectivo'), null);
});

test('tipo de movimiento según de dónde sale y a dónde va', () => {
  assert.equal(tipoDeMovimiento({ desde: 'cuenta:a', hacia: 'cuenta:b' }), TIPO_MOVIMIENTO.TRANSFERENCIA);
  assert.equal(tipoDeMovimiento({ desde: 'cuenta:a', hacia: 'tarjeta:t' }), TIPO_MOVIMIENTO.PAGO_TARJETA);
  assert.equal(tipoDeMovimiento({ desde: 'efectivo', hacia: 'tarjeta:t' }), TIPO_MOVIMIENTO.PAGO_TARJETA);
  assert.equal(tipoDeMovimiento({ desde: 'externo', hacia: 'cuenta:a' }), TIPO_MOVIMIENTO.DEPOSITO);
  assert.equal(tipoDeMovimiento({ desde: 'cuenta:a', hacia: 'efectivo' }), TIPO_MOVIMIENTO.RETIRO);
  assert.equal(tipoDeMovimiento({ desde: 'cuenta:a', hacia: 'externo' }), TIPO_MOVIMIENTO.RETIRO);
});

test('buscar la cuenta por sus últimos dígitos o por los de su débito', () => {
  const { cuentas } = datosDePrueba();
  assert.equal(buscarCuentaPorUltimos(cuentas, '1421').id, 'cusca');
  assert.equal(buscarCuentaPorUltimos(cuentas, '7788').id, 'cusca');
  assert.equal(buscarCuentaPorUltimos(cuentas, '0000'), null);
  assert.equal(buscarCuentaPorUltimos(cuentas, ''), null);
});

test('saldo en cuentas e ingresos que caen en cada una', () => {
  const datos = datosDePrueba();
  assert.equal(saldoEnCuentas(datos.cuentas), 700);
  const cusca = ingresosDeLaCuenta(datos.cuentas[0], datos);
  assert.deepEqual(cusca.personas.map((p) => p.id), ['jona']);
  assert.deepEqual(ingresosDeLaCuenta(datos.cuentas[1], datos).ingresos.map((i) => i.id), ['r1']);
});

test('efectos: la tarjeta debe más, la cuenta tiene menos, el efectivo no toca saldos', () => {
  assert.deepEqual(efectoDeMedio('tarjeta:atl', 10), { cuentas: {}, tarjetas: { atl: 10 } });
  assert.deepEqual(efectoDeMedio('cuenta:cusca', 10), { cuentas: { cusca: -10 }, tarjetas: {} });
  assert.deepEqual(efectoDeMedio('efectivo', 10), { cuentas: {}, tarjetas: {} });
  assert.deepEqual(efectoDeMedio('cuenta:cusca', 10, -1), { cuentas: { cusca: 10 }, tarjetas: {} });
});

test('efectos de un movimiento: sale de una, entra a otra, baja la deuda de la tarjeta', () => {
  assert.deepEqual(efectosDeMovimiento({ desde: 'cuenta:bac', hacia: 'cuenta:cusca', monto: 0.55 }), {
    cuentas: { bac: -0.55, cusca: 0.55 },
    tarjetas: {},
  });
  assert.deepEqual(efectosDeMovimiento({ desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 100 }), {
    cuentas: { cusca: -100 },
    tarjetas: { atl: -100 },
  });
  assert.deepEqual(efectosDeMovimiento({ desde: 'externo', hacia: 'cuenta:cusca', monto: 400 }, -1), {
    cuentas: { cusca: -400 },
    tarjetas: {},
  });
});

test('editar: se deshace lo anterior y se aplica lo nuevo; solo cambia lo que cambió', () => {
  const datos = datosDePrueba();
  const antes = efectoDeMedio('cuenta:cusca', 20, -1);
  const despues = efectoDeMedio('cuenta:cusca', 25);
  assert.deepEqual(cambiosDeSaldo(combinarEfectos(antes, despues), datos), {
    cuentas: [{ id: 'cusca', deltaSaldo: -5 }],
    tarjetas: [],
  });
  // Mismo monto y mismo medio: no se escribe nada.
  const igual = combinarEfectos(efectoDeMedio('tarjeta:atl', 20, -1), efectoDeMedio('tarjeta:atl', 20));
  assert.deepEqual(cambiosDeSaldo(igual, datos), { cuentas: [], tarjetas: [] });
});

test('no se escribe en cuentas o tarjetas que ya no existen', () => {
  const datos = datosDePrueba();
  const efectos = efectosDeMovimiento({ desde: 'cuenta:borrada', hacia: 'tarjeta:atl', monto: 50 });
  assert.deepEqual(cambiosDeSaldo(efectos, datos), { cuentas: [], tarjetas: [{ id: 'atl', deltaSaldo: -50 }] });
});

test('movimientos del mes sin los descartados, y pagos a cada tarjeta', () => {
  const datos = datosDePrueba();
  datos.movimientos[MES] = [
    { id: 'm1', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 0.55 },
    { id: 'm2', desde: 'cuenta:bac', hacia: 'cuenta:cusca', monto: 0.55 },
    { id: 'm3', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 9, descartado: true },
  ];
  assert.deepEqual(movimientosDelMes(datos, MES).map((m) => m.id), ['m1', 'm2']);
  assert.deepEqual(pagosATarjeta(datos, MES, 'atl').map((m) => m.id), ['m1']);
});

/* ---------- Pagos del mes con cuentas ---------- */

const pagoDe = (datos, clave) => pagosDelMes(datos, MES, HOY).find((p) => p.clave === clave);

test('la tarjeta pagada con una transferencia sale como pagada', () => {
  const datos = datosDePrueba();
  datos.movimientos[MES] = [{ id: 'm1', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 120 }];
  const pago = pagoDe(datos, 'tarjeta_atl');
  assert.equal(pago.pagado, true);
  assert.equal(pago.registrado, false);
  assert.equal(pago.monto, 120);
  assert.equal(pago.desde, 'cuenta:cusca');
  assert.equal(pago.transferencias.length, 1);
});

test('una tarjeta con saldo cero que se pagó por transferencia sigue en la lista', () => {
  const datos = datosDePrueba();
  datos.tarjetas[0].saldo = 0;
  datos.movimientos[MES] = [{ id: 'm1', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 300 }];
  assert.equal(pagoDe(datos, 'tarjeta_atl').monto, 300);
  datos.movimientos[MES] = [];
  assert.equal(pagoDe(datos, 'tarjeta_atl'), undefined);
});

test('pagar la tarjeta desde una cuenta baja las dos; desmarcar las devuelve', () => {
  const datos = datosDePrueba();
  const plan = planificarPago(datos, MES, 'tarjeta_atl', HOY, { tipo: 'contado', desde: 'cuenta:cusca', fecha: '2026-11-03' });
  assert.deepEqual(plan.pagados.tarjeta_atl, { fecha: '2026-11-03', monto: 300, tipo: 'contado', desde: 'cuenta:cusca' });
  assert.deepEqual(plan.tarjetas, [{ id: 'atl', deltaSaldo: -300 }]);
  assert.deepEqual(plan.cuentas, [{ id: 'cusca', deltaSaldo: -300 }]);

  datos.pagados[MES] = { tarjeta_atl: plan.pagados.tarjeta_atl };
  const deshacer = planificarPago(datos, MES, 'tarjeta_atl', HOY);
  assert.equal(deshacer.desmarcado, true);
  assert.deepEqual(deshacer.tarjetas, [{ id: 'atl', deltaSaldo: 300 }]);
  assert.deepEqual(deshacer.cuentas, [{ id: 'cusca', deltaSaldo: 300 }]);
});

test('pagar la tarjeta en efectivo no toca ninguna cuenta', () => {
  const plan = planificarPago(datosDePrueba(), MES, 'tarjeta_atl', HOY, { tipo: 'minimo' });
  assert.equal(plan.pagados.tarjeta_atl.desde, 'efectivo');
  assert.deepEqual(plan.cuentas, []);
  assert.deepEqual(plan.tarjetas, [{ id: 'atl', deltaSaldo: -25 }]);
});

test('cuota pagada con débito sale de la cuenta; desmarcarla la devuelve', () => {
  const datos = datosDePrueba();
  const plan = planificarPago(datos, MES, 'plazo_refri', HOY, { monto: 50, medio: 'cuenta:cusca' });
  assert.deepEqual(plan.cuentas, [{ id: 'cusca', deltaSaldo: -50 }]);
  assert.deepEqual(plan.tarjetas, []);
  assert.deepEqual(plan.plazos, [{ id: 'refri', deltaAbonado: 50 }]);

  datos.pagados[MES] = { plazo_refri: plan.pagados.plazo_refri };
  const deshacer = planificarPago(datos, MES, 'plazo_refri', HOY);
  assert.deepEqual(deshacer.cuentas, [{ id: 'cusca', deltaSaldo: 50 }]);
});

test('gasto fijo que se paga desde una cuenta: baja su saldo al marcarlo', () => {
  const datos = datosDePrueba();
  const luz = planificarPago(datos, MES, 'fijo_luz', HOY, { fecha: '2026-11-20' });
  assert.deepEqual(luz.pagados.fijo_luz, { fecha: '2026-11-20', monto: 30, medio: 'cuenta:bac' });
  assert.deepEqual(luz.cuentas, [{ id: 'bac', deltaSaldo: -30 }]);

  const agua = planificarPago(datos, MES, 'fijo_agua', HOY);
  assert.equal(agua.pagados.fijo_agua.medio, 'efectivo');
  assert.deepEqual(agua.cuentas, []);

  datos.pagados[MES] = { fijo_luz: luz.pagados.fijo_luz, fijo_agua: { fecha: '2026-11-01' } };
  assert.deepEqual(planificarPago(datos, MES, 'fijo_luz', HOY).cuentas, [{ id: 'bac', deltaSaldo: 30 }]);
  // Marcado antes de las cuentas (solo con fecha): se desmarca sin tocar saldos.
  const viejo = planificarPago(datos, MES, 'fijo_agua', HOY);
  assert.equal(viejo.desmarcado, true);
  assert.deepEqual(viejo.cuentas, []);
  assert.equal(pagoDe(datos, 'fijo_luz').medio, 'cuenta:bac');
});

test('si la cuenta se borró, desmarcar no intenta escribir en ella', () => {
  const datos = datosDePrueba();
  datos.pagados[MES] = { plazo_refri: { fecha: '2026-11-03', monto: 50, medio: 'cuenta:vieja' } };
  const plan = planificarPago(datos, MES, 'plazo_refri', HOY);
  assert.deepEqual(plan.cuentas, []);
  assert.deepEqual(plan.plazos, [{ id: 'refri', deltaAbonado: -50 }]);
});

test('el resumen cuenta el débito como dinero que ya salió', () => {
  const datos = datosDePrueba();
  datos.gastos[MES] = [
    { id: 'g1', monto: 10, medio: 'cuenta:cusca' },
    { id: 'g2', monto: 5, medio: 'efectivo' },
    { id: 'g3', monto: 40, medio: 'tarjeta:atl' },
  ];
  const r = resumenDelMes(datos, MES, HOY);
  assert.equal(r.gastosEfectivo, 15);
  assert.equal(r.gastosTarjeta, 40);
});

test('el respaldo guarda y lee cuentas y movimientos', () => {
  const datos = datosDePrueba();
  const respaldo = crearRespaldo(
    {
      ...datos,
      meses: {},
      gastos: [],
      movimientos: [{ id: 'm1', mes: MES, desde: 'cuenta:bac', hacia: 'cuenta:cusca', monto: 1, creadoEn: 'x' }],
    },
    '2026-11-03',
  );
  assert.equal(respaldo.movimientos[0].creadoEn, undefined);
  const leido = leerRespaldo(JSON.parse(JSON.stringify(respaldo)));
  assert.deepEqual(leido.colecciones.cuentas.map((c) => c.id), ['cusca', 'bac']);
  assert.deepEqual(leido.movimientos.map((m) => m.id), ['m1']);
  // Un respaldo de antes de las cuentas se sigue leyendo.
  const viejo = leerRespaldo({ version: 2, personas: [], gastos: [] });
  assert.deepEqual(viejo.colecciones.cuentas, []);
  assert.deepEqual(viejo.movimientos, []);
});

test('lo que entró y salió de una cuenta en el mes', () => {
  const datos = datosDePrueba();
  datos.movimientos[MES] = [
    { id: 'm1', desde: 'cuenta:bac', hacia: 'cuenta:cusca', monto: 0.55 },
    { id: 'm2', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 0.55 },
    { id: 'm3', desde: 'externo', hacia: 'cuenta:cusca', monto: 400, descartado: true },
  ];
  datos.gastos[MES] = [{ id: 'g1', medio: 'cuenta:cusca', monto: 5.25 }, { id: 'g2', medio: 'efectivo', monto: 3 }];
  datos.pagados[MES] = {
    plazo_refri: { monto: 50, medio: 'cuenta:cusca' },
    tarjeta_atl: { monto: 25, tipo: 'minimo', desde: 'cuenta:cusca' },
    fijo_agua: { fecha: '2026-11-01' },
  };
  assert.deepEqual(flujoDeCuenta(datos, MES, 'cusca'), { entro: 0.55, salio: 80.8 });
  assert.deepEqual(flujoDeCuenta(datos, MES, 'bac'), { entro: 0, salio: 0.55 });
});

test('nombres de banco escritos distinto se reconocen como el mismo', () => {
  assert.equal(claveDeBanco('Banco Cuscatlán'), 'cuscatlan');
  assert.equal(claveDeBanco('CUSCATLAN'), 'cuscatlan');
  assert.equal(claveDeBanco('B. ATLANTIDA'), 'atlantida');
  assert.equal(claveDeBanco('Banco Atlántida'), 'atlantida');
  assert.equal(claveDeBanco('Banco de América Central'), 'bac');
  assert.equal(claveDeBanco('BAC'), 'bac');
});
