/**
 * CUENTAS CLARAS · LECTOR DE AVISOS DEL BANCO
 *
 * Corre dentro de tu cuenta de Google (script.google.com), no en la app.
 * Cada 5 minutos:
 *   1. Si en la app alguien tocó "Buscar gastos del mes en los correos",
 *      revisa todos los avisos de ese mes en este Gmail y anota los que falten.
 *   2. Si no, revisa los avisos de los últimos 2 días.
 *
 * Lee dos clases de avisos:
 *
 *   - Compras con tarjeta ("Compra por USD 2.00 en PUMA DIDEA con tarjeta
 *     terminada en 1234"): las anota como gasto. Si es una tarjeta de crédito
 *     registrada, se suma a su saldo; si es la tarjeta de débito de una cuenta,
 *     se resta del saldo de la cuenta.
 *   - Transferencias (Transfer365 y parecidas): dinero que sale de una cuenta,
 *     llega a otra o paga una tarjeta. Las anota como movimiento y ajusta los
 *     saldos. El mismo envío visto desde los dos bancos (mismo número de
 *     referencia) se anota una sola vez.
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
  filtro:
    '(compra OR consumo OR cargo OR transacción OR transaccion OR autorizada OR aprobada OR transferencia OR transfer365 OR abono)',
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

/**
 * Palabras que indican que el correo NO es una compra que haya que anotar.
 * Las transferencias se leen aparte (leerMovimiento); si una no se pudo leer,
 * estas palabras evitan que se anote como compra.
 */
const NO_ES_CARGO =
  /(rechazad|declinad|denegad|no\s+autorizad|no\s+fue\s+aprobad|reversi[oó]n|reversad|reverso|anulad|devoluci[oó]n|reembolso|pago\s+recibido|hemos\s+recibido\s+(tu|su)\s+pago|abono\s+a\s+(tu|su)\s+tarjeta|pago\s+a\s+(tu|su)\s+tarjeta|pago\s+de\s+(tu|su)\s+tarjeta|transfer365|(tu|su)\s+transferencia|transferencia\s+(efectuada|realizada|recibida|enviada|exitosa|finalizada|entre)|abono\s+a\s+(tu\s+|su\s+)?cuenta|ha\s+recibido\s+un\s+abono)/i;

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
function limpiarTexto_(texto) {
  return String(texto || '').replace(/\u00a0/g, ' ').replace(/\r/g, '');
}

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
/* Leer una transferencia (funciones puras, con pruebas en tests/)    */
/* ------------------------------------------------------------------ */

/** Correos de transferencias: Transfer365, "ha recibido un abono a su cuenta"… */
const ES_TRANSFERENCIA =
  /transfer365|transferencia|abono\s+a\s+(?:tu\s+|su\s+)?cuenta|ha\s+recibido\s+un\s+abono|has\s+recibido\s+un\s+abono/i;

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
    const encabezado = /^informaci[oó]n\s+(?:de\s+|del\s+)?(origen|destino)\s*:?$/i.exec(linea);
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

/** "X8320", "*****8320", "TARJETA DE CREDITO XXXXXX4200" → los últimos 4 dígitos. */
function ultimosDe_(valor) {
  const m = /(\d{4})\D*$/.exec(String(valor || ''));
  return m ? m[1] : null;
}

