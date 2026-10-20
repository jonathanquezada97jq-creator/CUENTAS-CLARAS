/**
 * Ajustes (en la hoja inferior): cuenta, respaldo, cifras de ley y borrado.
 */
import { escaparHtml as esc, dinero } from '../utils/formato.js';
import { ICONOS } from '../ui/iconos.js';
import { abrirHoja, cerrarHoja } from '../ui/hoja.js';
import { avisar } from '../ui/aviso.js';
import { confirmarEnBoton } from '../ui/confirmar.js';
import { leer } from '../state/store.js';
import { borrarTodo, exportarRespaldo, importarRespaldo } from '../data/repositorio.js';
import {
  AFP,
  AGUINALDO,
  ISSS,
  SALARIO_MINIMO_COMERCIO,
  TABLA_RENTA_MENSUAL,
} from '../constants/ley-sv.js';

function filasDeLey() {
  const tramos = TABLA_RENTA_MENSUAL.map((t) =>
    t.porcentaje
      ? [`Renta, tramo ${t.tramo}`, `${t.porcentaje * 100} % sobre ${dinero(t.sobreExceso)} + ${dinero(t.cuotaFija)}`]
      : [`Renta, tramo ${t.tramo}`, `hasta ${dinero(t.hasta)} sin renta`],
  );
  const filas = [
    ['ISSS (trabajador)', `${ISSS.tasa * 100} % · base máx. ${dinero(ISSS.baseMaxima)}`],
    ['AFP (trabajador)', `${AFP.tasa * 100} %`],
    ...tramos,
    ['Servicios profesionales', 'retención 10 %'],
    [`Aguinaldo ${AGUINALDO.exencionRenta.anio}`, `exento hasta ${dinero(AGUINALDO.exencionRenta.hasta)}`],
    ['Salario mínimo comercio', dinero(SALARIO_MINIMO_COMERCIO)],
  ];
  return filas.map(([a, b]) => `<li><span>${esc(a)}</span><span>${esc(b)}</span></li>`).join('');
}

export function abrirAjustes() {
  const { usuario } = leer();
  abrirHoja(
    `<div class="hoja__encabezado"><h2>Ajustes</h2><button type="button" class="boton-icono" data-accion="cerrar-hoja" aria-label="Cerrar">${ICONOS.cerrar}</button></div>

    <section class="seccion">
      <span class="etiqueta">Cuenta</span>
      <p class="nota">Entraste como <b>${esc(usuario?.nombre || '')}</b> (${esc(usuario?.correo || '')}). Los datos se comparten con la otra cuenta autorizada del hogar.</p>
      <div class="fila-botones"><button type="button" class="boton" data-accion="salir">Salir</button></div>
    </section>

    <section class="seccion">
      <span class="etiqueta">Respaldo</span>
      <p class="nota">Copien un respaldo de vez en cuando y guárdenlo en sus notas. Para restaurarlo, o para traer los datos de la versión anterior, péguenlo abajo.</p>
      <div class="fila-botones"><button type="button" class="boton" data-accion="copiar-respaldo">Copiar respaldo</button></div>
      <div class="campo">
        <label for="texto-respaldo">Pegar respaldo</label>
        <textarea id="texto-respaldo" placeholder='{"app":"cuentas-claras", …}'></textarea>
      </div>
      <div class="fila-botones"><button type="button" class="boton" data-accion="importar-respaldo">Cargar respaldo</button></div>
      <p class="formulario__error" role="alert" id="mensaje-respaldo"></p>
    </section>

    <section class="seccion">
      <span class="etiqueta">Cifras de ley que usa la app</span>
      <ul class="datos-ley">${filasDeLey()}</ul>
      <p class="nota">Es un estimado de un mes normal: no incluye el recálculo de renta de junio y diciembre. Si la boleta dice otra cosa, escriban lo que les depositan en el salario de cada persona.</p>
    </section>

    <section class="seccion">
      <span class="etiqueta">Empezar de nuevo</span>
      <p class="nota">Borra todo lo del hogar para las dos cuentas. Copien un respaldo antes.</p>
      <div class="fila-botones"><button type="button" class="boton boton--peligro" data-accion="borrar-todo">Borrar todos los datos</button></div>
    </section>`,
    { titulo: 'Ajustes' },
  );
}

async function copiarRespaldo(boton) {
  const area = document.getElementById('texto-respaldo');
  boton.disabled = true;
  try {
    const texto = await exportarRespaldo();
    area.value = texto;
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Respaldo copiado. Pegalo en tus notas.');
    } catch {
      area.focus();
      area.select();
      avisar('El respaldo está en el cuadro: seleccionalo y copialo.');
    }
  } catch (error) {
    console.error(error);
    avisar('No se pudo leer todo. Revisá la conexión e intentá de nuevo.');
  } finally {
    boton.disabled = false;
  }
}

async function cargarRespaldo(boton) {
  const mensaje = document.getElementById('mensaje-respaldo');
  mensaje.textContent = '';
  let objeto;
  try {
    objeto = JSON.parse(document.getElementById('texto-respaldo').value);
  } catch {
    mensaje.textContent = 'Ese texto no está completo. Copien el respaldo entero e intenten de nuevo.';
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Cargando…';
  try {
    const cantidad = await importarRespaldo(objeto);
    cerrarHoja();
    avisar(`Respaldo cargado: ${cantidad} registros.`);
  } catch (error) {
    mensaje.textContent = error.message.includes('respaldo')
      ? error.message
      : 'No se pudo guardar. Revisen la conexión e intenten de nuevo.';
    boton.disabled = false;
    boton.textContent = 'Cargar respaldo';
  }
}

export const acciones = {
  'abrir-ajustes': abrirAjustes,
  'copiar-respaldo': copiarRespaldo,
  'importar-respaldo': cargarRespaldo,
  'borrar-todo': (boton) =>
    confirmarEnBoton(boton, async () => {
      boton.disabled = true;
      try {
        await borrarTodo();
        cerrarHoja();
        avisar('Se borraron todos los datos.');
      } catch {
        boton.disabled = false;
        avisar('No se pudo borrar. Revisen la conexión.');
      }
    }, { pregunta: 'Tocá otra vez para borrar todo' }),
};
