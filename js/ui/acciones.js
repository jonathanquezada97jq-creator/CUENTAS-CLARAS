/**
 * Clics de toda la app.
 *
 * Los botones no llevan `onclick`. En su lugar tienen `data-accion`:
 *
 *   <button data-accion="editar-tarjeta" data-id="abc">Editar</button>
 *
 * Cada módulo exporta un objeto `acciones` ({ 'editar-tarjeta': (boton) => … })
 * y `app.js` los registra aquí. Un solo oyente de clics busca el manejador.
 * Para agregar un botón nuevo: ponerle `data-accion` y agregar su manejador
 * en el módulo que corresponda.
 */
const manejadores = new Map();

/** @param {Object<string, (elemento: HTMLElement, evento: MouseEvent) => void>} mapa */
export function registrarAcciones(mapa) {
  Object.entries(mapa).forEach(([nombre, manejador]) => {
    if (manejadores.has(nombre)) console.warn(`La acción "${nombre}" ya estaba registrada.`);
    manejadores.set(nombre, manejador);
  });
}

export function escucharAcciones(raiz = document) {
  raiz.addEventListener('click', (evento) => {
    const elemento = evento.target.closest('[data-accion]');
    if (!elemento) return;
    const manejador = manejadores.get(elemento.dataset.accion);
    if (!manejador) {
      console.warn(`No hay manejador para la acción "${elemento.dataset.accion}".`);
      return;
    }
    evento.preventDefault();
    manejador(elemento, evento);
  });
}
