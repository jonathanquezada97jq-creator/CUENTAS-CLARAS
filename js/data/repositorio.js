/**
 * Todo lo que se lee y se escribe en Firestore pasa por este archivo.
 *
 * Estructura en la base de datos (ver docs/ARQUITECTURA.md):
 *
 *   hogares/{HOGAR_ID}/
 *     personas/{id}   salario de cada persona
 *     ingresos/{id}   remesas y otros ingresos
 *     tarjetas/{id}   tarjetas de crédito
 *     plazos/{id}     compras a cuotas y préstamos
 *     fijos/{id}      gastos fijos mensuales
 *     meses/{YYYY-MM} { pagados: { clave → detalle } }
 *     gastos/{id}     gastos del día a día, con su campo `mes`
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
import { idDeTarjeta, referenciaTarjeta } from '../domain/tarjetas.js';
import { METODO } from '../domain/plazos.js';
import { crearRespaldo, leerRespaldo, COLECCIONES_PRINCIPALES } from '../domain/respaldo.js';
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
}

/** Escucha los pagos marcados y los gastos de un mes. Llamarla dos veces no duplica nada. */
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
    onSnapshot(
      query(refColeccion('gastos'), where('mes', '==', mes)),
      (foto) =>
        cambiar((e) => {
          e.datos.gastos = { ...e.datos.gastos, [mes]: conId(foto) };
        }),
      errorDeLectura,
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
/* Registros: personas, ingresos, tarjetas, plazos, fijos             */
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

/** Borra un registro y suelta las referencias que otros tenían hacia él. */
export function eliminarRegistro(coleccion, id) {
  const { plazos } = leer().datos;
  const lote = writeBatch(db);
  lote.delete(refDocumento(coleccion, id));
  if (coleccion === 'tarjetas') {
    plazos
      .filter((p) => p.metodo === referenciaTarjeta(id))
      .forEach((p) => lote.update(refDocumento('plazos', p.id), { metodo: METODO.DIRECTO }));
  }
  if (coleccion === 'personas') {
    plazos
      .filter((p) => p.personaId === id)
      .forEach((p) => lote.update(refDocumento('plazos', p.id), { personaId: deleteField() }));
  }
  sinEsperar(lote.commit());
}

/* ------------------------------------------------------------------ */
/* Pagos del mes y gastos                                             */
/* ------------------------------------------------------------------ */

/**
 * Marca o desmarca un pago. Todo lo que cambia (el mes, el saldo de la
 * tarjeta, las cuotas) se escribe junto en un solo lote.
 * Los saldos y cuotas usan `increment` para que dos personas puedan
 * marcar cosas al mismo tiempo sin pisarse.
 * @returns {import('../domain/presupuesto.js').PlanDePago|null}
 */
export function alternarPago(mes, clave) {
  const plan = planificarPago(leer().datos, mes, clave, inicioDelDia());
  if (!plan) return null;

  const pagados = {};
  Object.entries(plan.pagados).forEach(([k, valor]) => {
    pagados[k] = valor === null ? deleteField() : valor;
  });

  const lote = writeBatch(db);
  lote.set(refDocumento('meses', mes), { pagados }, { merge: true });
  plan.tarjetas.forEach(({ id, deltaSaldo }) =>
    lote.update(refDocumento('tarjetas', id), { saldo: increment(deltaSaldo) }),
  );
  plan.plazos.forEach(({ id, deltaPagadas }) =>
    lote.update(refDocumento('plazos', id), { pagadas: increment(deltaPagadas) }),
  );
  sinEsperar(lote.commit());
  return plan;
}

/**
 * Guarda un gasto. Si se pagó con tarjeta, se suma al saldo de esa tarjeta.
 * @param {{fecha:string, monto:number, categoria:string, medio:string, nota:string}} gasto
 */
export function agregarGasto(gasto) {
  const { datos, usuario } = leer();
  const mes = gasto.fecha.slice(0, 7);
  const lote = writeBatch(db);
  lote.set(doc(refColeccion('gastos')), {
    ...gasto,
    mes,
    autor: usuario ? { uid: usuario.uid, nombre: usuario.nombre } : null,
    creadoEn: serverTimestamp(),
  });
  const idTarjeta = idDeTarjeta(gasto.medio);
  if (idTarjeta && datos.tarjetas.some((t) => t.id === idTarjeta)) {
    lote.update(refDocumento('tarjetas', idTarjeta), { saldo: increment(gasto.monto) });
  }
  sinEsperar(lote.commit());
  observarMes(mes);
}

/** Borra un gasto y, si fue con tarjeta, lo resta del saldo. */
export function borrarGasto(gasto) {
  const { datos } = leer();
  const lote = writeBatch(db);
  lote.delete(refDocumento('gastos', gasto.id));
  const idTarjeta = idDeTarjeta(gasto.medio);
  if (idTarjeta && datos.tarjetas.some((t) => t.id === idTarjeta)) {
    lote.update(refDocumento('tarjetas', idTarjeta), { saldo: increment(-gasto.monto) });
  }
  sinEsperar(lote.commit());
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
  const nombres = [...COLECCIONES_PRINCIPALES, 'meses', 'gastos'];
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
  const { colecciones, meses, gastos } = leerRespaldo(objeto, { nombrePersona });
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
  await escribirEnLotes(operaciones);
  return operaciones.length;
}

/** Borra todos los datos del hogar. */
export async function borrarTodo() {
  const nombres = [...COLECCIONES_PRINCIPALES, 'meses', 'gastos'];
  const fotos = await Promise.all(nombres.map((n) => getDocs(refColeccion(n))));
  const operaciones = fotos.flatMap((foto) =>
    foto.docs.map((documento) => (lote) => lote.delete(documento.ref)),
  );
  await escribirEnLotes(operaciones);
}
