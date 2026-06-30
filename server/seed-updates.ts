import { pool } from './db.js';

// Novedades amigables para el cliente, curadas a partir del historial de commits.
// Idempotente: solo inserta las que no existan (por titulo). created_at explicito
// para que el changelog se vea en orden cronologico real.
const updates: Array<{ date: string; title: string; body: string }> = [
  {
    date: '2026-06-26 09:00',
    title: 'Lanzamiento de El Rancho',
    body: 'App móvil para registrar la recolección diaria de huevos por categoría, controlar rotos, ventas y gastos, con vista del día y panel de usuarios.'
  },
  {
    date: '2026-06-26 12:00',
    title: 'App instalable y avisos al móvil',
    body: 'Instala El Rancho en el celular como app y úsala incluso sin internet. Campana de avisos y notificaciones push para el administrador.'
  },
  {
    date: '2026-06-26 15:00',
    title: 'Galpones y ajuste de inventario',
    body: 'Administra tus galpones y corrige el inventario por categoría cuando haga falta.'
  },
  {
    date: '2026-06-27 10:00',
    title: 'Reportes completos',
    body: 'Reportes con gráfica de producción, ventas y ganancia, indicadores del periodo, desglose por tamaño y exportación a CSV.'
  },
  {
    date: '2026-06-27 13:00',
    title: 'Editar y anular registros',
    body: 'Corrige o anula recolecciones, ventas y gastos sin perder el historial; el inventario se ajusta solo.'
  },
  {
    date: '2026-06-27 16:00',
    title: 'Vista de cajas y venta por cartón',
    body: 'El inventario muestra el equivalente en cajas y ahora puedes vender por cartón (30 huevos), además de cajón y oferta.'
  },
  {
    date: '2026-06-27 17:30',
    title: 'Oferta más flexible',
    body: 'En la venta por oferta ya puedes elegir libremente la categoría de huevo.'
  },
  {
    date: '2026-06-29 10:00',
    title: 'Historial por galpón',
    body: 'Cada galpón tiene su propio historial: producción, huevos rotos, movimientos de aves (cuando entran o mueren) y la lista de sus recolecciones.'
  },
  {
    date: '2026-06-29 12:00',
    title: 'Ventas por cliente',
    body: 'Nueva sección Clientes: mira cuánto le has vendido a cada cliente y el detalle de cada venta.'
  },
  {
    date: '2026-06-29 15:00',
    title: 'Novedades de la app',
    body: 'Toca la estrella para ver aquí mismo cada mejora de la app; te llega un aviso al móvil cuando hay una nueva.'
  }
];

let inserted = 0;
for (const update of updates) {
  const result = await pool.query(
    `INSERT INTO app_updates (title, body, created_at)
     SELECT $1, $2, $3::timestamptz
     WHERE NOT EXISTS (SELECT 1 FROM app_updates WHERE title = $1)`,
    [update.title, update.body, update.date]
  );
  inserted += result.rowCount ?? 0;
}

await pool.end();
console.log(`Novedades sembradas: ${inserted} nuevas (${updates.length} en total).`);