/** "USD0.55", "$1,250.00", "0.55" → número. */
function montoDe_(valor) {
  const m = /(\d[\d.,]*)/.exec(String(valor || '').replace(/US\$|USD|\$/gi, ' '));
  return m ? aNumero_(m[1]) : null;
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

/**
 * @typedef {Object} ExtremoLeido  Un lado de la transferencia según el correo.
 * @property {string} banco  Clave del banco (ver BANCOS_SV) o "".
 * @property {string|null} ultimos  Últimos 4 dígitos de la cuenta o tarjeta.
 * @property {boolean} esTarjeta  Si es una tarjeta de crédito.
 * @property {string} persona  Nombre del titular, si el correo lo dice.
 */

/**
 * Lee un correo de transferencia (Transfer365 y parecidos).
 * @param {string} texto  Asunto + cuerpo.
 * @param {string} [remitente]  "Notificaciones Banco Cuscatlán <…>"; dice de qué banco es el correo.
 * @returns {{tipo:'movimiento', monto:number, fecha:string|null, referencia:string|null,
 *            entrada:boolean, desde:ExtremoLeido, hacia:ExtremoLeido, concepto:string}
 *          |{tipo:'ignorar', motivo:string}|null}
 *   null si no es un correo de transferencia.
 */
function leerMovimiento(texto, remitente) {
  const t = limpiarTexto_(texto);
  if (!ES_TRANSFERENCIA.test(t)) return null;
  const campos = camposDelCorreo_(t);
  const valor = (patron, seccion) => buscarCampo_(campos, patron, seccion);
  const monto = montoDe_(valor(/^(monto|importe|valor|total|cantidad)( transferid[oa]| debitad[oa]| acreditad[oa])?$/));
  if (!monto) return null;
  const fallida = TRANSFERENCIA_FALLIDA.exec(t);
  if (fallida) return { tipo: 'ignorar', motivo: fallida[0] };

  // ¿El dueño del correo recibe el dinero o lo manda?
  const entrada = /(?:ha|has)\s+recibido|recibiste|le\s+han\s+(?:transferido|enviado)|acreditad[oa]\s+a\s+(?:su|tu)\s+cuenta/i.test(t);
  const banco = bancoDelCorreo_(remitente, t);

  let ultimosOrigen = ultimosDe_(
    valor(/^(producto|cuenta|tarjeta)( de)? origen$|^cuenta debitada$|^cuenta de cargo$/) ||
      valor(/^(cuenta|producto|numero de cuenta)$/, 'origen'),
  );
  const productoDestino =
    valor(/^(producto|cuenta|tarjeta)( de)? destino$|^cuenta acreditada$|^cuenta beneficiaria$/) ||
    valor(/^(cuenta|producto|numero de cuenta)$/, 'destino');
  let ultimosDestino = ultimosDe_(productoDestino);

  // La cuenta propia a veces solo aparece en la oración: "abono a su CUENTA DE AHORRO X1421".
  const propia =
    /(?:a|de|desde)\s+(?:su|tu)\s+cuenta(?:\s+de\s+ahorros?|\s+corriente)?\s*(?:n[uú]mero|no\.?)?\s*[x*•·#-]*\s*(\d{4})\b/i.exec(t);
  if (propia) {
    if (entrada && !ultimosDestino) ultimosDestino = propia[1];
    if (!entrada && !ultimosOrigen) ultimosOrigen = propia[1];
  }

  const bancoOrigenLeido = normalizarBanco(valor(/^banco( de)? (origen|emisor|ordenante)$/));
  const bancoDestinoLeido = normalizarBanco(valor(/^banco( de)? (destino|receptor|beneficiario)$/));
  // Un aviso de compra que solo menciona "transferencias" (en la publicidad del pie, por
  // ejemplo) no trae cuentas ni bancos de origen o destino: no es una transferencia.
  if (!ultimosOrigen && !ultimosDestino && !bancoOrigenLeido && !bancoDestinoLeido) return null;
  const bancoOrigen = bancoOrigenLeido || (entrada ? '' : banco);
  const bancoDestino = bancoDestinoLeido || (entrada ? banco : '');
  const tipoTransaccion = valor(/^tipo( de)? (transaccion|operacion|producto)$/);

  return {
    tipo: 'movimiento',
    monto,
    fecha: fechaDe_(valor(/^fecha/)),
    referencia: (valor(/referencia/).match(/[A-Za-z0-9-]{6,}/) || [null])[0],
    entrada,
    desde: {
      banco: bancoOrigen,
      ultimos: ultimosOrigen,
      esTarjeta: false,
      persona: textoUtil_(valor(/^(originado por|ordenante|remitente|enviado por)$/)),
    },
    hacia: {
      banco: bancoDestino,
      ultimos: ultimosDestino,
      esTarjeta: /tarjeta|credito/i.test(normalizar_(`${productoDestino} ${tipoTransaccion}`)),
      persona: textoUtil_(valor(/^(beneficiario|cliente|destinatario|nombre del beneficiario)$/)),
    },
    concepto: textoUtil_(valor(/^(concepto|descripcion|comentario)$/)),
  };
}

const mismosUltimos_ = (a, b) => Boolean(a && b) && String(a).padStart(4, '0') === String(b).padStart(4, '0');
const bancoCompatible_ = (claveLeida, bancoRegistrado) => {
  const registrado = normalizarBanco(bancoRegistrado);
  return !claveLeida || !registrado || registrado === claveLeida;
};

/**
 * Busca en la app la cuenta o tarjeta de un lado de la transferencia.
 * - Por los últimos 4 dígitos (si el banco no contradice).
 * - Si el correo no trae dígitos, por el banco, cuando solo hay una cuenta en ese banco.
 * @returns {{referencia:string, nombre:string}|null}
 */
function resolverExtremo_(extremo, cuentas, tarjetas) {
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
  if (!extremo.esTarjeta && extremo.banco) {
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
  const desde = resolverExtremo_(movimiento.desde, cuentas, tarjetas);
  const hacia = resolverExtremo_(movimiento.hacia, cuentas, tarjetas);
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
 * Id del movimiento: por el número de referencia, que es el mismo en los
 * correos de los dos bancos; si no hay, por el id del correo.
 */
function idDeMovimiento(movimiento, idCorreo) {
  const referencia = String(movimiento.referencia || '').replace(/[^A-Za-z0-9-]/g, '');
  return referencia ? `ref-${referencia}` : `correo-${idCorreo}`;
}

/**
 * Otro movimiento del mes que parece el mismo envío: mismo monto, fecha
 * con un día de diferencia como máximo y la misma cuenta o tarjeta en
 * algún lado. Sirve cuando los dos bancos usan referencias distintas, o
 * cuando ya se había anotado a mano. Devuelve su id, o null.
 */
function buscarMovimientoParecido(movimientos, nuevo) {
  const comparte = (m) =>
    (nuevo.desde !== 'externo' && m.desde === nuevo.desde) || (nuevo.hacia !== 'externo' && m.hacia === nuevo.hacia);
  const parecido = movimientos.find(
    (m) =>
      m.id !== nuevo.id &&
      !m.descartado &&
      Math.abs(Number(m.monto) - nuevo.monto) < 0.005 &&
      m.fecha &&
      diasEntre_(m.fecha, nuevo.fecha) <= 1 &&
      comparte(m),
  );
  return parecido ? parecido.id : null;
}

/**
 * Si la transferencia paga una tarjeta y en la app ya se marcó a mano un
 * pago de esa tarjeta por el mismo monto, devuelve "pago:tarjeta_<id>".
 * @param {Object<string, {monto:number}>} pagados  Pagos marcados en el mes.
 */
function pagoDeTarjetaParecido(pagados, hacia, monto) {
  if (!String(hacia).startsWith('tarjeta:')) return null;
  const clave = `tarjeta_${hacia.slice('tarjeta:'.length)}`;
  const pago = pagados[clave];
  return pago && Math.abs(Number(pago.monto) - monto) < 0.005 ? `pago:${clave}` : null;
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
    cuenta: Session.getEffectiveUser().getEmail(),
    etiquetas: guardar
      ? { registrado: obtenerEtiqueta_(AJUSTES.etiquetaRegistrado), revisar: obtenerEtiqueta_(AJUSTES.etiquetaRevisar) }
      : null,
    gastosDelMes: (mes) => delMes('gastos', mes, leerGastosDelMes_),
    movimientosDelMes: (mes) => delMes('movimientos', mes, leerMovimientosDelMes_),
    pagadosDelMes: (mes) => delMes('pagados', mes, leerPagadosDelMes_),
    resumen: {
      nuevos: 0,
      movimientos: 0,
      yaEstaban: 0,
      ignorados: 0,
      sinTarjeta: 0,
      sinCuenta: 0,
      posiblesRepetidos: [],
      correosRevisados: 0,
    },
  };
}

/**
 * Revisa un correo y, si es una compra o una transferencia que falta, la anota.
 * @returns {'no-es-aviso'|'ignorado'|'ya-estaba'|'prueba'|'guardado'|'sin-tarjeta'}
 */
function revisarMensaje_(mensaje, contexto) {
  const { resumen } = contexto;
  resumen.correosRevisados += 1;
  const texto = `${mensaje.getSubject()}\n${mensaje.getPlainBody()}`;
  const movimiento = leerMovimiento(texto, mensaje.getFrom());
  if (movimiento) return revisarMovimiento_(mensaje, movimiento, contexto);
  const aviso = leerAviso(texto);
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

  const destino = destinoDelCargo(aviso, contexto.tarjetas, contexto.cuentas);
  const categoria = adivinarCategoria(aviso.comercio);
  const parecido = buscarParecido(gastos, aviso.monto, fecha);
  const conQue = destino.id ? destino.nombre : `tarjeta ••${aviso.ultimos} (no registrada: se anota como efectivo)`;
  Logger.log(
    `${fecha} · $${aviso.monto.toFixed(2)} · ${aviso.comercio} · ${categoria} · ${conQue}${parecido ? ' · ¿repetido con uno anotado a mano?' : ''}`,
  );
  if (!contexto.guardar) return 'prueba';

  if (guardarGasto_(mensaje.getId(), fecha, aviso, categoria, destino, parecido) === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  gastos.push({ id: idGasto, monto: aviso.monto, fecha, origen: 'correo' });
  resumen.nuevos += 1;
  if (parecido) resumen.posiblesRepetidos.push(`${fecha} · $${aviso.monto.toFixed(2)} · ${aviso.comercio}`);
  if (!destino.id) {
    resumen.sinTarjeta += 1;
    return 'sin-tarjeta';
  }
  return 'guardado';
}

/**
 * Anota una transferencia leída del correo, una sola vez aunque llegue el
 * aviso de los dos bancos (mismo número de referencia).
 */
function revisarMovimiento_(mensaje, movimiento, contexto) {
  const { resumen } = contexto;
  if (movimiento.tipo === 'ignorar') {
    Logger.log(`Transferencia ignorada (${movimiento.motivo}): ${mensaje.getSubject()}`);
    resumen.ignorados += 1;
    return 'ignorado';
  }
  const fecha = movimiento.fecha || Utilities.formatDate(mensaje.getDate(), AJUSTES.zonaHoraria, 'yyyy-MM-dd');
  const mes = fecha.slice(0, 7);
  const id = idDeMovimiento(movimiento, mensaje.getId());
  const movimientos = contexto.movimientosDelMes(mes);
  if (movimientos.some((m) => m.id === id)) {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }

  const resuelto = resolverMovimiento(movimiento, contexto.cuentas, contexto.tarjetas);
  const monto = `$${movimiento.monto.toFixed(2)}`;
  if (!resuelto) {
    Logger.log(
      `${fecha} · ${monto} · transferencia de ${describirExtremo_(movimiento.desde)} a ${describirExtremo_(movimiento.hacia)}: ninguna de las dos cuentas está en la app, no se anota.`,
    );
    resumen.sinCuenta += 1;
    return 'sin-tarjeta';
  }
  const nuevo = { id, monto: movimiento.monto, fecha, desde: resuelto.desde, hacia: resuelto.hacia };
  const parecido =
    buscarMovimientoParecido(movimientos, nuevo) ||
    pagoDeTarjetaParecido(contexto.pagadosDelMes(mes), resuelto.hacia, movimiento.monto);
  Logger.log(
    `${fecha} · ${monto} · ${resuelto.nombreDesde} → ${resuelto.nombreHacia}${parecido ? ' · ¿repetido con uno anotado a mano?' : ''}`,
  );
  if (!contexto.guardar) return 'prueba';

  if (guardarMovimiento_(id, fecha, movimiento, resuelto, parecido) === 'repetido') {
    resumen.yaEstaban += 1;
    return 'ya-estaba';
  }
  movimientos.push(nuevo);
  resumen.movimientos += 1;
  if (parecido) resumen.posiblesRepetidos.push(`${fecha} · ${monto} · ${resuelto.nombreDesde} → ${resuelto.nombreHacia}`);
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
    movimientos: resumen.movimientos,
    yaEstaban: resumen.yaEstaban,
    ignorados: resumen.ignorados,
    sinTarjeta: resumen.sinTarjeta,
    sinCuenta: resumen.sinCuenta,
    correosRevisados: resumen.correosRevisados,
    posiblesRepetidos: resumen.posiblesRepetidos.slice(0, 20),
    mensaje: '',
  };
}

function registrarResumen_(contexto) {
  const r = contexto.resumen;
  if (!contexto.guardar) return;
  Logger.log(
    `Correos revisados: ${r.correosRevisados} · gastos nuevos: ${r.nuevos} · movimientos nuevos: ${r.movimientos} · ya estaban: ${r.yaEstaban} · ignorados: ${r.ignorados} · con tarjeta no registrada: ${r.sinTarjeta} · transferencias sin cuenta registrada: ${r.sinCuenta} · posibles repetidos: ${r.posiblesRepetidos.length}`,
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
  if ('mapValue' in campo) {
    const objeto = {};
    const campos = campo.mapValue.fields || {};
    Object.keys(campos).forEach((clave) => {
      objeto[clave] = valor_(campos[clave]);
    });
    return objeto;
  }
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

/** Gastos ya guardados de un mes, para no repetir y para detectar los anotados a mano. */
function leerGastosDelMes_(mes) {
  return leerDelMes_('gastos', mes, 'leer los gastos del mes').map(({ id, campos: c }) => ({
    id,
    monto: valor_(c.monto),
    fecha: valor_(c.fecha),
    origen: valor_(c.origen),
    descartado: valor_(c.descartado) === true,
  }));
}

/** Movimientos ya guardados de un mes (transferencias), para no repetir. */
function leerMovimientosDelMes_(mes) {
  return leerDelMes_('movimientos', mes, 'leer los movimientos del mes').map(({ id, campos: c }) => ({
    id,
    monto: valor_(c.monto),
    fecha: valor_(c.fecha),
    desde: valor_(c.desde),
    hacia: valor_(c.hacia),
    origen: valor_(c.origen),
    descartado: valor_(c.descartado) === true,
  }));
}

/** Pagos marcados a mano en el mes: { 'tarjeta_<id>': {monto, …} }. */
function leerPagadosDelMes_(mes) {
  const r = pedirFirestore_('get', rutaHogar_(`meses/${mes}`));
  if (r.codigo === 404) return {};
  if (r.codigo !== 200) throw errorDeFirestore_('leer los pagos del mes', r);
  return valor_((r.datos.fields || {}).pagados) || {};
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

const AUTOR_CORREO = () => ({ mapValue: { fields: { uid: campo_('correo'), nombre: campo_('Correo del banco') } } });

/** Escritura que suma (o resta) al saldo de una cuenta o tarjeta. */
function cambioDeSaldo_(coleccion, id, delta) {
  return {
    transform: {
      document: rutaHogar_(`${coleccion}/${id}`),
      fieldTransforms: [{ fieldPath: 'saldo', increment: { doubleValue: Math.round(delta * 100) / 100 } }],
    },
  };
}

/**
 * Crea un documento solo si no existe, junto con los cambios de saldo, en un
 * solo paso: si ya existía, no se escribe nada (ni se repiten los saldos).
 * @returns {'guardado'|'repetido'}
 */
function crearSiNoExiste_(ruta, campos, cambiosDeSaldo, accion) {
  const escrituras = [
    {
      update: { name: rutaHogar_(ruta), fields: campos },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'creadoEn', setToServerValue: 'REQUEST_TIME' }],
    },
    ...cambiosDeSaldo,
  ];
  const r = pedirFirestore_('post', `${BASE_DOCUMENTOS()}:commit`, { writes: escrituras });
  if (r.codigo === 200) return 'guardado';
  const estado = r.datos.error ? r.datos.error.status : '';
  if (estado === 'ALREADY_EXISTS' || estado === 'FAILED_PRECONDITION') return 'repetido';
  throw errorDeFirestore_(accion, r);
}

/**
 * Guarda el gasto y lo suma al saldo de la tarjeta (o lo resta de la cuenta,
 * si fue con débito). El id del gasto sale del id del correo, así un correo
 * nunca se anota dos veces.
 * @param {ReturnType<typeof destinoDelCargo>} destino
 * @param {string|null} parecido  Id de un gasto anotado a mano que parece el mismo.
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
  const saldos = destino.id ? [cambioDeSaldo_(destino.coleccion, destino.id, destino.delta)] : [];
  return crearSiNoExiste_(`gastos/correo-${idCorreo}`, campos, saldos, 'guardar el gasto');
}

/**
 * Guarda una transferencia y ajusta los saldos: baja la cuenta de donde
 * salió, sube la cuenta a donde llegó o baja la deuda de la tarjeta pagada.
 * @param {ReturnType<typeof resolverMovimiento>} resuelto
 */
function guardarMovimiento_(id, fecha, movimiento, resuelto, parecido) {
  const campos = {
    fecha: campo_(fecha),
    mes: campo_(fecha.slice(0, 7)),
    monto: { doubleValue: movimiento.monto },
    desde: campo_(resuelto.desde),
    hacia: campo_(resuelto.hacia),
    nota: campo_(notaDeMovimiento(movimiento, resuelto)),
    autor: AUTOR_CORREO(),
    origen: campo_('correo'),
  };
  if (movimiento.referencia) campos.referencia = campo_(movimiento.referencia);
  if (parecido) campos.posibleRepetido = campo_(parecido);

  const saldos = [];
  const [tipoDesde, idDesde] = resuelto.desde.split(':');
  const [tipoHacia, idHacia] = resuelto.hacia.split(':');
  if (tipoDesde === 'cuenta') saldos.push(cambioDeSaldo_('cuentas', idDesde, -movimiento.monto));
  if (tipoHacia === 'cuenta') saldos.push(cambioDeSaldo_('cuentas', idHacia, movimiento.monto));
  if (tipoHacia === 'tarjeta') saldos.push(cambioDeSaldo_('tarjetas', idHacia, -movimiento.monto));
  return crearSiNoExiste_(`movimientos/${id}`, campos, saldos, 'guardar la transferencia');
}
