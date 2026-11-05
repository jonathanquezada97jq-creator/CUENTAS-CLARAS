/**
 * CUENTAS CLARAS · LECTOR DE AVISOS DEL BANCO
 *
 * Corre dentro de tu cuenta de Google (script.google.com), no en la app.
 * Cada 5 minutos:
 *   1. Si en la app alguien tocó "Buscar lo de (mes) en los correos", revisa
 *      todos los avisos de ese mes en este Gmail y anota lo que falte.
 *   2. Si se actualizó este script o cambiaron en la app las cuentas, las
 *      tarjetas o los gastos fijos, vuelve a revisar el mes actual: así se
 *      anota lo que antes no se pudo (por ejemplo, transferencias de una
 *      cuenta que todavía no estaba registrada).
 *   3. Si no, revisa los avisos de los últimos 2 días.
 *
 * Qué hace con cada aviso:
 *   - Compra con tarjeta → gasto. Sube el saldo de la tarjeta de crédito o
 *     baja el de la cuenta, si fue con débito.
 *   - Cobro automático de un gasto fijo (universidad, internet…) → marca el
 *     gasto fijo como pagado en Pagos, sin anotar un gasto aparte.
 *   - Transferencia (Transfer365 y parecidas) → movimiento entre cuentas o
 *     pago de tarjeta, con los saldos ajustados.
 *
 * Sin duplicados:
 *   - Cada correo se anota una sola vez, aunque se revise el mes muchas veces.
 *   - La misma transferencia avisada por los dos bancos (o en los Gmail de los
 *     dos) se anota una vez: por el número de referencia o, si no coincide,
 *     por monto, fecha y cuentas.
 *   - Si ya lo habían anotado a mano en la app (un gasto, una transferencia,
 *     el pago de una tarjeta o de un gasto fijo), el aviso se enlaza con eso
 *     en lugar de anotarse otra vez.
 *
 * Los avisos que parecen transferencias pero no se pudieron leer quedan con
 * la etiqueta "Cuentas Claras/Revisar" en Gmail y aparecen en la app.
 *
 * Los correos no salen de Google: el script lee Gmail y escribe directo en
 * tu base de datos de Firebase con tu propia cuenta.
 *
 * Instalación y actualización paso a paso: docs/AVISOS-DEL-BANCO.md
 *
 * Funciones para correr desde el editor:
 *   probarSinGuardar()            Muestra qué encontraría en los últimos días, sin guardar.
 *   probarMesSinGuardar()         Lo mismo con todo el mes actual.
 *   verAvisosSinLeer()            Muestra el texto de los avisos del mes que no se
 *                                 pudieron leer, para mandárselo a quien mantiene la app.
 *   instalarRevisionAutomatica()  Activa la revisión cada 5 minutos.
 *   detenerRevisionAutomatica()   La apaga.
 *   revisarCorreos()              Una revisión ahora (la que corre sola).
 *   revisarMesActual()            Busca y anota todo el mes actual ahora.
 */

/** Cambia con cada versión del script: al cambiar, se vuelve a revisar el mes. */
const VERSION_LECTOR = '2026-11-04';

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
   * que sea más preciso, agregá el remitente de tus bancos, por ejemplo:
   *   'from:(notificaciones@bancocuscatlan.com OR notificaciones_bac@baccredomatic.com)'
   */
  filtro:
    '(compra OR consumo OR cargo OR transacción OR transaccion OR autorizada OR aprobada OR transferencia OR transfer365 OR abono OR traslado OR acreditado OR depósito OR deposito OR débito OR debito)',
  /** En la revisión de rutina, cuántos días hacia atrás mirar. */
  diasRecientes: 2,
  /** Cada cuántos minutos revisar: 5, 10, 15 o 30. */
  minutosEntreRevisiones: 5,
  /** Tope de correos al revisar un mes completo (cada ejecución tiene 6 minutos). */
  maximoCorreosPorMes: 500,
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
    // Si cambió el script o las cuentas, tarjetas o gastos fijos de la app,
    // lo que antes no se pudo anotar quizá ahora sí: se revisa el mes de nuevo.
    const huella = `${VERSION_LECTOR}|${contexto.huella}`;
    if (huella !== propiedades.getProperty('ultimaHuella')) {
      Logger.log('Cambió el lector o las cuentas, tarjetas o gastos fijos de la app: se revisa el mes actual.');
      revisarMes_(mesActual_(), contexto);
      propiedades.setProperty('ultimaHuella', huella);
    } else {
      revisarRecientes_(contexto);
    }
    escribirEstadoCuenta_(contexto, {});
  });
}

