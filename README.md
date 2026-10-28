# Kivan

Gestión de un estudio creativo: clientes y servicios, equipo y liquidaciones, operación
mensual (producciones, cobros y pagos), facturación, cuentas corrientes, cashflow y
reportes de rentabilidad.

## Stack

- **Web:** React + Vite + TypeScript, TanStack Query y TanStack Table, Tailwind, componentes
  sobre Radix/shadcn (`src/app/components`), estilos y temas en `src/styles`.
- **API:** Fastify 5 + TypeScript (`apps/api`), Prisma 7 sobre Postgres (`packages/db`).
  Los tipos y enums compartidos están en `packages/shared` y las variables de entorno
  validadas en `packages/config`.
- **Tests:** Vitest para los unitarios (web y API) y Playwright para los e2e de la web
  contra una API simulada.
- Monorepo con pnpm.

## Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| Node.js | 24.x | API, build y tests |
| pnpm | 10.x | se activa con `corepack enable`, que viene con Node |
| Docker | Docker Desktop abierto | Postgres local y los tests de la API |
| Postgres | 14 o más | solo si no usás Docker (opción B) |

```bash
node -v                      # v24.x
corepack enable && pnpm -v   # 10.x
```

> No uses pnpm 11, porque cambia cómo lee los overrides del lockfile. Con
> `corepack enable` se usa solo la versión fijada en `package.json`.

## Levantarlo en local

### Opción A: todo con Docker (lo más rápido)

```bash
./scripts/dev-up.sh
```

Instala dependencias, levanta Postgres en Docker (puerto **5477**), crea la base, aplica
las migraciones, carga el usuario dueño y crea `apps/api/.env`. Cada vez que lo corrés
arrancás con una base limpia.

Después, en **dos terminales** desde la raíz del repo:

```bash
pnpm --filter api dev    # API en http://localhost:3010
pnpm dev                 # Web en http://localhost:5173
```

Entrá a http://localhost:5173 con **`owner@studio.test` / `owner1234`**.

**Con los datos reales:** si te pasaron `kivan-data.sql`, ponelo en `dumps/` y corré
`DUMP_FILE=dumps/kivan-data.sql ./scripts/dev-up.sh`. En ese caso no se crea el usuario de
prueba: entrás con el mail de cualquier usuario del estudio y la clave `owner1234` (todas
las claves del dump se reemplazaron por esa).

Para bajar todo: `./scripts/dev-down.sh`. Frena la API, frena Vite y borra el contenedor
de Postgres.

### Opción B: con un Postgres que ya tengas

El script de creación de la base es `scripts/create-db.sh`. Funciona contra cualquier
Postgres: uno instalado en la máquina, uno en otro contenedor o uno hosteado. Le pasás un
usuario que pueda crear roles y bases:

```bash
pnpm install
ADMIN_URL=postgresql://postgres:TU_CLAVE@localhost:5432/postgres ./scripts/create-db.sh
```

Qué hace, en orden (si lo corrés de nuevo, saltea lo que ya existe):

1. Crea el rol `kivan_app`, que es el usuario con el que se conecta la API (no es
   superusuario).
2. Crea la base `kivan`.
3. Aplica las migraciones de `packages/db/prisma/migrations`. El esquema completo en SQL
   está en `packages/db/prisma/migrations/0001_init/migration.sql`.
4. Le da permisos de lectura y escritura sobre las tablas a `kivan_app`.
5. Carga la fila de configuración del estudio y el usuario dueño
   (`owner@studio.test` / `owner1234`). Si le pasás `DUMP_FILE`, carga ese dump en su
   lugar.
6. Crea `apps/api/.env` apuntando a la base nueva, si todavía no existe.

Variables opcionales:

| Variable | Default | |
| --- | --- | --- |
| `DB_NAME` | `kivan` | nombre de la base |
| `APP_USER` / `APP_PASSWORD` | `kivan_app` / `app` | **cambiá la clave** fuera de tu máquina |
| `SEED_EMAIL` / `SEED_PASSWORD` | `owner@studio.test` / `owner1234` | usuario dueño inicial |
| `SKIP_SEED=1` | | crea el esquema sin el usuario dueño |
| `DUMP_FILE` | | un dump de datos (`dumps/kivan-data.sql`) para cargar en vez del usuario dueño. Solo sobre una base vacía |

