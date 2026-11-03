/**
 * CUENTAS CLARAS · LECTOR DE AVISOS DEL BANCO
 *
 * Corre dentro de tu cuenta de Google (script.google.com), no en la app.
 * Cada 10 minutos busca en Gmail los avisos de compra con tarjeta que manda
 * el banco ("Compra por USD 2.00 en PUMA DIDEA con tarjeta terminada en
 * 1234"), saca el monto, el comercio y los últimos 4 dígitos, y lo anota
 * como gasto en Cuentas Claras. Si la tarjeta está registrada en la app, el
 * gasto se suma a su saldo, igual que cuando se anota a mano.
 *
 * Los correos no salen de Google: el script lee Gmail y escribe directo en
 * tu base de datos de Firebase con tu propia cuenta.
 *
 * Instalación paso a paso: docs/AVISOS-DEL-BANCO.md
 *
 * Funciones para correr desde el editor:
 *   probarSinGuardar()            Muestra qué encontraría, sin guardar nada.
 *   instalarRevisionAutomatica()  Activa la revisión cada 10 minutos.
 *   detenerRevisionAutomatica()   La apaga.
 *   revisarCorreos()              Una revisión ahora (la que corre sola).
 */

/* ------------------------------------------------------------------ */
/* Ajustes: lo único que podría hacer falta cambiar                    */
/* ------------------------------------------------------------------ */

const AJUSTES = {
  /** projectId de js/config.js. */
  proyecto: 'cuentas-claras-2811',
  /** HOGAR_ID de js/config.js. */
  hogar: 'principal',
  /**
   * Qué correos revisar (misma sintaxis que el buscador de Gmail). Para que
   * sea más precisa, agregá el remitente de tu banco, por ejemplo:
   *   'newer_than:2d from:(notificaciones@tubanco.com)'
   */
  busqueda:
    'newer_than:2d (compra OR consumo OR cargo OR transacción OR transaccion OR autorizada OR aprobada)',
  /** Cada cuántos minutos revisar: 5, 10, 15 o 30. */
  minutosEntreRevisiones: 10,
  zonaHoraria: 'America/El_Salvador',
  etiquetaRegistrado: 'Cuentas Claras/Registrado',
  etiquetaRevisar: 'Cuentas Claras/Revisar',
};

/* ------------------------------------------------------------------ */
/* Funciones para correr desde el editor                               */
/* ------------------------------------------------------------------ */

function revisarCorreos() {
  const candado = LockService.getUserLock();
  if (!candado.tryLock(5000)) return; // ya hay una revisión corriendo
  try {
    procesarCorreos_({ guardar: true });
  } finally {
    candado.releaseLock();
  }
}

function probarSinGuardar() {
  procesarCorreos_({ guardar: false });
}

function instalarRevisionAutomatica() {
  detenerRevisionAutomatica();
  ScriptApp.newTrigger('revisarCorreos')
    .timeBased()
    .everyMinutes(AJUSTES.minutosEntreRevisiones)
    .create();
  Logger.log(`Listo: se van a revisar los correos cada ${AJUSTES.minutosEntreRevisiones} minutos.`);
  revisarCorreos();
}

function detenerRevisionAutomatica() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'revisarCorreos')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/* ------------------------------------------------------------------ */
/* Leer un aviso del banco (funciones puras, con pruebas en tests/)   */
/* ------------------------------------------------------------------ */

/** Palabras que indican que el correo NO es un cargo que haya que anotar. */
const NO_ES_CARGO =
  /(rechazad|declinad|denegad|no\s+autorizad|no\s+fue\s+aprobad|reversi[oó]n|reversad|reverso|anulad|devoluci[oó]n|reembolso|pago\s+recibido|hemos\s+recibido\s+(tu|su)\s+pago|abono\s+a\s+(tu|su)\s+tarjeta|pago\s+a\s+(tu|su)\s+tarjeta|pago\s+de\s+(tu|su)\s+tarjeta)/i;

/** Texto antes de un monto que dice que no es el monto de la compra. */
const NO_ES_EL_MONTO = /(saldo|disponible|l[ií]mite|cr[eé]dito\s+disponible|pago\s+m[ií]nimo)[^$\d]{0,25}$/i;

