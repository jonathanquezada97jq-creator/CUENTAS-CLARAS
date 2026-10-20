/** Pestaña Ingresos: salario de cada persona con su boleta, aguinaldo y otros ingresos. */
import { escaparHtml as esc, dinero } from '../utils/formato.js';
import { calcularAguinaldo } from '../domain/salario.js';
import { ingresoTotalMensual, ingresosExtraMensuales } from '../domain/presupuesto.js';
import { TIPOS_INGRESO } from '../constants/catalogos.js';
import { boletaSalario, boton, bloqueVacio, motivoAguinaldo, textoAguinaldo } from '../ui/componentes.js';

function personaHtml(persona, datos, anio) {
  const aguinaldo = calcularAguinaldo(persona, anio);
  return `<article class="persona">
    <div class="persona__cabecera">
      <h3 class="persona__nombre">${esc(persona.nombre)}</h3>
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

export function vistaIngresos(estado, hoy) {
  const { datos } = estado;
  const anio = hoy.getFullYear();
  const personas = datos.personas.length
    ? datos.personas.map((p) => personaHtml(p, datos, anio)).join('')
    : bloqueVacio('Agreguen a cada persona del hogar con su salario.', boton('Agregar persona', 'nueva-persona', { variante: 'principal' }));

  const extras = datos.ingresos.length
    ? `<ul class="lista">${datos.ingresos
        .map(
          (i) => `<li class="lista__fila"><button type="button" class="lista__enlace" data-accion="editar-ingreso" data-id="${esc(i.id)}"><div class="lista__titulo">${esc(i.nombre)}</div><div class="lista__detalle">${esc(TIPOS_INGRESO[i.tipo] || 'Ingreso')} · ${i.frecuencia === 'quincenal' ? 'quincenal' : 'mensual'} · día ${esc(i.dia)}</div></button><span class="monto">${dinero(i.monto)}</span></li>`,
        )
        .join('')}</ul>
      <div class="indicadores"><span>Otros ingresos al mes <b>${dinero(ingresosExtraMensuales(datos))}</b></span></div>`
    : '<p class="nota">Remesas, ventas, alquileres: agréguenlos para que cuenten en el presupuesto.</p>';

  return `<section class="seccion">
      <h1 class="titulo-pagina">Ingresos</h1>
      <p class="texto-suave">Salarios con los descuentos de ley de El Salvador, aguinaldo y lo demás que entra.</p>
      <div class="indicadores"><span>Total del hogar al mes <b>${dinero(ingresoTotalMensual(datos))}</b></span></div>
    </section>
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Salarios</h2>${datos.personas.length ? boton('Agregar persona', 'nueva-persona', { variante: 'chico', icono: 'mas' }) : ''}</div>
      ${personas}
    </section>
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Otros ingresos</h2>${boton('Agregar', 'nuevo-ingreso', { variante: 'chico', icono: 'mas' })}</div>
      ${extras}
    </section>`;
}
