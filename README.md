# Cuentas Claras

Finanzas del hogar para El Salvador, compartidas entre dos personas.

- **Salarios** con los descuentos de ley: ISSS 3 % (máximo $30), AFP 7.25 % y renta según la tabla de retención vigente desde mayo de 2025.
- **Aguinaldo** según los años de servicio (15, 19 o 21 días).
- **Tarjetas de crédito**: saldo, día de corte, fecha de pago, uso del límite y cuánto cuestan los intereses si solo se paga una parte.
- **Cuotas y préstamos**: compras en almacenes, tasa cero, préstamos, extrafinanciamientos y descuentos por planilla.
- **Pagos del mes** con fecha, para marcarlos al pagar, y **gastos del día a día**.
- Lo que una persona anota, la otra lo ve al instante en su teléfono.

La app no necesita instalarse ni compilarse: son archivos HTML, CSS y JavaScript que GitHub Pages publica tal cual. Los datos se guardan en Firebase (de Google), en el plan gratuito.

---

## Quién puede ver los datos

Hay dos partes separadas:

| Parte | Dónde vive | Quién la ve |
| --- | --- | --- |
| El código de la app | GitHub (este repositorio) | Puede ser público: no lleva datos ni contraseñas |
| Los datos del hogar | Firestore (Firebase) | Solo las cuentas de Google escritas en `firestore.rules` |

Cualquiera que abra la dirección de la app ve la pantalla de "Entrar con Google", pero si su correo no está en las reglas, la base de datos no le entrega nada. Esa protección la aplica el servidor de Google, no el teléfono, así que no se puede saltar desde el navegador.

> **Sobre GitHub Pages y repositorios privados:** con una cuenta gratuita de GitHub, Pages solo publica repositorios públicos. Con GitHub Pro el repositorio puede ser privado. En los dos casos los datos quedan igual de protegidos.

---

## Puesta en marcha (una sola vez, unos 20 minutos)

### 1. Crear el proyecto de Firebase

1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** → nombre: `cuentas-claras` → Google Analytics no hace falta.

### 2. Activar la entrada con Google

1. En el menú: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Google** → **Habilitar** → elegí un correo de asistencia → **Guardar**.

### 3. Crear la base de datos y poner las reglas

1. **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `nam5 (United States)` o la más cercana. **Modo de producción**.
3. Pestaña **Reglas**: borrá lo que hay, pegá el contenido de [`firestore.rules`](firestore.rules) **con los dos correos reales** y tocá **Publicar**.

Si el repositorio es público y no querés que sus correos queden en GitHub, dejá los correos de ejemplo en el archivo y escribí los reales solo en la consola.

### 4. Conectar la app con Firebase

1. **⚙ Configuración del proyecto → General → Tus apps →** ícono web `</>`.
2. Apodo: `cuentas-claras`. No marqués Firebase Hosting. **Registrar app**.
3. Copiá los valores de `firebaseConfig` y pegalos en [`js/config.js`](js/config.js). Es el único archivo de código que hay que editar.

### 5. Subir a GitHub y publicar

