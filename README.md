# El Rancho

PWA para control operativo y administrativo de una granja avicola.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- PWA con `vite-plugin-pwa`
- API Express
- Neon PostgreSQL
- Login por correo y contrasena
- Recuperacion de contrasena por token
- Cola offline con IndexedDB

## Configuracion

1. Crea `.env` usando `.env.example` como base.
2. Configura `DATABASE_URL` con la conexion de Neon.
3. Configura `JWT_SECRET` con un valor largo y privado.
4. Ejecuta migraciones:

```bash
npm run migrate
```

5. Crea el administrador inicial:

```bash
npm run create-admin
```

6. Inicia desarrollo:

```bash
npm run dev
```

## Logo

Coloca el logo en:

```txt
public/brand/logo.svg
public/brand/logo.png
```

El sistema intentara usar `logo.svg`. Si no existe, mostrara un icono temporal.

## Negocio

- Categorias de huevo: pequeno, mediano, grande, extra grande y jumbo.
- Huevos rotos se registran, pero no entran al inventario vendible.
- 1 cajon = 12 cartones x 30 huevos = 360 huevos.
- Oferta Grande = 3 cartones x 30 huevos = 90 huevos.
- Las ventas descuentan inventario automaticamente.
- Recolecciones suman inventario automaticamente.

## Offline

Si no hay internet, el navegador guarda recolecciones, ventas y gastos en IndexedDB. Al volver la conexion, intenta sincronizar con la API.

Las ventas offline se validan contra inventario al sincronizar. Si no hay inventario suficiente, la API rechaza esa sincronizacion para proteger el inventario real.

## Recuperacion de contrasena

`/api/auth/forgot-password` genera un token valido por 30 minutos. En desarrollo lo devuelve como `devToken` y tambien lo imprime en consola. En produccion debe conectarse un proveedor de correo antes de enviar el sistema a usuarios reales.
