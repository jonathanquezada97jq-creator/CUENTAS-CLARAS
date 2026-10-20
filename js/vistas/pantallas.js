/**
 * Pantallas que se ven antes de usar la app: falta configurar Firebase,
 * entrar con Google, cuenta sin permiso y cargando.
 */
import { escaparHtml as esc } from '../utils/formato.js';
import { ICONOS } from '../ui/iconos.js';
import { avisar } from '../ui/aviso.js';
import { entrarConGoogle, salir } from '../data/sesion.js';

export function pantallaSinConfiguracion() {
  return `<section class="pantalla">
    <span class="etiqueta">Falta un paso</span>
    <h1>Conectá la app con tu proyecto de Firebase</h1>
    <p>Abrí el archivo <code>js/config.js</code> y pegá los datos de tu app web de Firebase. Los pasos completos están en el archivo <code>README.md</code>, en la sección "Puesta en marcha".</p>
  </section>`;
}

export function pantallaEntrada() {
  return `<section class="pantalla">
    <span class="etiqueta">Finanzas del hogar · El Salvador</span>
    <h1>Las cuentas de la casa, claras y compartidas</h1>
    <p>Salarios con ISSS, AFP y renta, tarjetas, cuotas y pagos del mes. Lo que uno anota, el otro lo ve al instante.</p>
    <button type="button" class="boton boton--grande" data-accion="entrar">${ICONOS.google}Entrar con Google</button>
    <p class="nota">Solo las cuentas autorizadas pueden ver los datos.</p>
  </section>`;
}

export function pantallaSinPermiso(usuario) {
  return `<section class="pantalla">
    <span class="etiqueta">Sin acceso</span>
    <h1>Esta cuenta no tiene permiso</h1>
    <p>Entraste como <b>${esc(usuario?.correo || 'una cuenta sin correo')}</b>, pero ese correo no está en la lista de las reglas de Firestore.</p>
    <p>Si es tu cuenta, agregá el correo en <code>firestore.rules</code> y publicá las reglas en la consola de Firebase. Si te equivocaste de cuenta, salí y entrá con la correcta.</p>
    <button type="button" class="boton" data-accion="salir">Salir y usar otra cuenta</button>
  </section>`;
}

export function pantallaCargando() {
  return `<section class="pantalla" aria-busy="true">
    <span class="etiqueta">Un momento</span>
    <h1>Cargando sus cuentas…</h1>
  </section>`;
}

export const acciones = {
  entrar: () =>
    entrarConGoogle().catch((error) => {
      console.error(error);
      avisar('No se pudo entrar. Revisá tu conexión e intentá de nuevo.');
    }),
  salir: () => salir(),
};
