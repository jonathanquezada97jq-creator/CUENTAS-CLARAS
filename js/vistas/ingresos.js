/**
 * Pestaña Ingresos: salario de cada persona con su boleta y aguinaldo,
 * ingresos que se repiten e ingresos de una sola vez.
 */
import { escaparHtml as esc, dinero } from '../utils/formato.js';
import { fechaCorta, leerFecha } from '../utils/fechas.js';
import { calcularAguinaldo } from '../domain/salario.js';
import {
  diasDePago,
  esIngresoUnico,
  ingresoTotalMensual,
  ingresosRecurrentesMensuales,
} from '../domain/presupuesto.js';
import { TIPOS_INGRESO } from '../constants/catalogos.js';
import { boletaSalario, boton, bloqueVacio, motivoAguinaldo, textoAguinaldo } from '../ui/componentes.js';

/** Cuántos ingresos de una sola vez se muestran (los más recientes). */
const MAXIMO_UNICOS = 12;

function textoDiasDePago(persona) {
  const dias = diasDePago(persona);
  return dias.length === 2 ? `Le pagan los días ${dias[0]} y ${dias[1]}` : `Le pagan el día ${dias[0]}`;
}

function personaHtml(persona, datos, anio) {
  const aguinaldo = calcularAguinaldo(persona, anio);
  return `<article class="persona">
    <div class="persona__cabecera">
      <div><h3 class="persona__nombre">${esc(persona.nombre)}</h3><div class="lista__detalle">${textoDiasDePago(persona)}</div></div>
      ${boton('Editar', 'editar-persona', { variante: 'chico', datos: { id: persona.id } })}
    </div>
    ${boletaSalario(persona, datos)}
    ${
      aguinaldo
        ? `<div class="cifra"><span class="etiqueta">Aguinaldo ${anio}</span><span class="cifra__valor">${dinero(aguinaldo.monto)} <small>${aguinaldo.dias} días × ${dinero(aguinaldo.salarioDiario)}</small></span><p>Le tocan ${aguinaldo.dias} días (${esc(motivoAguinaldo(aguinaldo))}). ${esc(textoAguinaldo(aguinaldo, anio))}</p></div>`
        : ''
    }
  </article>`;
}

function filaIngreso(ingreso, detalle) {
  return `<li class="lista__fila"><button type="button" class="lista__enlace" data-accion="editar-ingreso" data-id="${esc(ingreso.id)}"><div class="lista__titulo">${esc(ingreso.nombre)}</div><div class="lista__detalle">${esc(detalle)}</div></button><span class="monto">${dinero(ingreso.monto)}</span></li>`;
}

export function vistaIngresos(estado, hoy) {
  const { datos } = estado;
  const anio = hoy.getFullYear();
  const personas = datos.personas.length
    ? datos.personas.map((p) => personaHtml(p, datos, anio)).join('')
    : bloqueVacio('Agreguen a cada persona del hogar con su salario.', boton('Agregar persona', 'nueva-persona', { variante: 'principal' }));

  const recurrentes = datos.ingresos.filter((i) => !esIngresoUnico(i));
  const unicos = datos.ingresos
    .filter(esIngresoUnico)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, MAXIMO_UNICOS);

  const listaRecurrentes = recurrentes.length
    ? `<ul class="lista">${recurrentes
        .map((i) => filaIngreso(i, `${TIPOS_INGRESO[i.tipo] || 'Ingreso'} · ${i.frecuencia === 'quincenal' ? 'cada quincena' : 'cada mes'} · día ${i.dia}`))
        .join('')}</ul>
      <div class="indicadores"><span>Al mes <b>${dinero(ingresosRecurrentesMensuales(datos))}</b></span></div>`
    : '<p class="nota">Remesas, alquileres o cualquier entrada fija que se repite.</p>';

  const listaUnicos = unicos.length
    ? `<ul class="lista">${unicos
        .map((i) => {
          const fecha = leerFecha(i.fecha);
          return filaIngreso(i, `${fecha ? fechaCorta(fecha) : ''} · ${TIPOS_INGRESO[i.tipo] || 'Ingreso'}`);
        })
        .join('')}</ul>`
    : '<p class="nota">Una venta, un servicio, un trabajo extra. Cuenta solo en el mes de su fecha.</p>';

  return `<section class="seccion">
      <h1 class="titulo-pagina">Ingresos</h1>
      <p class="texto-suave">Salarios con los descuentos de ley de El Salvador, aguinaldo y lo demás que entra.</p>
      <div class="indicadores"><span>Fijo del hogar al mes <b>${dinero(ingresoTotalMensual(datos))}</b></span></div>
    </section>
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Salarios</h2>${datos.personas.length ? boton('Agregar persona', 'nueva-persona', { variante: 'chico', icono: 'mas' }) : ''}</div>
      ${personas}
    </section>
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">De una sola vez</h2>${boton('Agregar', 'nuevo-ingreso-unico', { variante: 'principal chico', icono: 'mas' })}</div>
      ${listaUnicos}
    </section>
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Cada mes o quincena</h2>${boton('Agregar', 'nuevo-ingreso', { variante: 'chico', icono: 'mas' })}</div>
      ${listaRecurrentes}
    </section>`;
}
