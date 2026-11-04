/**
 * CUENTAS CLARAS · LECTOR DE AVISOS DEL BANCO
 *
 * Corre dentro de tu cuenta de Google (script.google.com), no en la app.
 * Cada 5 minutos:
 *   1. Si en la app alguien tocó "Buscar gastos del mes en los correos",
 *      revisa todos los avisos de ese mes en este Gmail y anota los que falten.
 *   2. Si no, revisa los avisos de los últimos 2 días.
 *
 * De cada aviso ("Compra por USD 2.00 en PUMA DIDEA con tarjeta terminada en
 * 1234") saca el monto, el comercio y los últimos 4 dígitos, y lo anota como
 * gasto en Cuentas Claras. Si la tarjeta está registrada en la app, el gasto
 * se suma a su saldo, igual que cuando se anota a mano.
 *
 * Los correos no salen de Google: el script lee Gmail y escribe directo en
 * tu base de datos de Firebase con tu propia cuenta.
 *
 * Instalación y actualización paso a paso: docs/AVISOS-DEL-BANCO.md
 *
 * Funciones para correr desde el editor:
 *   probarSinGuardar()            Muestra qué encontraría en los últimos días, sin guardar.
 *   probarMesSinGuardar()         Lo mismo con todo el mes actual.
 *   instalarRevisionAutomatica()  Activa la revisión cada 5 minutos.
 *   detenerRevisionAutomatica()   La apaga.
 *   revisarCorreos()              Una revisión ahora (la que corre sola).
 *   revisarMesActual()            Busca y anota todo el mes actual ahora.
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
   * Qué correos son avisos del banco (sintaxis del buscador de Gmail). Para
   * que sea más preciso, agregá el remitente de tu banco, por ejemplo:
   *   'from:(notificaciones@tubanco.com)'
   */
  filtro: '(compra OR consumo OR cargo OR transacción OR transaccion OR autorizada OR aprobada)',
  /** En la revisión de rutina, cuántos días hacia atrás mirar. */
  diasRecientes: 2,
  /** Cada cuántos minutos revisar: 5, 10, 15 o 30. */
  minutosEntreRevisiones: 5,
  /** Tope de correos al revisar un mes completo (cada ejecución tiene 6 minutos). */
  maximoCorreosPorMes: 300,
  zonaHoraria: 'America/El_Salvador',
  /** Diferencia con UTC de la zona horaria (El Salvador no cambia de horario). */
  desfaseUtc: '-06:00',
  etiquetaRegistrado: 'Cuentas Claras/Registrado',
  etiquetaRevisar: 'Cuentas Claras/Revisar',
};

/* ------------------------------------------------------------------ */
/* Funciones para correr desde el editor                               */
/* ------------------------------------------------------------------ */

/** La revisión que corre sola cada pocos minutos. */
function revisarCorreos() {
  conCandado_(() => {
    const contexto = crearContexto_({ guardar: true });
    const solicitud = leerSolicitud_();
    const propiedades = PropertiesService.getUserProperties();
    if (solicitud && solicitud.id !== propiedades.getProperty('ultimaSolicitud')) {
      propiedades.setProperty('ultimaSolicitud', solicitud.id);
      atenderSolicitud_(solicitud, contexto);
      return;
    }
    revisarRecientes_(contexto);
    escribirEstadoCuenta_(contexto.cuenta, {});
  });
}

/** Busca y anota todo el mes actual ahora (sin esperar a que lo pidan en la app). */
function revisarMesActual() {
  conCandado_(() => {
    const contexto = crearContexto_({ guardar: true });
    revisarMes_(mesActual_(), contexto);
    escribirEstadoCuenta_(contexto.cuenta, resumenParaGuardar_(contexto.resumen, { estado: 'listo', mes: mesActual_() }));
    registrarResumen_(contexto);
  });
}

function probarSinGuardar() {
  const contexto = crearContexto_({ guardar: false });
  revisarRecientes_(contexto);
  Logger.log('Prueba terminada: no se guardó nada.');
}

