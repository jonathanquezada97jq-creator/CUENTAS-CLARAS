/**
 * Inicializa Firebase y expone lo que usa el resto de la app.
 *
 * Es el ÚNICO archivo que importa el SDK de Firebase. Si algún día se
 * cambia de proveedor (Supabase, un servidor propio…), solo cambian los
 * archivos de la carpeta `js/data/`.
 *
 * El SDK se carga como módulo desde el CDN oficial de Google, así que el
 * proyecto no necesita instalar nada ni compilar. Para actualizar Firebase,
 * cambiá el número de versión en las URLs de este archivo (las seis iguales).
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_CONFIG } from '../config.js';

const app = initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);

/**
 * La caché local guarda una copia en el teléfono: la app abre sin señal y
 * los cambios se envían cuando vuelve la conexión.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

export const proveedorGoogle = new GoogleAuthProvider();
proveedorGoogle.setCustomParameters({ prompt: 'select_account' });

export {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  increment,
  deleteField,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
