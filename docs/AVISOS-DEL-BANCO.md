# Gastos, cobros y transferencias automáticos desde los avisos del banco

El banco te manda un correo cada vez que pagás con tarjeta, te cobran algo automático o movés dinero:

> Compra aprobada por USD 2.00 en PUMA DIDEA con su tarjeta terminada en 1234.

> Le informamos que ha recibido un abono a su CUENTA DE AHORRO X1421 en concepto de Transfer365.

El archivo [`apps-script/Codigo.gs`](../apps-script/Codigo.gs) (el "lector") lee esos correos en Gmail y los anota en Cuentas Claras:

- **Solo:** cada 5 minutos revisa los avisos de los últimos 2 días.
- **Cuando cambia algo:** si se actualiza el script o agregan o cambian en la app una cuenta, una tarjeta o un gasto fijo, en la siguiente revisión vuelve a mirar **todo el mes actual**. Así se anota lo que antes no se pudo (por ejemplo, las transferencias de una cuenta que todavía no estaba registrada).
- **Cuando lo piden desde la app:** en **Pagos**, el botón **Buscar lo de (mes) en los correos** hace que el lector de cada cuenta revise **todos** los avisos de ese mes y anote lo que falte. Sirve para meses anteriores o para lo que pasó antes de instalarlo.
- **Todo el mes, aunque sean muchos correos:** revisa del día 1 en adelante. Google deja correr cada revisión unos 6 minutos; si no alcanza, la siguiente revisión automática (5 minutos después) sigue desde donde quedó, sin empezar otra vez. Mientras tanto la app dice **Revisando**.
- **Qué correos mira:** los que traen palabras de avisos (compra, cargo, transferencia, Transfer365, abono, débito…) **y todo lo que mandan los bancos** (Cuscatlán, BAC, Agrícola, Davivienda, Promerica, Atlántida, Hipotecario…), aunque no traigan esas palabras.
- **Fechas:** si un banco escribe la fecha al revés (11/03/2026 por 3 de noviembre), se corrige con la fecha del correo.

### Compras con tarjeta

- **Monto, comercio y fecha** salen del correo, también de las tablas sin ":" como las *Alertas PRF* de BAC ("Comercio | Monto" y abajo "WOMPI*ESTACION PUMA DI | 3.00"), aunque el monto venga sin "$".
- **Tarjeta:** se busca en la app por los últimos 4 dígitos:
  - si es una **tarjeta de crédito** registrada, el gasto se suma a su saldo;
  - si es la **tarjeta de débito** de una cuenta (el campo "Últimos 4 del débito" de la cuenta), el gasto se resta del saldo de la cuenta;
  - si no está en la app, se anota como efectivo y el correo queda con la etiqueta *Cuentas Claras/Revisar* en Gmail.
- **Categoría:** se adivina por el comercio (Puma o Texaco → Transporte y gasolina; Súper Selectos → Súper y comida…). Si se equivoca, tocá el gasto en la app y cambiala.
- **Sin repetir:** cada correo se anota una sola vez, aunque se vuelva a revisar el mes.
- **Anotado a mano:** si ya habían anotado ese gasto a mano con el **mismo monto y la misma tarjeta** (un día más o menos), no se anota otra vez: el aviso se enlaza con lo que anotaron y el gasto dice "confirmado por el banco". Si coincide el monto pero no la tarjeta, se anota marcado **¿Repetido?** para que decidan.
- **No se anotan** compras rechazadas, reversiones ni devoluciones.

### Cobros automáticos de gastos fijos

La universidad, el internet o Netflix que se cobran solos a una tarjeta o a una cuenta **no se anotan como gasto aparte**: el lector marca el gasto fijo como **pagado** en Pagos, con lo que realmente cobraron.

Para eso, en **Pagos → Gastos fijos → (el gasto) → ¿Cómo lo pagan?** elijan la tarjeta ("Cargo automático · Tarjeta…") o la cuenta de donde sale. El lector lo reconoce:

- **Por el nombre:** si el aviso trae lo que escribieron en **Cómo aparece en el correo del banco** (por ejemplo `UDB` o `TIGO, Millicom`), o una palabra del nombre del gasto fijo de 4 letras o más ("Universidad" sí; "Luz" no).
- **Por el monto:** el mismo monto exacto, con esa misma tarjeta o cuenta, a 3 días o menos del día de pago.

