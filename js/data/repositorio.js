/**
 * Todo lo que se lee y se escribe en Firestore pasa por este archivo.
 *
 * Estructura en la base de datos (ver docs/ARQUITECTURA.md):
 *
 *   hogares/{HOGAR_ID}/
 *     personas/{id}   salario de cada persona
 *     ingresos/{id}   remesas y otros ingresos
 *     tarjetas/{id}   tarjetas de crédito
 *     cuentas/{id}    cuentas de banco (ahorro o corriente) con su débito
 *     plazos/{id}     compras a cuotas y préstamos
 *     fijos/{id}      gastos fijos mensuales
 *     meses/{YYYY-MM} { pagados: { clave → detalle } }
 *     gastos/{id}     gastos del día a día, con su campo `mes`
 *     movimientos/{id} transferencias, pagos de tarjeta, depósitos y retiros, con `mes`
 *
 * Las lecturas son en tiempo real (onSnapshot): cuando una persona guarda
 * algo, a la otra le aparece solo. Las escrituras no se esperan en la
 * interfaz: Firestore las muestra de inmediato y las envía cuando hay señal.
 */
import { HOGAR_ID } from '../config.js';
import {
  db,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  setDoc,
  writeBatch,
  increment,
  deleteField,
  serverTimestamp,
} from './firebase.js';
import { cambiar, leer, COLECCIONES } from '../state/store.js';
import { planificarPago } from '../domain/presupuesto.js';
import { referenciaTarjeta } from '../domain/tarjetas.js';
import {
  cambiosDeSaldo,
  combinarEfectos,
  efectoDeMedio,
  efectosDeMovimiento,
  referenciaCuenta,
} from '../domain/cuentas.js';
import { METODO, MEDIO_EFECTIVO } from '../domain/plazos.js';
import {
  crearRespaldo,
  leerRespaldo,
  COLECCIONES_POR_MES,
  COLECCIONES_PRINCIPALES,
} from '../domain/respaldo.js';
import { fechaIso, inicioDelDia, mesDe } from '../utils/fechas.js';

/** ruta('tarjetas', 'abc') → "hogares/principal/tarjetas/abc" */
const ruta = (...partes) => ['hogares', HOGAR_ID, ...partes].join('/');
const refColeccion = (nombre) => collection(db, ruta(nombre));
const refDocumento = (...partes) => doc(db, ruta(...partes));
const conId = (foto) => foto.docs.map((d) => ({ id: d.id, ...d.data() }));

/* ------------------------------------------------------------------ */
/* Lectura en tiempo real                                             */
/* ------------------------------------------------------------------ */

const cancelaciones = [];
const mesesObservados = new Set();
let avisos = { alNoTenerPermiso() {}, alFallarEscritura() {} };

function errorDeLectura(error) {
  if (error.code === 'permission-denied') avisos.alNoTenerPermiso();
  else console.error('Error al leer de Firestore', error);
}

/**
 * Empieza a escuchar las colecciones principales.
 * @param {{alNoTenerPermiso: Function, alFallarEscritura: (error: Error) => void}} manejadores
 */
export function iniciarSincronizacion(manejadores) {
  detenerSincronizacion();
  avisos = manejadores;
  COLECCIONES.forEach((nombre) => {
    const cancelar = onSnapshot(
      refColeccion(nombre),
      (foto) =>
        cambiar((e) => {
          e.datos[nombre] = conId(foto);
          e.cargadas.add(nombre);
        }),
      errorDeLectura,
    );
    cancelaciones.push(cancelar);
  });
  observarLector();
}

/** Escucha el estado del lector de avisos del banco (apps-script/Codigo.gs). */
function observarLector() {
  cancelaciones.push(
    onSnapshot(
      refColeccion('lectorCorreo'),
      (foto) =>
        cambiar((e) => {
          // Se busca por el nombre del documento: la solicitud tiene además un campo `id` propio.
          const solicitud = foto.docs.find((d) => d.id === 'solicitud');
          e.lector = {
            solicitud: solicitud ? solicitud.data() : null,
            cuentas: foto.docs.filter((d) => d.id.startsWith('cuenta-')).map((d) => d.data()),
          };
        }),
      errorDeLectura,
    ),
  );
}

