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
const FUNCIONES = [
  'leerAviso',
  'adivinarCategoria',
  'aNumero_',
  'buscarParecido',
  'limitesDelMes',
  'claveDeCuenta',
  'leerMovimiento',
  'normalizarBanco',
  'resolverMovimiento',
  'notaDeMovimiento',
  'idDeMovimiento',
  'buscarMovimientoParecido',
  'pagoDeTarjetaParecido',
  'destinoDelCargo',
];
const {
  leerAviso,
  adivinarCategoria,
  aNumero_,
  buscarParecido,
  limitesDelMes,
  claveDeCuenta,
  leerMovimiento,
  normalizarBanco,
  resolverMovimiento,
  notaDeMovimiento,
  idDeMovimiento,
  buscarMovimientoParecido,
  pagoDeTarjetaParecido,
  destinoDelCargo,
} = vm.runInNewContext(`${codigo}\n;({ ${FUNCIONES.join(', ')} })`, {});

/** Objeto creado dentro de vm → objeto normal, para comparar con deepEqual. */
const copia = (x) => JSON.parse(JSON.stringify(x));

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

/* ------------------------------------------------------------------ */
/* Transferencias: los tres correos reales de ejemplo                  */
/* ------------------------------------------------------------------ */

const REMITENTE_CUSCATLAN = 'Notificaciones Banco Cuscatlán <notificaciones@bancocuscatlan.com>';
const REMITENTE_BAC = 'notificaciones_bac@baccredomatic.com';

/** Cuscatlán: "ha recibido un abono a su CUENTA DE AHORRO X1421" (dinero que entra). */
const CUSCATLAN_ABONO = `Transfer365
TRANSACCIÓN EXITOSA
Buen día, JONATHAN STANLEY QUEZADA
Le informamos que ha recibido un abono a su CUENTA DE AHORRO X1421 en concepto de Transfer365. Compartimos el detalle a continuación:
• Banco origen: BAC
• Originado por: JONATHAN STANLEY QUEZADA ABREGO
• Producto Origen: X8320
• Monto: USD0.55
• Fecha y hora: 02/11/2026 12:35:20 A.M.
• No Referencia: BAMCSVSS20261102B039560774
• Concepto:
Puede verificar esta operación a través de NetBanking o Banca digital en la opción de consulta de movimientos o comuníquese a nuestro teléfono 2212-2000
Gracias por preferir nuestros servicios electrónicos
Atentamente,
Banco Cuscatlán de El Salvador, S.A`;

/** El mismo correo como queda cuando la tabla pasa a texto: valor en la línea siguiente. */
const CUSCATLAN_ABONO_TABLA = `Transfer365
TRANSACCIÓN EXITOSA

Buen día, JONATHAN STANLEY QUEZADA

Le informamos que ha recibido un abono a su CUENTA DE AHORRO X1421 en concepto de Transfer365. Compartimos el detalle a continuación:

Banco origen:
\tBAC
Originado por:
\tJONATHAN STANLEY QUEZADA ABREGO
Producto Origen:
\tX8320
Monto:
\tUSD0.55
Fecha y hora:
\t02/11/2026 12:35:20 A.M.
No Referencia:
\tBAMCSVSS20261102B039560774
Concepto:

Puede verificar esta operación a través de NetBanking o Banca digital en la opción de consulta de movimientos o comuníquese a nuestro teléfono 2212-2000`;

/** BAC: la misma transferencia vista desde la cuenta que la envió. */
const BAC_ENVIO = `Notificación de Transferencia Finalizada Transfer365 del Banco Central de Reserva
Estimado(a): JONATHAN STANLEY QUEZADA ABREGO,

BAC le notifica que su transferencia efectuada en Banca en Línea por medio del Sistema Transfer365 del Banco Central de Reserva, fue confirmada por el Banco destino.

Información Origen
Referencia: BAMCSVSS20261102B039560774
Cuenta: *****8320
Concepto: -

Información Destino
Fecha de confirmación: 2026-11-02T12:35:35-06:00
Cliente: Jonathan Quezada
Cuenta: ***********1421
Banco Destino: CUSCATLÁN
Monto: $0.55
Tipo Transacción: Abono a cuenta

Este mensaje es generado por un sistema automático, agradeceremos no responder a su dirección.`;