/** Busca y anota todo el mes actual ahora (sin esperar a que lo pidan en la app). */
function revisarMesActual() {
  conCandado_(() => {
    const contexto = crearContexto_({ guardar: true });
    revisarMes_(mesActual_(), contexto);
    escribirEstadoCuenta_(contexto, resumenParaGuardar_(contexto.resumen, { estado: 'listo', mes: mesActual_() }));
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

/**
 * Muestra el texto completo de los avisos del mes que parecen transferencias
 * pero no se pudieron leer. Copiá lo que sale en el registro y mandáselo a
 * quien mantiene la app para que el lector aprenda ese formato.
 */
function verAvisosSinLeer() {
  const contexto = crearContexto_({ guardar: false });
  contexto.mostrarTextoSinLeer = true;
  revisarMes_(mesActual_(), contexto);
  Logger.log(
    contexto.resumen.sinLeer
      ? `Hay ${contexto.resumen.sinLeer} aviso(s) sin leer: su texto está arriba.`
      : 'Todos los avisos del mes se pudieron leer.',
  );
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

/**
 * Palabras que indican que el correo NO es una compra que haya que anotar.
 * Las transferencias se leen aparte (leerMovimiento); si una no se pudo leer,
 * estas palabras evitan que se anote como compra.
 */
const NO_ES_CARGO =
  /(rechazad|declinad|denegad|no\s+autorizad|no\s+fue\s+aprobad|reversi[oó]n|reversad|reverso|anulad|devoluci[oó]n|reembolso|pago\s+recibido|hemos\s+recibido\s+(tu|su)\s+pago|abono\s+a\s+(tu|su)\s+tarjeta|pago\s+a\s+(tu|su)\s+tarjeta|pago\s+de\s+(tu|su)\s+tarjeta|transfer\s*365|(tu|su)\s+transferencia|transferencia\s+(efectuada|realizada|recibida|enviada|exitosa|finalizada|entre|a\s+terceros|propia|local|ach|interbancaria|de\s+fondos)|traslado\s+(de\s+fondos|entre\s+cuentas)|abono\s+a\s+(tu\s+|su\s+)?cuenta|(ha|has)\s+recibido\s+(un\s+abono|una\s+transferencia|dinero|un\s+dep[oó]sito)|(dep[oó]sito|cr[eé]dito)\s+a\s+(tu|su)\s+cuenta|acreditad[oa]s?\s+(a|en)\s+(tu|su)\s+cuenta)/i;

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

/** Texto del correo sin espacios raros ni retornos de carro. */
function limpiarTexto_(texto) {
  return String(texto || '').replace(/\u00a0/g, ' ').replace(/\r/g, '');
}

/**
 * Lee el texto de un correo (asunto + cuerpo).
 * @returns {{tipo:'cargo', monto:number, ultimos:string, comercio:string}
 *          |{tipo:'ignorar', motivo:string}|null}
 *   null si no parece un aviso de compra con tarjeta.
 */
function leerAviso(texto) {
  const t = limpiarTexto_(texto);
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
 * fecha con un día de diferencia como máximo (aunque se haya anotado con otro
 * medio). No cuentan los que ya se enlazaron con otro aviso. Devuelve su id, o null.
 * @param {{id:string, monto:number, fecha:string, origen?:string, descartado?:boolean, correoId?:string}[]} gastos
 */
function buscarParecido(gastos, monto, fecha) {
  const parecido = gastos.find(
    (g) =>
      g.origen !== 'correo' &&
      !g.descartado &&
      !g.correoId &&
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
/* Leer una transferencia (funciones puras, con pruebas en tests/)    */
/* ------------------------------------------------------------------ */

/**
 * Frases de un aviso de transferencia o movimiento entre cuentas. Son
 * frases, no la palabra "transferencia" sola, para no confundir un aviso de
 * compra cuyo pie dice "Hacé tus transferencias en línea".
 */
const ES_TRANSFERENCIA = new RegExp(
  [
    'transfer\\s*365',
    '(?:su|tu)\\s+transferencia',
    '(?:una|la)\\s+transferencia',
    'transferencia\\s+(?:efectuada|realizada|recibida|enviada|exitosa|finalizada|entre|a\\s+terceros|propia|local|ach|interbancaria|de\\s+fondos|electr[oó]nica|inmediata|procesada|aplicada)',
    'transferencias?\\s+entre\\s+cuentas',
    'traslado\\s+(?:de\\s+fondos|entre\\s+cuentas)',
    'abono\\s+a\\s+(?:tu\\s+|su\\s+)?cuenta',
    '(?:ha|has)\\s+recibido\\s+(?:un\\s+abono|una\\s+transferencia|dinero|un\\s+dep[oó]sito|fondos)',
    'recibiste\\s+(?:dinero|una\\s+transferencia|un\\s+dep[oó]sito|fondos|\\$|us\\$|usd)',
    '(?:dep[oó]sito|cr[eé]dito)\\s+a\\s+(?:tu|su)\\s+cuenta',
    'acreditad[oa]s?\\s+(?:a|en)\\s+(?:tu|su)\\s+cuenta',
    'env[ií]o\\s+de\\s+dinero',
    '(?:te|le)\\s+(?:han\\s+)?(?:enviado|transferido|depositado)',
    'transferiste|enviaste\\s+(?:dinero|\\$|us\\$|usd)',
  ].join('|'),
  'i',
);

/**
 * Pago de una tarjeta de crédito. Solo se lee si el aviso dice de qué cuenta
 * salió el dinero; el "recibimos su pago" del banco de la tarjeta no se anota
 * (el pago ya llega por el aviso de la cuenta de donde salió).
 */
const ES_PAGO_DE_TARJETA = /pago\s+(?:a|de)\s+(?:su\s+|tu\s+|la\s+)?tarjeta/i;

/** Avisos de compra: estos nunca son transferencias. */
const ES_AVISO_DE_COMPRA = /(^|\n)[\s•·*-]*(comercio|establecimiento)\s*:|\bcompra\s+(aprobada|autorizada|realizada|exitosa|por)\b/i;

/** El dueño del correo recibe el dinero (si no, lo manda). */
const ES_ENTRADA =
  /(?:ha|has)\s+recibido|recibiste|(?:te|le)\s+(?:han\s+)?(?:transferido|enviado|depositado)|acreditad[oa]s?\s+(?:a|en)\s+(?:su|tu)\s+cuenta|(?:abono|dep[oó]sito|cr[eé]dito)\s+a\s+(?:su|tu)\s+cuenta/i;

/** Transferencias que no se hicieron. */
const TRANSFERENCIA_FALLIDA = /rechazad|no\s+fue\s+(?:aplicad|procesad|realizad|exitos)|no\s+se\s+pudo|fallid|revertid|reversi[oó]n/i;

/** Texto sin tildes, en minúsculas y con los espacios juntos, para comparar. */
function normalizar_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bancos de El Salvador: clave → cómo se reconoce en un texto ya normalizado. */
const BANCOS_SV = [
  ['agricola', 'Agrícola', /agricola/],
  ['cuscatlan', 'Cuscatlán', /cuscatlan/],
  ['bac', 'BAC', /(^|[^a-z])bac([^a-z]|$)|credomatic|banco de america central/],
  ['davivienda', 'Davivienda', /davivienda/],
  ['promerica', 'Promerica', /promerica/],
  ['hipotecario', 'Hipotecario', /hipotecario/],
  ['atlantida', 'Atlántida', /atlantida/],
  ['industrial', 'Industrial', /industrial/],
  ['azul', 'Banco Azul', /banco azul|bancoazul|(^|[^a-z])azul([^a-z]|$)/],
  ['fedecredito', 'Fedecrédito', /fedecredito/],
  ['abank', 'Abank', /abank/],
  ['bfa', 'BFA', /(^|[^a-z])bfa([^a-z]|$)|fomento agropecuario/],
  ['cooperativa', 'Cooperativa', /cooperativa|acacu|acacpa|comedica/],
];

/** "B. ATLANTIDA", "Banco Atlántida" → "atlantida"; si no se reconoce, "". */
function normalizarBanco(texto) {
  const t = normalizar_(texto);
  if (!t) return '';
  const encontrado = BANCOS_SV.find(([, , patron]) => patron.test(t));
  return encontrado ? encontrado[0] : '';
}

function nombreDeBanco_(clave) {
  const encontrado = BANCOS_SV.find(([c]) => c === clave);
  return encontrado ? encontrado[1] : '';
}

/**
 * Pares "Etiqueta: valor" del correo, en orden. Acepta el valor en la misma
 * línea o en la siguiente (así quedan las tablas al pasar a texto) y recuerda
 * si están bajo "Información Origen" o "Información Destino".
 * @returns {{seccion:string, etiqueta:string, valor:string}[]}
 */
function camposDelCorreo_(texto) {
  const lineas = limpiarTexto_(texto)
    .split('\n')
    .map((l) => l.replace(/^[\s•·*\-–]+/, '').trim())
    .filter(Boolean);
  const pareceEtiqueta = (linea) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^:]{0,40}:/.test(linea);
  const campos = [];
  let seccion = '';
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i];
    const encabezado = /^(?:informaci[oó]n|datos)\s+(?:de\s+|del\s+)?(origen|destino)\s*:?$/i.exec(linea);
    if (encabezado) {
      seccion = normalizar_(encabezado[1]);
      continue;
    }
    const m = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .º°]{0,40}?)\s*:\s*(.*)$/.exec(linea);
    if (!m) continue;
    let valor = m[2].trim();
    if (!valor && i + 1 < lineas.length && !pareceEtiqueta(lineas[i + 1])) {
      valor = lineas[i + 1];
      i += 1;
    }
    campos.push({ seccion, etiqueta: normalizar_(m[1]).replace(/[^a-z0-9 ]/g, ''), valor });
  }
  return campos;
}

/** Valor del primer campo cuya etiqueta cumple el patrón (y está en la sección, si se pide). */
function buscarCampo_(campos, patron, seccion) {
  const campo = campos.find((c) => patron.test(c.etiqueta) && (seccion === undefined || c.seccion === seccion));
  return campo ? campo.valor : '';
}

/** "X8320", "*****8320", "TARJETA DE CREDITO XXXXXX4200", "***421" → los últimos dígitos (3 o 4). */
function ultimosDe_(valor) {
  const m = /(\d{3,4})\D*$/.exec(String(valor || ''));
  return m ? m[1] : null;
}

/** "USD0.55", "$1,250.00", "0.55" → número. */
function montoDe_(valor) {
  const m = /(\d[\d.,]*)/.exec(String(valor || '').replace(/US\$|USD|\$/gi, ' '));
  return m ? aNumero_(m[1]) : null;
}

/** El primer monto con moneda de un texto que no sea un saldo ni una comisión. */
function montoEnTexto_(texto) {
  const montos = /(?:US\$|USD|\$)\s?(\d[\d.,]*\d|\d)/gi;
  let m;
  while ((m = montos.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 40), m.index);
    if (/(saldo|disponible|comisi[oó]n|l[ií]mite|iva)[^$\d]{0,30}$/i.test(antes)) continue;
    const n = aNumero_(m[1]);
    if (n) return n;
  }
  return null;
}

/** "02/11/2026 12:35:20 A.M." (día/mes/año) o "2026-11-02T12:35:35-06:00" → "2026-11-02". */
function fechaDe_(valor) {
  const texto = String(valor || '');
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return null;
}

/** El banco que manda el correo: por el remitente o, si no, por la firma. */
function bancoDelCorreo_(remitente, texto) {
  const porRemitente = normalizarBanco(String(remitente || '').replace(/[._@-]/g, ' '));
  if (porRemitente) return porRemitente;
  const firma =
    /atentamente,?\s*\n\s*([^\n]{3,60})/i.exec(texto) || /^\s*([^\n]{2,40}?)\s+le\s+(?:notifica|informa)/im.exec(texto);
  return firma ? normalizarBanco(firma[1]) : '';
}

/** Texto corto que sirva de nota: descarta "-", "Transfer365" y párrafos largos. */
function textoUtil_(valor) {
  const t = String(valor || '').trim();
  if (t.length < 2 || t.length > 40 || /^[-–.]+$/.test(t) || /^transfer\s*365$/i.test(t)) return '';
  return t;
}

/** Etiquetas de la cuenta de donde sale el dinero (ya sin tildes ni puntuación). */
const ETIQUETA_ORIGEN =
  /^(producto|cuenta|tarjeta|numero de cuenta)( de)? (origen|debito|cargo|a debitar|debitada|que envia|remitente)$|^cuenta debitada$|^cuenta de cargo$|^debitado de$|^desde( la)? cuenta$|^de la cuenta$/;
/** Etiquetas de la cuenta o tarjeta a donde llega. */
const ETIQUETA_DESTINO =
  /^(producto|cuenta|tarjeta|numero de cuenta)( de)? (destino|credito|abono|a acreditar|acreditada|beneficiaria|del beneficiario|a pagar|pagada|que recibe)$|^cuenta acreditada$|^cuenta beneficiaria$|^acreditado a$|^hacia( la)? cuenta$|^a la cuenta$/;
/** Etiquetas del monto, sin saldos ni comisiones. */
const ETIQUETA_MONTO = /^(monto|importe|valor|cantidad|total)( |$)(?!.*(disponible|saldo|comision|iva|cargo por))/;

/** "cuenta de ahorro X1421", "cuenta ****1421", "cuenta terminada en 1421". */
const CUENTA_EN_ORACION = String.raw`cuenta(?:\s+de\s+ahorros?|\s+corriente)?\s*(?:n[uú]mero|no\.?|#)?\s*(?:terminada\s+en\s+)?[x*•·#.\-]*\s*(\d[\d\-]{2,})`;
const PROPIA_EN_ORACION = new RegExp(String.raw`\b(?:a|de|desde|en)\s+(?:su|tu)\s+` + CUENTA_EN_ORACION, 'i');
const ORIGEN_EN_ORACION = new RegExp(String.raw`\bdesde\s+(?:la\s+)?` + CUENTA_EN_ORACION, 'i');
const DESTINO_EN_ORACION = new RegExp(String.raw`\b(?:a|hacia|para)\s+(?:la\s+)?` + CUENTA_EN_ORACION, 'i');
const TARJETA_EN_ORACION =
  /\b(?:a|hacia|para|de)\s+(?:la\s+|su\s+|tu\s+)?tarjeta(?:\s+de\s+cr[eé]dito)?\s*(?:terminada\s+en\s+)?[x*•·#.\-]*\s*(\d[\d\-]{2,})/i;

/** Busca el patrón y devuelve los últimos dígitos y el banco que se nombra justo después. */
function cuentaEnOracion_(patron, texto) {
  const m = patron.exec(texto);
  if (!m) return null;
  const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 50);
  return { ultimos: ultimosDe_(m[1]), banco: normalizarBanco(despues.split(/[.\n]/)[0]) };
}

/**
 * @typedef {Object} ExtremoLeido  Un lado de la transferencia según el correo.
 * @property {string} banco  Clave del banco (ver BANCOS_SV) o "".
 * @property {string|null} ultimos  Últimos dígitos de la cuenta o tarjeta.
 * @property {boolean} esTarjeta  Si es una tarjeta de crédito.
 * @property {string} persona  Nombre del titular, si el correo lo dice.
 */

/**
 * Lee un correo de transferencia (Transfer365 y parecidos). Entiende los
 * datos en forma de lista ("Producto Origen: X8320") y en una oración
 * ("transferiste $50.00 desde tu cuenta ****1421 a la cuenta ****5555").
 * @param {string} texto  Asunto + cuerpo.
 * @param {string} [remitente]  "Notificaciones Banco Cuscatlán <…>"; dice de qué banco es el correo.
 * @returns {{tipo:'movimiento', monto:number, fecha:string|null, referencia:string|null,
 *            entrada:boolean, desde:ExtremoLeido, hacia:ExtremoLeido, concepto:string}
 *          |{tipo:'ignorar', motivo:string}|null}
 *   null si no es un correo de transferencia.
 */
function leerMovimiento(texto, remitente) {
  const t = limpiarTexto_(texto);
  const esTransferencia = ES_TRANSFERENCIA.test(t);
  const esPagoDeTarjeta = !esTransferencia && ES_PAGO_DE_TARJETA.test(t);
  if (!esTransferencia && !esPagoDeTarjeta) return null;
  if (ES_AVISO_DE_COMPRA.test(t) && !/transfer\s*365/i.test(t)) return null;

  const campos = camposDelCorreo_(t);
  const valor = (patron, seccion) => buscarCampo_(campos, patron, seccion);
  const monto = montoDe_(valor(ETIQUETA_MONTO)) || montoEnTexto_(t);
  if (!monto) return null;
  const fallida = TRANSFERENCIA_FALLIDA.exec(t);
  if (fallida) return { tipo: 'ignorar', motivo: fallida[0] };

  const entrada = ES_ENTRADA.test(t);
  const banco = bancoDelCorreo_(remitente, t);

  // 1. Los datos en forma de lista.
  let ultimosOrigen = ultimosDe_(valor(ETIQUETA_ORIGEN) || valor(/^(cuenta|producto|numero de cuenta)$/, 'origen'));
  const productoDestino = valor(ETIQUETA_DESTINO) || valor(/^(cuenta|producto|numero de cuenta)$/, 'destino');
  let ultimosDestino = ultimosDe_(productoDestino);
  let bancoOrigenLeido = normalizarBanco(valor(/^banco( de)? (origen|emisor|ordenante|que envia)$/));
  let bancoDestinoLeido = normalizarBanco(valor(/^banco( de)? (destino|receptor|beneficiario|que recibe)$/));
  const tipoTransaccion = valor(/^tipo( de)? (transaccion|operacion|producto|cuenta)$/);
  let destinoEsTarjeta = /tarjeta|credito/i.test(normalizar_(`${productoDestino} ${tipoTransaccion}`));

  // 2. Lo que falte, de las oraciones: "abono a su CUENTA DE AHORRO X1421",
  //    "desde la cuenta ****8320 de BAC", "a la tarjeta terminada en 4200".
  const propia = cuentaEnOracion_(PROPIA_EN_ORACION, t);
  if (propia) {
    if (entrada && !ultimosDestino) ultimosDestino = propia.ultimos;
    if (!entrada && !ultimosOrigen) ultimosOrigen = propia.ultimos;
  }
  const origen = !ultimosOrigen && cuentaEnOracion_(ORIGEN_EN_ORACION, t);
  if (origen) {
    ultimosOrigen = origen.ultimos;
    bancoOrigenLeido = bancoOrigenLeido || origen.banco;
  }
  if (!ultimosDestino) {
    const tarjeta = cuentaEnOracion_(TARJETA_EN_ORACION, t);
    const cuenta = !tarjeta && cuentaEnOracion_(DESTINO_EN_ORACION, t);
    const destino = tarjeta || cuenta;
    if (destino) {
      ultimosDestino = destino.ultimos;
      bancoDestinoLeido = bancoDestinoLeido || destino.banco;
      destinoEsTarjeta = destinoEsTarjeta || Boolean(tarjeta);
    }
  }

  // Un aviso que no trae ninguna cuenta ni banco de origen o destino no es una transferencia.
  if (!ultimosOrigen && !ultimosDestino && !bancoOrigenLeido && !bancoDestinoLeido) return null;
  // Un pago de tarjeta solo se lee si dice de qué cuenta salió (ver ES_PAGO_DE_TARJETA).
  if (esPagoDeTarjeta && !ultimosOrigen) return null;
  if (esPagoDeTarjeta) destinoEsTarjeta = true;

  const bancoOrigen = bancoOrigenLeido || (entrada ? '' : banco);
  const bancoDestino = bancoDestinoLeido || (entrada ? banco : '');
  const referencia = valor(/referencia|comprobante|autorizacion|numero de (transaccion|operacion)|no (de )?(transaccion|operacion)|id de (transaccion|operacion)/);

  return {
    tipo: 'movimiento',
    monto,
    fecha: fechaDe_(valor(/^fecha/)),
    referencia: (referencia.match(/[A-Za-z0-9-]{6,}/) || [null])[0],
    entrada,
    desde: {
      banco: bancoOrigen,
      ultimos: ultimosOrigen,
      esTarjeta: false,
      persona: textoUtil_(valor(/^(originado por|ordenante|remitente|enviado por|de parte de)$/)),
    },
    hacia: {
      banco: bancoDestino,
      ultimos: ultimosDestino,
      esTarjeta: destinoEsTarjeta,
      persona: textoUtil_(valor(/^(beneficiario|cliente|destinatario|nombre del beneficiario|para)$/)),
    },
    concepto: textoUtil_(valor(/^(concepto|descripcion|comentario|motivo)$/)),
  };
}

/**
 * Un aviso que parece una transferencia (trae un monto y frases de
 * transferencia) pero que leerMovimiento no pudo leer. Esos no se anotan
 * como compra: quedan para revisar y aparecen en la app.
 */
function pareceTransferenciaSinLeer(texto) {
  const t = limpiarTexto_(texto);
  return ES_TRANSFERENCIA.test(t) && !ES_AVISO_DE_COMPRA.test(t) && !TRANSFERENCIA_FALLIDA.test(t) && Boolean(montoEnTexto_(t) || /monto\s*:/i.test(t));
}

/** Los mismos últimos dígitos (los avisos a veces muestran solo 3). */
const mismosUltimos_ = (a, b) => {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length < 3 || y.length < 3) return false;
  return x.endsWith(y) || y.endsWith(x);
};
const bancoCompatible_ = (claveLeida, bancoRegistrado) => {
  const registrado = normalizarBanco(bancoRegistrado);
  return !claveLeida || !registrado || registrado === claveLeida;
};

