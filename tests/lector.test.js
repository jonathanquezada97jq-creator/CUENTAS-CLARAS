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
