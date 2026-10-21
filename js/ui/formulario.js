/**
 * Formularios declarativos en la hoja inferior.
 *
 * Cada formulario se describe con una lista de campos, por ejemplo:
 *
 *   { nombre: 'limite', etiqueta: 'Límite de crédito', tipo: 'dinero', requerido: true, medio: true }
 *
 * Tipos: 'texto' (por defecto), 'dinero', 'entero', 'dia', 'porcentaje',
 *        'fecha', 'lista', 'opciones' (botones para elegir uno), 'casilla', 'colores'.
 * Opcionales: ayuda, sugerencias (lista para autocompletar), opciones (para
 *   'lista', 'opciones' y 'colores'; en 'opciones' cada una puede llevar un
 *   tercer valor que se muestra a la derecha, como un monto), porDefecto,
 *   maximo (largo del texto), medio (ocupa media fila),
 *   mostrarSi: ['otroCampo', 'valor'] o ['otroCampo', ['valor1', 'valor2']].
 */
import { aNumero, escaparHtml as esc } from '../utils/formato.js';
import { abrirHoja, cerrarHoja } from './hoja.js';
import { ICONOS } from './iconos.js';
import { confirmarEnBoton } from './confirmar.js';

const TIPOS_NUMERICOS = new Set(['dinero', 'entero', 'dia', 'porcentaje']);

/** Acepta ['a','b'], [['valor','texto']] u { valor: 'texto' }. */
function paresDeOpciones(opciones = []) {
  const lista = Array.isArray(opciones) ? opciones : Object.entries(opciones);
  return lista.map((x) => (Array.isArray(x) ? x : [x, x]));
}

function htmlControl(campo, valor, id) {
  const requerido = campo.requerido ? ' required' : '';
  switch (campo.tipo) {
    case 'lista':
      return `<select id="${id}" name="${campo.nombre}"${requerido}>${paresDeOpciones(campo.opciones)
        .map(
          ([v, t]) =>
            `<option value="${esc(v)}"${String(v) === String(valor) ? ' selected' : ''}>${esc(t)}</option>`,
        )
        .join('')}</select>`;
    case 'dinero':
      return `<div class="entrada-dinero"><span>$</span><input id="${id}" name="${campo.nombre}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(valor)}" placeholder="${esc(campo.ejemplo ?? '0.00')}"${requerido}></div>`;
    case 'entero':
    case 'dia':
    case 'porcentaje': {
      const decimal = campo.tipo === 'porcentaje';
      const limites = campo.tipo === 'dia' ? ' min="1" max="31"' : ' min="0"';
      return `<input id="${id}" name="${campo.nombre}" type="number" inputmode="${decimal ? 'decimal' : 'numeric'}" step="${decimal ? '0.01' : '1'}"${limites} value="${esc(valor)}" placeholder="${esc(campo.ejemplo ?? '')}"${requerido}>`;
    }
    case 'fecha':
      return `<input id="${id}" name="${campo.nombre}" type="date" value="${esc(valor)}"${requerido}>`;
    default: {
      const lista = campo.sugerencias ? ` list="${id}-sugerencias"` : '';
      const sugerencias = campo.sugerencias
        ? `<datalist id="${id}-sugerencias">${campo.sugerencias.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`
        : '';
      return `<input id="${id}" name="${campo.nombre}" type="text" value="${esc(valor)}" placeholder="${esc(campo.ejemplo ?? '')}" maxlength="${campo.maximo ?? 60}"${lista}${requerido}>${sugerencias}`;
    }
  }
}

function htmlCampo(campo, valorGuardado) {
  const id = `campo-${campo.nombre}`;
  const vacio = valorGuardado === undefined || valorGuardado === null || valorGuardado === '';
  const valor = vacio ? (campo.porDefecto ?? '') : valorGuardado;
  const valoresQueMuestran = campo.mostrarSi ? [].concat(campo.mostrarSi[1]).join('|') : '';
  const condicion = campo.mostrarSi
    ? ` data-mostrar-si="${campo.mostrarSi[0]}" data-valor="${esc(valoresQueMuestran)}"`
    : '';

  if (campo.tipo === 'opciones') {
    const botones = paresDeOpciones(campo.opciones)
      .map(
        ([clave, texto, detalle]) =>
          `<label class="opcion"><input type="radio" name="${campo.nombre}" value="${esc(clave)}"${String(clave) === String(valor) ? ' checked' : ''}><span class="opcion__texto">${esc(texto)}</span>${detalle ? `<b class="opcion__detalle">${esc(detalle)}</b>` : ''}</label>`,
      )
      .join('');
    return `<fieldset class="campo campo--opciones"${condicion}><legend class="campo__nombre">${esc(campo.etiqueta)}</legend><div class="opciones">${botones}</div></fieldset>`;
  }

  if (campo.tipo === 'casilla') {
    return `<label class="campo campo--casilla"${condicion}><input id="${id}" name="${campo.nombre}" type="checkbox"${valor ? ' checked' : ''}><span>${esc(campo.etiqueta)}</span></label>`;
  }

  if (campo.tipo === 'colores') {
    const opciones = paresDeOpciones(campo.opciones)
      .map(
        ([clave, nombre]) =>
          `<label title="${esc(nombre)}"><input type="radio" name="${campo.nombre}" value="${esc(clave)}"${clave === valor ? ' checked' : ''} aria-label="${esc(nombre)}"><span style="background: var(--tarjeta-${esc(clave)})"></span></label>`,
      )
      .join('');
    return `<div class="campo"${condicion}><span class="campo__nombre">${esc(campo.etiqueta)}</span><div class="colores" role="radiogroup" aria-label="${esc(campo.etiqueta)}">${opciones}</div></div>`;
  }

  const clase = campo.medio ? 'campo campo--medio' : 'campo';
  const ayuda = campo.ayuda ? `<small>${esc(campo.ayuda)}</small>` : '';
  return `<div class="${clase}"${condicion}><label for="${id}">${esc(campo.etiqueta)}</label>${htmlControl(campo, valor, id)}${ayuda}</div>`;
}