/**
 * Busca en la app la cuenta o tarjeta de un lado de la transferencia.
 * - Por los últimos dígitos (si el banco no contradice).
 * - Si el correo no trae dígitos, por el banco, cuando solo hay una cuenta en ese banco.
 * @returns {{referencia:string, nombre:string}|null}
 */
function resolverExtremo_(extremo, cuentas, tarjetas, { adivinarPorBanco = true } = {}) {
  const comoCuenta = (c) => ({ referencia: `cuenta:${c.id}`, nombre: c.nombre });
  const comoTarjeta = (t) => ({ referencia: `tarjeta:${t.id}`, nombre: t.nombre });
  const listaDeTarjetas = Object.keys(tarjetas).map((ultimos) => ({ ...tarjetas[ultimos], ultimos }));

  if (extremo.ultimos) {
    const tarjeta = listaDeTarjetas.find((x) => mismosUltimos_(x.ultimos, extremo.ultimos) && bancoCompatible_(extremo.banco, x.banco));
    if (extremo.esTarjeta && tarjeta) return comoTarjeta(tarjeta);
    const cuenta =
      cuentas.find((c) => mismosUltimos_(c.ultimos, extremo.ultimos) && bancoCompatible_(extremo.banco, c.banco)) ||
      cuentas.find((c) => mismosUltimos_(c.debito, extremo.ultimos) && bancoCompatible_(extremo.banco, c.banco));
    if (cuenta) return comoCuenta(cuenta);
    return tarjeta ? comoTarjeta(tarjeta) : null;
  }
  if (adivinarPorBanco && !extremo.esTarjeta && extremo.banco) {
    const delBanco = cuentas.filter((c) => normalizarBanco(c.banco) === extremo.banco);
    if (delBanco.length === 1) return comoCuenta(delBanco[0]);
  }
  return null;
}

/**
 * Convierte lo leído del correo en un movimiento de la app.
 * @param {Object} movimiento  Resultado de leerMovimiento.
 * @param {{id:string, banco:string, ultimos?:string, debito?:string, nombre:string}[]} cuentas
 * @param {Object<string, {id:string, banco:string, nombre:string}>} tarjetas  Por últimos 4 dígitos.
 * @returns {{desde:string, hacia:string, nombreDesde:string, nombreHacia:string}|null}
 *   "externo" en el lado que no está en la app; null si ninguno de los dos lados está.
 */
