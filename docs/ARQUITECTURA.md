# Arquitectura de Cuentas Claras

Este documento explica cómo está organizado el código, qué reglas sigue y cómo hacer los cambios más comunes. Está pensado para quien llegue al proyecto sin conocerlo.

## Decisiones de base

- **Sin framework y sin compilación.** HTML, CSS y JavaScript con módulos nativos (`import`/`export`). GitHub Pages publica los archivos tal cual y cualquier programador puede leerlos sin instalar herramientas.
- **Firebase como servidor.** Firebase Authentication (entrar con Google) y Cloud Firestore (base de datos en tiempo real). El SDK se carga desde el CDN oficial de Google en `js/data/firebase.js`.
- **Los cálculos no dependen de la interfaz.** Todo lo que es dinero o fechas vive en funciones puras con pruebas.
- **Español en todo:** nombres de archivos, funciones, variables, comentarios y textos.

## Capas y dependencias

```
index.html
  └─ js/main.js              arranque: sesión → sincronización
       ├─ js/app.js          decide la pantalla, dibuja la pestaña, registra acciones
       │    ├─ vistas/       arman HTML con el estado (y exportan sus acciones)
       │    └─ formularios/  abren un formulario y guardan con el repositorio
       ├─ ui/                piezas genéricas: hoja, aviso, formulario, componentes
       ├─ state/store.js     estado en memoria (una sola fuente de verdad)
       ├─ data/              Firebase: sesión y repositorio
       └─ domain/            reglas de negocio puras
            ├─ constants/    cifras de ley y catálogos
            └─ utils/        fechas y formato
```

Quién puede importar a quién:

| Carpeta | Puede importar | No puede importar |
| --- | --- | --- |
| `constants/`, `utils/` | solo entre ellas | nada más |
| `domain/` | `constants/`, `utils/`, otros de `domain/` | DOM, Firebase, `state/`, `ui/` |
| `data/` | `domain/`, `state/`, `utils/`, `config.js` | `ui/`, `vistas/` |
| `ui/` | `domain/`, `utils/`, `constants/` | `data/` (excepto vía acciones) |
| `vistas/`, `formularios/` | todo lo anterior | otras vistas |

`js/data/firebase.js` es el **único** archivo que importa el SDK de Firebase. Si algún día se cambia de proveedor, solo cambia la carpeta `data/`.

## Reglas del código

1. **Funciones puras en `domain/` y `utils/`.** Reciben datos y devuelven resultados. Nada de `document`, `fetch` ni Firebase adentro, y la fecha de hoy nunca se pide ahí (`new Date()` sin argumentos): llega como parámetro `hoy`. Así se prueban con `npm test`.
2. **Las vistas solo arman HTML.** `vistaPagos(estado, hoy)` devuelve un texto HTML. No escriben datos ni modifican el estado. Lo que hacen los botones va en el objeto `acciones` del mismo archivo.
3. **Clics con `data-accion`.** Ningún botón lleva `onclick`. Se escribe `<button data-accion="editar-tarjeta" data-id="abc">` y el manejador se declara en el `acciones` del módulo correspondiente. `js/app.js` los registra todos.
4. **Todo texto de la persona pasa por `esc()`** (`escaparHtml` de `utils/formato.js`) antes de entrar al HTML: nombres, notas, bancos.
5. **Escrituras solo en `data/repositorio.js`.** Formularios y acciones llaman a sus funciones (`guardarRegistro`, `alternarPago`, `agregarGasto`…). Nadie más escribe en Firestore.
6. **Dinero:** siempre `redondear()` a centavos antes de mostrar o comparar. Los saldos y cuotas cambian con `increment()` para que dos personas puedan marcar cosas a la vez.
7. **Fechas:** un mes es `"YYYY-MM"` y una fecha es `"YYYY-MM-DD"`. Las funciones de `utils/fechas.js` hacen las cuentas (fin de mes, cruce de año).
8. **Cifras de ley solo en `constants/ley-sv.js`.** Ningún otro archivo escribe un porcentaje o tope de ley.
9. **CSS con variables.** Los colores salen de `css/tokens.css`. Las clases siguen `bloque__elemento--variante` (por ejemplo `pago__marca`, `boton--principal`).
10. **Cada función pública lleva un comentario** que dice qué hace. Los tipos de los registros están documentados con JSDoc en `domain/`.

Formato: `.editorconfig` y `.prettierrc.json` (2 espacios, comillas simples, 100 columnas).

## Flujo de datos