/**
 * Escucha los pagos marcados, los gastos y los movimientos de un mes.
 * Llamarla dos veces no duplica nada.
 */
export function observarMes(mes) {
  if (mesesObservados.has(mes)) return;
  mesesObservados.add(mes);
  cancelaciones.push(
    onSnapshot(
      refDocumento('meses', mes),
      (foto) =>
        cambiar((e) => {
          e.datos.pagados = { ...e.datos.pagados, [mes]: foto.data()?.pagados ?? {} };
        }),
      errorDeLectura,
    ),
    ...COLECCIONES_POR_MES.map((nombre) =>
      onSnapshot(
        query(refColeccion(nombre), where('mes', '==', mes)),
        (foto) =>
          cambiar((e) => {
            e.datos[nombre] = { ...e.datos[nombre], [mes]: conId(foto) };
          }),
        errorDeLectura,
      ),
    ),
  );
}

export function detenerSincronizacion() {
  cancelaciones.splice(0).forEach((cancelar) => cancelar());
  mesesObservados.clear();
}

/* ------------------------------------------------------------------ */
/* Estado de guardado                                                 */
/* ------------------------------------------------------------------ */

let escriturasPendientes = 0;

/** Recalcula el indicador "Guardando… / Guardado / Sin conexión". */
export function actualizarIndicadorDeGuardado() {
  cambiar((e) => {
    if (escriturasPendientes === 0) {
      if (e.guardado !== 'error') e.guardado = 'al-dia';
    } else {
      e.guardado = navigator.onLine ? 'guardando' : 'sin-conexion';
    }
  });
}

/** Lleva la cuenta de una escritura y avisa si falla. */
function registrar(promesa) {
  escriturasPendientes += 1;
  actualizarIndicadorDeGuardado();
  return promesa.then(
    () => {
      escriturasPendientes -= 1;
      cambiar((e) => {
        if (e.guardado === 'error') e.guardado = 'al-dia';
      });
      actualizarIndicadorDeGuardado();
    },
    (error) => {
      escriturasPendientes -= 1;
      console.error('Error al guardar en Firestore', error);
      cambiar((e) => {
        e.guardado = 'error';
      });
      avisos.alFallarEscritura(error);
      throw error;
    },
  );
}

/** Para escrituras que la interfaz no espera: el error ya se avisó en `registrar`. */
const sinEsperar = (promesa) => {
  registrar(promesa).catch(() => {});
};

/* ------------------------------------------------------------------ */
/* Saldos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Agrega al lote los cambios de saldo de cuentas y tarjetas. Usa
 * `increment` para que dos personas puedan anotar a la vez sin pisarse.
 * @param {{cuentas: {id:string, deltaSaldo:number}[], tarjetas: {id:string, deltaSaldo:number}[]}} cambios
 */
function escribirSaldos(lote, cambios) {
  ['cuentas', 'tarjetas'].forEach((coleccion) =>
    (cambios[coleccion] || []).forEach(({ id, deltaSaldo }) =>
      lote.update(refDocumento(coleccion, id), { saldo: increment(deltaSaldo) }),
    ),
  );
}

/** Los mismos cambios, a partir de efectos (ver domain/cuentas.js). */
const escribirEfectos = (lote, efectos) => escribirSaldos(lote, cambiosDeSaldo(efectos, leer().datos));

/* ------------------------------------------------------------------ */
/* Registros: personas, ingresos, tarjetas, cuentas, plazos, fijos    */
/* ------------------------------------------------------------------ */

/**
 * Crea (sin `id`) o actualiza (con `id`) un registro. Devuelve el id.
 * Los registros nuevos guardan el mes en que se crearon (`creado`) para
 * no aparecer en meses anteriores.
 */
