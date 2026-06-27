# Resumen del proyecto — El Rancho

> Contexto para retomar el proyecto en cualquier chat nuevo. Última actualización: 2026-06-27.
> Pendiente de deploy: correr `npm run migrate` para el ENUM `carton` antes de vender por cartón.

## Qué es

**El Rancho** es una **PWA** administrativa y operativa para una **granja avícola**. Registra la
recolección diaria de huevos por categoría, controla huevos rotos, descuenta ventas del inventario
y centraliza gastos; le da al administrador una vista del día y reportes del negocio.

- **Usuarios**: `admin` (vista completa) y `trabajador` (registra desde celular en campo, con modo offline).
- **Tono/diseño**: mobile-first, "Flat Design Touch-First", paleta **frosted-mint** (verde), acento
  naranja `#ea580c`. Tipografías **Fira Sans** (UI) y **Fira Code** (números). WCAG AA.
- **Moneda**: Quetzal guatemalteco (**GTQ**, símbolo `Q`), locale `es-GT`.

## Stack

- **Frontend**: React 19 + Vite 8 + TypeScript, Tailwind v4 (+ CSS propio en `src/styles.css`),
  `lucide-react` (iconos), `vite-plugin-pwa` (SW/offline), `recharts` (chart, lazy-loaded), `idb` (cola offline).
- **Backend**: Express 5 en TypeScript (`tsx`), `zod` (validación), `bcryptjs`, `jsonwebtoken`
  (JWT en cookie httpOnly `elrancho_session`), `web-push`.
- **DB**: **Neon Postgres** (`pg`).
- **Deploy**: **Vercel** — frontend estático por CDN + API Express como **función serverless**
  (`api/index.ts` reexporta la app de `server/index.ts`; routing en `vercel.json`).
- **Repo**: GitHub `davidperez17/granja-avicola-elrancho` (rama `main`).

## Estructura

```
src/
  App.tsx            # toda la UI (pantallas, shell, nav, modales)
  styles.css         # estilos (sin frameworks de UI; clases propias)
  types.ts           # tipos compartidos
  lib/api.ts         # cliente fetch de la API
  lib/offline.ts     # cola IndexedDB + sync
  lib/push.ts        # suscripción Web Push, estado, instalar
  components/ReportChart.tsx  # chart Recharts (import dinámico)
server/
  index.ts           # API Express (todos los endpoints)
  db.ts              # pool pg
  auth.ts            # JWT, requireAuth, requireRole
  schema.sql         # esquema (idempotente)
  migrate.ts         # aplica schema.sql  (npm run migrate)
  create-admin.ts    # crea admin desde env (npm run create-admin)
api/index.ts         # entrada serverless Vercel (reexporta app)
vercel.json          # rewrites /api/* -> función
public/brand/        # logo.svg, hero.jpg (imagen del hero de Hoy)
public/push-sw.js    # handlers push/notificationclick (cargado por el SW)
```

## Base de datos (tablas)

`users`, `password_reset_tokens`, `inventory` (por categoría), `daily_collections`, `sales`,
`sale_items`, `expenses`, `settings`, `notifications`, `notification_reads`, `galpones`,
`push_subscriptions`. Columna `galpon_id` en `daily_collections` y `expenses`. Columna `voided_at`
(soft delete) en `daily_collections`, `sales` y `expenses`.

Categorías de huevo: `pequeno, mediano, grande, extra_grande, jumbo`. Roles: `admin, trabajador`.
Venta: `cajon` = 360 huevos, `oferta_grande` = 90, `carton` = 30.

## Endpoints API (prefijo /api)