Si no tenés `psql` instalado, el script lo corre adentro de un contenedor de Docker
descartable.

Después levantás la API y la web igual que en la opción A.

## Variables de entorno

**API (`apps/api/.env`, tomá como modelo `apps/api/.env.example`).** La API valida todo
al arrancar y no levanta si falta algo.

- `DATABASE_URL`: conexión como `kivan_app`.
- `JWT_SECRET`: 32 caracteres o más. En producción, uno largo y al azar.
- `PORT` / `HOST`: por defecto `3010` / `127.0.0.1`.
- `CORS_ORIGINS`: los orígenes de la web separados por coma. Hace falta cuando la web y la
  API están en dominios distintos.
- `TRUST_PROXY_HOPS`: en `1` si la API está detrás de un proxy (nginx, Caddy…).
- `MAIL_ENABLED`, `SMTP_*`, `MAIL_FROM`, `APP_URL`: el mail de invitaciones. Viene apagado.
  Con el mail apagado, el link para que un usuario nuevo defina su clave le aparece en
  pantalla al admin, que se lo pasa a mano.

**Web (`.env.local`, tomá como modelo `.env.example`).**

- `VITE_API_URL`: dónde está la API (por defecto `http://localhost:3010`).
- `VITE_DEV_AUTOLOGIN*`: opcional, entra solo con el usuario de prueba en desarrollo.
  No existe en el build de producción.

## Comandos

```bash
pnpm verify                     # lint + tipos + tests unitarios + build de la web
pnpm e2e                        # tests end-to-end (Playwright)
pnpm --filter api build         # tipos y build de la API
TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter api test   # tests de la API (levantan su propio Postgres en Docker)
```

Para cambiar el esquema de la base: editás `packages/db/prisma/schema.prisma` y corrés
`DATABASE_URL=<url del dueño> pnpm --filter @hold/db prisma:migrate --name <nombre>`, que
genera la migración nueva en `packages/db/prisma/migrations`.

## Producción (resumen)

1. **Base:** `ADMIN_URL=<url admin de prod> APP_PASSWORD=<clave fuerte> SKIP_SEED=1 ./scripts/create-db.sh`.
   Después de cada cambio de esquema: `DATABASE_URL=<url admin> pnpm --filter @hold/db prisma:deploy`.
2. **API:** hay una imagen lista en `apps/api/Dockerfile`:
   ```bash
   docker build -f apps/api/Dockerfile -t kivan-api .
   docker run -p 3010:3000 -e HOST=0.0.0.0 -e PORT=3000 \
     -e DATABASE_URL=... -e JWT_SECRET=... -e CORS_ORIGINS=https://tu-web kivan-api
   ```
3. **Web:** `VITE_API_URL=https://tu-api pnpm build` genera archivos estáticos en `dist/`,
   que se sirven desde cualquier hosting estático (S3 + CDN, Netlify, nginx…). Tiene que
   devolver `index.html` para cualquier ruta, porque la app maneja sus propias rutas.

El primer usuario dueño lo crea el seed (o `SEED_EMAIL` / `SEED_PASSWORD` sin
`SKIP_SEED`). El resto de los usuarios se invitan desde **Configuración**.

## Estructura

```
apps/api/            API (un módulo por dominio en src/modules)
packages/db/         esquema Prisma y migraciones
packages/shared/     tipos y enums compartidos entre web y API
packages/config/     variables de entorno validadas
scripts/             create-db.sh, dev-up.sh, dev-down.sh
src/app/pages/       pantallas y su lógica de datos
src/app/components/  componentes de interfaz
src/api/             clientes HTTP de la web
e2e/                 tests de Playwright
```

## Problemas comunes

- **"Docker is installed but not running":** abrí Docker Desktop y esperá a que arranque.
- **Puerto ocupado:** usá `PG_PORT=5480 ./scripts/dev-up.sh`. Para la API cambiá `PORT`
  en `apps/api/.env` y en la web poné `VITE_API_URL` en `.env.local`.
- **`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`:** estás con pnpm 11. Corré `corepack enable`.
- **La API no arranca por un error de variables:** revisá que exista `apps/api/.env` y que
  `JWT_SECRET` tenga 32 caracteres o más.
- **El login da 401:** volvé a correr `./scripts/dev-up.sh` (base limpia), o en la opción B
  `create-db.sh`, que vuelve a cargar al usuario dueño si no existe.