export function guardarRegistro(coleccion, valores, id) {
  const { id: _descartado, ...cuerpo } = valores;
  const ref = id ? refDocumento(coleccion, id) : doc(refColeccion(coleccion));
  cuerpo.actualizado = serverTimestamp();
  if (!id) cuerpo.creado = mesDe(new Date());
  sinEsperar(setDoc(ref, cuerpo, { merge: true }));
  return ref.id;
}

/**
 * Borra un registro y suelta las referencias que otros tenían hacia él:
 * las cuotas que se pagaban con esa tarjeta o cuenta pasan a efectivo, y
 * los salarios que caían en esa cuenta quedan sin cuenta. Los gastos y
 * movimientos de meses pasados se quedan como están (son historia).
 */
export function eliminarRegistro(coleccion, id) {
  const { plazos, fijos, personas, ingresos, cuentas } = leer().datos;
  const lote = writeBatch(db);
  lote.delete(refDocumento(coleccion, id));
  const actualizar = (nombre, lista, condicion, cambios) =>
    lista.filter(condicion).forEach((r) => lote.update(refDocumento(nombre, r.id), cambios));

  if (coleccion === 'tarjetas') {
    actualizar('plazos', plazos, (p) => p.metodo === referenciaTarjeta(id), { metodo: METODO.DIRECTO });
  }
  if (coleccion === 'cuentas') {
    const referencia = referenciaCuenta(id);
    actualizar('plazos', plazos, (p) => p.metodo === referencia, { metodo: METODO.DIRECTO });
    actualizar('fijos', fijos, (f) => f.medio === referencia, { medio: MEDIO_EFECTIVO });
    actualizar('personas', personas, (p) => p.cuentaId === id, { cuentaId: deleteField() });
    actualizar('ingresos', ingresos, (i) => i.cuentaId === id, { cuentaId: deleteField() });
  }
  if (coleccion === 'personas') {
    actualizar('plazos', plazos, (p) => p.personaId === id, { personaId: deleteField() });
    actualizar('cuentas', cuentas, (c) => c.personaId === id, { personaId: deleteField() });
  }
  sinEsperar(lote.commit());
}

/* ------------------------------------------------------------------ */
/* Pagos del mes y gastos                                             */
/* ------------------------------------------------------------------ */

/**
 * Marca o desmarca un pago. Todo lo que cambia (el mes, el saldo de la
 * tarjeta o de la cuenta, lo abonado a la cuota) se escribe junto en un solo lote.
 * Los saldos y abonos usan `increment` para que dos personas puedan
 * marcar cosas al mismo tiempo sin pisarse.
 * @param {string} mes
 * @param {string} clave
 * @param {import('../domain/presupuesto.js').DetalleDePago} [detalle]
 * @returns {import('../domain/presupuesto.js').PlanDePago|null}
 */
export function alternarPago(mes, clave, detalle) {
  const plan = planificarPago(leer().datos, mes, clave, inicioDelDia(), detalle);
  if (!plan || plan.bloqueado) return plan;

  const pagados = {};
  Object.entries(plan.pagados).forEach(([k, valor]) => {
    pagados[k] = valor === null ? deleteField() : valor;
  });

  const lote = writeBatch(db);
  lote.set(refDocumento('meses', mes), { pagados }, { merge: true });
  escribirSaldos(lote, plan);
  plan.plazos.forEach(({ id, deltaAbonado, deltaPagadas }) => {
    const cambios = {};
    if (deltaAbonado) cambios.abonado = increment(deltaAbonado);
    if (deltaPagadas) cambios.pagadas = increment(deltaPagadas);
    lote.update(refDocumento('plazos', id), cambios);
  });
  sinEsperar(lote.commit());
  return plan;
}

const autorActual = () => {
  const { usuario } = leer();
  return usuario ? { uid: usuario.uid, nombre: usuario.nombre } : null;
};