```
Leer:     Firestore ──onSnapshot──▶ repositorio ──cambiar()──▶ store ──▶ app.dibujar() ──▶ vista
Escribir: clic ──data-accion──▶ manejador ──▶ repositorio ──▶ Firestore ──(eco)──▶ onSnapshot ──▶ …
```

Las escrituras no se esperan en la interfaz: Firestore actualiza su copia local al instante, avisa a los `onSnapshot` y envía el cambio al servidor cuando hay señal. El indicador del encabezado (`Guardado` / `Guardando…` / `Sin señal`) sale de `actualizarIndicadorDeGuardado()` en el repositorio.

`app.dibujar()` arma el HTML de la pestaña y solo reemplaza el contenido si cambió, para no perder el foco ni el scroll.

## Modelo de datos en Firestore

Todo vive bajo `hogares/{HOGAR_ID}` (`HOGAR_ID` está en `js/config.js`).

| Colección | Documento | Campos principales |
| --- | --- | --- |
| `personas` | id automático | `nombre`, `salarioBruto`, `tipo` (`asalariado` · `servicios` · `sin`), `frecuencia` (`quincenal` · `mensual`), `diaQuincena1`, `diaQuincena2` (si es quincenal), `diaPago` (si es mensual), `fechaIngreso`, `deduccion1600`, `netoReal`, `cuentaId` (cuenta donde le depositan) |
| `ingresos` | id automático | `nombre`, `tipo`, `monto`, `frecuencia` (`unica` · `mensual` · `quincenal`), `fecha` (si es `unica`), `dia` (si se repite), `cuentaId` |
| `tarjetas` | id automático | `banco`, `nombre`, `ultimos`, `titular`, `limite`, `saldo`, `pagoMinimo`, `tasa`, `corte`, `pago`, `color` |
| `cuentas` | id automático | `banco`, `tipo` (`ahorro` · `corriente`), `nombre` (apodo), `ultimos` (de la cuenta), `debito` (últimos 4 de su tarjeta de débito), `saldo`, `personaId`, `color` |
| `plazos` | id automático | `descripcion`, `acreedor`, `tipo`, `metodo` (cómo se paga normalmente: `efectivo` · `planilla` · `tarjeta:<id>` · `cuenta:<id>`), `personaId`, `cuota`, `total`, `pagadas` (cuotas pagadas antes de anotarla), `abonado` (dinero pagado desde la app), `dia`, `tasa` |
| `fijos` | id automático | `nombre`, `categoria`, `monto`, `dia`, `medio` (`efectivo` · `cuenta:<id>` · `tarjeta:<id>` si es un cargo automático), `comercio` (cómo aparece en el aviso del banco, para que el lector reconozca el cobro) |
| `meses` | `YYYY-MM` | `pagados`: mapa de clave de pago → detalle |
| `gastos` | id automático, o `correo-<id>` si vino del correo | `fecha`, `mes`, `monto`, `categoria`, `medio` (`efectivo` · `tarjeta:<id>` · `cuenta:<id>` si fue con débito), `nota`, `autor`, `origen` (`correo` si lo anotó el lector de avisos), `correoId` (gasto anotado a mano que el lector enlazó con su aviso), `posibleRepetido` (id de un gasto anotado a mano que parece el mismo, o `pago:fijo_<id>`), `descartado` (gasto del correo que se borró en la app, o aviso que se usó para otra cosa), `enlazadoA` (`pago:fijo_<id>` si el aviso marcó un gasto fijo) |
| `movimientos` | id automático, o `ref-<referencia del banco>` si vino del correo | `fecha`, `mes`, `monto`, `desde` (`cuenta:<id>` · `efectivo` · `externo`), `hacia` (`cuenta:<id>` · `tarjeta:<id>` · `efectivo` · `externo`), `nota`, `autor`, `origen`, `referencia`, `referencias` (avisos del banco enlazados con este movimiento), `lados` (`sale` · `entra`: qué banco ya avisó), `posibleRepetido` (id de otro movimiento), `descartado`, `enlazadoA` (`pago:tarjeta_<id>` o `pago:fijo_<id>` si el aviso se usó para un pago marcado) |
| `lectorCorreo` | `solicitud` y `cuenta-<correo>` | Pedido de revisar un mes desde la app (`id`, `mes`, `pedidoEn`, `pedidoPor`) y estado de cada lector (`cuenta`, `ultimaRevision`, `solicitud`, `estado`, `nuevos`, `movimientos`, `fijos`, `enlazados`, `yaEstaban`, `sinTarjeta`, `sinCuenta`, `sinLeer`, `posiblesRepetidos`, `mensaje`, y siempre `avisosPendientes`). Ver `domain/lector.js`. |

