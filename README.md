# Florería — sistema de membresías y entregas

Webapp para gestionar socios con membresía semanal / quincenal / mensual:
portal público donde el socio ve su carnet y coordina la fecha de entrega, y
panel de administración donde se cargan membresías, fechas disponibles y el
estado de cuota de cada socio.

## Stack

- Backend: Node.js + Express
- Base de datos: SQLite (archivo `floreria.db`, no necesita servidor de DB aparte)
- Frontend: HTML/CSS/JS simple, sin build step

## Correrlo en tu máquina

```bash
npm install
cp .env.example .env   # completá ADMIN_USER, ADMIN_PASSWORD y SESSION_SECRET
npm start
```

Abrí `http://localhost:3000` para el portal del socio y
`http://localhost:3000/admin` para el panel de administración.

## Primeros pasos una vez arriba

1. Entrá a `/admin` con el usuario y contraseña que pusiste en `.env`.
2. Creá las membresías: nombre, frecuencia de entrega (semanal/quincenal/
   mensual) y su valor mensual — todas las membresías se cobran por mes,
   aunque la entrega de flores sea más seguido; cada tipo puede tener un
   valor distinto.
3. Cargá las fechas de entrega disponibles para cada membresía (opcionalmente
   con un cupo máximo de socios por fecha).
4. Dá de alta a los socios: código de socio, DNI, nombre, apellido, su
   membresía y (opcional) la fecha en que vence la cuota. Con ese código +
   DNI el socio entra a `/` y ve su carnet, y desde ahí puede subir su propia
   foto tocando el círculo del avatar.
5. Cada vez que un socio paga, apretá **Renovar** en la tabla de socios: le
   suma un mes a partir de hoy o del vencimiento actual si todavía no venció.
   El estado "Al día" / "Vencida" en el carnet y en el panel se calcula solo
   a partir de esa fecha — no hay que tildar nada a mano.

## Reemplazar el logo

Ahora mismo se usa un logo placeholder en `public/img/logo-placeholder.svg`.
Cuando tengas el archivo del logo real de la florería:

1. Reemplazá `public/img/logo-placeholder.svg` por tu logo (podés mantener el
   mismo nombre de archivo para no tocar el HTML, o cambiarlo y actualizar las
   referencias `<img src="...">` y `<link rel="icon" ...>` en `index.html` y
   `admin.html`).
2. Si tu logo no es SVG (por ejemplo PNG), lo mismo: poné el archivo en
   `public/img/` y actualizá las rutas.

## Deploy gratis (Railway o Render)

Cualquiera de las dos sirve para esto — corren un proceso Node.js normal las
24 hs y te dan una URL pública tipo `tu-app.up.railway.app` o
`tu-app.onrender.com`, sin necesidad de dominio propio todavía.

### Railway

1. Subí esta carpeta a un repo de GitHub (o usá `railway up` desde la CLI sin
   GitHub).
2. En [railway.app](https://railway.app) → **New Project** → **Deploy from
   GitHub repo**.
3. En **Variables** cargá `ADMIN_USER`, `ADMIN_PASSWORD` y `SESSION_SECRET`
   (no hace falta `PORT`, Railway lo inyecta solo).
4. Railway detecta el `package.json` y corre `npm start` automáticamente.
5. **Importante:** SQLite guarda todo (incluidas las fotos de los socios,
   que se almacenan como base64 dentro de la base) en un archivo
   (`floreria.db`) dentro del contenedor. Si no agregás un **Volume** en
   Railway y lo montás en la carpeta del proyecto, cada vez que se redeploye
   la app vas a perder los datos. Andá a la pestaña **Volumes** del
   servicio, creá uno y montalo en `/app` (o el path donde quede el
   proyecto).

### Render

1. Mismo repo en GitHub → [render.com](https://render.com) → **New Web
   Service**.
2. Build command: `npm install` — Start command: `npm start`.
3. Cargá las mismas variables de entorno.
4. En el plan free, el **disco no es persistente entre deploys** — para
   mantener los datos hay que agregar un **Persistent Disk** (está en los
   planes pagos) o migrar a una base externa (por ejemplo Postgres, que Render
   sí ofrece gratis como servicio aparte). Para probar el sistema ahora mismo
   el plan free alcanza; para producción real con datos que no se pueden
   perder, conviene Railway con volumen o Render + Postgres.

## Seguridad antes de pasar a producción real

- Cambiá `ADMIN_PASSWORD` y `SESSION_SECRET` por valores fuertes y únicos
  (no los que vienen de ejemplo).
- Serví la app solo por HTTPS (Railway y Render lo dan gratis por defecto).
- El código de socio + DNI identifica al socio pero no es un secreto fuerte
  (el DNI se puede llegar a adivinar o filtrar). Si más adelante vas a manejar
  datos sensibles o pagos reales, conviene sumar una contraseña propia por
  socio o un límite de intentos de login.

## Estructura del proyecto

```
floreria-app/
├── server.js              # servidor Express
├── db.js                  # conexión y esquema SQLite
├── middleware/auth.js      # chequeo de sesión admin/socio
├── routes/
│   ├── admin.js            # API del panel de administración
│   └── socio.js            # API del portal del socio
└── public/
    ├── index.html           # portal del socio (login + carnet)
    ├── admin.html            # panel de administración
    ├── css/style.css
    ├── js/socio.js
    ├── js/admin.js
    └── img/logo-placeholder.svg
```