function resolverMovimiento(movimiento, cuentas, tarjetas) {
  // Un lado sin dígitos se adivina por el banco solo si es el lado del dueño del
  // correo: si el aviso es de que salió dinero, la cuenta de origen es la suya en
  // ese banco; si es de que llegó, la de destino. El otro lado podría ser de
  // cualquier persona con cuenta en ese banco: solo se reconoce por sus dígitos.
  const desde = resolverExtremo_(movimiento.desde, cuentas, tarjetas, { adivinarPorBanco: !movimiento.entrada });
  const hacia = resolverExtremo_(movimiento.hacia, cuentas, tarjetas, { adivinarPorBanco: Boolean(movimiento.entrada) });
  // Solo se mueve dinero desde una cuenta; una tarjeta de crédito no es origen.
  const desdeValido = desde && desde.referencia.startsWith('cuenta:') ? desde : null;
  if (!desdeValido && !hacia) return null;
  if (desdeValido && hacia && desdeValido.referencia === hacia.referencia) return null;
  return {
    desde: desdeValido ? desdeValido.referencia : 'externo',
    hacia: hacia ? hacia.referencia : 'externo',
    nombreDesde: desdeValido ? desdeValido.nombre : describirExtremo_(movimiento.desde),
    nombreHacia: hacia ? hacia.nombre : describirExtremo_(movimiento.hacia),
  };
}

/** "BAC ••8320", "Atlántida tarjeta ••4200", "JUAN PEREZ · Agrícola". */
function describirExtremo_(extremo) {
  const cuenta = [nombreDeBanco_(extremo.banco), extremo.esTarjeta ? 'tarjeta' : '', extremo.ultimos ? `••${extremo.ultimos}` : '']
    .filter(Boolean)
    .join(' ');
  return [extremo.persona, cuenta].filter(Boolean).join(' · ') || 'otra cuenta';
}

/** Nota para el movimiento: el concepto y lo que no está registrado en la app. */
function notaDeMovimiento(movimiento, resuelto) {
  const partes = [];
  if (movimiento.concepto) partes.push(movimiento.concepto);
  if (resuelto.desde === 'externo') partes.push(`Desde ${resuelto.nombreDesde}`);
  if (resuelto.hacia === 'externo') partes.push(`A ${resuelto.nombreHacia}`);
  return partes.join(' · ');
}

/**
 * Clave del aviso: por el número de referencia, que suele ser el mismo en
 * los correos de los dos bancos; si no hay, por el id del correo. Es el id
 * del movimiento cuando se crea, y se guarda en `referencias` cuando el
 * aviso se enlaza con un movimiento que ya existía.
 */
function idDeMovimiento(movimiento, idCorreo) {
  const referencia = String(movimiento.referencia || '').replace(/[^A-Za-z0-9-]/g, '');
  return referencia ? `ref-${referencia}` : `correo-${idCorreo}`;
}

/** Si un movimiento ya conoce este aviso (es su id o está en sus referencias). */
const yaConoceElAviso = (m, clave) => m.id === clave || (m.referencias || []).includes(clave);

/** El lado que avisa: el banco de donde sale el dinero o el banco a donde llega. */
const ladoDelAviso = (movimiento) => (movimiento.entrada ? 'entra' : 'sale');

/**
 * El mismo envío ya anotado: avisado por el otro banco (o en el otro Gmail)
 * con otra referencia, o anotado a mano en la app. Mismo monto, hasta 2 días
 * de diferencia, las mismas cuentas (o una que en un aviso no se conocía) y
 * que todavía no se haya enlazado un aviso de este mismo lado (dos avisos
 * del mismo lado con referencias distintas son dos transferencias).
 * Incluye los borrados en la app, para no volver a crearlos.
 * @param {{id:string, monto:number, fecha:string, desde:string, hacia:string, lado:string}} nuevo
 */
function buscarMismoMovimiento(movimientos, nuevo) {
  const compatible = (a, b) => a === b || a === 'externo' || b === 'externo';
  const candidatos = movimientos.filter(
    (m) =>
      Math.abs(Number(m.monto) - nuevo.monto) < 0.005 &&
      m.fecha &&
      diasEntre_(m.fecha, nuevo.fecha) <= 2 &&
      compatible(m.desde, nuevo.desde) &&
      compatible(m.hacia, nuevo.hacia) &&
      ((nuevo.desde !== 'externo' && m.desde === nuevo.desde) || (nuevo.hacia !== 'externo' && m.hacia === nuevo.hacia)) &&
      !(m.lados || []).includes(nuevo.lado),
  );
  candidatos.sort((a, b) => diasEntre_(a.fecha, nuevo.fecha) - diasEntre_(b.fecha, nuevo.fecha));
  return candidatos[0] || null;
}

/**
 * Otro movimiento del mes que se parece (mismo monto, ±1 día y una cuenta
 * en común) sin ser claramente el mismo: el nuevo se anota marcado
 * "¿Repetido?" para que decidan. Devuelve su id, o null.
 */
function buscarMovimientoParecido(movimientos, nuevo) {
  const comparte = (m) =>
    (nuevo.desde !== 'externo' && m.desde === nuevo.desde) || (nuevo.hacia !== 'externo' && m.hacia === nuevo.hacia);
  const parecido = movimientos.find(
    (m) =>
      m.id !== nuevo.id &&
      !m.descartado &&
      // Dos avisos del mismo lado con referencias distintas son dos transferencias.
      !(m.origen === 'correo' && (m.lados || []).includes(nuevo.lado)) &&
      Math.abs(Number(m.monto) - nuevo.monto) < 0.005 &&
      m.fecha &&
      diasEntre_(m.fecha, nuevo.fecha) <= 1 &&
      comparte(m),
  );
  return parecido ? parecido.id : null;
}

/**
 * Si la transferencia paga una tarjeta y en Pagos ya marcaron a mano el pago
 * de esa tarjeta por el mismo monto, devuelve ese pago: el aviso se enlaza
 * con él en lugar de anotarse otra vez.
 * @param {Object<string, {monto:number, desde?:string, correo?:string}>} pagados  Pagos marcados en el mes.
 * @returns {{clave:string, pago:Object}|null}
 */
function pagoDeTarjetaMarcado(pagados, hacia, monto) {
  if (!String(hacia).startsWith('tarjeta:')) return null;
  const clave = `tarjeta_${hacia.slice('tarjeta:'.length)}`;
  const pago = pagados[clave];
  return pago && !pago.correo && Math.abs(Number(pago.monto) - monto) < 0.005 ? { clave, pago } : null;
}

/**
 * Con qué se pagó una compra según los últimos 4 dígitos de la tarjeta:
 * una tarjeta de crédito registrada, la tarjeta de débito de una cuenta,
 * o ninguna (se anota como efectivo y el correo queda para revisar).
 * @returns {{medio:string, coleccion:'tarjetas'|'cuentas'|null, id:string|null, nombre:string, delta:number}}
 */
function destinoDelCargo(aviso, tarjetas, cuentas) {
  const tarjeta = tarjetas[aviso.ultimos];
  if (tarjeta) return { medio: `tarjeta:${tarjeta.id}`, coleccion: 'tarjetas', id: tarjeta.id, nombre: tarjeta.nombre, delta: aviso.monto };
  const cuenta = cuentas.find((c) => mismosUltimos_(c.debito, aviso.ultimos)) || cuentas.find((c) => mismosUltimos_(c.ultimos, aviso.ultimos));
  if (cuenta) return { medio: `cuenta:${cuenta.id}`, coleccion: 'cuentas', id: cuenta.id, nombre: `débito ${cuenta.nombre}`, delta: -aviso.monto };
  return { medio: 'efectivo', coleccion: null, id: null, nombre: '', delta: 0 };
}

/**
 * Un gasto anotado a mano que es la misma compra: mismo monto, mismo medio
 * (la misma tarjeta o el mismo débito), un día de diferencia como máximo y
 * que todavía no se haya enlazado con otro aviso. El aviso se enlaza con él.
 */
function buscarGastoIgual(gastos, cobro) {
  const iguales = gastos.filter(
    (g) =>
      g.origen !== 'correo' &&
      !g.descartado &&
      !g.correoId &&
      g.medio === cobro.medio &&
      Math.abs(Number(g.monto) - cobro.monto) < 0.005 &&
      g.fecha &&
      diasEntre_(g.fecha, cobro.fecha) <= 1,
  );
  iguales.sort((a, b) => diasEntre_(a.fecha, cobro.fecha) - diasEntre_(b.fecha, cobro.fecha));
  return iguales[0] || null;
}

/* ------------------------------------------------------------------ */
/* Cobros automáticos de gastos fijos (funciones puras, con pruebas)  */
/* ------------------------------------------------------------------ */

/** Palabras del nombre de un gasto fijo que no sirven para reconocerlo. */
const PALABRAS_COMUNES = new Set(
  'pago pagos cuota cuotas mensual mensualidad servicio servicios plan recibo factura cargo gasto gastos fijo fijos casa para por del las los una uno con'.split(' '),
);

/**
 * Palabras para reconocer el gasto fijo en el aviso: lo que escribieron en
 * "Cómo aparece en el correo" (separado por comas) o, si no, las palabras de
 * 4 letras o más de su nombre ("Universidad" sí; "Luz" no).
 */
function palabrasDelFijo(fijo) {
  const limpiar = (p) => normalizar_(p).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (fijo.comercio) {
    return String(fijo.comercio).split(/[,;/\n]+/).map(limpiar).filter((p) => p.length >= 2);
  }
  return limpiar(fijo.nombre)
    .split(' ')
    .filter((p) => p.length >= 4 && !PALABRAS_COMUNES.has(p));
}

