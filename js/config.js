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
  apiKey: 'PEGA_AQUI_TU_API_KEY',
  authDomain: 'TU-PROYECTO.firebaseapp.com',
  projectId: 'TU-PROYECTO',
  storageBucket: 'TU-PROYECTO.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
};

/**
 * Nombre del hogar dentro de la base de datos. Todos los datos viven en
 * `hogares/<HOGAR_ID>/...`. Solo cambialo si querés empezar otro hogar
 * desde cero en el mismo proyecto.
 */
export const HOGAR_ID = 'principal';
