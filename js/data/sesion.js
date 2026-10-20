/**
 * Entrar y salir con la cuenta de Google.
 * Quién puede ver los datos no se decide aquí, sino en `firestore.rules`.
 */
import {
  auth,
  proveedorGoogle,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from './firebase.js';

/**
 * Avisa cada vez que alguien entra o sale.
 * @param {(usuario: {uid:string, nombre:string, correo:string}|null) => void} alCambiar
 */
export function observarSesion(alCambiar) {
  return onAuthStateChanged(auth, (usuario) => {
    if (!usuario) {
      alCambiar(null);
      return;
    }
    alCambiar({
      uid: usuario.uid,
      nombre: usuario.displayName || usuario.email || 'Sin nombre',
      correo: usuario.email || '',
    });
  });
}

/** Abre la ventana de Google; si el navegador la bloquea, redirige. */
export async function entrarConGoogle() {
  try {
    await signInWithPopup(auth, proveedorGoogle);
  } catch (error) {
    const cancelado = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
    if (cancelado.includes(error.code)) return;
    if (error.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, proveedorGoogle);
      return;
    }
    throw error;
  }
}

export function salir() {
  return signOut(auth);
}