Además, todos los registros guardan `creado` (mes en que se crearon, para no aparecer en meses anteriores) y `actualizado` (hora del servidor).

**Cuotas en dinero.** Lo pagado de un plazo es `pagadas × cuota + abonado`. Así un abono mayor a la cuota baja lo que falta, y las cuotas pendientes son lo que falta ÷ cuota, redondeado hacia arriba (`domain/plazos.js`).

**Claves de pago** dentro de `meses/{mes}.pagados`: `fijo_<id>`, `plazo_<id>`, `tarjeta_<id>`. El detalle guarda lo necesario para revertir el pago exacto si se desmarca:

| Pago | Detalle guardado |
| --- | --- |
| Gasto fijo | `fecha`, `monto`, `medio` (`efectivo` · `cuenta:<id>` · `tarjeta:<id>`), `origen` (`correo` si lo marcó el lector al ver el cobro) |
| Cuota | `fecha`, `monto` (lo pagado, puede ser más que la cuota), `medio` (`efectivo` · `planilla` · `tarjeta:<id>` · `cuenta:<id>`) |
| Tarjeta | `fecha`, `monto`, `tipo` (`contado` · `minimo` · `otro`), `desde` (`efectivo` · `cuenta:<id>`), `correo` (aviso del banco enlazado con este pago) |

Los pagos marcados con versiones anteriores (fijos con solo `fecha`; cuotas pagadas "junto con la tarjeta", con `via`, `cuotas` y `plazos`) se siguen leyendo y se pueden desmarcar.

## Cuentas, débito y movimientos

Cada forma de pagar deja su huella en un saldo (`domain/cuentas.js`):

| Se pagó con | Qué cambia |
| --- | --- |
| `efectivo` | ningún saldo |
| `tarjeta:<id>` | sube el `saldo` (deuda) de la tarjeta |
| `cuenta:<id>` (débito o desde la cuenta) | baja el `saldo` de la cuenta |

Un **movimiento** mueve dinero de `desde` a `hacia`: la cuenta de donde sale baja, la cuenta a donde llega sube y la tarjeta a donde llega debe menos. Su tipo (`transferencia`, `pago-tarjeta`, `deposito`, `retiro`) no se guarda: sale de `desde` y `hacia` con `tipoDeMovimiento()`.

Las funciones `efectoDeMedio()` y `efectosDeMovimiento()` calculan esas huellas; `combinarEfectos()` las suma (para editar: deshacer lo anterior y aplicar lo nuevo) y `cambiosDeSaldo()` deja solo las cuentas y tarjetas que existen. El repositorio las escribe con `increment` en el mismo lote que el registro (`escribirEfectos()`).

Una tarjeta cuenta como pagada en el mes si tiene su pago marcado en Pagos **o** si algún movimiento del mes va hacia ella (por ejemplo, un Transfer365 leído del correo). En ese segundo caso, tocar el círculo no la desmarca: se quita borrando el movimiento.

Los movimientos no cambian lo que "les queda del mes": los ingresos salen de Ingresos y los pagos de Pagos. Solo mueven saldos entre cuentas.

## Ejemplo: qué pasa al pagar una cuota con tarjeta

1. La persona toca el círculo: `<button data-accion="marcar-pago" data-mes="2026-10" data-clave="plazo_abc">`.
2. `acciones['marcar-pago']` en `formularios/pago.js` abre la ventana de pago con la cuota ya puesta. La persona sube el monto si abona más y elige la tarjeta.
3. Al guardar se llama a `alternarPago(mes, clave, { monto, medio, fecha })` del repositorio.
4. El repositorio le pide a `planificarPago()` (en `domain/presupuesto.js`, función pura) qué cambia: sumar el monto a `abonado` de la cuota, sumar el mismo monto al `saldo` de la tarjeta y guardar el detalle en el mes.
5. El repositorio escribe todo en **un solo lote** (`writeBatch`), así no queda a medias.
6. Firestore avisa a los `onSnapshot` de las dos personas y la pantalla se redibuja sola.

En el resumen del mes, lo pagado con tarjeta no se resta de lo disponible: queda en el saldo de la tarjeta y se cubre cuando se paga la tarjeta.

## Instalación en el teléfono

`manifest.webmanifest` describe la app (nombre, íconos, colores) y `sw.js` es el *service worker*: guarda una copia de los archivos para que la app abra sin señal. Usa "primero la red", así que cada cambio que se sube a GitHub llega solo; la copia guardada solo se usa sin conexión. Si se cambia la forma de guardar en caché, hay que subir `VERSION` en `sw.js`.

## Cambios comunes

