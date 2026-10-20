import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumarMeses, mesesEntre, fechaDePago, proximaFecha, cuandoEs } from '../js/utils/fechas.js';
import { dinero, redondear, escaparHtml } from '../js/utils/formato.js';
import { leerRespaldo, crearRespaldo } from '../js/domain/respaldo.js';

test('sumar meses cruza el año', () => {
  assert.equal(sumarMeses('2026-11', 3), '2027-02');
  assert.equal(sumarMeses('2026-01', -1), '2025-12');
  assert.equal(mesesEntre('2026-10', '2027-01'), 3);
});

test('un pago el día 31 cae el último día en meses cortos', () => {
  assert.equal(fechaDePago('2027-02', 31).getDate(), 28);
  assert.equal(fechaDePago('2028-02', 31).getDate(), 29);
});

test('próxima fecha de un día del mes', () => {
  const hoy = new Date(2026, 9, 19);
  assert.equal(proximaFecha(20, hoy).getMonth(), 9);
  assert.equal(proximaFecha(5, hoy).getMonth(), 10);
  assert.equal(cuandoEs(new Date(2026, 9, 20), hoy), 'Mañana');
});

test('formato de dinero y redondeo de medio centavo', () => {
  assert.equal(dinero(1234.5), '$1,234.50');
  assert.equal(dinero(-20), '−$20.00');
  assert.equal(redondear(54.375), 54.38);
  assert.equal(escaparHtml('<b>"Ana"</b>'), '&lt;b&gt;&quot;Ana&quot;&lt;/b&gt;');
});

test('convierte el respaldo de la primera versión', () => {
  const v1 = {
    app: 'cuentas-claras',
    v: 1,
    main: {
      perfil: { salarioBruto: 950, tipo: 'asalariado', frecuencia: 'quincenal' },
      ingresos: [],
      tarjetas: [{ id: 't1', banco: 'BAC' }],
      plazos: [{ id: 'p1', metodo: 'planilla' }, { id: 'p2', metodo: 'tarjeta:t1' }],
      fijos: [{ id: 'f1', nombre: 'Luz' }],
      meses: ['2026-10'],
    },
    meses: {
      '2026-10': {
        pagados: {
          'fijo:f1': { f: '2026-10-02' },
          'tarjeta:t1': { monto: 10, cuotas: 0, plazos: ['p2'], f: '2026-10-05' },
          'plazo:p2': { via: 'tarjeta:t1' },
        },
        gastos: [{ id: 'g1', fecha: '2026-10-03', monto: 5 }],
      },
    },
  };
  const r = leerRespaldo(v1, { nombrePersona: 'Jonathan' });
  assert.equal(r.colecciones.personas.length, 1);
  assert.equal(r.colecciones.personas[0].nombre, 'Jonathan');
  assert.equal(r.colecciones.plazos[0].personaId, 'persona-1');
  assert.deepEqual(r.meses['2026-10'].pagados.fijo_f1, { fecha: '2026-10-02' });
  assert.equal(r.meses['2026-10'].pagados.plazo_p2.via, 'tarjeta_t1');
  assert.equal(r.gastos[0].mes, '2026-10');
});

test('el respaldo nuevo se puede volver a leer', () => {
  const respaldo = crearRespaldo(
    {
      personas: [{ id: 'a', nombre: 'Ana', actualizado: { seconds: 1 } }],
      tarjetas: [],
      plazos: [],
      fijos: [],
      ingresos: [],
      meses: { '2026-10': { pagados: { fijo_x: { fecha: '2026-10-01' } } } },
      gastos: [{ id: 'g', mes: '2026-10', monto: 3 }],
    },
    '2026-10-20',
  );
  assert.equal(respaldo.personas[0].actualizado, undefined);
  const leido = leerRespaldo(JSON.parse(JSON.stringify(respaldo)));
  assert.equal(leido.colecciones.personas[0].nombre, 'Ana');
  assert.equal(leido.gastos.length, 1);
});

test('rechaza un texto que no es respaldo', () => {
  assert.throws(() => leerRespaldo({ hola: 1 }), /no es un respaldo/);
});
