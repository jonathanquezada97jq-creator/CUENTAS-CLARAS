/**
 * Íconos SVG que se insertan dentro del HTML de las vistas.
 * Usan `currentColor`, así que toman el color del texto que los rodea.
 */
const svg = (contenido, grosor = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contenido}</svg>`;

export const ICONOS = Object.freeze({
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  cerrar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>', 2.2),
  izquierda: svg('<path d="M15 5l-7 7 7 7"/>'),
  derecha: svg('<path d="M9 5l7 7-7 7"/>'),
  ajustes: svg(
    '<path d="M4 6h9M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15.5" cy="6" r="2.2"/><circle cx="8.5" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
    1.8,
  ),
  inicio: svg('<path d="M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1H15v-5.5H9V20H4.5a1 1 0 0 1-1-1z"/>', 1.8),
  pagos: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14l2 2 4-4"/>', 1.8),
  tarjetas: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.2"/><path d="M2.5 9.5h19M6 15h4"/>', 1.8),
  cuotas: svg('<path d="M12 3.5 20.5 8 12 12.5 3.5 8z"/><path d="M3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16"/>', 1.8),
  ingresos: svg(
    '<path d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 20H4z"/><path d="M4 7.5V5.5A1.5 1.5 0 0 1 5.5 4H16"/><circle cx="16" cy="13.8" r="1.4"/>',
    1.8,
  ),
  google:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
});