**Actualizar las cifras de ley (cada año).** Editar `js/constants/ley-sv.js` y los montos esperados en `tests/salario.test.js`. Correr `npm test`.

**Agregar un campo a un registro.** Por ejemplo, un número de contrato en las cuotas: agregar el campo en la lista de `js/formularios/plazo.js` y mostrarlo en `js/vistas/cuotas.js`. Firestore no necesita migraciones; los registros viejos simplemente no tienen el campo. Documentarlo en el `@typedef` de `domain/plazos.js`.

**Agregar una categoría, banco o tipo.** Editar `js/constants/catalogos.js`.

**Agregar una pestaña.** Crear `js/vistas/<nombre>.js` con `export function vista<Nombre>(estado, hoy)`, agregarla en `VISTAS` de `js/app.js` y su enlace `<a class="pestanas__boton" href="#<nombre>">` en `index.html`.

**Agregar un botón con una acción nueva.** Ponerle `data-accion="mi-accion"` y declarar `'mi-accion': (boton) => …` en el `acciones` del módulo. Si el módulo es nuevo, registrar su `acciones` en `iniciarInterfaz()` de `js/app.js`.

**Agregar un cálculo.** Escribirlo como función pura en `domain/`, con su prueba en `tests/`, y llamarlo desde la vista.

**Dar acceso a otra cuenta.** Agregar el correo en `firestore.rules` y publicar las reglas en la consola de Firebase. No hace falta cambiar código.

## Pruebas

`npm test` corre `node --test`, que encuentra los archivos `tests/*.test.js`. Prueban `domain/` y `utils/`. La interfaz se revisa a mano en el navegador; las piezas que conviene probar a mano después de un cambio:

- Entrar, salir y entrar con una cuenta sin permiso.
- Pagar una cuota con tarjeta abonando más que la cuota, y desmarcarla (el saldo de la tarjeta sube y vuelve).
- Pagar una tarjeta con el mínimo y con otro monto.
- Agregar y borrar un gasto con tarjeta (el saldo sube y baja) y con débito (la cuenta baja y sube).
- Pagar una tarjeta desde una cuenta y desmarcarlo (bajan y vuelven la tarjeta y la cuenta).
- Anotar una transferencia, editar su monto y borrarla.
- Agregar un ingreso de una sola vez y ver que solo cuenta en su mes.
- Instalar la app en el teléfono y abrirla en modo claro y oscuro.

## Gastos que llegan del correo

`apps-script/Codigo.gs` no es parte de la app: corre en Google Apps Script con la cuenta del dueño del proyecto (instalación en `docs/AVISOS-DEL-BANCO.md`). Lee los avisos del banco en Gmail y escribe en Firestore con la API REST, sin pasar por las reglas de `firestore.rules` (usa los permisos de la cuenta dueña del proyecto).

Guarda los gastos con la misma forma que `agregarGasto()` del repositorio, más `origen: 'correo'`, con id `correo-<id del correo>` y `autor.nombre = 'Correo del banco'`. Si cambia la forma de un gasto en la app, hay que cambiarla también en `guardarGasto_()` del script.

Las transferencias (Transfer365 y parecidas) se guardan como `movimientos` con la forma de `guardarMovimiento()` del repositorio, con id `ref-<número de referencia>`: el aviso de los dos bancos de una misma transferencia trae la misma referencia, así que se anota una sola vez. `leerMovimiento()` lee el correo, `resolverMovimiento()` busca las cuentas y tarjetas por sus últimos 4 dígitos (o por el banco, si hay una sola cuenta en ese banco) y `guardarMovimiento_()` escribe el movimiento y los saldos juntos. Si cambia la forma de un movimiento en la app, hay que cambiarla también ahí.

Las funciones que leen el texto del correo son puras y se prueban en Node (`tests/avisos-banco.test.js` carga el archivo con `node:vm`).

La app y el script se comunican solo por Firestore: el botón **Buscar lo del mes en los correos** (`vistas/pagos.js`) escribe `lectorCorreo/solicitud`; cada script lo atiende en su siguiente revisión y deja su resultado en `lectorCorreo/cuenta-<correo>`, que la app escucha (`observarLector()` en el repositorio) y resume con `estadoDelLector()` de `domain/lector.js`. Los gastos y movimientos del correo, o enlazados con un aviso (`correoId`, `referencias`), que se borran en la app quedan `descartado` en lugar de borrarse, para que el script no los vuelva a crear; `gastosDelMes()` y `movimientosDelMes()` los ocultan.

## Mejoras posibles

- Pedir el monto real al marcar gastos fijos que cambian cada mes (luz, agua).
- Recordatorios de pago con notificaciones.
