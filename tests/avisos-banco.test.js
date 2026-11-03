/**
 * Pruebas del lector de avisos del banco (apps-script/Codigo.gs).
 * El archivo corre en Google Apps Script; aquí se cargan solo sus funciones
 * puras para comprobar que lee bien distintos formatos de correo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const codigo = readFileSync(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8');
const { leerAviso, adivinarCategoria, aNumero_, buscarParecido, limitesDelMes, claveDeCuenta } =
  vm.runInNewContext(
    `${codigo}\n;({ leerAviso, adivinarCategoria, aNumero_, buscarParecido, limitesDelMes, claveDeCuenta })`,
    {},
  );

test('aviso en una oración (estilo SMS o correo corto)', () => {
  const aviso = leerAviso(
    'Banco Agrícola le informa: Compra aprobada por USD 2.00 en PUMA DIDEA con su tarjeta terminada en 1234 el 03/11/2026 a las 05:01.',
  );
  assert.deepEqual({ ...aviso }, { tipo: 'cargo', monto: 2, ultimos: '1234', comercio: 'PUMA DIDEA' });
});

test('aviso en tabla con "Comercio:" y "Monto:"', () => {
  const aviso = leerAviso(`Notificación de transacción
Estimado cliente, se ha realizado una transacción con su tarjeta.
Comercio: SUPER SELECTOS ESCALON
Ciudad: SAN SALVADOR
Tarjeta: VISA ************5678
Monto: USD 45.30
Fecha: 03/11/2026 12:10
Autorización: 123456
Saldo disponible: USD 1,254.70`);
  assert.equal(aviso.monto, 45.3);
  assert.equal(aviso.ultimos, '5678');
  assert.equal(aviso.comercio, 'SUPER SELECTOS ESCALON');
});

test('tabla con la etiqueta en una línea y el valor en la siguiente', () => {
  const aviso = leerAviso('Detalle de su compra\nComercio\nPOLLO CAMPERO METROCENTRO\nMonto\n$12.50\nTarjeta\nXXXX-XXXX-XXXX-9012');
  assert.equal(aviso.monto, 12.5);
  assert.equal(aviso.ultimos, '9012');
  assert.equal(aviso.comercio, 'POLLO CAMPERO METROCENTRO');
});

test('no toma el saldo disponible como monto de la compra', () => {
  const aviso = leerAviso('Saldo disponible $1,500.00. Consumo de $8.75 en STARBUCKS. Tarjeta ****4321');
  assert.equal(aviso.monto, 8.75);
  assert.equal(aviso.comercio, 'STARBUCKS');
});

test('compras rechazadas, reversiones y pagos a la tarjeta no se anotan', () => {
  assert.equal(leerAviso('Su compra por $20.00 en AMAZON con tarjeta terminada en 1234 fue rechazada.').tipo, 'ignorar');
  assert.equal(leerAviso('Hemos recibido su pago de $150.00 a su tarjeta terminada en 1234.').tipo, 'ignorar');
  assert.equal(leerAviso('Reversión de compra por USD 5.00 en UBER, tarjeta terminada en 1234').tipo, 'ignorar');
});

test('correos de publicidad no son avisos', () => {
  assert.equal(leerAviso('¡Aprovecha! Compra hoy y obtén 20% de descuento en tu próxima compra.'), null);
  assert.equal(leerAviso('Tu estado de cuenta de octubre ya está disponible.'), null);
});

test('números con distintos separadores', () => {
  assert.equal(aNumero_('1,234.56'), 1234.56);
  assert.equal(aNumero_('1.234,56'), 1234.56);
  assert.equal(aNumero_('2,00'), 2);
  assert.equal(aNumero_('2.00'), 2);
});

test('categoría según el comercio', () => {
  assert.equal(adivinarCategoria('PUMA DIDEA'), 'Transporte y gasolina');
  assert.equal(adivinarCategoria('SUPER SELECTOS ESCALON'), 'Súper y comida');
  assert.equal(adivinarCategoria('FARMACIA SAN NICOLAS'), 'Salud y farmacia');
  assert.equal(adivinarCategoria('POLLO CAMPERO METROCENTRO'), 'Comida fuera');
  assert.equal(adivinarCategoria('ALGO RARO SA DE CV'), 'Otros');
});

test('detecta una compra que ya se anotó a mano (mismo monto, ±1 día)', () => {
  const gastos = [
    { id: 'manual1', monto: 2, fecha: '2026-11-02', origen: undefined },
    { id: 'correo-x', monto: 2, fecha: '2026-11-03', origen: 'correo' },
    { id: 'manual2', monto: 15, fecha: '2026-11-03', descartado: true },
  ];
  assert.equal(buscarParecido(gastos, 2, '2026-11-03'), 'manual1');
  assert.equal(buscarParecido(gastos, 2, '2026-11-05'), null, 'más de un día de diferencia');
  assert.equal(buscarParecido(gastos, 15, '2026-11-03'), null, 'los descartados no cuentan');
  assert.equal(buscarParecido(gastos, 2.5, '2026-11-02'), null, 'otro monto');
});

test('límites del mes en hora de El Salvador', () => {
  const { inicio, fin } = limitesDelMes('2026-11', '-06:00');
  assert.equal(new Date(inicio * 1000).toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(new Date(fin * 1000).toISOString(), '2026-12-01T06:00:00.000Z');
  assert.equal(new Date(limitesDelMes('2026-12', '-06:00').fin * 1000).toISOString(), '2027-01-01T06:00:00.000Z');
});

test('clave de cada cuenta para su documento de estado', () => {
  assert.equal(claveDeCuenta('Ana.Lopez@gmail.com'), 'ana-lopez-gmail-com');
});