Creá un repositorio nuevo en GitHub llamado `cuentas-claras` (vacío, sin README) y desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primera versión de Cuentas Claras"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cuentas-claras.git
git push -u origin main
```

Si preferís no usar la terminal, en GitHub podés usar **Add file → Upload files** y arrastrar el contenido de la carpeta. Revisá que suban también `.nojekyll` y la carpeta `.github` (en Mac, `Cmd + Shift + .` muestra los archivos ocultos).

Después, en el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. En uno o dos minutos la app queda en:

```
https://TU-USUARIO.github.io/cuentas-claras/
```

### 6. Autorizar esa dirección en Firebase

En Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `TU-USUARIO.github.io`.

Sin este paso, el botón "Entrar con Google" da error.

### 7. Ponerla en la pantalla del teléfono

- **Android (Chrome):** abrí la dirección → menú ⋮ → **Agregar a la pantalla principal**.
- **iPhone (Safari):** abrí la dirección → botón Compartir → **Agregar a inicio**.

Cada uno entra con su propia cuenta de Google. Los datos son los mismos para los dos.

---

## Pasar los datos de la versión anterior

Si ya usaban la versión que se hizo dentro de Claude:

1. En la versión anterior: **Ajustes → Copiar respaldo**.
2. En esta app: **Ajustes → Pegar respaldo → Cargar respaldo**.

El salario de la versión anterior aparece con el nombre de quien carga el respaldo; desde **Ingresos → Editar** se le puede cambiar y agregar a la otra persona.

---

## Mantenimiento

- **Cada año**, revisar las cifras de ley en [`js/constants/ley-sv.js`](js/constants/ley-sv.js): tabla de renta, salario mínimo y la exención del aguinaldo (se aprueba año con año). Si cambian, actualizar también los montos esperados en `tests/salario.test.js`.
- **De vez en cuando**, copiar un respaldo desde **Ajustes** y guardarlo en las notas.
- **Costo:** el plan gratuito de Firebase (Spark) permite 50,000 lecturas y 20,000 escrituras al día. El uso de una pareja queda muy por debajo.

---

## Para programadores

### Correr la app en tu computadora

Se necesita un servidor local (los módulos de JavaScript no cargan abriendo el archivo con doble clic):

```bash
npm start                    # con Node.js 20 o más nuevo
# o bien
python3 -m http.server 8080
```

Abrí <http://localhost:8080>. Firebase acepta `localhost` sin configurar nada.

### Pruebas

```bash
npm test
```

Prueban los cálculos (salario, renta, aguinaldo, tarjetas, presupuesto, respaldo) con el ejecutor de pruebas que trae Node, sin instalar dependencias. GitHub las corre solas en cada cambio (`.github/workflows/pruebas.yml`).

### Estructura

```
index.html                 Estructura de la página; carga los estilos y js/main.js
manifest.webmanifest       Datos para instalar la app en el teléfono
firestore.rules            Quién puede leer y escribir (los dos correos)
css/
  tokens.css               Colores, tipografía y radios (tema claro y oscuro)
  base.css                 Reinicio, estructura, encabezado y pestañas
  componentes.css          Botones, chips, listas, formularios, hoja inferior
  vistas.css               Piezas propias de cada pestaña
js/
  main.js                  Arranque: sesión y sincronización
  app.js                   Qué pantalla se ve; registra las acciones
  config.js                Datos del proyecto de Firebase  ← se edita una vez
  constants/
    ley-sv.js              ISSS, AFP, tabla de renta, aguinaldo  ← revisar cada año
    catalogos.js           Categorías, bancos, tipos de cuota
  utils/                   Fechas y formato de dinero (funciones puras)
  domain/                  Reglas de negocio (funciones puras, con pruebas)
    salario.js             Salario neto y aguinaldo
    tarjetas.js            Pago del mes, uso del límite, simulación de intereses
    plazos.js              Cuotas pagadas y pendientes
    presupuesto.js         Ingresos, pagos del mes, endeudamiento, marcar pagos
    respaldo.js            Crear y leer respaldos
  data/                    Lo único que habla con Firebase
    firebase.js            Inicializa el SDK
    sesion.js              Entrar y salir con Google
    repositorio.js         Leer y escribir en Firestore
  state/store.js           Estado en memoria
  ui/                      Piezas de interfaz reutilizables
  formularios/             Un formulario por tipo de registro
  vistas/                  Una vista por pestaña, más pantallas y ajustes
tests/                     Pruebas con node:test
docs/ARQUITECTURA.md       Reglas del código, flujo de datos y modelo de datos
```

Antes de cambiar algo, leé [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): explica las reglas que sigue el código y cómo hacer los cambios más comunes.