/**
 * ¿Este cobro es el pago automático de un gasto fijo?
 * - Por el nombre: el comercio o beneficiario del aviso trae alguna palabra
 *   del gasto fijo, y se pagó con el medio del fijo (o el fijo no tiene medio).
 * - Por el monto: el mismo monto exacto, con la misma tarjeta o cuenta del
 *   fijo, y a 3 días o menos de su día de pago.
 * @param {{id:string, nombre:string, monto:number, dia:number, medio?:string, comercio?:string}[]} fijos
 * @param {Object<string, Object>} pagados  Pagos marcados del mes.
 * @param {{monto:number, fecha:string, medio:string, texto:string}} cobro
 * @returns {{fijo:Object, clave:string, porNombre:boolean, yaPagado:boolean}|null}
 */
function buscarFijoDelCobro(fijos, pagados, cobro) {
  const texto = ` ${normalizar_(cobro.texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  const dia = Number(String(cobro.fecha).slice(8, 10));
  const candidatos = fijos
    .map((fijo) => {
      const medioDelFijo = fijo.medio && fijo.medio !== 'efectivo' ? fijo.medio : null;
      const mismoMedio = medioDelFijo === cobro.medio;
      // La palabra tiene que empezar donde empieza una palabra del aviso.
      const porNombre = palabrasDelFijo(fijo).some((p) => texto.includes(` ${p}`));
      const distancia = Math.abs(dia - Number(fijo.dia));
      const cerca = distancia <= 3 || distancia >= 27; // el 30 y el 1 están cerca
      const mismoMonto = Math.abs(Number(fijo.monto) - cobro.monto) < 0.005;
      const sirve = (porNombre && (!medioDelFijo || mismoMedio)) || (mismoMedio && mismoMonto && cerca);
      if (!sirve) return null;
      const clave = `fijo_${fijo.id}`;
      return { fijo, clave, porNombre, yaPagado: Boolean(pagados[clave]), distancia };
    })
    .filter(Boolean);
  candidatos.sort(
    (a, b) => Number(b.porNombre) - Number(a.porNombre) || Number(a.yaPagado) - Number(b.yaPagado) || a.distancia - b.distancia,
  );
  if (!candidatos.length) return null;
  const { fijo, clave, porNombre, yaPagado } = candidatos[0];
  return { fijo, clave, porNombre, yaPagado };
}

/** Número corto que cambia cuando cambia el texto (para notar cambios en la app). */
function huella(texto) {
  let h = 0;
  const t = String(texto);
  for (let i = 0; i < t.length; i += 1) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
  const cuentas = leerCuentas_();
  const fijos = leerFijos_();
  Logger.log(`Tarjetas en la app: ${Object.keys(tarjetas).map((u) => `••${u}`).join(', ') || 'ninguna'}`);
  Logger.log(`Cuentas en la app: ${cuentas.map((c) => c.nombre).join(', ') || 'ninguna'}`);
  /** Lo ya guardado de cada mes, leído una sola vez por ejecución. */
  const cache = { gastos: {}, movimientos: {}, pagados: {} };
  const delMes = (tipo, mes, leerDeFirestore) => {
    if (!cache[tipo][mes]) cache[tipo][mes] = leerDeFirestore(mes);
    return cache[tipo][mes];
  };
  return {
    guardar,
    tarjetas,
    cuentas,
    fijos,
    /** Cambia si cambian las cuentas, tarjetas o gastos fijos de la app. */
    huella: huella(JSON.stringify([tarjetas, cuentas, fijos])),
    cuenta: Session.getEffectiveUser().getEmail(),
    etiquetas: guardar
      ? { registrado: obtenerEtiqueta_(AJUSTES.etiquetaRegistrado), revisar: obtenerEtiqueta_(AJUSTES.etiquetaRevisar) }
      : null,
    /** Avisos que no se pudieron anotar, para mostrarlos en la app (ver pendientes). */
    pendientes: guardar ? leerPendientes_() : {},
    gastosDelMes: (mes) => delMes('gastos', mes, leerGastosDelMes_),
    movimientosDelMes: (mes) => delMes('movimientos', mes, leerMovimientosDelMes_),
    pagadosDelMes: (mes) => delMes('pagados', mes, leerPagadosDelMes_),
    resumen: {
      nuevos: 0,
      movimientos: 0,
      fijos: 0,
      enlazados: 0,
      yaEstaban: 0,
      ignorados: 0,
      sinTarjeta: 0,
      sinCuenta: 0,
      sinLeer: 0,
      posiblesRepetidos: [],
      correosRevisados: 0,
    },
  };
}

/** Lo que se escribe en Firestore por las compras, cobros y transferencias que pasan por la cuenta o tarjeta. */
function saldosDelMedio_(medio, monto, contexto, signo = 1) {
  const [tipo, id] = String(medio).split(':');
  if (tipo === 'tarjeta' && Object.keys(contexto.tarjetas).some((u) => contexto.tarjetas[u].id === id)) {
    return [escrituraSaldo_('tarjetas', id, monto * signo)];
  }
  if (tipo === 'cuenta' && contexto.cuentas.some((c) => c.id === id)) return [escrituraSaldo_('cuentas', id, -monto * signo)];
  return [];
}

/**
 * Revisa un correo: compra, cobro de un gasto fijo o transferencia.
 * @returns {'no-es-aviso'|'ignorado'|'ya-estaba'|'prueba'|'guardado'|'sin-tarjeta'|'sin-cuenta'|'sin-leer'}
 */
function revisarMensaje_(mensaje, contexto) {
  const { resumen } = contexto;
  resumen.correosRevisados += 1;
  contexto.ultimoPendiente = null;
  const texto = `${mensaje.getSubject()}\n${mensaje.getPlainBody()}`;
  const movimiento = leerMovimiento(texto, mensaje.getFrom());
  let resultado;
  if (movimiento) {
    resultado = revisarMovimiento_(mensaje, movimiento, contexto);
  } else {
    const aviso = leerAviso(texto);
    if (aviso && aviso.tipo === 'cargo') {
      resultado = revisarCargo_(mensaje, aviso, contexto);
    } else if (pareceTransferenciaSinLeer(texto)) {
      resultado = avisoSinLeer_(mensaje, texto, contexto);
    } else if (aviso) {
      Logger.log(`Ignorado (${aviso.motivo}): ${mensaje.getSubject()}`);
      resumen.ignorados += 1;
      resultado = 'ignorado';
    } else {
      resultado = 'no-es-aviso';
    }
  }
  // Lo que no se pudo anotar queda pendiente (y se muestra en la app) hasta que se pueda.
  if (contexto.guardar) {
    if (resultado === 'sin-leer' || resultado === 'sin-cuenta') {
      contexto.pendientes[mensaje.getId()] = {
        fecha: Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd'),
        texto: contexto.ultimoPendiente || mensaje.getSubject(),
      };
    } else {
      delete contexto.pendientes[mensaje.getId()];
    }
  }
  return resultado;
}

/** Un aviso que parece una transferencia pero no se pudo leer: queda para revisar. */
function avisoSinLeer_(mensaje, texto, contexto) {
  const fecha = Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  contexto.resumen.sinLeer += 1;
  contexto.ultimoPendiente = `${fecha} · Sin leer: "${mensaje.getSubject()}" de ${String(mensaje.getFrom()).replace(/<.*>/, '').trim()}`;
  Logger.log(`${fecha} · Parece una transferencia pero no se pudo leer: "${mensaje.getSubject()}" (${mensaje.getFrom()})`);
  if (contexto.mostrarTextoSinLeer) {
    Logger.log(`----- Texto del aviso -----\n${limpiarTexto_(texto).replace(/\n{3,}/g, '\n\n').slice(0, 2500)}\n----- Fin del aviso -----`);
  }
  return 'sin-leer';
}

/**
 * Una compra con tarjeta. En este orden:
 *   1. ¿Ya se anotó este correo? → nada.
 *   2. ¿Es el cobro automático de un gasto fijo? → se marca el fijo pagado.
 *   3. ¿Ya la anotaron a mano (mismo monto y misma tarjeta)? → se enlaza.
 *   4. Si no, se anota como gasto (marcado "¿Repetido?" si se parece a otro).
 */
function revisarCargo_(mensaje, aviso, contexto) {
  const { resumen } = contexto;
  const idCorreo = mensaje.getId();
  const fecha = Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  const mes = fecha.slice(0, 7);
  const idGasto = `correo-${idCorreo}`;
  const gastos = contexto.gastosDelMes(mes);
  if (gastos.some((g) => g.id === idGasto || g.correoId === idCorreo)) {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }

  const destino = destinoDelCargo(aviso, contexto.tarjetas, contexto.cuentas);
  const monto = `$${aviso.monto.toFixed(2)}`;

  // 2. Cobro automático de un gasto fijo.
  const fijo = destino.id
    ? buscarFijoDelCobro(contexto.fijos, contexto.pagadosDelMes(mes), {
        monto: aviso.monto,
        fecha,
        medio: destino.medio,
        texto: aviso.comercio,
      })
    : null;
  if (fijo && (fijo.porNombre || !fijo.yaPagado)) {
    const token = {
      coleccion: 'gastos',
      id: idGasto,
      campos: { categoria: 'Gasto fijo', medio: destino.medio, nota: `${aviso.comercio} · ${fijo.fijo.nombre}` },
    };
    return anotarPagoFijo_(token, { fecha, mes, monto: aviso.monto, medio: destino.medio, fijo }, contexto);
  }

  // 3. Ya anotado a mano.
  const igual = buscarGastoIgual(gastos, { monto: aviso.monto, fecha, medio: destino.medio });
  if (igual) {
    Logger.log(`${fecha} · ${monto} · ${aviso.comercio} · ya estaba anotado a mano: se enlaza`);
    if (!contexto.guardar) return 'prueba';
    confirmar_([escrituraActualizar_(`gastos/${igual.id}`, { correoId: idCorreo })], 'enlazar el gasto');
    igual.correoId = idCorreo;
    resumen.enlazados += 1;
    return 'ya-estaba';
  }

  // 4. Gasto nuevo.
  const categoria = adivinarCategoria(aviso.comercio);
  const parecido = (fijo && `pago:${fijo.clave}`) || buscarParecido(gastos, aviso.monto, fecha);
  const conQue = destino.id ? destino.nombre : `tarjeta ••${aviso.ultimos} (no registrada: se anota como efectivo)`;
  Logger.log(`${fecha} · ${monto} · ${aviso.comercio} · ${categoria} · ${conQue}${parecido ? ' · ¿repetido?' : ''}`);
  if (!contexto.guardar) return 'prueba';

  if (guardarGasto_(idCorreo, fecha, aviso, categoria, destino, parecido) === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  gastos.push({ id: idGasto, monto: aviso.monto, fecha, origen: 'correo', medio: destino.medio });
  resumen.nuevos += 1;
  if (parecido) resumen.posiblesRepetidos.push(`${fecha} · ${monto} · ${aviso.comercio}`);
  if (!destino.id) {
    resumen.sinTarjeta += 1;
    return 'sin-tarjeta';
  }
  return 'guardado';
}

/**
 * Marca un gasto fijo como pagado por un cobro leído del correo. Si ya
 * estaba marcado (a mano o por otro aviso), solo se recuerda el correo para
 * no volver a leerlo. El correo se guarda como "token" (un gasto o
 * movimiento descartado, que la app no muestra) para que nunca se anote dos
 * veces, aunque después desmarquen el pago.
 */
function anotarPagoFijo_(token, cobro, contexto) {
  const { resumen } = contexto;
  const { fijo, fecha, mes, monto, medio } = cobro;
  const pagados = contexto.pagadosDelMes(mes);
  const yaPagado = Boolean(pagados[fijo.clave]);
  Logger.log(
    `${fecha} · $${monto.toFixed(2)} · cobro de "${fijo.fijo.nombre}" (gasto fijo): ${yaPagado ? 'ya estaba marcado como pagado' : 'se marca pagado en Pagos'}`,
  );
  if (!contexto.guardar) return 'prueba';

  const camposDelToken = {
    fecha: campo_(fecha),
    mes: campo_(mes),
    monto: { doubleValue: monto },
    ...Object.keys(token.campos).reduce((a, k) => ({ ...a, [k]: campo_(token.campos[k]) }), {}),
    autor: AUTOR_CORREO(),
    origen: campo_('correo'),
    descartado: campo_(true),
    enlazadoA: campo_(`pago:${fijo.clave}`),
  };
  const escrituras = [escrituraCrear_(`${token.coleccion}/${token.id}`, camposDelToken)];
  if (!yaPagado) {
    const pago = { fecha, monto, medio, origen: 'correo' };
    escrituras.push(escrituraPago_(mes, fijo.clave, pago), ...saldosDelMedio_(medio, monto, contexto));
    pagados[fijo.clave] = pago;
  }
  if (confirmar_(escrituras, 'marcar el gasto fijo') === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  if (yaPagado) {
    resumen.enlazados += 1;
    return 'ya-estaba';
  }
  resumen.fijos += 1;
  return 'guardado';
}

/**
 * Una transferencia. En este orden:
 *   1. ¿Ya se anotó este aviso (por su referencia o su correo)? → nada.
 *   2. ¿Es el mismo envío avisado por el otro banco o anotado a mano? → se enlaza.
 *   3. ¿Paga una tarjeta cuyo pago ya marcaron a mano en Pagos? → se enlaza con ese pago.
 *   4. ¿Es el pago de un gasto fijo (sale de una cuenta hacia afuera)? → se marca el fijo.
 *   5. Si no, se anota como movimiento nuevo.
 * Además, si la versión anterior del lector había anotado este correo como una
 * compra, esa compra se quita (y se devuelve su saldo).
 */
function revisarMovimiento_(mensaje, movimiento, contexto) {
  const { resumen } = contexto;
  if (movimiento.tipo === 'ignorar') {
    Logger.log(`Transferencia ignorada (${movimiento.motivo}): ${mensaje.getSubject()}`);
    resumen.ignorados += 1;
    return 'ignorado';
  }
  const idCorreo = mensaje.getId();
  const fechaDelCorreo = Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  const fecha = movimiento.fecha || fechaDelCorreo;
  const mes = fecha.slice(0, 7);
  const clave = idDeMovimiento(movimiento, idCorreo);
  const movimientos = contexto.movimientosDelMes(mes);
  const limpieza = limpiarCompraFalsa_(idCorreo, fechaDelCorreo, contexto);
  if (movimientos.some((m) => yaConoceElAviso(m, clave))) {
    if (limpieza.length && contexto.guardar) confirmar_(limpieza, 'quitar la compra falsa');
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }

  const resuelto = resolverMovimiento(movimiento, contexto.cuentas, contexto.tarjetas);
  const monto = `$${movimiento.monto.toFixed(2)}`;
  if (!resuelto) {
    const texto = `${fecha} · ${monto} · de ${describirExtremo_(movimiento.desde)} a ${describirExtremo_(movimiento.hacia)}`;
    Logger.log(`${texto}: ninguna de las dos cuentas está en la app, no se anota.`);
    contexto.ultimoPendiente = `${texto} · ninguna cuenta está en la app`;
    if (limpieza.length && contexto.guardar) confirmar_(limpieza, 'quitar la compra falsa');
    resumen.sinCuenta += 1;
    return 'sin-cuenta';
  }
  const ruta = `${resuelto.nombreDesde} → ${resuelto.nombreHacia}`;
  const lado = ladoDelAviso(movimiento);
  const nuevo = { id: clave, monto: movimiento.monto, fecha, desde: resuelto.desde, hacia: resuelto.hacia, lado };

  // 2. El mismo envío, avisado por el otro banco o anotado a mano.
  const mismo = buscarMismoMovimiento(movimientos, nuevo);
  if (mismo) {
    Logger.log(`${fecha} · ${monto} · ${ruta} · ya estaba (${mismo.origen === 'correo' ? 'avisado por el otro banco' : 'anotado a mano'}): se enlaza`);
    if (!contexto.guardar) return 'prueba';
    confirmar_(
      [escrituraActualizar_(`movimientos/${mismo.id}`, {}, { referencias: [clave], lados: [lado] }), ...limpieza],
      'enlazar la transferencia',
    );
    mismo.referencias = [...(mismo.referencias || []), clave];
    mismo.lados = [...(mismo.lados || []), lado];
    resumen.enlazados += 1;
    return 'ya-estaba';
  }

  const camposBase = {
    fecha: campo_(fecha),
    mes: campo_(mes),
    monto: { doubleValue: movimiento.monto },
    desde: campo_(resuelto.desde),
    hacia: campo_(resuelto.hacia),
    nota: campo_(notaDeMovimiento(movimiento, resuelto)),
    autor: AUTOR_CORREO(),
    origen: campo_('correo'),
    lados: campo_([lado]),
  };
  if (movimiento.referencia) camposBase.referencia = campo_(movimiento.referencia);

  // 3. El pago de tarjeta que ya marcaron a mano en Pagos.
  const pagados = contexto.pagadosDelMes(mes);
  const pagoManual = pagoDeTarjetaMarcado(pagados, resuelto.hacia, movimiento.monto);
  if (pagoManual) {
    // Si lo marcaron como pagado en efectivo pero salió de una cuenta, se corrige la cuenta.
    const corregirCuenta = !String(pagoManual.pago.desde || '').startsWith('cuenta:') && resuelto.desde.startsWith('cuenta:');
    Logger.log(
      `${fecha} · ${monto} · ${ruta} · ya estaba marcado en Pagos: se enlaza${corregirCuenta ? ` y se resta de ${resuelto.nombreDesde}` : ''}`,
    );
    if (!contexto.guardar) return 'prueba';
    const escrituras = [
      escrituraCrear_(`movimientos/${clave}`, { ...camposBase, descartado: campo_(true), enlazadoA: campo_(`pago:${pagoManual.clave}`) }),
      escrituraPago_(mes, pagoManual.clave, corregirCuenta ? { correo: clave, desde: resuelto.desde } : { correo: clave }, { soloEstosCampos: true }),
      ...(corregirCuenta ? saldosDelMedio_(resuelto.desde, movimiento.monto, contexto) : []),
      ...limpieza,
    ];
    if (confirmar_(escrituras, 'enlazar el pago de la tarjeta') === 'guardado') {
      pagoManual.pago.correo = clave;
      movimientos.push({ ...nuevo, descartado: true, lados: [lado] });
    }
    resumen.enlazados += 1;
    return 'ya-estaba';
  }

  // 4. El pago de un gasto fijo hecho con una transferencia.
  const fijo =
    resuelto.hacia === 'externo' && resuelto.desde.startsWith('cuenta:')
      ? buscarFijoDelCobro(contexto.fijos, pagados, {
          monto: movimiento.monto,
          fecha,
          medio: resuelto.desde,
          texto: [movimiento.concepto, movimiento.hacia.persona, resuelto.nombreHacia].join(' '),
        })
      : null;
  if (fijo && (fijo.porNombre || !fijo.yaPagado)) {
    const token = {
      coleccion: 'movimientos',
      id: clave,
      campos: { desde: resuelto.desde, hacia: resuelto.hacia, nota: `${fijo.fijo.nombre} (gasto fijo)` },
    };
    const resultado = anotarPagoFijo_(token, { fecha, mes, monto: movimiento.monto, medio: resuelto.desde, fijo }, contexto);
    if (limpieza.length && contexto.guardar) confirmar_(limpieza, 'quitar la compra falsa');
    movimientos.push({ ...nuevo, descartado: true, lados: [lado] });
    return resultado;
  }

  // 5. Movimiento nuevo.
  const parecido = buscarMovimientoParecido(movimientos, nuevo);
  Logger.log(`${fecha} · ${monto} · ${ruta}${parecido ? ' · ¿repetido?' : ''}`);
  if (!contexto.guardar) return 'prueba';
  const campos = { ...camposBase };
  if (parecido) campos.posibleRepetido = campo_(parecido);
  const saldos = [];
  const [tipoDesde, idDesde] = resuelto.desde.split(':');
  const [tipoHacia, idHacia] = resuelto.hacia.split(':');
  if (tipoDesde === 'cuenta') saldos.push(escrituraSaldo_('cuentas', idDesde, -movimiento.monto));
  if (tipoHacia === 'cuenta') saldos.push(escrituraSaldo_('cuentas', idHacia, movimiento.monto));
  if (tipoHacia === 'tarjeta') saldos.push(escrituraSaldo_('tarjetas', idHacia, -movimiento.monto));
  if (confirmar_([escrituraCrear_(`movimientos/${clave}`, campos), ...saldos, ...limpieza], 'guardar la transferencia') === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  movimientos.push({ ...nuevo, origen: 'correo', lados: [lado] });
  resumen.movimientos += 1;
  if (parecido) resumen.posiblesRepetidos.push(`${fecha} · ${monto} · ${ruta}`);
  return 'guardado';
}

/**
 * La versión anterior del lector podía anotar un aviso de transferencia como
 * si fuera una compra. Si este correo tiene esa compra, se descarta y se
 * devuelve lo que había sumado a la tarjeta o restado de la cuenta.
 * @returns {Object[]} Escrituras para agregar al guardado (vacío si no hay nada que limpiar).
 */
function limpiarCompraFalsa_(idCorreo, fechaDelCorreo, contexto) {
  const gastos = contexto.gastosDelMes(fechaDelCorreo.slice(0, 7));
  const falsa = gastos.find((g) => g.id === `correo-${idCorreo}` && !g.descartado && !g.enlazadoA);
  if (!falsa) return [];
  Logger.log(`Se quita la compra de $${Number(falsa.monto).toFixed(2)} que la versión anterior anotó por este aviso de transferencia.`);
  falsa.descartado = true;
  return [
    escrituraActualizar_(`gastos/${falsa.id}`, { descartado: true, nota: 'Era una transferencia, no una compra' }),
    ...saldosDelMedio_(falsa.medio, Number(falsa.monto), contexto, -1),
  ];
}

function etiquetar_(hilo, resultados, contexto) {
  if (!contexto.etiquetas) return;
  if (resultados.some((r) => r === 'sin-tarjeta' || r === 'sin-cuenta' || r === 'sin-leer')) {
    hilo.addLabel(contexto.etiquetas.revisar);
  } else if (resultados.includes('guardado')) {
    hilo.addLabel(contexto.etiquetas.registrado);
  }
}

/** Los avisos que no se pudieron anotar se vuelven a intentar en la siguiente revisión. */
const SE_REINTENTA = ['sin-cuenta', 'sin-leer'];

/** Revisión de rutina: avisos de los últimos días que todavía no se habían leído. */
function revisarRecientes_(contexto) {
  const procesados = contexto.guardar ? leerProcesados_() : new Set();
  const desde = Date.now() - AJUSTES.diasRecientes * 86400000;
  GmailApp.search(`newer_than:${AJUSTES.diasRecientes}d ${AJUSTES.filtro}`, 0, 50).forEach((hilo) => {
    const resultados = [];
    hilo.getMessages().forEach((mensaje) => {
      // Los hilos juntan avisos viejos con el mismo asunto: solo se miran los recientes.
      if (mensaje.getDate().getTime() < desde || procesados.has(mensaje.getId())) return;
      const resultado = revisarMensaje_(mensaje, contexto);
      resultados.push(resultado);
      if (!SE_REINTENTA.includes(resultado)) procesados.add(mensaje.getId());
    });
    etiquetar_(hilo, resultados, contexto);
  });
  if (contexto.guardar) guardarProcesados_(procesados);
  registrarResumen_(contexto);
}

/**
 * Revisa todos los avisos de un mes, aunque ya se hubieran leído antes: así
 * aparecen los que se fueron de paso. Lo que ya está anotado no se repite.
 */
function revisarMes_(mes, contexto) {
  const { inicio, fin } = limitesDelMes(mes, AJUSTES.desfaseUtc);
  const consulta = `${AJUSTES.filtro} after:${inicio} before:${fin}`;
  const procesados = contexto.guardar ? leerProcesados_() : new Set();
  const vistos = new Set();
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
        if (segundos < inicio || segundos >= fin || vistos.has(mensaje.getId())) return;
        if (revisados >= AJUSTES.maximoCorreosPorMes) return;
        vistos.add(mensaje.getId());
        revisados += 1;
        const resultado = revisarMensaje_(mensaje, contexto);
        resultados.push(resultado);
        if (!SE_REINTENTA.includes(resultado)) procesados.add(mensaje.getId());
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
  escribirEstadoCuenta_(contexto, { ...base, estado: 'revisando' });
  try {
    revisarMes_(solicitud.mes, contexto);
    escribirEstadoCuenta_(contexto, resumenParaGuardar_(contexto.resumen, { ...base, estado: 'listo' }));
  } catch (error) {
    escribirEstadoCuenta_(contexto, { ...base, estado: 'error', mensaje: String(error.message || error).slice(0, 300) });
    throw error;
  }
}

function resumenParaGuardar_(resumen, extra) {
  return {
    ...extra,
    nuevos: resumen.nuevos,
    movimientos: resumen.movimientos,
    fijos: resumen.fijos,
    enlazados: resumen.enlazados,
    yaEstaban: resumen.yaEstaban,
    ignorados: resumen.ignorados,
    sinTarjeta: resumen.sinTarjeta,
    sinCuenta: resumen.sinCuenta,
    sinLeer: resumen.sinLeer,
    correosRevisados: resumen.correosRevisados,
    posiblesRepetidos: resumen.posiblesRepetidos.slice(0, 20),
    mensaje: '',
  };
}

function registrarResumen_(contexto) {
  const r = contexto.resumen;
  Logger.log(
    `Correos revisados: ${r.correosRevisados} · gastos nuevos: ${r.nuevos} · transferencias nuevas: ${r.movimientos} · gastos fijos marcados: ${r.fijos} · enlazados con lo anotado a mano o con el otro banco: ${r.enlazados} · ya estaban: ${r.yaEstaban} · ignorados: ${r.ignorados} · con tarjeta no registrada: ${r.sinTarjeta} · transferencias sin cuenta en la app: ${r.sinCuenta} · sin leer: ${r.sinLeer} · posibles repetidos: ${r.posiblesRepetidos.length}`,
  );
}

/* ------------------------------------------------------------------ */
/* Gmail y memoria del script                                          */
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

/**
 * Avisos que no se pudieron anotar (sin leer o de cuentas que no están en la
 * app): { idDelCorreo: { fecha, texto } }. Se muestran en la app hasta que
 * se anoten o pasen 45 días.
 */
const CLAVE_PENDIENTES = 'avisosPendientes';

function leerPendientes_() {
  try {
    return JSON.parse(PropertiesService.getUserProperties().getProperty(CLAVE_PENDIENTES) || '{}');
  } catch (error) {
    return {};
  }
}

/** Los pendientes más nuevos primero, sin los de hace más de 45 días; los guarda y los devuelve como texto. */
function guardarPendientes_(pendientes) {
  const limite = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  const vigentes = Object.keys(pendientes)
    .map((id) => ({ id, ...pendientes[id] }))
    .filter((p) => p.fecha >= limite)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 30);
  const guardar = {};
  vigentes.forEach((p) => {
    guardar[p.id] = { fecha: p.fecha, texto: p.texto };
  });
  PropertiesService.getUserProperties().setProperty(CLAVE_PENDIENTES, JSON.stringify(guardar));
  return vigentes.map((p) => p.texto);
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
  if ('mapValue' in campo) {
    const objeto = {};
    const campos = campo.mapValue.fields || {};
    Object.keys(campos).forEach((clave) => {
      objeto[clave] = valor_(campos[clave]);
    });
    return objeto;
  }
  if ('arrayValue' in campo) return (campo.arrayValue.values || []).map(valor_);
  if ('stringValue' in campo) return campo.stringValue;
  if ('doubleValue' in campo) return Number(campo.doubleValue);
  if ('integerValue' in campo) return Number(campo.integerValue);
  if ('booleanValue' in campo) return campo.booleanValue;
  if ('timestampValue' in campo) return campo.timestampValue;
  if ('nullValue' in campo) return null;
  return undefined;
}

/** Valor de JavaScript → campo de la API REST (textos, números, listas y objetos simples). */
function campo_(valor) {
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(campo_) } };
  if (typeof valor === 'number') return { doubleValue: valor };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (valor && typeof valor === 'object') {
    const fields = {};
    Object.keys(valor).forEach((clave) => {
      fields[clave] = campo_(valor[clave]);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(valor) };
}

/** Documentos de una colección del hogar como { id, campos }. */
function leerColeccion_(nombre, accion) {
  const r = pedirFirestore_('get', `${rutaHogar_(nombre)}?pageSize=300`);
  if (r.codigo !== 200) throw errorDeFirestore_(accion, r);
  return (r.datos.documents || []).map((documento) => ({
    id: documento.name.split('/').pop(),
    campos: documento.fields || {},
  }));
}

/** Tarjetas de la app por sus últimos 4 dígitos: { '1234': {id, banco, nombre} }. */
function leerTarjetas_() {
  const tarjetas = {};
  leerColeccion_('tarjetas', 'leer las tarjetas').forEach(({ id, campos }) => {
    const ultimos = valor_(campos.ultimos);
    if (!ultimos) return;
    const clave = String(ultimos).padStart(4, '0');
    const banco = valor_(campos.banco) || '';
    tarjetas[clave] = { id, banco, nombre: `Tarjeta ${banco} ••${clave}`.replace('  ', ' ') };
  });
  return tarjetas;
}

/** Cuentas de banco de la app: [{id, banco, ultimos, debito, nombre}]. */
function leerCuentas_() {
  return leerColeccion_('cuentas', 'leer las cuentas').map(({ id, campos }) => {
    const banco = valor_(campos.banco) || '';
    const ultimos = valor_(campos.ultimos) ? String(valor_(campos.ultimos)).padStart(4, '0') : '';
    const debito = valor_(campos.debito) ? String(valor_(campos.debito)).padStart(4, '0') : '';
    return { id, banco, ultimos, debito, nombre: `${banco}${ultimos ? ` ••${ultimos}` : ''}` || 'Cuenta' };
  });
}

/** Gastos fijos de la app: [{id, nombre, monto, dia, medio, comercio}]. */
function leerFijos_() {
  return leerColeccion_('fijos', 'leer los gastos fijos').map(({ id, campos }) => ({
    id,
    nombre: valor_(campos.nombre) || '',
    monto: Number(valor_(campos.monto)) || 0,
    dia: Number(valor_(campos.dia)) || 0,
    medio: valor_(campos.medio) || 'efectivo',
    comercio: valor_(campos.comercio) || '',
  }));
}

/** Documentos de una colección que tienen `mes` igual al pedido. */
function leerDelMes_(coleccion, mes, accion) {
  const r = pedirFirestore_('post', `${rutaDocumento_(`hogares/${AJUSTES.hogar}`)}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: coleccion }],
      where: { fieldFilter: { field: { fieldPath: 'mes' }, op: 'EQUAL', value: { stringValue: mes } } },
    },
  });
  if (r.codigo !== 200) throw errorDeFirestore_(accion, r);
  return (Array.isArray(r.datos) ? r.datos : [])
    .filter((fila) => fila.document)
    .map(({ document }) => ({ id: document.name.split('/').pop(), campos: document.fields || {} }));
}

