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
| `personas` | id automático | `nombre`, `salarioBruto`, `tipo` (`asalariado` · `servicios` · `sin`), `frecuencia` (`quincenal` · `mensual`), `diaPago`, `fechaIngreso`, `deduccion1600`, `netoReal` |
| `ingresos` | id automático | `nombre`, `tipo`, `monto`, `frecuencia`, `dia` |
| `tarjetas` | id automático | `banco`, `nombre`, `ultimos`, `titular`, `limite`, `saldo`, `pagoMinimo`, `tasa`, `corte`, `pago`, `plan` (`total` · `minimo` · `fijo`), `planMonto`, `color` |
| `plazos` | id automático | `descripcion`, `acreedor`, `tipo`, `metodo` (`efectivo` · `planilla` · `tarjeta:<id>`), `personaId`, `cuota`, `total`, `pagadas`, `dia`, `tasa` |
| `fijos` | id automático | `nombre`, `categoria`, `monto`, `dia` |
| `meses` | `YYYY-MM` | `pagados`: mapa de clave de pago → detalle |
| `gastos` | id automático | `fecha`, `mes`, `monto`, `categoria`, `medio` (`efectivo` · `tarjeta:<id>`), `nota`, `autor` |

Además, todos los registros guardan `creado` (mes en que se crearon, para no aparecer en meses anteriores) y `actualizado` (hora del servidor).

**Claves de pago** dentro de `meses/{mes}.pagados`: `fijo_<id>`, `plazo_<id>`, `tarjeta_<id>`. El detalle de una tarjeta pagada guarda `monto`, `cuotas` y `plazos` (ids de las cuotas que se pagaron con ella) para poder revertir el pago exacto si se desmarca.

## Ejemplo: qué pasa al marcar el pago de una tarjeta

1. La persona toca el círculo: `<button data-accion="marcar-pago" data-mes="2026-10" data-clave="tarjeta_abc">`.
2. `acciones['marcar-pago']` en `vistas/pagos.js` llama a `alternarPago(mes, clave)` del repositorio.
3. El repositorio le pide a `planificarPago()` (en `domain/presupuesto.js`, función pura) qué cambia: restar el pago del saldo, avanzar una cuota de cada compra a plazo cargada a esa tarjeta y guardar el detalle en el mes.
4. El repositorio escribe todo en **un solo lote** (`writeBatch`), así no queda a medias.
5. Firestore avisa a los `onSnapshot` de las dos personas y la pantalla se redibuja sola.

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
- Marcar y desmarcar el pago de una tarjeta con una cuota cargada.
- Agregar y borrar un gasto con tarjeta (el saldo sube y baja).
- Abrir la app en el teléfono, en modo claro y oscuro.

## Mejoras posibles

- Un *service worker* para que la app abra sin señal aunque sea la primera vez del día (los datos ya funcionan sin señal gracias a la caché de Firestore).
- Editar un gasto (hoy se borra y se vuelve a anotar).
- Recordatorios de pago con notificaciones.