/** Cuscatlán: pago a una tarjeta de crédito de otro banco con Transfer365. */
const CUSCATLAN_PAGO_TARJETA = `Transfer365
TRANSACCIÓN EXITOSA
Buen día, JONATHAN STANLEY QUEZADA
Le informamos el resultado de su operación Transfer365 realizado a través de Banca Digital. Compartimos el detalle a continuación:
Banco Destino:
B. ATLANTIDA
Beneficiario:
Jonathan Quezada
Producto Destino:
TARJETA DE CREDITO XXXXXX4200
Monto:
0.55
Fecha y hora:
02/11/2026 12:37:23 A.M.
Concepto:
Transfer365
No Referencia:
BACUSVSS20261102000064612933
Para consultas, comuníquese al teléfono 2212-2000 o con su ejecutivo de cuenta
Atentamente,
Banco CUSCATLAN`;

const CUENTAS = [
  { id: 'cusca', banco: 'Banco Cuscatlán', ultimos: '1421', debito: '7788', nombre: 'Banco Cuscatlán ••1421' },
  { id: 'bac', banco: 'BAC', ultimos: '8320', debito: '', nombre: 'BAC ••8320' },
];
const TARJETAS = {
  4200: { id: 'atl', banco: 'Banco Atlántida', nombre: 'Tarjeta Banco Atlántida ••4200' },
  1234: { id: 'agri', banco: 'Banco Agrícola', nombre: 'Tarjeta Banco Agrícola ••1234' },
};

test('bancos: reconoce cómo los escriben los correos y la app', () => {
  assert.equal(normalizarBanco('B. ATLANTIDA'), 'atlantida');
  assert.equal(normalizarBanco('Banco Atlántida'), 'atlantida');
  assert.equal(normalizarBanco('CUSCATLÁN'), 'cuscatlan');
  assert.equal(normalizarBanco('BAC'), 'bac');
  assert.equal(normalizarBanco('Banco de América Central'), 'bac');
  assert.equal(normalizarBanco('Banco Agrícola'), 'agricola');
  assert.equal(normalizarBanco('Jonathan Quezada'), '');
});

for (const [nombre, texto] of [
  ['en la misma línea', CUSCATLAN_ABONO],
  ['en tabla', CUSCATLAN_ABONO_TABLA],
]) {
  test(`Cuscatlán, dinero recibido (${nombre}): de BAC ••8320 a la cuenta ••1421`, () => {
    const m = copia(leerMovimiento(texto, REMITENTE_CUSCATLAN));
    assert.equal(m.tipo, 'movimiento');
    assert.equal(m.monto, 0.55);
    assert.equal(m.fecha, '2026-11-02');
    assert.equal(m.referencia, 'BAMCSVSS20261102B039560774');
    assert.equal(m.entrada, true);
    assert.deepEqual(m.desde, { banco: 'bac', ultimos: '8320', esTarjeta: false, persona: 'JONATHAN STANLEY QUEZADA ABREGO' });
    assert.deepEqual(m.hacia, { banco: 'cuscatlan', ultimos: '1421', esTarjeta: false, persona: '' });
    assert.equal(m.concepto, '', 'el párrafo de abajo no se toma como concepto');
  });
}

test('BAC, dinero enviado: de ••8320 a Cuscatlán ••1421', () => {
  const m = copia(leerMovimiento(BAC_ENVIO, REMITENTE_BAC));
  assert.equal(m.monto, 0.55);
  assert.equal(m.fecha, '2026-11-02');
  assert.equal(m.referencia, 'BAMCSVSS20261102B039560774');
  assert.equal(m.entrada, false);
  assert.deepEqual(m.desde, { banco: 'bac', ultimos: '8320', esTarjeta: false, persona: '' });
  assert.deepEqual(m.hacia, { banco: 'cuscatlan', ultimos: '1421', esTarjeta: false, persona: 'Jonathan Quezada' });
});