/**
 * Guarda un gasto. Con tarjeta de crédito se suma a su saldo; con débito
 * se resta del saldo de la cuenta.
 * @param {{fecha:string, monto:number, categoria:string, medio:string, nota:string}} gasto
 */
export function agregarGasto(gasto) {
  const mes = gasto.fecha.slice(0, 7);
  const lote = writeBatch(db);
  lote.set(doc(refColeccion('gastos')), {
    ...gasto,
    mes,
    autor: autorActual(),
    creadoEn: serverTimestamp(),
  });
  escribirEfectos(lote, efectoDeMedio(gasto.medio, gasto.monto));
  sinEsperar(lote.commit());
  observarMes(mes);
}

/**
 * Cambia un gasto (monto, fecha, categoría, medio, nota). Si cambió el
 * monto o el medio, ajusta los saldos: deshace el gasto anterior en su
 * tarjeta o cuenta y aplica el nuevo.
 * @param {Object} original  El gasto como está guardado (con su id).
 * @param {{fecha:string, monto:number, categoria:string, medio:string, nota:string}} cambios
 */
export function editarGasto(original, cambios) {
  const mes = cambios.fecha.slice(0, 7);
  const lote = writeBatch(db);
  lote.update(refDocumento('gastos', original.id), {
    ...cambios,
    mes,
    // Si estaba marcado como posible repetido, al revisarlo y guardarlo se quita la marca.
    ...(original.posibleRepetido ? { posibleRepetido: deleteField() } : {}),
    actualizado: serverTimestamp(),
  });
  escribirEfectos(
    lote,
    combinarEfectos(efectoDeMedio(original.medio, original.monto, -1), efectoDeMedio(cambios.medio, cambios.monto)),
  );
  sinEsperar(lote.commit());
  observarMes(mes);
}

/** Borra un gasto y deshace lo que sumó a la tarjeta o restó de la cuenta. */
export function borrarGasto(gasto) {
  const lote = writeBatch(db);
  if (gasto.origen === 'correo') {
    // Se marca en lugar de borrarlo, para que el lector de correos no lo vuelva a anotar.
    lote.update(refDocumento('gastos', gasto.id), { descartado: true, actualizado: serverTimestamp() });
  } else {
    lote.delete(refDocumento('gastos', gasto.id));
  }
  escribirEfectos(lote, efectoDeMedio(gasto.medio, gasto.monto, -1));
  sinEsperar(lote.commit());
}

/* ------------------------------------------------------------------ */
/* Movimientos entre cuentas                                          */
/* ------------------------------------------------------------------ */

/**
 * Anota un movimiento (transferencia, pago de tarjeta, depósito o retiro)
 * o cambia uno que ya existe. Los saldos de las cuentas y tarjetas
 * involucradas se ajustan en la misma escritura.
 * @param {{fecha:string, monto:number, desde:string, hacia:string, nota:string}} valores
 * @param {Object} [original]  El movimiento como está guardado, para editarlo.
 */
export function guardarMovimiento(valores, original) {
  const mes = valores.fecha.slice(0, 7);
  const lote = writeBatch(db);
  if (original) {
    lote.update(refDocumento('movimientos', original.id), {
      ...valores,
      mes,
      ...(original.posibleRepetido ? { posibleRepetido: deleteField() } : {}),
      actualizado: serverTimestamp(),
    });
    escribirEfectos(lote, combinarEfectos(efectosDeMovimiento(original, -1), efectosDeMovimiento(valores)));
  } else {
    lote.set(doc(refColeccion('movimientos')), {
      ...valores,
      mes,
      autor: autorActual(),
      creadoEn: serverTimestamp(),
    });
    escribirEfectos(lote, efectosDeMovimiento(valores));
  }
  sinEsperar(lote.commit());
  observarMes(mes);
}

