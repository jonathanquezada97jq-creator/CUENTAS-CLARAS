/**
 * Aviso flotante corto ("Gasto agregado", "Respaldo copiado").
 */
let temporizador = null;

export function avisar(texto, duracionMs = 2800) {
  const elemento = document.getElementById('aviso');
  elemento.textContent = texto;
  elemento.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    elemento.hidden = true;
  }, duracionMs);
}