test('el aviso de BAC ya no se confunde con una compra de $0.55', () => {
  assert.equal(leerAviso(BAC_ENVIO).tipo, 'ignorar');
});

test('Cuscatlán, pago a la tarjeta de crédito Atlántida ••4200', () => {
  const m = copia(leerMovimiento(CUSCATLAN_PAGO_TARJETA, REMITENTE_CUSCATLAN));
  assert.equal(m.monto, 0.55);
  assert.equal(m.referencia, 'BACUSVSS20261102000064612933');
  assert.equal(m.entrada, false);
  assert.deepEqual(m.desde, { banco: 'cuscatlan', ultimos: null, esTarjeta: false, persona: '' });
  assert.deepEqual(m.hacia, { banco: 'atlantida', ultimos: '4200', esTarjeta: true, persona: 'Jonathan Quezada' });
  assert.equal(m.concepto, '', '"Transfer365" no sirve de nota');
});

test('el envío y el abono de la misma transferencia dan el mismo movimiento (se anota una vez)', () => {
  const envio = leerMovimiento(BAC_ENVIO, REMITENTE_BAC);
  const abono = leerMovimiento(CUSCATLAN_ABONO, REMITENTE_CUSCATLAN);
  assert.equal(idDeMovimiento(envio, 'correo1'), 'ref-BAMCSVSS20261102B039560774');
  assert.equal(idDeMovimiento(envio, 'correo1'), idDeMovimiento(abono, 'correo2'));
  const a = copia(resolverMovimiento(envio, CUENTAS, TARJETAS));
  const b = copia(resolverMovimiento(abono, CUENTAS, TARJETAS));
  assert.deepEqual(a, {
    desde: 'cuenta:bac',
    hacia: 'cuenta:cusca',
    nombreDesde: 'BAC ••8320',
    nombreHacia: 'Banco Cuscatlán ••1421',
  });
  assert.deepEqual(b, a);
  assert.equal(notaDeMovimiento(envio, a), '');
});

test('el pago de tarjeta sale de la única cuenta de Cuscatlán y va a la tarjeta Atlántida', () => {
  const pago = leerMovimiento(CUSCATLAN_PAGO_TARJETA, REMITENTE_CUSCATLAN);
  const r = copia(resolverMovimiento(pago, CUENTAS, TARJETAS));
  assert.equal(r.desde, 'cuenta:cusca');
  assert.equal(r.hacia, 'tarjeta:atl');
  // Con dos cuentas en Cuscatlán no se adivina de cuál salió.
  const dos = [...CUENTAS, { id: 'cusca2', banco: 'Cuscatlán', ultimos: '9999', nombre: 'Cuscatlán ••9999' }];
  const r2 = copia(resolverMovimiento(pago, dos, TARJETAS));
  assert.equal(r2.desde, 'externo');
  assert.equal(r2.hacia, 'tarjeta:atl');
  assert.equal(notaDeMovimiento(pago, r2), 'Desde Cuscatlán');
});

test('si una de las cuentas no está en la app, se anota igual con el otro lado como externo', () => {
  const abono = leerMovimiento(CUSCATLAN_ABONO, REMITENTE_CUSCATLAN);
  const soloCuscatlan = [CUENTAS[0]];
  const r = copia(resolverMovimiento(abono, soloCuscatlan, TARJETAS));
  assert.equal(r.desde, 'externo');
  assert.equal(r.hacia, 'cuenta:cusca');
  assert.equal(notaDeMovimiento(abono, r), 'Desde JONATHAN STANLEY QUEZADA ABREGO · BAC ••8320');
  // Sin ninguna cuenta registrada no hay nada que anotar.
  assert.equal(resolverMovimiento(abono, [], {}), null);
});