function probarMesSinGuardar() {
  const contexto = crearContexto_({ guardar: false });
  revisarMes_(mesActual_(), contexto);
  Logger.log('Prueba terminada: no se guardó nada.');
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

/** Días entre dos fechas "YYYY-MM-DD". */
function diasEntre_(a, b) {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

/**
 * Un gasto anotado a mano que parece ser la misma compra: mismo monto y
 * fecha con un día de diferencia como máximo. Devuelve su id, o null.
 * @param {{id:string, monto:number, fecha:string, origen?:string, descartado?:boolean}[]} gastos
 */
function buscarParecido(gastos, monto, fecha) {
  const parecido = gastos.find(
    (g) =>
      g.origen !== 'correo' &&
      !g.descartado &&
      Math.abs(Number(g.monto) - monto) < 0.005 &&
      g.fecha &&
      diasEntre_(g.fecha, fecha) <= 1,
  );
  return parecido ? parecido.id : null;
}

/** "2026-11" → { inicio, fin } en segundos desde 1970, según la zona horaria. */
function limitesDelMes(mes, desfaseUtc) {
  const [anio, numero] = mes.split('-').map(Number);
  const siguiente = numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, '0')}`;
  return {
    inicio: Date.parse(`${mes}-01T00:00:00${desfaseUtc}`) / 1000,
    fin: Date.parse(`${siguiente}-01T00:00:00${desfaseUtc}`) / 1000,
  };
}

/** Correo → clave para el documento de la cuenta: "ana.lopez@gmail.com" → "ana-lopez-gmail-com". */
function claveDeCuenta(correo) {
  return String(correo || 'sin-correo').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/* ------------------------------------------------------------------ */
/* Revisar correos                                                     */
/* ------------------------------------------------------------------ */

function conCandado_(accion) {
  const candado = LockService.getUserLock();
  if (!candado.tryLock(5000)) return; // ya hay una revisión corriendo
  try {
    accion();
  } finally {
    candado.releaseLock();
  }
}

function mesActual_() {
  return Utilities.formatDate(new Date(), AJUSTES.zonaHoraria, 'yyyy-MM');
}

function crearContexto_({ guardar }) {
  const tarjetas = leerTarjetas_();
  Logger.log(`Tarjetas en la app: ${Object.keys(tarjetas).map((u) => `••${u}`).join(', ') || 'ninguna'}`);
  const cacheDeGastos = {};
  return {
    guardar,
    tarjetas,
    cuenta: Session.getEffectiveUser().getEmail(),
    etiquetas: guardar
      ? { registrado: obtenerEtiqueta_(AJUSTES.etiquetaRegistrado), revisar: obtenerEtiqueta_(AJUSTES.etiquetaRevisar) }
      : null,
    /** Gastos ya guardados de un mes, leídos una sola vez por ejecución. */
    gastosDelMes(mes) {
      if (!cacheDeGastos[mes]) cacheDeGastos[mes] = leerGastosDelMes_(mes);
      return cacheDeGastos[mes];
    },
    resumen: { nuevos: 0, yaEstaban: 0, ignorados: 0, sinTarjeta: 0, posiblesRepetidos: [], correosRevisados: 0 },
  };
}

/**
 * Revisa un correo y, si es un cargo que falta, lo anota.
 * @returns {'no-es-aviso'|'ignorado'|'ya-estaba'|'prueba'|'guardado'|'sin-tarjeta'}
 */
function revisarMensaje_(mensaje, contexto) {
  const { resumen } = contexto;
  resumen.correosRevisados += 1;
  const aviso = leerAviso(`${mensaje.getSubject()}\n${mensaje.getPlainBody()}`);
  if (!aviso) return 'no-es-aviso';
  if (aviso.tipo === 'ignorar') {
    Logger.log(`Ignorado (${aviso.motivo}): ${mensaje.getSubject()}`);
    resumen.ignorados += 1;
    return 'ignorado';
  }

  const fecha = Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  const idGasto = `correo-${mensaje.getId()}`;
  const gastos = contexto.gastosDelMes(fecha.slice(0, 7));
  if (gastos.some((g) => g.id === idGasto)) {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }

  const tarjeta = contexto.tarjetas[aviso.ultimos] || null;
  const categoria = adivinarCategoria(aviso.comercio);
  const parecido = buscarParecido(gastos, aviso.monto, fecha);
  const destino = tarjeta ? tarjeta.nombre : `tarjeta ••${aviso.ultimos} (no registrada: se anota como débito)`;
  Logger.log(
    `${fecha} · $${aviso.monto.toFixed(2)} · ${aviso.comercio} · ${categoria} · ${destino}${parecido ? ' · ¿repetido con uno anotado a mano?' : ''}`,
  );
  if (!contexto.guardar) return 'prueba';

  if (guardarGasto_(mensaje.getId(), fecha, aviso, categoria, tarjeta, parecido) === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  gastos.push({ id: idGasto, monto: aviso.monto, fecha, origen: 'correo' });
  resumen.nuevos += 1;
  if (parecido) resumen.posiblesRepetidos.push(`${fecha} · $${aviso.monto.toFixed(2)} · ${aviso.comercio}`);
  if (!tarjeta) {
    resumen.sinTarjeta += 1;
    return 'sin-tarjeta';
  }
  return 'guardado';
}

function etiquetar_(hilo, resultados, contexto) {
  if (!contexto.etiquetas) return;
  if (resultados.includes('sin-tarjeta')) hilo.addLabel(contexto.etiquetas.revisar);
  else if (resultados.includes('guardado')) hilo.addLabel(contexto.etiquetas.registrado);
}

/** Revisión de rutina: avisos de los últimos días que todavía no se habían leído. */
function revisarRecientes_(contexto) {
  const procesados = contexto.guardar ? leerProcesados_() : new Set();
  GmailApp.search(`newer_than:${AJUSTES.diasRecientes}d ${AJUSTES.filtro}`, 0, 50).forEach((hilo) => {
    const resultados = [];
    hilo.getMessages().forEach((mensaje) => {
      if (procesados.has(mensaje.getId())) return;
      resultados.push(revisarMensaje_(mensaje, contexto));
      procesados.add(mensaje.getId());
    });
    etiquetar_(hilo, resultados, contexto);
  });
  if (contexto.guardar) guardarProcesados_(procesados);
  registrarResumen_(contexto);
}

/**
 * Revisa todos los avisos de un mes, aunque ya se hubieran leído antes: así
 * aparecen los que se fueron de paso. Los que ya están anotados no se repiten.
 */
function revisarMes_(mes, contexto) {
  const { inicio, fin } = limitesDelMes(mes, AJUSTES.desfaseUtc);
  const consulta = `${AJUSTES.filtro} after:${inicio} before:${fin}`;
  const procesados = contexto.guardar ? leerProcesados_() : new Set();
  const porPagina = 100;
  let desde = 0;
  let revisados = 0;
  Logger.log(`Revisando los correos de ${mes}…`);

  for (;;) {
    const hilos = GmailApp.search(consulta, desde, porPagina);
    hilos.forEach((hilo) => {
      const resultados = [];
      hilo.getMessages().forEach((mensaje) => {
        const segundos = mensaje.getDate().getTime() / 1000;
        if (segundos < inicio || segundos >= fin || revisados >= AJUSTES.maximoCorreosPorMes) return;
        revisados += 1;
        resultados.push(revisarMensaje_(mensaje, contexto));
        procesados.add(mensaje.getId());
      });
      etiquetar_(hilo, resultados, contexto);
    });
    if (hilos.length < porPagina || revisados >= AJUSTES.maximoCorreosPorMes) break;
    desde += porPagina;
  }

  if (contexto.guardar) guardarProcesados_(procesados);
  if (revisados >= AJUSTES.maximoCorreosPorMes) {
    Logger.log(`Se llegó al tope de ${AJUSTES.maximoCorreosPorMes} correos; afiná AJUSTES.filtro con el remitente del banco.`);
  }
  registrarResumen_(contexto);
}

/** Atiende el pedido hecho desde la app y deja el resultado para que la app lo muestre. */
function atenderSolicitud_(solicitud, contexto) {
  const base = { mes: solicitud.mes, solicitud: solicitud.id };
  escribirEstadoCuenta_(contexto.cuenta, { ...base, estado: 'revisando' });
  try {
    revisarMes_(solicitud.mes, contexto);
    escribirEstadoCuenta_(contexto.cuenta, resumenParaGuardar_(contexto.resumen, { ...base, estado: 'listo' }));
  } catch (error) {
    escribirEstadoCuenta_(contexto.cuenta, { ...base, estado: 'error', mensaje: String(error.message || error).slice(0, 300) });
    throw error;
  }
}

function resumenParaGuardar_(resumen, extra) {
  return {
    ...extra,
    nuevos: resumen.nuevos,
    yaEstaban: resumen.yaEstaban,
    ignorados: resumen.ignorados,
    sinTarjeta: resumen.sinTarjeta,
    correosRevisados: resumen.correosRevisados,
    posiblesRepetidos: resumen.posiblesRepetidos.slice(0, 20),
    mensaje: '',
  };
}

function registrarResumen_(contexto) {
  const r = contexto.resumen;
  if (!contexto.guardar) return;
  Logger.log(
    `Correos revisados: ${r.correosRevisados} · nuevos: ${r.nuevos} · ya estaban: ${r.yaEstaban} · ignorados: ${r.ignorados} · con tarjeta no registrada: ${r.sinTarjeta} · posibles repetidos: ${r.posiblesRepetidos.length}`,
  );
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

/* ------------------------------------------------------------------ */
/* Firestore (API REST, con tu propia cuenta de Google)                */
/* ------------------------------------------------------------------ */

const BASE_DOCUMENTOS = () => `projects/${AJUSTES.proyecto}/databases/(default)/documents`;
const rutaDocumento_ = (ruta) => `${BASE_DOCUMENTOS()}/${ruta}`;
const rutaHogar_ = (ruta) => rutaDocumento_(`hogares/${AJUSTES.hogar}/${ruta}`);

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

function errorDeFirestore_(accion, r) {
  return new Error(
    `No se pudo ${accion} (${r.codigo}): ${r.datos.error ? r.datos.error.message : 'sin detalle'}. ` +
      'Revisá que AJUSTES.proyecto sea el projectId de js/config.js y que la cuenta tenga acceso al proyecto de Firebase.',
  );
}

/** Valor de un campo de la API REST → valor de JavaScript. */
function valor_(campo) {
  if (!campo) return undefined;
  if ('stringValue' in campo) return campo.stringValue;
  if ('doubleValue' in campo) return Number(campo.doubleValue);
  if ('integerValue' in campo) return Number(campo.integerValue);
  if ('booleanValue' in campo) return campo.booleanValue;
  if ('timestampValue' in campo) return campo.timestampValue;
  if ('nullValue' in campo) return null;
  return undefined;
}

/** Valor de JavaScript → campo de la API REST (textos, números y listas de textos). */
function campo_(valor) {
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(campo_) } };
  if (typeof valor === 'number') return { doubleValue: valor };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  return { stringValue: String(valor) };
}

/** Tarjetas de la app por sus últimos 4 dígitos: { '1234': {id, nombre} }. */
function leerTarjetas_() {
  const r = pedirFirestore_('get', `${rutaHogar_('tarjetas')}?pageSize=300`);
  if (r.codigo !== 200) throw errorDeFirestore_('leer las tarjetas', r);
  const tarjetas = {};
  (r.datos.documents || []).forEach((documento) => {
    const campos = documento.fields || {};
    const ultimos = valor_(campos.ultimos);
    if (!ultimos) return;
    const clave = String(ultimos).padStart(4, '0');
    tarjetas[clave] = {
      id: documento.name.split('/').pop(),
      nombre: `Tarjeta ${valor_(campos.banco) || ''} ••${clave}`.replace('  ', ' '),
    };
  });
  return tarjetas;
}

/** Gastos ya guardados de un mes, para no repetir y para detectar los anotados a mano. */
function leerGastosDelMes_(mes) {
  const r = pedirFirestore_('post', `${rutaDocumento_(`hogares/${AJUSTES.hogar}`)}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: 'gastos' }],
      where: { fieldFilter: { field: { fieldPath: 'mes' }, op: 'EQUAL', value: { stringValue: mes } } },
    },
  });
  if (r.codigo !== 200) throw errorDeFirestore_('leer los gastos del mes', r);
  return (Array.isArray(r.datos) ? r.datos : [])
    .filter((fila) => fila.document)
    .map(({ document }) => {
      const c = document.fields || {};
      return {
        id: document.name.split('/').pop(),
        monto: valor_(c.monto),
        fecha: valor_(c.fecha),
        origen: valor_(c.origen),
        descartado: valor_(c.descartado) === true,
      };
    });
}