- **Auth**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`,
  `POST /auth/reset-password`.
- **Operación**: `POST /collections` (cualquier rol), `POST /sales` `POST /expenses` (admin),
  `POST /sync` (cola offline), `GET /collections|sales|expenses` (admin; `?all=true` = historial completo),
  `PATCH /collections|sales|expenses/:id` (editar), `DELETE /collections|sales|expenses/:id` (anular).
- **Dashboard/datos**: `GET /dashboard/today` (incluye `profitYesterday`, `birds`),
  `GET /inventory`, `PATCH /inventory/:category` (ajuste admin), `GET /reports?period=7|30|365`.
- **Registros**: `GET /registros` (admin: todos con autor+galpón; trabajador: los suyos).
- **Galpones**: `GET /galpones`, `POST /galpones`, `PATCH /galpones/:id` (admin).
- **Usuarios**: `GET /users`, `POST /users`, `PATCH /users/:id` (admin; sin DELETE, solo desactivar).
- **Notificaciones**: `GET /notifications`, `POST /notifications/read`.
- **Push**: `GET /push/public-key`, `POST /push/subscribe`, `POST /push/unsubscribe`.

## Funcionalidades implementadas

1. **Rediseño mobile-first** completo: Welcome → Login → app con **bottom-nav**.
   - Admin ve: Hoy · Registrar · Inventario · Reportes · Ajustes.
   - Trabajador ve: Registrar · Historial · Ajustes.
   - **Welcome inmersivo**: foto del hero (`public/brand/hero.jpg`) a pantalla completa con
     degradado y contenido anclado abajo (sin espacio vacío).
   - **Login**: header verde de marca (back + wordmark + título del modo) + hoja blanca con el
     formulario que crece para llenar la pantalla.
2. **Registrar** (control segmentado): Recolección (compacta, grid P/M/G/XG/J + total + rotos),
   Venta y Gasto (estos dos solo admin). Selector de **galpón** en recolección y gasto. La venta
   tiene producto **Cajón (360) · Oferta (90) · Cartón (30)**; cartón/cajón con categoría libre,
   oferta fuerza `grande`. Huevos/unidad centralizados en `eggsPerUnit()` (cliente y server).
3. **Hoy** (admin): saludo **según la hora** + imagen hero, ganancia con **tendencia real vs ayer (%)**, stats
   (producción con **% postura**, ventas, gastos), inventario disponible y **"Últimos registros"**
   con nombre del trabajador, galpón y hora.
4. **Inventario** (admin): existencia por categoría con barras; **ajuste manual** por categoría
   (corrige errores; deja notificación de auditoría). Vista rápida de **cajas** (chip `≈ X cajas`
   por categoría, bajo el número, y total en el banner; 1 caja = 360 huevos, `formatCajas()`).
5. **Reportes** (admin): selector 7/30/Año, **chart Recharts** (producción vs ventas vs ganancia),
   KPIs del periodo, desglose por tamaño y por categoría de venta, **exportar CSV**.
6. **Historial** (trabajador): sus registros con hora.
7. **Galpones** (admin, en Ajustes): nombre + nº de aves; usados para % de postura.
8. **Usuarios** (admin, en Ajustes): crear, cambiar rol, activar/desactivar (guardas anti-bloqueo:
   no puede auto-desactivarse ni quitarse admin).
9. **Notificaciones in-app**: campana en Hoy con badge, polling cada 25s, bottom-sheet, tabla
   `notifications` + `notification_reads`. Eventos: recolección/venta/gasto, inventario bajo, ajuste.
10. **Web Push** (móvil con app cerrada, solo admin): `web-push` + VAPID + `push_subscriptions`,
    handlers en `public/push-sw.js`. **Banner flotante (snackbar)** fijo sobre la bottom-nav que
    **no ocupa layout** (no choca con el hero); "Ver" abre el modal de Ajustes y descarta el banner.
    **Modal en Ajustes** con estado; activar/desactivar cierra el sheet para no taparlo con el toast.
11. **Offline**: cola IndexedDB + `POST /sync` (operaciones en orden cronológico); banner de
    sincronización.
12. **Registros** (admin, en Ajustes): historial completo de **Recolección · Ventas · Gastos**
    (pestañas), con **editar** y **anular** cada registro. Editor en bottom-sheet. Anular = soft
    delete (`voided_at`): el registro queda para auditoría pero no cuenta en totales/reportes/inventario.
    Editar/anular **ajusta el inventario por la diferencia** de forma transaccional (devuelve/descuenta
    huevos; el `CHECK quantity>=0` impide estados imposibles). Endpoints: `GET /collections|sales|expenses?all=true`,
    `PATCH` y `DELETE` (anula) de cada uno.

## Variables de entorno (Vercel → Production)

`DATABASE_URL` (Neon), `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
(mailto). En local además `APP_ORIGIN`, `PORT`, `ADMIN_EMAIL/PASSWORD/NAME` (para `create-admin`).
`.env` está en `.gitignore` (nunca se commitea); ver `.env.example`.

## Scripts

`npm run dev` (api+web), `npm run build` (tsc + vite), `npm run migrate`, `npm run create-admin`,
`npm start` (producción local).

## Decisiones y restricciones clave

- **Vercel serverless no soporta SSE** ni conexiones largas → notificaciones por **polling** +
  **Web Push** (el envío de web-push sí corre en serverless).
- **iOS**: el push exige tener la **PWA instalada** en pantalla de inicio (Safari no dispara
  `beforeinstallprompt`; se muestran instrucciones).
- **Reportes** agregan al vuelo desde los registros (sin tabla de resumen); año = 12 meses por mes.
- **Zona horaria Guatemala**: el server usa `GT_TODAY = (now() AT TIME ZONE 'America/Guatemala')::date`
  (no `CURRENT_DATE`, que en Neon es UTC) y el cliente `dateToday()` también en `America/Guatemala`.
  Así un registro nocturno (UTC−6) cae en el día correcto en "Hoy"/Reportes. Es a prueba de pooler
  (no depende del timezone de sesión).
- **No hay DELETE** de usuarios ni galpones (solo desactivar) para conservar historial/referencias.
  Recolección/ventas/gastos tampoco se borran físicamente: se **anulan** (`voided_at`), conservando
  la fila para auditoría. Toda agregación filtra `voided_at IS NULL`.
- La **DB ya tiene datos reales** del cliente (no borrar). En pruebas locales, siempre limpiar lo
  que se cree.
- **Service Worker auto-update**: `vite.config.ts` con `registerType: 'autoUpdate'` +
  `skipWaiting`/`clientsClaim`/`cleanupOutdatedCaches` → cada deploy entra solo con un recargón.
  (El SW instalado **antes** de este cambio había que des-registrarlo una vez a mano.)
- **Escala de z-index semántica** en `:root` (`--z-nav:30 < --z-banner:50 < --z-modal:60 <
  --z-toast:80 < --z-skip:100`). Regla: nada flotante debe tapar un sheet abierto (el toast queda
  arriba a propósito, pero los sheets se cierran antes de dispararlo).
- **Sheets/overlays**: render con `createPortal` a `document.body` + scroll-lock del fondo; el hero
  usa `isolation: isolate` para que sus capas internas no se filtren al contexto raíz.

## Convenciones de trabajo

- **Commits cortos** (Conventional Commits: `feat:`, `fix:`), con trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **No amendar** commits ya pusheados (crear commits nuevos encima).
- El push normalmente lo hace el usuario manual; a veces pide que se haga automático.

## Pendientes / ideas futuras

- "Precios y categorías" en Ajustes está como **"Próximamente"**.
- Motivo opcional en el ajuste de inventario (auditoría más detallada).
- Poda de notificaciones antiguas (>90 días).
- `daily_summary` con cron solo si en el futuro permiten borrar registros.