test('una cuenta de otra persona con los mismos 4 dígitos en otro banco no se confunde', () => {
  const envio = leerMovimiento(BAC_ENVIO, REMITENTE_BAC);
  const otroBanco = [CUENTAS[1], { id: 'agri', banco: 'Banco Agrícola', ultimos: '1421', nombre: 'Agrícola ••1421' }];
  const r = copia(resolverMovimiento(envio, otroBanco, {}));
  assert.equal(r.desde, 'cuenta:bac');
  assert.equal(r.hacia, 'externo');
});

test('transferencias rechazadas no se anotan', () => {
  const texto = `Transfer365\nSu transferencia fue rechazada por el banco destino.\nMonto: $25.00\nNo Referencia: ABC123456`;
  assert.equal(leerMovimiento(texto, REMITENTE_CUSCATLAN).tipo, 'ignorar');
});

test('los avisos de compra no son transferencias', () => {
  assert.equal(leerMovimiento('Compra aprobada por USD 2.00 en PUMA DIDEA con su tarjeta terminada en 1234.', ''), null);
});

test('movimiento parecido: mismo monto, ±1 día y una cuenta en común', () => {
  const movimientos = [
    { id: 'manual', monto: 0.55, fecha: '2026-11-02', desde: 'externo', hacia: 'cuenta:cusca' },
    { id: 'viejo', monto: 0.55, fecha: '2026-11-02', desde: 'cuenta:bac', hacia: 'cuenta:cusca', descartado: true },
  ];
  const nuevo = { id: 'ref-X', monto: 0.55, fecha: '2026-11-03', desde: 'cuenta:bac', hacia: 'cuenta:cusca' };
  assert.equal(buscarMovimientoParecido(movimientos, nuevo), 'manual');
  assert.equal(buscarMovimientoParecido(movimientos, { ...nuevo, monto: 1 }), null);
  assert.equal(buscarMovimientoParecido(movimientos, { ...nuevo, hacia: 'externo', desde: 'externo' }), null);
});

test('pago de tarjeta ya marcado a mano en Pagos', () => {
  const pagados = { tarjeta_atl: { monto: 0.55, tipo: 'otro' } };
  assert.equal(pagoDeTarjetaParecido(pagados, 'tarjeta:atl', 0.55), 'pago:tarjeta_atl');
  assert.equal(pagoDeTarjetaParecido(pagados, 'tarjeta:atl', 10), null);
  assert.equal(pagoDeTarjetaParecido(pagados, 'cuenta:cusca', 0.55), null);
});

test('compra con la tarjeta de débito: se resta de la cuenta', () => {
  const cuentas = CUENTAS;
  const debito = copia(destinoDelCargo({ monto: 5, ultimos: '7788' }, TARJETAS, cuentas));
  assert.deepEqual(debito, { medio: 'cuenta:cusca', coleccion: 'cuentas', id: 'cusca', nombre: 'débito Banco Cuscatlán ••1421', delta: -5 });
  const credito = copia(destinoDelCargo({ monto: 2, ultimos: '1234' }, TARJETAS, cuentas));
  assert.equal(credito.medio, 'tarjeta:agri');
  assert.equal(credito.delta, 2);
  const nada = copia(destinoDelCargo({ monto: 2, ultimos: '5555' }, TARJETAS, cuentas));
  assert.equal(nada.medio, 'efectivo');
  assert.equal(nada.id, null);
});

test('una compra cuyo pie habla de transferencias sigue siendo una compra', () => {
  const texto = `Notificación de transacción
Comercio: SUPER SELECTOS ESCALON
Tarjeta: VISA ************5678
Monto: USD 45.30
Hacé tus transferencias y pagos desde la Banca en Línea.`;
  assert.equal(leerMovimiento(texto, REMITENTE_CUSCATLAN), null);
  const aviso = leerAviso(texto);
  assert.equal(aviso.tipo, 'cargo');
  assert.equal(aviso.monto, 45.3);
});