Si el gasto fijo **ya estaba marcado** como pagado (a mano), el aviso no se anota otra vez. Si lo marcan como pagado por error, desmarquenlo: el lector no lo vuelve a marcar, y si en realidad era otra compra, anótenla como gasto.

### Transferencias (Transfer365)

Se anotan como **movimiento** en Pagos → Movimientos entre cuentas, y los saldos se ajustan solos:

| Correo | Qué se anota |
| --- | --- |
| Cuscatlán: "ha recibido un abono a su CUENTA DE AHORRO X1421", Producto Origen X8320 de BAC | Transferencia de BAC ••8320 a Cuscatlán ••1421 |
| BAC: "su transferencia… fue confirmada", Cuenta \*\*\*\*\*8320 → Cuenta \*\*\*1421 Cuscatlán | La **misma** transferencia: no se repite |
| Cuscatlán: "resultado de su operación Transfer365", Producto Destino TARJETA DE CREDITO XXXXXX4200 de B. Atlántida | Pago de la tarjeta Atlántida ••4200 desde la cuenta de Cuscatlán |

- **Las cuentas y tarjetas** se reconocen por sus últimos 4 dígitos. Si el correo no dice de qué cuenta salió (como el pago de tarjeta de Cuscatlán), se usa la cuenta de ese banco, si hay una sola registrada.
- **Formatos:** además de Transfer365, entiende los avisos con etiquetas ("Cuenta débito", "Cuenta crédito", "Cuenta origen", "Monto de la transacción", "Comprobante"…) y los que lo cuentan en una oración ("transferiste $50.00 desde tu cuenta ****1421 a la cuenta ****5555 de Banco Agrícola").
- **Una sola vez:** cuando los dos bancos avisan la misma transferencia (o la ven los Gmail de los dos), se anota una sola vez: por el número de referencia o, si no coincide, porque es el mismo monto, con hasta 2 días de diferencia, entre las mismas cuentas, y uno avisa que salió y el otro que llegó. Dos avisos iguales del mismo banco con referencias distintas son dos transferencias distintas.
- **Anotada a mano:** si ya la habían anotado en la app (Bancos → Mover dinero), el aviso se enlaza con esa y el movimiento dice "confirmado por el banco".
- **Entre sus cuentas y las de su esposa:** registren en **Bancos** también las cuentas de ella (con "¿De quién es?"). Así una transferencia de una cuenta suya a una de ella baja una y sube la otra, y los avisos de los dos bancos se juntan en una sola.
- **Si un lado no está en la app** (por ejemplo, dinero que te mandó otra persona), se anota igual con ese lado como "Otra cuenta o persona": la cuenta tuya sube o baja. Si **ninguno** de los dos lados está en la app, no se anota todavía: aparece en la app como pendiente y, cuando agreguen esa cuenta en Bancos, se anota sola en la siguiente revisión.
- **Pago de tarjeta marcado a mano:** si ya habían marcado en Pagos el pago de esa tarjeta por el mismo monto, no se anota otra vez. Si lo habían marcado como pagado en efectivo y el aviso dice que salió de una cuenta, se corrige: se resta de esa cuenta.
- **Pago de un gasto fijo con una transferencia** (por ejemplo, el alquiler a la cuenta del dueño): si coincide con un gasto fijo que sale de esa cuenta, se marca pagado en lugar de anotarse como transferencia.
- **Compras falsas de la versión anterior:** la versión anterior del lector podía anotar un aviso de transferencia como si fuera una compra. Al leer ese aviso otra vez, esa compra se quita sola y se devuelve su saldo.
- **La tarjeta queda pagada:** en Pagos, la tarjeta que se pagó con una transferencia sale como pagada. Para quitar ese pago, borren el movimiento.
- **No se anotan** transferencias rechazadas o que no se hicieron, ni los avisos de "recibimos su pago" que manda el banco de la tarjeta (el pago ya llega por el aviso de la cuenta de donde salió).
- **"En proceso":** el aviso de Cuscatlán de que una transferencia está en proceso no se anota; se anota la del aviso con el resultado ("TRANSACCIÓN EXITOSA"), así no queda doble.

