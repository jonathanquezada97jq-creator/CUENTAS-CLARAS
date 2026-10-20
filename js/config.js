/**
 * CONFIGURACIÓN DEL PROYECTO
 *
 * Es el único archivo que hay que editar para conectar la app a tu
 * proyecto de Firebase. Los valores salen de:
 * Consola de Firebase → ⚙ Configuración del proyecto → Tus apps → App web.
 *
 * Estos valores NO son secretos y pueden quedar públicos en GitHub.
 * Lo que protege tus datos son las reglas de `firestore.rules`, que solo
 * dejan entrar a los correos que vos escribás ahí.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAwo_a5Rz4g236H7NJ8Gz_O8eGAdcwazAQ",
  authDomain: "cuentas-claras-2811.firebaseapp.com",
  projectId: "cuentas-claras-2811",
  storageBucket: "cuentas-claras-2811.firebasestorage.app",
  messagingSenderId: "535157134123",
  appId: "1:535157134123:web:6d077a5362590aa051ab6e"
};

/**
 * Nombre del hogar dentro de la base de datos. Todos los datos viven en
 * `hogares/<HOGAR_ID>/...`. Solo cambialo si querés empezar otro hogar
 * desde cero en el mismo proyecto.
 */
export const HOGAR_ID = 'principal';
