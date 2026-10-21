/**
 * Pestaña Inicio: cuánto queda del mes, próximos pagos y avisos.
 * `vistaInicio` solo arma HTML; no escribe datos.
 */
import { escaparHtml as esc, dinero, dineroEntero, porcentaje, redondear, sumar, aNumero } from '../utils/formato.js';
import { cuandoEs, fechaCorta, mesDe, nombreDelMes, sumarMeses, diferenciaDias, leerFecha } from '../utils/fechas.js';
import {
  resumenDelMes,
  pagosDelMes,
  endeudamiento,
  nivelDeDeuda,
  proximosIngresos,
  gastosDelMes,
  clavePago,
  LIMITES_DEUDA,
} from '../domain/presupuesto.js';
import { usoDeTarjeta } from '../domain/tarjetas.js';
import { cuotasPendientes, mesDeLaUltimaCuota } from '../domain/plazos.js';
import { calcularAguinaldo } from '../domain/salario.js';
import {
  boton,
  bloqueVacio,
  cifraGrande,
  enlacePestana,
  filaPago,
  motivoAguinaldo,
  textoAguinaldo,
} from '../ui/componentes.js';

const NIVELES = {
  saludable: { texto: 'Saludable', clase: 'bien' },
  cuidado: { texto: 'Con cuidado', clase: 'aviso' },
  alto: { texto: 'Alto', clase: 'mal' },
};

function primerosPasos() {
  return `<section class="seccion">
      <h1 class="titulo-pagina">Empecemos por lo básico</h1>
      <p class="texto-suave">Con sus salarios, tarjetas y lo que sacaron a plazos, la app les dice cuánto les queda cada mes y qué tienen que pagar. Lo que uno anota, el otro lo ve al instante.</p>
    </section>
    ${bloqueVacio('1. Agreguen a cada persona con su salario: calculamos ISSS, AFP y renta.', boton('Agregar persona', 'nueva-persona', { variante: 'principal' }))}
    ${bloqueVacio('2. Agreguen las tarjetas de crédito y lo que tienen a cuotas o en préstamo.', boton('Agregar tarjeta', 'nueva-tarjeta') + boton('Agregar cuota', 'nuevo-plazo'))}
    ${bloqueVacio('3. Anoten los gastos fijos: alquiler, luz, agua, internet.', boton('Agregar gasto fijo', 'nuevo-fijo'))}
    ${bloqueVacio('¿Ya usaban la versión anterior? Copien el respaldo de allá y péguenlo en Ajustes.', boton('Abrir Ajustes', 'abrir-ajustes'))}`;
}

function resumen(r, mes) {
  const base = Math.max(r.ingreso, r.compromisos + r.gastosEfectivo, 1);
  const ancho = (x) => `${((Math.max(0, x) / base) * 100).toFixed(2)}%`;
  const falta = r.disponible < 0;
  return `<section class="resumen" aria-label="Resumen del mes">
    <div class="etiqueta">${falta ? 'Les falta en' : 'Les queda en'} ${nombreDelMes(mes)}</div>
    <div class="resumen__cifra${falta ? ' resumen__cifra--falta' : ''}">${cifraGrande(Math.abs(r.disponible))}</div>
    <div class="resumen__detalle">Entran <b>${dinero(r.ingreso)}</b> · pagos <b>${dinero(r.compromisos)}</b> · gastos <b>${dinero(r.gastosEfectivo)}</b></div>
    <div class="resumen__barra" role="img" aria-label="Pagado ${dinero(r.pagado)}, por pagar ${dinero(r.pendiente)}, gastos ${dinero(r.gastosEfectivo)}">
      <span class="segmento--pagado" style="width:${ancho(r.pagado)}"></span><span class="segmento--pendiente" style="width:${ancho(r.pendiente)}"></span><span class="segmento--gastos" style="width:${ancho(r.gastosEfectivo)}"></span>
    </div>
    <div class="resumen__leyenda">
      <span><i class="segmento--pagado"></i>Pagado ${dineroEntero(r.pagado)}</span>
      <span><i class="segmento--pendiente"></i>Por pagar ${dineroEntero(r.pendiente)}</span>
      <span><i class="segmento--gastos"></i>Gastos ${dineroEntero(r.gastosEfectivo)}</span>
    </div>
  </section>`;
}