function leerCampo(formulario, campo) {
  if (campo.tipo === 'colores' || campo.tipo === 'opciones') {
    const marcado = formulario.querySelector(`input[name="${campo.nombre}"]:checked`);
    return marcado ? marcado.value : (campo.porDefecto ?? '');
  }
  const control = formulario.elements.namedItem(campo.nombre);
  if (!control) return '';
  if (campo.tipo === 'casilla') return control.checked;
  if (TIPOS_NUMERICOS.has(campo.tipo)) {
    if (control.value.trim() === '') return '';
    const numero = aNumero(control.value);
    return campo.tipo === 'entero' || campo.tipo === 'dia' ? Math.round(numero) : numero;
  }
  return control.value.trim();
}

const estaOculto = (formulario, campo) =>
  Boolean(formulario.querySelector(`[data-mostrar-si] [name="${campo.nombre}"]`)?.closest('[data-mostrar-si]')?.hidden);

/** Valores actuales; los campos ocultos por `mostrarSi` quedan vacíos. */
export function leerValores(formulario, campos) {
  const valores = {};
  campos.forEach((campo) => {
    if (estaOculto(formulario, campo)) valores[campo.nombre] = campo.tipo === 'casilla' ? false : '';
    else valores[campo.nombre] = leerCampo(formulario, campo);
  });
  return valores;
}

function aplicarCondiciones(formulario) {
  formulario.querySelectorAll('[data-mostrar-si]').forEach((envoltura) => {
    const origen = formulario.elements.namedItem(envoltura.dataset.mostrarSi);
    const valores = envoltura.dataset.valor.split('|');
    envoltura.hidden = !origen || !valores.includes(origen.value);
  });
}

/**
 * Abre un formulario en la hoja inferior.
 * @param {Object} config
 * @param {string} config.titulo
 * @param {string} [config.intro]
 * @param {Object[]} config.campos
 * @param {Object} [config.valores]  Valores actuales al editar.
 * @param {string} [config.textoGuardar]
 * @param {(valores: Object) => string|undefined} [config.validar]  Devuelve un mensaje si algo está mal.
 * @param {(valores: Object) => void} config.alGuardar
 * @param {() => void} [config.alEliminar]  Si existe, aparece el botón Eliminar.
 * @param {(valores: Object) => string} [config.vistaPrevia]  HTML que se actualiza al escribir.
 */
export function abrirFormulario(config) {
  const {
    titulo,
    intro,
    campos,
    valores = {},
    textoGuardar = 'Guardar',
    validar,
    alGuardar,
    alEliminar,
    vistaPrevia,
  } = config;

  const panel = abrirHoja(
    `<div class="hoja__encabezado">
      <h2>${esc(titulo)}</h2>
      <button type="button" class="boton-icono" data-accion="cerrar-hoja" aria-label="Cerrar">${ICONOS.cerrar}</button>
    </div>
    ${intro ? `<p class="texto-suave">${esc(intro)}</p>` : ''}
    <form class="formulario" novalidate>
      ${campos.map((campo) => htmlCampo(campo, valores[campo.nombre])).join('')}
      ${vistaPrevia ? '<div class="formulario__vista-previa" data-vista-previa></div>' : ''}
      <p class="formulario__error" role="alert" data-error></p>
      <div class="formulario__acciones">
        ${alEliminar ? '<button type="button" class="boton boton--peligro" data-eliminar>Eliminar</button>' : ''}
        <span class="separador"></span>
        <button type="button" class="boton" data-accion="cerrar-hoja">Cancelar</button>
        <button type="submit" class="boton boton--principal">${esc(textoGuardar)}</button>
      </div>
    </form>`,
    { titulo },
  );

  const formulario = panel.querySelector('form');
  const error = formulario.querySelector('[data-error]');

  const refrescar = () => {
    aplicarCondiciones(formulario);
    if (vistaPrevia) {
      formulario.querySelector('[data-vista-previa]').innerHTML = vistaPrevia(
        leerValores(formulario, campos),
      );
    }
  };
  refrescar();
  formulario.addEventListener('input', refrescar);
  formulario.addEventListener('change', refrescar);

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = leerValores(formulario, campos);
    const faltante = campos.find(
      (c) => c.requerido && !estaOculto(formulario, c) && datos[c.nombre] === '',
    );
    const mensaje = faltante
      ? `Completá el campo "${faltante.etiqueta}".`
      : validar?.(datos);
    if (mensaje) {
      error.textContent = mensaje;
      return;
    }
    cerrarHoja();
    alGuardar(datos);
  });

  const botonEliminar = formulario.querySelector('[data-eliminar]');
  botonEliminar?.addEventListener('click', () =>
    confirmarEnBoton(botonEliminar, () => {
      cerrarHoja();
      alEliminar();
    }),
  );
}