### Avisos que no se pudieron anotar

Si un aviso **de un banco** parece una transferencia pero el lector no entiende su formato, o si ninguna de sus cuentas está en la app, **no se pierde**:

- En la app, **Pagos → Avisos del banco** los lista ("Sin leer" o "ninguna cuenta está en la app").
- En Gmail quedan con la etiqueta *Cuentas Claras/Revisar*.
- Se vuelven a intentar en cada revisión mientras sean recientes, y siempre que se busque el mes.

Para los "Sin leer": en script.google.com elegí la función **`verAvisosSinLeer`** y tocá **Ejecutar**. En el registro sale el texto completo de cada uno, y también el de los correos de los bancos con un monto que no se reconocieron como compra ni transferencia: copialo y mandáselo a quien mantiene la app para enseñarle ese formato al lector.

En el registro de cualquier revisión, cada correo de un banco deja una línea, aunque no se anote ("Correo del banco que no se anota: …"): así se ve que sí se miró.

Corre en **la cuenta de Google de cada persona** (Apps Script), no en la app ni en otro servidor. Es gratis y funciona aunque no tengan la app abierta. Para que se lean los correos de los dos, cada uno instala su propio lector.

---

## Instalación (una vez por persona, unos 10 minutos)

Hacelo en una computadora. Si es la cuenta de tu esposa, primero hacé el paso de [Dar acceso a la otra cuenta](#dar-acceso-a-la-otra-cuenta).

### 1. Crear el script

1. Entrá a <https://script.google.com> con la cuenta de Google cuyos correos querés leer → **Nuevo proyecto**.
2. Arriba a la izquierda, cambiale el nombre a `Cuentas Claras · avisos del banco`.
3. Borrá todo lo que aparece en `Código.gs` y pegá el contenido completo de [`apps-script/Codigo.gs`](../apps-script/Codigo.gs). En GitHub, el botón **Copy raw file** (dos cuadritos) copia todo el archivo.
4. Revisá arriba del archivo, en `AJUSTES`, que `proyecto` sea el `projectId` de tu `js/config.js` (por ejemplo `cuentas-claras-2811`).

### 2. Dar los permisos que necesita

1. En el menú de la izquierda, tocá ⚙ **Configuración del proyecto**.
2. Marcá **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
3. Volvé al editor (`< >`), abrí `appsscript.json`, borrá lo que tiene y pegá el contenido de [`apps-script/appsscript.json`](../apps-script/appsscript.json).
4. Guardá con **Ctrl + S** (o el ícono de disquete).

### 3. Probar sin guardar nada

1. Arriba, en la lista de funciones, elegí **`probarMesSinGuardar`** y tocá **Ejecutar**.
2. Google pide permisos: **Revisar permisos** → elegí la cuenta.
3. Va a decir "Google no verificó esta app". Es normal: el script es tuyo y nadie más lo usa. Tocá **Configuración avanzada** → **Ir a Cuentas Claras · avisos del banco (no seguro)** → **Permitir**.
4. Abajo, en **Registro de ejecución**, tienen que aparecer las compras del mes, una por línea:

   ```
   Tarjetas en la app: ••1234, ••4200
   Cuentas en la app: Banco Cuscatlán ••1421, BAC ••8320
   Revisando los correos de 2026-11…
   2026-11-02 · $0.55 · BAC ••8320 → Banco Cuscatlán ••1421
   2026-11-02 · $0.55 · Banco Cuscatlán ••1421 → Tarjeta Banco Atlántida ••4200
   2026-11-03 · $2.00 · PUMA DIDEA · Transporte y gasolina · Tarjeta Banco Agrícola ••1234
   ```

   - Si dice `Tarjetas en la app: ninguna` o `Cuentas en la app: ninguna`, registrá en **Bancos** las tarjetas y las cuentas con sus **últimos 4 dígitos** (y el débito de cada cuenta).
   - Si algo no sale, copiá el texto de un aviso del banco y mandáselo a quien mantiene la app para ajustar el lector.

### 4. Activarlo

1. Elegí la función **`instalarRevisionAutomatica`** y tocá **Ejecutar**.
2. En el registro sale "Listo: se van a revisar los correos cada 5 minutos."
3. Para anotar de una vez lo que ya pasó este mes, corré **`revisarMesActual`** (o tocá el botón en la app).

---

## Buscar lo de un mes desde la app

En **Pagos**, abajo de los movimientos, está la sección **Avisos del banco**:

1. Navegá al mes que querés revisar y tocá **Buscar lo de (mes) en los correos**.
2. Cada cuenta que tiene el lector instalado aparece en la lista. El lector atiende el pedido en su siguiente revisión, en menos de 5 minutos; mientras tanto dice **En cola** y después **Revisando**.
3. Al terminar, cada cuenta muestra cuántos gastos y transferencias nuevos anotó y cuántos ya estaban. Lo nuevo aparece solo en los gastos y en los movimientos del mes.
4. Si algo quedó marcado **¿Repetido?**, tocalo: la ventana dice con qué se parece. Si es lo mismo, eliminá uno de los dos; si no, tocá **Guardar** y se quita la marca.

Si una cuenta dice **Apagado**, su lector no ha revisado en más de 30 minutos: revisá en script.google.com que siga activo (paso 4 de la instalación).

Los gastos y transferencias del correo que se eliminan en la app no vuelven a aparecer al revisar de nuevo el mes.

## Actualizar un lector que ya estaba instalado

Cuando cambia `apps-script/Codigo.gs`:

1. En script.google.com, abrí el proyecto, borrá **todo** el contenido de `Código.gs` y pegá la versión nueva completa.
2. Si también cambió `appsscript.json`, hacé lo mismo con él. (En las últimas versiones no cambió.)
3. Registrá en la app (pestaña **Bancos**) todas las cuentas, las de los dos, con sus últimos 4 dígitos y los de su débito, y en los gastos fijos elegí cómo se pagan.
4. Corré **`probarMesSinGuardar`** y revisá en el registro qué anotaría.
5. Guardá y corré **`instalarRevisionAutomatica`**. Si pide permisos otra vez, aceptalos. En esa primera revisión, como el script cambió, vuelve a mirar todo el mes actual y anota lo que faltaba.
6. Cada persona hace lo mismo en su propio script.
7. Para meses anteriores, usá el botón **Buscar lo de (mes) en los correos** en Pagos.

## Dar acceso a la otra cuenta

El lector escribe en Firebase con la cuenta de Google donde está instalado. La cuenta que creó el proyecto ya tiene acceso; la otra hay que agregarla una vez:

1. En la consola de Firebase: ⚙ **Configuración del proyecto → Usuarios y permisos → Agregar miembro**.
2. Escribí el correo de la otra persona, elegí el rol **Editor** y tocá **Agregar miembro**.
3. Ella acepta la invitación que le llega al correo y después sigue los pasos de instalación con su cuenta.

## Ajustes opcionales

En `AJUSTES`, arriba de `Codigo.gs`:

- **`filtro`:** palabras de los avisos que se buscan en Gmail.
- **`remitentes`:** además, se revisa todo lo que manden estos remitentes (nombres o dominios de los bancos, separados por `OR`). Si tu banco no está, agregalo: por ejemplo `OR bancoXYZ.com.sv`.
- **`minutosEntreRevisiones`:** 5, 10, 15 o 30. Si lo cambiás, cambiá también `MINUTOS_ENTRE_REVISIONES` en `js/domain/lector.js` para que la app diga el tiempo correcto.

Después de cambiar algo, guardá y volvé a correr `instalarRevisionAutomatica`.

**Para apagarlo:** corré `detenerRevisionAutomatica`.

## Si algo falla

Google manda un correo cuando una revisión automática da error, y si el error fue al buscar un mes desde la app, la app lo muestra en la cuenta correspondiente.

| Mensaje | Qué hacer |
| --- | --- |
| `No se pudo leer las tarjetas (403)` | La cuenta no tiene acceso al proyecto de Firebase: ver [Dar acceso a la otra cuenta](#dar-acceso-a-la-otra-cuenta). O `proyecto` en `AJUSTES` no coincide con tu `js/config.js`. |
| `…ninguna de las dos cuentas está en la app, no se anota.` | Registrá en **Bancos** la cuenta con sus últimos 4 dígitos: en la siguiente revisión se anota sola. |
| `Parece una transferencia pero no se pudo leer` | Corré `verAvisosSinLeer` y mandá el texto a quien mantiene la app. |
| Un cobro automático se anotó como gasto en lugar de marcar el gasto fijo | En el gasto fijo, elegí con qué tarjeta o cuenta se cobra y escribí en **Cómo aparece en el correo del banco** lo que dice el aviso (el comercio). Borrá el gasto y marcá el fijo. |
| Una transferencia quedó en la cuenta equivocada | Tocala en Pagos → Movimientos y corregí las cuentas: los saldos se ajustan solos. Revisá que los últimos 4 dígitos de cada cuenta estén bien. |
| `No se pudo leer las tarjetas (404)` | Revisá `proyecto` y `hogar` en `AJUSTES`. |
| `Cloud Firestore API has not been used in project …` | Copiá el mensaje completo y mandáselo a quien mantiene la app. |
| `Se requiere autorización` | Volvé a correr `probarMesSinGuardar` y aceptá los permisos. |
| `No alcanzó el tiempo: falta desde el …` | Es normal con muchos correos: la siguiente revisión automática sigue desde ahí. Si corriste la función a mano, esperá 5 minutos. |
| Faltan avisos de un banco que no está en la lista | Agregá su remitente en `remitentes` (ver Ajustes opcionales) o mandá un ejemplo a quien mantiene la app. |

## Cómo funciona por dentro

- **Sin repetir:** el gasto se guarda con el id `correo-<id del correo>` y la transferencia con `ref-<número de referencia>` (el mismo en los avisos de los dos bancos), siempre con la condición de que no exista.
- **Enlazar en lugar de repetir:** cuando el aviso corresponde a algo que ya existe, no se crea nada nuevo. Un gasto anotado a mano recibe `correoId`; un movimiento recibe la referencia del aviso en `referencias` y el lado que avisó (`sale` o `entra`) en `lados`; un pago de tarjeta marcado a mano recibe `correo`. Así, al revisar el mes otra vez, el aviso se reconoce.
- **Cobros de gastos fijos:** se marca `meses/<mes>.pagados.fijo_<id>` con `origen: 'correo'` y se guarda el correo como un gasto (o movimiento) `descartado` con `enlazadoA: 'pago:fijo_<id>'`, que la app no muestra: es la marca de que ese correo ya se usó, aunque después desmarquen el pago.
- **Volver a revisar el mes:** el script guarda una huella de la versión y de las cuentas, tarjetas y gastos fijos de la app; si cambia, revisa el mes actual.
- **Pendientes:** los avisos que no se pudieron anotar se guardan en las propiedades del script y se publican en `lectorCorreo/cuenta-<correo>.avisosPendientes`, que la app muestra. Además, el script recuerda los últimos 400 correos que leyó para no volver a leerlos en la revisión de rutina. Al revisar un mes completo no usa esa memoria (así encuentra los que se fueron de paso), y los que ya están se saltan por su id.
- **Gastos y transferencias borrados en la app:** si vinieron del correo, la app no los borra sino que los marca `descartado`; así el lector no los vuelve a crear.
- **Pedido desde la app:** el botón escribe `hogares/<hogar>/lectorCorreo/solicitud` con un id y el mes. Cada lector, en su siguiente revisión, ve que es un pedido nuevo, revisa el mes y deja su resultado en `lectorCorreo/cuenta-<correo>`, que la app muestra. Ese documento también guarda la hora de su última revisión, y así la app sabe qué lectores están activos.
- El gasto o la transferencia y los cambios de saldo (tarjeta, cuentas) se escriben juntos en una sola operación (`documents:commit`), igual que cuando se anota desde la app.
- Las funciones que leen y comparan (`leerAviso`, `leerMovimiento`, `resolverMovimiento`, `buscarMismoMovimiento`, `buscarGastoIgual`, `buscarFijoDelCobro`, `adivinarCategoria`, `buscarParecido`, `limitesDelMes`…) tienen pruebas en `tests/avisos-banco.test.js`, con los avisos reales de Cuscatlán y BAC. Para un banco con otro formato, agregá un ejemplo de su correo a esas pruebas y ajustá los patrones: `buscarMonto_`, `buscarUltimos_` o `buscarComercio_` para compras; las etiquetas que busca `leerMovimiento` ("Producto Origen", "Banco Destino"…) para transferencias.