/** Gastos ya guardados de un mes, para no repetir y para enlazar con los anotados a mano. */
function leerGastosDelMes_(mes) {
  return leerDelMes_('gastos', mes, 'leer los gastos del mes').map(({ id, campos: c }) => ({
    id,
    monto: valor_(c.monto),
    fecha: valor_(c.fecha),
    medio: valor_(c.medio) || 'efectivo',
    origen: valor_(c.origen),
    correoId: valor_(c.correoId),
    enlazadoA: valor_(c.enlazadoA),
    descartado: valor_(c.descartado) === true,
  }));
}

/** Movimientos ya guardados de un mes, para no repetir y para enlazar los avisos del otro banco. */
function leerMovimientosDelMes_(mes) {
  return leerDelMes_('movimientos', mes, 'leer los movimientos del mes').map(({ id, campos: c }) => ({
    id,
    monto: valor_(c.monto),
    fecha: valor_(c.fecha),
    desde: valor_(c.desde),
    hacia: valor_(c.hacia),
    origen: valor_(c.origen),
    referencias: valor_(c.referencias) || [],
    lados: valor_(c.lados) || [],
    descartado: valor_(c.descartado) === true,
  }));
}

/** Pagos marcados del mes: { 'tarjeta_<id>': {monto, …}, 'fijo_<id>': {…} }. */
function leerPagadosDelMes_(mes) {
  const r = pedirFirestore_('get', rutaHogar_(`meses/${mes}`));
  if (r.codigo === 404) return {};
  if (r.codigo !== 200) throw errorDeFirestore_('leer los pagos del mes', r);
  const pagados = valor_((r.datos.fields || {}).pagados) || {};
  // Un pago desmarcado puede quedar como null.
  Object.keys(pagados).forEach((clave) => {
    if (!pagados[clave]) delete pagados[clave];
  });
  return pagados;
}

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
 * cuándo revisó por última vez, el resultado del último pedido y los avisos
 * que no se pudieron anotar.
 */