/** El pedido hecho desde la app ("Buscar gastos del mes en los correos"), o null. */
function leerSolicitud_() {
  const r = pedirFirestore_('get', rutaHogar_('lectorCorreo/solicitud'));
  if (r.codigo === 404) return null;
  if (r.codigo !== 200) throw errorDeFirestore_('leer el pedido de la app', r);
  const c = r.datos.fields || {};
  const id = valor_(c.id);
  const mes = valor_(c.mes);
  return id && /^\d{4}-\d{2}$/.test(mes) ? { id, mes } : null;
}

/**
 * Deja en Firestore el estado de esta cuenta para que la app lo muestre:
 * cuándo revisó por última vez y el resultado del último pedido.
 */
function escribirEstadoCuenta_(cuenta, datos) {
  const campos = { cuenta: campo_(cuenta) };
  Object.keys(datos).forEach((clave) => {
    campos[clave] = campo_(datos[clave]);
  });
  const r = pedirFirestore_('post', `${BASE_DOCUMENTOS()}:commit`, {
    writes: [
      {
        update: { name: rutaHogar_(`lectorCorreo/cuenta-${claveDeCuenta(cuenta)}`), fields: campos },
        updateMask: { fieldPaths: Object.keys(campos) },
        updateTransforms: [{ fieldPath: 'ultimaRevision', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  });
  if (r.codigo !== 200) throw errorDeFirestore_('guardar el estado de la revisión', r);
}

/**
 * Guarda el gasto (y suma al saldo de la tarjeta) en un solo paso. El id del
 * gasto sale del id del correo, así un correo nunca se anota dos veces.
 * @param {string|null} parecido  Id de un gasto anotado a mano que parece el mismo.
 * @returns {'guardado'|'repetido'}
 */
function guardarGasto_(idCorreo, fecha, aviso, categoria, tarjeta, parecido) {
  const campos = {
    fecha: campo_(fecha),
    mes: campo_(fecha.slice(0, 7)),
    monto: { doubleValue: aviso.monto },
    categoria: campo_(categoria),
    medio: campo_(tarjeta ? `tarjeta:${tarjeta.id}` : 'efectivo'),
    nota: campo_(tarjeta ? aviso.comercio : `${aviso.comercio} · tarjeta ••${aviso.ultimos}`),
    autor: { mapValue: { fields: { uid: campo_('correo'), nombre: campo_('Correo del banco') } } },
    origen: campo_('correo'),
  };
  if (parecido) campos.posibleRepetido = campo_(parecido);

  const escrituras = [
    {
      update: { name: rutaHogar_(`gastos/correo-${idCorreo}`), fields: campos },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'creadoEn', setToServerValue: 'REQUEST_TIME' }],
    },
  ];
  if (tarjeta) {
    escrituras.push({
      transform: {
        document: rutaHogar_(`tarjetas/${tarjeta.id}`),
        fieldTransforms: [{ fieldPath: 'saldo', increment: { doubleValue: aviso.monto } }],
      },
    });
  }

  const r = pedirFirestore_('post', `${BASE_DOCUMENTOS()}:commit`, { writes: escrituras });
  if (r.codigo === 200) return 'guardado';
  const estado = r.datos.error ? r.datos.error.status : '';
  if (estado === 'ALREADY_EXISTS' || estado === 'FAILED_PRECONDITION') return 'repetido';
  throw errorDeFirestore_('guardar el gasto', r);
}