/** "1,234.56" → 1234.56; también acepta "1.234,56" y "2,00". */
function aNumero_(texto) {
  let t = String(texto).trim();
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma > punto) {
    // la coma es el separador decimal si le siguen exactamente 2 dígitos
    t = /,\d{2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    t = t.replace(/,/g, '');
  }
  const n = parseFloat(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function buscarMonto_(texto) {
  const conEtiqueta = /(?:monto|importe|valor|total|cantidad)(?:\s+de\s+la\s+(?:compra|transacci[oó]n))?\s*:?\s*(?:USD|US\$|\$)\s*([\d.,]*\d)/i.exec(texto)
    || /(?:monto|importe|valor|total|cantidad)(?:\s+de\s+la\s+(?:compra|transacci[oó]n))?\s*:?\s*([\d.,]*\d)\s*(?:USD|d[oó]lares)/i.exec(texto);
  if (conEtiqueta) return aNumero_(conEtiqueta[1]);

  const montos = /(?:USD|US\$|\$)\s*([\d.,]*\d)|([\d.,]*\d)\s*(?:USD|d[oó]lares)/gi;
  let m;
  while ((m = montos.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 40), m.index);
    if (NO_ES_EL_MONTO.test(antes)) continue;
    const n = aNumero_(m[1] || m[2]);
    if (n !== null && n > 0) return n;
  }
  return null;
}

function buscarUltimos_(texto) {
  const patrones = [
    /(?:terminad[ao]\s+en|termina\s+en|finalizad[ao]\s+en|terminaci[oó]n|con\s+final|que\s+termina\s+en)\s*:?\s*(?:[x*•·.]+[\s-]*)*(\d{4})\b/i,
    /(?:[x*•·]{2,}[\s-]*){1,4}(\d{4})\b/i,
    /tarjeta[^\n\d$]{0,40}?(\d{4})\b(?![.,/]\d)/i,
  ];
  for (const patron of patrones) {
    const m = patron.exec(texto);
    if (m) return m[1];
  }
  return null;
}

function limpiarComercio_(texto) {
  return String(texto)
    .replace(/\s+/g, ' ')
    .replace(/^[\s:\-–]+|[\s.,;:\-–]+$/g, '')
    .slice(0, 60);
}

function buscarComercio_(texto) {
  const patrones = [
    /(?:comercio|establecimiento|negocio|lugar|merchant)\s*:?[ \t]*\n?[ \t]*([^\n]{2,60})/i,
    /(?:USD|US\$|\$)\s*[\d.,]*\d\s+(?:en|at)\s+([^\n]{2,60}?)(?=\s+(?:con|el|a\s+las|desde|usando|mediante|por)\b|[.,;\n]|$)/i,
    /\ben\s+(?:el\s+comercio\s+)?([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 &'.\-]{2,40}?)(?=\s+(?:con|el|a\s+las|desde)\b|[.,;\n]|$)/,
  ];
  for (const patron of patrones) {
    const m = patron.exec(texto);
    if (m) {
      const comercio = limpiarComercio_(m[1]);
      if (comercio && !/^(su|tu|la|el)\s+tarjeta/i.test(comercio)) return comercio;
    }
  }
  return null;
}

/**
 * Lee el texto de un correo (asunto + cuerpo).
 * @returns {{tipo:'cargo', monto:number, ultimos:string, comercio:string}
 *          |{tipo:'ignorar', motivo:string}|null}
 *   null si no parece un aviso de compra con tarjeta.
 */
function leerAviso(texto) {
  const t = String(texto || '').replace(/\u00a0/g, ' ').replace(/\r/g, '');
  const ultimos = buscarUltimos_(t);
  const monto = buscarMonto_(t);
  if (!ultimos || !monto) return null;
  const negativo = NO_ES_CARGO.exec(t);
  if (negativo) return { tipo: 'ignorar', motivo: negativo[0] };
  return { tipo: 'cargo', monto, ultimos, comercio: buscarComercio_(t) || 'Compra con tarjeta' };
}

/** Categorías de la app (js/constants/catalogos.js) según palabras del comercio. */
const CATEGORIAS_POR_COMERCIO = [
  ['Transporte y gasolina', /\b(puma|texaco|uno\b|shell|esso|alba|gasolinera|servicentro|uber|indrive|didi|parqueo|estacionamiento|peaje)/i],
  ['Súper y comida', /\b(selectos|walmart|despensa|pricesmart|super\b|supermercado|mercado|carnicer|panader)/i],
  ['Comida fuera', /\b(campero|pizza|mcdonald|burger|wendy|starbucks|pupuser|restaurante|cafe|café|subway|kfc|domino|caesars|biggest|rapidito|taco|sushi|pedidos ya|pedidosya|hugo)/i],
  ['Salud y farmacia', /\b(farmacia|san nicol[aá]s|camila|econ[oó]mica|hospital|cl[ií]nica|laboratorio|m[eé]dic|dental|[oó]ptica)/i],
  ['Ropa y cuidado personal', /\b(siman|prado|zara|nike|adidas|payless|carri[oó]n|bershka|h&m|sal[oó]n|barber)/i],
  ['Salidas y entretenimiento', /\b(cinemark|cin[eé]polis|netflix|spotify|disney|hbo|max\b|steam|playstation|xbox|youtube|apple\.com|google play)/i],
  ['Hogar', /\b(freund|vidr[ií]|epa\b|ferreter|curacao|tropigas|omnisport|ikea)/i],
  ['Educación', /\b(librer[ií]a|universidad|colegio|escuela|udemy|coursera)/i],
];

function adivinarCategoria(comercio) {
  const encontrada = CATEGORIAS_POR_COMERCIO.find(([, patron]) => patron.test(comercio || ''));
  return encontrada ? encontrada[0] : 'Otros';
}

/* ------------------------------------------------------------------ */
/* Gmail                                                               */
/* ------------------------------------------------------------------ */

function obtenerEtiqueta_(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

const CLAVE_PROCESADOS = 'correosProcesados';
const MAXIMO_PROCESADOS = 400;

function leerProcesados_() {
  try {
    return new Set(JSON.parse(PropertiesService.getUserProperties().getProperty(CLAVE_PROCESADOS) || '[]'));
  } catch (error) {
    return new Set();
  }
}

function guardarProcesados_(procesados) {
  const lista = Array.from(procesados).slice(-MAXIMO_PROCESADOS);
  PropertiesService.getUserProperties().setProperty(CLAVE_PROCESADOS, JSON.stringify(lista));
}

function procesarCorreos_({ guardar }) {
  const tarjetas = leerTarjetas_();
  const procesados = guardar ? leerProcesados_() : new Set();
  const registrado = guardar ? obtenerEtiqueta_(AJUSTES.etiquetaRegistrado) : null;
  const revisar = guardar ? obtenerEtiqueta_(AJUSTES.etiquetaRevisar) : null;
  const resumen = { guardados: 0, repetidos: 0, ignorados: 0, revisar: 0 };

  Logger.log(`Tarjetas en la app: ${Object.keys(tarjetas).map((u) => `••${u}`).join(', ') || 'ninguna'}`);

  GmailApp.search(AJUSTES.busqueda, 0, 50).forEach((hilo) => {
    hilo.getMessages().forEach((mensaje) => {
      const id = mensaje.getId();
      if (procesados.has(id)) return;

      const aviso = leerAviso(`${mensaje.getSubject()}\n${mensaje.getPlainBody()}`);
      const fecha = Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');

      if (!aviso) {
        procesados.add(id);
        return;
      }
      if (aviso.tipo === 'ignorar') {
        Logger.log(`Ignorado (${aviso.motivo}): ${mensaje.getSubject()}`);
        resumen.ignorados += 1;
        procesados.add(id);
        return;
      }

      const tarjeta = tarjetas[aviso.ultimos] || null;
      const categoria = adivinarCategoria(aviso.comercio);
      const destino = tarjeta ? tarjeta.nombre : `tarjeta ••${aviso.ultimos} (no registrada: se anota como débito)`;
      Logger.log(`${fecha} · $${aviso.monto.toFixed(2)} · ${aviso.comercio} · ${categoria} · ${destino}`);

      if (!guardar) return;
      const resultado = guardarGasto_(id, fecha, aviso, categoria, tarjeta);
      if (resultado === 'guardado') resumen.guardados += 1;
      else resumen.repetidos += 1;
      hilo.addLabel(tarjeta ? registrado : revisar);
      if (!tarjeta) resumen.revisar += 1;
      procesados.add(id);
    });
  });

  if (guardar) guardarProcesados_(procesados);
  Logger.log(
    guardar
      ? `Guardados: ${resumen.guardados} · ya estaban: ${resumen.repetidos} · ignorados: ${resumen.ignorados} · con tarjeta no registrada: ${resumen.revisar}`
      : 'Prueba terminada: no se guardó nada.',
  );
}

/* ------------------------------------------------------------------ */
/* Firestore (API REST, con tu propia cuenta de Google)                */
/* ------------------------------------------------------------------ */

function rutaDocumento_(ruta) {
  return `projects/${AJUSTES.proyecto}/databases/(default)/documents/${ruta}`;
}

function pedirFirestore_(metodo, ruta, cuerpo) {
  const opciones = {
    method: metodo,
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      'X-Goog-User-Project': AJUSTES.proyecto,
    },
  };
  if (cuerpo) {
    opciones.contentType = 'application/json';
    opciones.payload = JSON.stringify(cuerpo);
  }
  const respuesta = UrlFetchApp.fetch(`https://firestore.googleapis.com/v1/${ruta}`, opciones);
  const texto = respuesta.getContentText();
  return { codigo: respuesta.getResponseCode(), datos: texto ? JSON.parse(texto) : {} };
}

/** Tarjetas de la app por sus últimos 4 dígitos: { '1234': {id, nombre} }. */
function leerTarjetas_() {
  const r = pedirFirestore_('get', `${rutaDocumento_(`hogares/${AJUSTES.hogar}/tarjetas`)}?pageSize=300`);
  if (r.codigo !== 200) {
    throw new Error(
      `No se pudo leer Firebase (${r.codigo}): ${r.datos.error ? r.datos.error.message : 'sin detalle'}. ` +
        'Revisá que AJUSTES.proyecto sea el projectId de js/config.js y que estés usando la cuenta dueña del proyecto.',
    );
  }
  const tarjetas = {};
  (r.datos.documents || []).forEach((documento) => {
    const campos = documento.fields || {};
    const ultimos = campos.ultimos && (campos.ultimos.stringValue || campos.ultimos.integerValue);
    if (!ultimos) return;
    const banco = campos.banco ? campos.banco.stringValue : 'Tarjeta';
    tarjetas[String(ultimos).padStart(4, '0')] = {
      id: documento.name.split('/').pop(),
      nombre: `Tarjeta ${banco} ••${ultimos}`,
    };
  });
  return tarjetas;
}

/**
 * Guarda el gasto (y suma al saldo de la tarjeta) en un solo paso. El id del
 * gasto sale del id del correo, así un correo nunca se anota dos veces.
 * @returns {'guardado'|'repetido'}
 */
function guardarGasto_(idCorreo, fecha, aviso, categoria, tarjeta) {
  const texto = (v) => ({ stringValue: v });
  const escrituras = [
    {
      update: {
        name: rutaDocumento_(`hogares/${AJUSTES.hogar}/gastos/correo-${idCorreo}`),
        fields: {
          fecha: texto(fecha),
          mes: texto(fecha.slice(0, 7)),
          monto: { doubleValue: aviso.monto },
          categoria: texto(categoria),
          medio: texto(tarjeta ? `tarjeta:${tarjeta.id}` : 'efectivo'),
          nota: texto(tarjeta ? aviso.comercio : `${aviso.comercio} · tarjeta ••${aviso.ultimos}`),
          autor: { mapValue: { fields: { uid: texto('correo'), nombre: texto('Correo del banco') } } },
          origen: texto('correo'),
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'creadoEn', setToServerValue: 'REQUEST_TIME' }],
    },
  ];
  if (tarjeta) {
    escrituras.push({
      transform: {
        document: rutaDocumento_(`hogares/${AJUSTES.hogar}/tarjetas/${tarjeta.id}`),
        fieldTransforms: [{ fieldPath: 'saldo', increment: { doubleValue: aviso.monto } }],
      },
    });
  }

  const r = pedirFirestore_('post', `projects/${AJUSTES.proyecto}/databases/(default)/documents:commit`, {
    writes: escrituras,
  });
  if (r.codigo === 200) return 'guardado';
  const estado = r.datos.error ? r.datos.error.status : '';
  if (estado === 'ALREADY_EXISTS' || estado === 'FAILED_PRECONDITION') return 'repetido';
  throw new Error(`No se pudo guardar el gasto (${r.codigo}): ${r.datos.error ? r.datos.error.message : 'sin detalle'}`);
}
