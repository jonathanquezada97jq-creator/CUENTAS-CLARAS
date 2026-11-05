import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelLector, milisegundos, nombreCorto } from '../js/domain/lector.js';

const AHORA = Date.parse('2026-11-03T23:40:00Z');
const haceMinutos = (m) => new Date(AHORA - m * 60000).toISOString();

const cuentas = [
  {
    cuenta: 'jonathan@gmail.com',
    ultimaRevision: haceMinutos(2),
    solicitud: 's1',
    estado: 'listo',
    nuevos: 3,
    yaEstaban: 2,
    sinTarjeta: 1,
    posiblesRepetidos: ['2026-11-01 · $2.00 · PUMA DIDEA'],
  },
  { cuenta: 'maria@gmail.com', ultimaRevision: haceMinutos(4), solicitud: 's0', estado: 'listo' },
];

test('sin lector instalado', () => {
  const r = estadoDelLector({ solicitud: null, cuentas: [] }, '2026-11', AHORA);
  assert.equal(r.instalado, false);
  assert.equal(r.ocupado, false);
});

test('cada cuenta con su estado respecto al pedido del mes', () => {
  const r = estadoDelLector({ solicitud: { id: 's1', mes: '2026-11' }, cuentas }, '2026-11', AHORA);
  assert.equal(r.instalado, true);
  const [jonathan, maria] = r.cuentas;
  assert.equal(jonathan.nombre, 'jonathan');
  assert.equal(jonathan.estado, 'listo');
  assert.deepEqual(jonathan.resultado.posiblesRepetidos, ['2026-11-01 · $2.00 · PUMA DIDEA']);
  assert.equal(maria.estado, 'esperando', 'todavía no atendió el pedido nuevo');
  assert.equal(r.ocupado, true);
});

test('un pedido de otro mes no cuenta para el mes que se ve', () => {
  const r = estadoDelLector({ solicitud: { id: 's1', mes: '2026-10' }, cuentas }, '2026-11', AHORA);
  assert.equal(r.pedido, null);
  assert.ok(r.cuentas.every((c) => c.estado === 'sin-pedido'));
});

test('un lector que no revisa hace mucho se ve apagado y no bloquea el botón', () => {
  const viejas = [{ cuenta: 'maria@gmail.com', ultimaRevision: haceMinutos(90), solicitud: 's0' }];
  const r = estadoDelLector({ solicitud: { id: 's1', mes: '2026-11' }, cuentas: viejas }, '2026-11', AHORA);
  assert.equal(r.cuentas[0].apagado, true);
  assert.equal(r.cuentas[0].minutos, 90);
  assert.equal(r.ocupado, false);
});

test('ayudantes', () => {
  assert.equal(nombreCorto('ana.lopez@gmail.com'), 'ana.lopez');
  assert.equal(milisegundos({ toMillis: () => 5 }), 5);
  assert.equal(milisegundos('2026-11-03T00:00:00Z'), Date.parse('2026-11-03T00:00:00Z'));
  assert.equal(milisegundos(null), null);
});

test('los avisos que no se pudieron anotar se muestran aunque no haya pedido', () => {
  const lector = {
    solicitud: null,
    cuentas: [{ cuenta: 'ana@gmail.com', ultimaRevision: new Date(AHORA - 60000).toISOString(), avisosPendientes: ['2026-11-04 · Sin leer: "Transferencia" de BAC', 7] }],
  };
  const r = estadoDelLector(lector, '2026-11', AHORA);
  assert.deepEqual(r.cuentas[0].pendientes, ['2026-11-04 · Sin leer: "Transferencia" de BAC']);
});

/* ---------- Borrar lo leído y volver a leer ---------- */
import { planDeRelectura, relecturaVacia } from '../js/domain/lector.js';

test('borrar lo leído del mes: lo del correo se borra (también lo ya borrado) y se devuelven los saldos', () => {
  const MES = '2026-11';
  const datos = {
    tarjetas: [{ id: 'atl', saldo: 300 }],
    cuentas: [{ id: 'cusca', saldo: 100 }, { id: 'bac', saldo: 50 }],
    gastos: {
      [MES]: [
        { id: 'correo-1', origen: 'correo', medio: 'cuenta:bac', monto: 3 }, // compra con débito, visible
        { id: 'correo-2', origen: 'correo', medio: 'tarjeta:atl', monto: 10, descartado: true }, // la borraron
        { id: 'correo-3', origen: 'correo', medio: 'tarjeta:atl', monto: 120, descartado: true, enlazadoA: 'pago:fijo_uni' },
        { id: 'a-mano', medio: 'tarjeta:atl', monto: 2.5, correoId: 'abc' },
        { id: 'a-mano-borrado', medio: 'efectivo', monto: 4, correoId: 'def', descartado: true },
        { id: 'solo-a-mano', medio: 'efectivo', monto: 7 },
      ],
    },
    movimientos: {
      [MES]: [
        { id: 'ref-A', origen: 'correo', desde: 'cuenta:bac', hacia: 'cuenta:cusca', monto: 0.55 },
        { id: 'ref-B', origen: 'correo', desde: 'cuenta:cusca', hacia: 'tarjeta:atl', monto: 0.55, descartado: true },
        { id: 'mano', desde: 'cuenta:cusca', hacia: 'cuenta:bac', monto: 40, referencias: ['ref-C'], lados: ['sale'] },
        { id: 'mano-sola', desde: 'cuenta:cusca', hacia: 'cuenta:bac', monto: 5 },
      ],
    },
    pagados: {
      [MES]: {
        fijo_uni: { fecha: '2026-11-05', monto: 120, medio: 'tarjeta:atl', origen: 'correo' },
        tarjeta_atl: { monto: 50, tipo: 'minimo', desde: 'cuenta:cusca', correo: 'ref-D' },
        fijo_luz: { fecha: '2026-11-01', monto: 30, medio: 'efectivo' },
      },
    },
  };
  const plan = planDeRelectura(datos, MES);
  assert.deepEqual(plan.borrarGastos, ['correo-1', 'correo-2', 'correo-3', 'a-mano-borrado']);
  assert.deepEqual(plan.desenlazarGastos, ['a-mano']);
  assert.deepEqual(plan.borrarMovimientos, ['ref-A', 'ref-B']);
  assert.deepEqual(plan.desenlazarMovimientos, ['mano']);
  assert.deepEqual(plan.desmarcarPagos, ['fijo_uni']);
  assert.deepEqual(plan.desenlazarPagos, ['tarjeta_atl']);
  // BAC: +3 (vuelve la compra con débito) +0.55 (vuelve la transferencia que salió);
  // Cuscatlán: −0.55 (se quita lo que le había entrado);
  // Atlántida: −120 (la universidad que se cargó a la tarjeta).
  const porId = (lista) => Object.fromEntries(lista.map(({ id, deltaSaldo }) => [id, deltaSaldo]));
  assert.deepEqual(porId(plan.saldos.cuentas), { bac: 3.55, cusca: -0.55 });
  assert.deepEqual(porId(plan.saldos.tarjetas), { atl: -120 });
  assert.deepEqual(plan.conteo, { gastos: 1, movimientos: 1, pagos: 1 });
  assert.equal(relecturaVacia(plan), false);
  assert.equal(relecturaVacia(planDeRelectura({ tarjetas: [], cuentas: [], gastos: {}, movimientos: {}, pagados: {} }, MES)), true);
});
