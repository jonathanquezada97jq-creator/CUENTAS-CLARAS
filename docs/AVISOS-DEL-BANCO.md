# Gastos automáticos desde los avisos del banco

Cuando pagás con tarjeta, el banco te manda un correo como este:

> Compra aprobada por USD 2.00 en PUMA DIDEA con su tarjeta terminada en 1234.

El archivo [`apps-script/Codigo.gs`](../apps-script/Codigo.gs) lee esos correos en tu Gmail cada 10 minutos y anota el gasto en Cuentas Claras:

- **Monto, comercio y fecha** salen del correo.
- **Tarjeta:** se busca en la app por los últimos 4 dígitos. Si está registrada, el gasto se suma a su saldo. Si no está, se anota como débito y el correo queda con la etiqueta *Cuentas Claras/Revisar* en Gmail.
- **Categoría:** se adivina por el nombre del comercio (Puma o Texaco → Transporte y gasolina; Súper Selectos → Súper y comida…). Si se equivoca, tocá el gasto en la app y cambiala.
- **No se repite:** cada correo se anota una sola vez, aunque el banco agrupe varios avisos en la misma conversación.
- **No se anotan** compras rechazadas, reversiones, devoluciones ni pagos a la tarjeta.

Corre en **tu cuenta de Google** (Apps Script), no en la app ni en otro servidor. Es gratis y funciona aunque no tengas la app abierta.

---

## Instalación (una sola vez, unos 10 minutos)

Hacelo en una computadora y con **la misma cuenta de Google con la que creaste Firebase** (la dueña del proyecto).

### 1. Crear el script

1. Entrá a <https://script.google.com> → **Nuevo proyecto**.
2. Arriba a la izquierda, cambiale el nombre a `Cuentas Claras · avisos del banco`.
3. Borrá todo lo que aparece en `Código.gs` y pegá el contenido completo de [`apps-script/Codigo.gs`](../apps-script/Codigo.gs). En GitHub, el botón **Copy raw file** (dos cuadritos) copia todo el archivo.
4. Revisá arriba del archivo, en `AJUSTES`, que `proyecto` sea el `projectId` de tu `js/config.js` (por ejemplo `cuentas-claras-2811`).

### 2. Dar los permisos que necesita

1. En el menú de la izquierda, tocá ⚙ **Configuración del proyecto**.
2. Marcá **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
3. Volvé al editor (`< >`), abrí `appsscript.json`, borrá lo que tiene y pegá el contenido de [`apps-script/appsscript.json`](../apps-script/appsscript.json).
4. Guardá con **Ctrl + S** (o el ícono de disquete).

### 3. Probar sin guardar nada

1. Arriba, en la lista de funciones, elegí **`probarSinGuardar`** y tocá **Ejecutar**.
2. Google pide permisos: **Revisar permisos** → elegí tu cuenta.
3. Va a decir "Google no verificó esta app". Es normal: el script es tuyo y nadie más lo usa. Tocá **Configuración avanzada** → **Ir a Cuentas Claras · avisos del banco (no seguro)** → **Permitir**.
4. Abajo, en **Registro de ejecución**, tienen que aparecer tus compras recientes, una por línea:

   ```
   Tarjetas en la app: ••1234
   2026-11-03 · $2.00 · PUMA DIDEA · Transporte y gasolina · Tarjeta Banco Agrícola ••1234
   ```

   - Si dice `Tarjetas en la app: ninguna`, registrá tus tarjetas en la app con sus **últimos 4 dígitos**.
   - Si tus compras de los últimos 2 días no salen, copiá el texto de un aviso del banco y mandáselo a quien mantiene la app para ajustar el lector.

### 4. Activarlo

1. Elegí la función **`instalarRevisionAutomatica`** y tocá **Ejecutar**.
2. En el registro sale "Listo: se van a revisar los correos cada 10 minutos." Desde ahí funciona solo.

---

## Qué ves en la app

En **Pagos → Gastos del día a día** aparecen los gastos con "· Correo" al final. Tocá cualquiera para cambiarle la categoría, la tarjeta, el monto o la nota; si cambiás la tarjeta o el monto, los saldos se ajustan solos.

Desde ahora no hace falta anotar a mano las compras con tarjeta: si las anotás a mano y también llega el correo, quedarían dos veces.

## Ajustes opcionales

En `AJUSTES`, arriba de `Codigo.gs`:

- **`busqueda`:** qué correos revisar. Para que lea solo los de tu banco, agregá el remitente, por ejemplo `'newer_than:2d from:(notificaciones@tubanco.com)'`.
- **`minutosEntreRevisiones`:** 5, 10, 15 o 30.

Después de cambiar algo, guardá y volvé a correr `instalarRevisionAutomatica`.

**Para apagarlo:** corré `detenerRevisionAutomatica`.

## Los avisos de tu esposa

Sus avisos llegan a su Gmail, así que ella necesita su propio script:

1. Vos, en Firebase: ⚙ **Configuración del proyecto → Usuarios y permisos → Agregar miembro** → su correo → rol **Editor**.
2. Ella repite los pasos de instalación con su cuenta.

## Si algo falla

Google manda un correo cuando una revisión automática da error. Los errores más comunes:

| Mensaje | Qué hacer |
| --- | --- |
| `No se pudo leer Firebase (403)` | Estás en una cuenta de Google que no es la dueña del proyecto, o `proyecto` en `AJUSTES` no coincide con tu `js/config.js`. |
| `No se pudo leer Firebase (404)` | Revisá `proyecto` y `hogar` en `AJUSTES`. |
| `Cloud Firestore API has not been used in project …` | Copiá el mensaje completo y mandáselo a quien mantiene la app. |
| `Se requiere autorización` | Volvé a correr `probarSinGuardar` y aceptá los permisos. |

## Cómo funciona por dentro

- Cada correo leído se guarda en la lista de procesados del script (las últimas 400), y el gasto se guarda con el id `correo-<id del correo>`. Firestore rechaza crear dos veces el mismo id, así que nunca queda repetido.
- El gasto y la suma al saldo de la tarjeta se escriben juntos en una sola operación (`documents:commit`), igual que cuando se anota desde la app.
- Las funciones que leen el texto (`leerAviso`, `adivinarCategoria`) tienen pruebas en `tests/avisos-banco.test.js`. Para un banco con otro formato, agregá un ejemplo de su correo a esas pruebas y ajustá los patrones de `buscarMonto_`, `buscarUltimos_` o `buscarComercio_`.