function escribirEstadoCuenta_(contexto, datos) {
  if (!contexto.guardar) return;
  const campos = { cuenta: campo_(contexto.cuenta), avisosPendientes: campo_(guardarPendientes_(contexto.pendientes)) };
  Object.keys(datos).forEach((clave) => {
    campos[clave] = campo_(datos[clave]);
  });
  confirmar_(
    [
      {
        update: { name: rutaHogar_(`lectorCorreo/cuenta-${claveDeCuenta(contexto.cuenta)}`), fields: campos },
        updateMask: { fieldPaths: Object.keys(campos) },
        updateTransforms: [{ fieldPath: 'ultimaRevision', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
    'guardar el estado de la revisión',
  );
}

/* ---------- Escrituras ---------- */

const AUTOR_CORREO = () => ({ mapValue: { fields: { uid: campo_('correo'), nombre: campo_('Correo del banco') } } });

/** Crear un documento solo si no existe (así un aviso nunca se anota dos veces). */
function escrituraCrear_(ruta, campos) {
  return {
    update: { name: rutaHogar_(ruta), fields: campos },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: 'creadoEn', setToServerValue: 'REQUEST_TIME' }],
  };
}

/** Sumar (o restar) al saldo de una cuenta o tarjeta. */
function escrituraSaldo_(coleccion, id, delta) {
  return {
    transform: {
      document: rutaHogar_(`${coleccion}/${id}`),
      fieldTransforms: [{ fieldPath: 'saldo', increment: { doubleValue: Math.round(delta * 100) / 100 } }],
    },
  };
}

/**
 * Cambiar algunos campos de un documento que existe y, si se pide, agregar
 * valores a listas sin repetirlos (por ejemplo, las referencias de los avisos).
 */
function escrituraActualizar_(ruta, campos, agregarALista) {
  const transformaciones = Object.keys(agregarALista || {}).map((campo) => ({
    fieldPath: campo,
    appendMissingElements: { values: agregarALista[campo].map(campo_) },
  }));
  const nombres = Object.keys(campos);
  if (!nombres.length) {
    return { transform: { document: rutaHogar_(ruta), fieldTransforms: transformaciones }, currentDocument: { exists: true } };
  }
  const fields = {};
  nombres.forEach((clave) => {
    fields[clave] = campo_(campos[clave]);
  });
  const escritura = { update: { name: rutaHogar_(ruta), fields }, updateMask: { fieldPaths: nombres }, currentDocument: { exists: true } };
  if (transformaciones.length) escritura.updateTransforms = transformaciones;
  return escritura;
}

/**
 * Marcar un pago del mes en meses/{mes}.pagados. Con `soloEstosCampos`, cambia
 * solo esos campos de un pago que ya estaba marcado (sin borrar los demás).
 */
function escrituraPago_(mes, clave, detalle, { soloEstosCampos = false } = {}) {
  const mascara = soloEstosCampos
    ? Object.keys(detalle).map((campo) => `pagados.${clave}.${campo}`)
    : [`pagados.${clave}`];
  return {
    update: { name: rutaHogar_(`meses/${mes}`), fields: { pagados: campo_({ [clave]: detalle }) } },
    updateMask: { fieldPaths: mascara },
  };
}

/**
 * Escribe todo junto en un solo paso (si una parte falla, no se escribe nada).
 * @returns {'guardado'|'repetido'}  'repetido' si el documento a crear ya existía.
 */
function confirmar_(escrituras, accion) {
  const r = pedirFirestore_('post', `${BASE_DOCUMENTOS()}:commit`, { writes: escrituras });
  if (r.codigo === 200) return 'guardado';
  const estado = r.datos.error ? r.datos.error.status : '';
  if (estado === 'ALREADY_EXISTS' || estado === 'FAILED_PRECONDITION' || estado === 'NOT_FOUND') return 'repetido';
  throw errorDeFirestore_(accion, r);
}

/**
 * Guarda el gasto y lo suma al saldo de la tarjeta (o lo resta de la cuenta,
 * si fue con débito). El id del gasto sale del id del correo, así un correo
 * nunca se anota dos veces.
 * @param {ReturnType<typeof destinoDelCargo>} destino
 * @param {string|null} parecido  Id de un gasto anotado a mano que parece el mismo, o "pago:fijo_<id>".
 */
function guardarGasto_(idCorreo, fecha, aviso, categoria, destino, parecido) {
  const campos = {
    fecha: campo_(fecha),
    mes: campo_(fecha.slice(0, 7)),
    monto: { doubleValue: aviso.monto },
    categoria: campo_(categoria),
    medio: campo_(destino.medio),
    nota: campo_(destino.id ? aviso.comercio : `${aviso.comercio} · tarjeta ••${aviso.ultimos}`),
    autor: AUTOR_CORREO(),
    origen: campo_('correo'),
  };
  if (parecido) campos.posibleRepetido = campo_(parecido);
  const saldos = destino.id ? [escrituraSaldo_(destino.coleccion, destino.id, destino.delta)] : [];
  return confirmar_([escrituraCrear_(`gastos/correo-${idCorreo}`, campos), ...saldos], 'guardar el gasto');
}