function medidor(proporcion, clase, marcas) {
  const relleno = Math.min(100, proporcion * 100).toFixed(1);
  const lineas = marcas.map((m) => `<i class="medidor__marca" style="left:${m * 100}%"></i>`).join('');
  return `<div class="medidor medidor--${clase}"><span class="medidor__relleno" style="width:${relleno}%"></span>${lineas}</div>`;
}

function cifras(r, datos) {
  const pendientes = r.pagos.filter((p) => !p.pagado).length;
  const deuda = endeudamiento(datos);
  const nivel = NIVELES[nivelDeDeuda(deuda.proporcion)];
  const limite = redondear(sumar(datos.tarjetas, (t) => aNumero(t.limite)));
  const usado = redondear(sumar(datos.tarjetas, (t) => usoDeTarjeta(t, datos.plazos).usado));
  const uso = limite > 0 ? usado / limite : 0;
  const claseUso = uso < 0.3 ? 'bien' : uso <= 0.6 ? 'aviso' : 'mal';

  return `<section class="cifras">
    <div class="cifra">
      <span class="etiqueta">Por pagar este mes</span>
      <span class="cifra__valor">${dinero(r.pendiente)}</span>
      <p>${pendientes ? `${pendientes} pago${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''}` : 'Todo al día'}</p>
    </div>
    <div class="cifra">
      <span class="etiqueta">Cuotas de deuda / ingreso</span>
      <span class="cifra__valor">${porcentaje(deuda.proporcion)} <small>${nivel.texto}</small></span>
      ${medidor(deuda.proporcion, nivel.clase, [LIMITES_DEUDA.saludable, LIMITES_DEUDA.maximo])}
      <p>${dinero(deuda.total)} al mes entre cuotas y mínimos. Arriba de ${porcentaje(LIMITES_DEUDA.maximo)} es difícil que les aprueben otro crédito.</p>
    </div>
    <div class="cifra">
      <span class="etiqueta">Uso de tarjetas</span>
      ${
        limite > 0
          ? `<span class="cifra__valor">${porcentaje(uso)} <small>de ${dineroEntero(limite)}</small></span>${medidor(uso, claseUso, [0.3])}<p>${dinero(usado)} usado, con las cuotas pendientes.</p>`
          : '<span class="cifra__valor">—</span><p>No hay tarjetas registradas.</p>'
      }
    </div>
  </section>`;
}

function proximosPagos(r, datos, mes, hoy) {
  const pendientes = r.pagos.filter((p) => !p.pagado);
  const siguientes = pagosDelMes(datos, sumarMeses(mes, 1), hoy).filter(
    (p) => !p.pagado && diferenciaDias(hoy, p.fecha) <= 21,
  );
  const lista = [...pendientes, ...siguientes].slice(0, 6);
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Próximos pagos</h2>${enlacePestana('Ver el mes', 'pagos')}</div>
    ${lista.length ? `<ul class="pagos">${lista.map((p) => filaPago(p, hoy, datos)).join('')}</ul>` : bloqueVacio('No hay pagos pendientes en las próximas semanas.')}
  </section>`;
}

function proximosDepositos(datos, hoy) {
  const lista = proximosIngresos(datos, hoy).slice(0, 4);
  if (!lista.length) return '';
  const nombre = (e) =>
    e.tipo === 'salario'
      ? `${e.persona.frecuencia === 'mensual' ? 'Salario' : 'Quincena'} de ${e.persona.nombre}`
      : e.ingreso.nombre;
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Lo que va a entrar</h2></div>
    <ul class="lista">${lista
      .map(
        (e) => `<li class="lista__fila"><div class="lista__principal"><div class="lista__titulo">${esc(nombre(e))}</div><div class="lista__detalle">${fechaCorta(e.fecha)} · ${cuandoEs(e.fecha, hoy).toLowerCase()}</div></div><span class="monto">${dinero(e.monto)}</span></li>`,
      )
      .join('')}</ul>
  </section>`;
}

const marcaDeTiempo = (gasto) => gasto.creadoEn?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

