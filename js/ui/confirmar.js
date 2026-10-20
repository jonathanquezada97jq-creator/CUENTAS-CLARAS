/**
 * Confirmación en el mismo botón: el primer toque cambia el texto a una
 * pregunta y el segundo toque ejecuta la acción. Si no se toca otra vez
 * en unos segundos, el botón vuelve a como estaba.
 * (Las ventanas `confirm()` del navegador no se usan: se ven mal en el teléfono.)
 */
export function confirmarEnBoton(elemento, accion, { pregunta = '¿Seguro? Tocá otra vez', esperaMs = 3500 } = {}) {
  if (elemento.dataset.confirmando) {
    delete elemento.dataset.confirmando;
    accion();
    return;
  }
  const contenidoOriginal = elemento.innerHTML;
  elemento.dataset.confirmando = 'si';
  elemento.classList.add('confirmando');
  elemento.textContent = pregunta;
  setTimeout(() => {
    if (!elemento.isConnected || !elemento.dataset.confirmando) return;
    delete elemento.dataset.confirmando;
    elemento.classList.remove('confirmando');
    elemento.innerHTML = contenidoOriginal;
  }, esperaMs);
}