/** Borra un movimiento y deshace sus efectos en los saldos. */
export function borrarMovimiento(movimiento) {
  const lote = writeBatch(db);
  if (movimiento.origen === 'correo') {
    // Igual que los gastos: se marca para que el lector no lo vuelva a anotar.
    lote.update(refDocumento('movimientos', movimiento.id), { descartado: true, actualizado: serverTimestamp() });
  } else {
    lote.delete(refDocumento('movimientos', movimiento.id));
  }
  escribirEfectos(lote, efectosDeMovimiento(movimiento, -1));
  sinEsperar(lote.commit());
}

/**
 * Pide al lector de correos de cada cuenta que revise todos los avisos del
 * banco de un mes. Cada lector lo atiende en su siguiente revisión
 * (cada pocos minutos) y deja el resultado en lectorCorreo/cuenta-<correo>.
 */
export function pedirRevisionDeCorreos(mes) {
  const { usuario } = leer();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  sinEsperar(
    setDoc(refDocumento('lectorCorreo', 'solicitud'), {
      id,
      mes,
      pedidoEn: serverTimestamp(),
      pedidoPor: usuario?.nombre || '',
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Respaldo, importación y borrado total                              */
/* ------------------------------------------------------------------ */

/** Escribe muchas operaciones en lotes (Firestore acepta hasta 500 por lote). */
async function escribirEnLotes(operaciones, tamano = 400) {
  for (let i = 0; i < operaciones.length; i += tamano) {
    const lote = writeBatch(db);
    operaciones.slice(i, i + tamano).forEach((operacion) => operacion(lote));
    await registrar(lote.commit()); // un lote a la vez, en orden
  }
}

/** Texto JSON con todos los datos del hogar, de todos los meses. */
export async function exportarRespaldo() {
  const nombres = [...COLECCIONES_PRINCIPALES, 'meses', ...COLECCIONES_POR_MES];
  const fotos = await Promise.all(nombres.map((n) => getDocs(refColeccion(n))));
  const todo = {};
  nombres.forEach((nombre, i) => {
    todo[nombre] = conId(fotos[i]);
  });
  const meses = {};
  todo.meses.forEach(({ id, pagados }) => {
    meses[id] = { pagados: pagados || {} };
  });
  todo.meses = meses;
  return JSON.stringify(crearRespaldo(todo, fechaIso(new Date())));
}

/**
 * Carga un respaldo (de esta versión o de la versión de Claude).
 * Los registros con el mismo id se reemplazan.
 * @returns {Promise<number>} Cantidad de registros guardados.
 */
export async function importarRespaldo(objeto) {
  const nombrePersona = leer().usuario?.nombre?.split(' ')[0] || 'Persona 1';
  const { colecciones, meses, gastos, movimientos } = leerRespaldo(objeto, { nombrePersona });
  const operaciones = [];
  Object.entries(colecciones).forEach(([nombre, lista]) => {
    lista.forEach(({ id, ...cuerpo }) =>
      operaciones.push((lote) => lote.set(refDocumento(nombre, id), cuerpo)),
    );
  });
  Object.entries(meses).forEach(([mes, contenido]) =>
    operaciones.push((lote) => lote.set(refDocumento('meses', mes), contenido)),
  );
  gastos.forEach(({ id, ...cuerpo }) =>
    operaciones.push((lote) => lote.set(refDocumento('gastos', id), cuerpo)),
  );
  movimientos.forEach(({ id, ...cuerpo }) =>
    operaciones.push((lote) => lote.set(refDocumento('movimientos', id), cuerpo)),
  );
  await escribirEnLotes(operaciones);
  return operaciones.length;
}

/** Borra todos los datos del hogar. */
export async function borrarTodo() {
  const nombres = [...COLECCIONES_PRINCIPALES, 'meses', ...COLECCIONES_POR_MES];
  const fotos = await Promise.all(nombres.map((n) => getDocs(refColeccion(n))));
  const operaciones = fotos.flatMap((foto) =>
    foto.docs.map((documento) => (lote) => lote.delete(documento.ref)),
  );
  await escribirEnLotes(operaciones);
}