function ultimosGastos(datos, mes) {
  const gastos = [...gastosDelMes(datos, mes)]
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || marcaDeTiempo(b) - marcaDeTiempo(a))
    .slice(0, 3);
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Lo último que anotaron</h2>${enlacePestana('Ver gastos', 'pagos')}</div>
    ${
      gastos.length
        ? `<ul class="lista">${gastos
            .map((g) => {
              const fecha = leerFecha(g.fecha);
              const quien = g.autor?.nombre ? ` · ${g.autor.nombre.split(' ')[0]}` : '';
              return `<li class="lista__fila"><div class="lista__principal"><div class="lista__titulo">${esc(g.nota || g.categoria)}</div><div class="lista__detalle">${fecha ? fechaCorta(fecha) : ''} · ${esc(g.categoria)}${esc(quien)}</div></div><span class="monto">${dinero(g.monto)}</span></li>`;
            })
            .join('')}</ul>`
        : '<p class="nota">Anoten lo que gastan en el día: súper, gasolina, salidas. El otro lo ve al instante.</p>'
    }
  </section>`;
}

function aguinaldos(datos, hoy) {
  const anio = hoy.getFullYear();
  const lista = datos.personas
    .map((persona) => ({ persona, aguinaldo: calcularAguinaldo(persona, anio) }))
    .filter((x) => x.aguinaldo);
  if (!lista.length) return '';
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Aguinaldo ${anio}</h2></div>
    <ul class="lista">${lista
      .map(
        ({ persona, aguinaldo }) => `<li class="lista__fila"><div class="lista__principal"><div class="lista__titulo">${esc(persona.nombre)}</div><div class="lista__detalle">${aguinaldo.dias} días · ${esc(motivoAguinaldo(aguinaldo))}</div></div><span class="monto">${dinero(aguinaldo.monto)}</span></li>`,
      )
      .join('')}</ul>
    <p class="nota">${esc(textoAguinaldo(lista[0].aguinaldo, anio))}</p>
  </section>`;
}

function cuotasPorTerminar(datos, mes) {
  const pagadosEsteMes = datos.pagados?.[mes] ?? {};
  const lista = datos.plazos
    .filter((p) => cuotasPendientes(p) > 0 && cuotasPendientes(p) <= 3)
    .sort((a, b) => cuotasPendientes(a) - cuotasPendientes(b));
  if (!lista.length) return '';
  return `<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Cuotas por terminar</h2></div>
    <ul class="lista">${lista
      .map((p) => {
        const n = cuotasPendientes(p);
        const ultima = mesDeLaUltimaCuota(p, mes, Boolean(pagadosEsteMes[clavePago('plazo', p.id)]));
        return `<li class="lista__fila"><div class="lista__principal"><div class="lista__titulo">${esc(p.descripcion)}</div><div class="lista__detalle">${n === 1 ? 'Falta 1 cuota' : `Faltan ${n} cuotas`} · desde ${nombreDelMes(sumarMeses(ultima, 1))} se liberan ${dinero(p.cuota)} al mes</div></div></li>`;
      })
      .join('')}</ul>
  </section>`;
}

/** @param {Object} estado  Estado completo (ver js/state/store.js). */
export function vistaInicio(estado, hoy) {
  const { datos } = estado;
  const vacio = ['personas', 'ingresos', 'tarjetas', 'plazos', 'fijos'].every((c) => !datos[c].length);
  if (vacio) return primerosPasos();

  const mes = mesDe(hoy);
  const r = resumenDelMes(datos, mes, hoy);
  const accionesRapidas = `<div class="acciones-rapidas">
      ${boton('Agregar gasto', 'nuevo-gasto', { variante: 'principal', icono: 'mas', datos: { mes } })}
      ${boton('Agregar ingreso', 'nuevo-ingreso-unico', { icono: 'mas', datos: { mes } })}
    </div>`;
  return [
    resumen(r, mes),
    accionesRapidas,
    cifras(r, datos),
    proximosPagos(r, datos, mes, hoy),
    ultimosGastos(datos, mes),
    proximosDepositos(datos, hoy),
    aguinaldos(datos, hoy),
    cuotasPorTerminar(datos, mes),
  ].join('');
}
