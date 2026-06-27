import 'dotenv/config';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import webpush from 'web-push';
import { z } from 'zod';
import { pool, query, queryOne } from './db.js';
import { requireAuth, requireRole, setSessionCookie, signSession, type AuthUser } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const __dirname = dirname(fileURLToPath(import.meta.url));

const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const pushEnabled = Boolean(vapidPublic && vapidPrivate);
if (pushEnabled) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@elrancho.app', vapidPublic, vapidPrivate);
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const categories = ['pequeno', 'mediano', 'grande', 'extra_grande', 'jumbo'] as const;
const categorySchema = z.enum(categories);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const countSchema = z.coerce.number().int().min(0).default(0);

const galponIdSchema = z.string().uuid().optional().nullable();

const collectionSchema = z.object({
  collectionDate: dateSchema,
  pequeno: countSchema,
  mediano: countSchema,
  grande: countSchema,
  extraGrande: countSchema,
  jumbo: countSchema,
  rotos: countSchema,
  galponId: galponIdSchema,
  notes: z.string().max(500).optional().default('')
});

const saleItemSchema = z.object({
  productType: z.enum(['cajon', 'oferta_grande']),
  category: categorySchema,
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0)
});

const saleSchema = z.object({
  saleDate: dateSchema,
  customer: z.string().max(160).optional().default(''),
  notes: z.string().max(500).optional().default(''),
  items: z.array(saleItemSchema).min(1)
});

const expenseSchema = z.object({
  expenseDate: dateSchema,
  category: z.string().min(1).max(80),
  supplier: z.string().max(160).optional().default(''),
  amount: z.coerce.number().min(0),
  galponId: galponIdSchema,
  notes: z.string().max(500).optional().default('')
});

function eggsPerUnit(productType: 'cajon' | 'oferta_grande') {
  return productType === 'oferta_grande' ? 90 : 360;
}

const LOW_INVENTORY_THRESHOLD = 360; // 1 cajon en huevos

const categoryLabel: Record<string, string> = {
  pequeno: 'Pequeno',
  mediano: 'Mediano',
  grande: 'Grande',
  extra_grande: 'Extra grande',
  jumbo: 'Jumbo'
};

type NotificationInput = {
  type: 'collection' | 'sale' | 'expense' | 'low_inventory';
  title: string;
  body?: string;
  actorName?: string;
  source?: 'direct' | 'sync';
};

// Envia push a los admin activos suscritos. Best-effort; limpia suscripciones expiradas.
async function sendPushToAdmins(title: string, body: string) {
  if (!pushEnabled) return;
  try {
    const subs = await query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.role = 'admin' AND u.active`
    );
    const payload = JSON.stringify({ title, body });
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
          }
        }
      })
    );
  } catch (error) {
    console.error('No se pudo enviar push:', error);
  }
}

// Best-effort: una notificacion nunca debe romper el registro principal.
async function addNotification(input: NotificationInput) {
  try {
    await query(
      `INSERT INTO notifications (type, title, body, actor_name, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.type, input.title, input.body ?? null, input.actorName ?? null, input.source ?? 'direct']
    );
    await sendPushToAdmins(input.title, input.body ?? '');
  } catch (error) {
    console.error('No se pudo registrar notificacion:', error);
  }
}

function formatQ(value: number) {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function parseError(error: unknown) {
  if (error instanceof z.ZodError) return { message: 'Datos invalidos.', issues: error.issues };
  if (error instanceof Error) return { message: error.message };
  return { message: 'Error inesperado.' };
}

async function addCollection(input: z.infer<typeof collectionSchema>, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO daily_collections
       (collection_date, pequeno, mediano, grande, extra_grande, jumbo, rotos, notes, created_by, galpon_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [input.collectionDate, input.pequeno, input.mediano, input.grande, input.extraGrande, input.jumbo, input.rotos, input.notes, userId, input.galponId ?? null]
    );

    const increments = [
      ['pequeno', input.pequeno],
      ['mediano', input.mediano],
      ['grande', input.grande],
      ['extra_grande', input.extraGrande],
      ['jumbo', input.jumbo]
    ] as const;

    for (const [category, amount] of increments) {
      await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = now() WHERE category = $2',
        [amount, category]
      );
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addSale(input: z.infer<typeof saleSchema>, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const requiredByCategory = new Map<string, number>();
    for (const item of input.items) {
      const eggs = eggsPerUnit(item.productType) * item.quantity;
      requiredByCategory.set(item.category, (requiredByCategory.get(item.category) || 0) + eggs);
    }

    const lowCrossed: Array<{ category: string; remaining: number }> = [];
    for (const [category, required] of requiredByCategory) {
      const inventory = await client.query<{ quantity: number }>(
        'SELECT quantity FROM inventory WHERE category = $1 FOR UPDATE',
        [category]
      );
      const available = inventory.rows[0]?.quantity ?? 0;
      if (available < required) {
        throw new Error(`Inventario insuficiente para ${category}. Disponible: ${available}, requerido: ${required}.`);
      }
      const remaining = available - required;
      if (available >= LOW_INVENTORY_THRESHOLD && remaining < LOW_INVENTORY_THRESHOLD) {
        lowCrossed.push({ category, remaining });
      }
    }

    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const sale = await client.query(
      `INSERT INTO sales (sale_date, customer, total, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.saleDate, input.customer, total, input.notes, userId]
    );

    for (const item of input.items) {
      const unitEggs = eggsPerUnit(item.productType);
      const lineTotal = item.quantity * item.unitPrice;
      await client.query(
        `INSERT INTO sale_items (sale_id, product_type, category, quantity, eggs_per_unit, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sale.rows[0].id, item.productType, item.category, item.quantity, unitEggs, item.unitPrice, lineTotal]
      );
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1, updated_at = now() WHERE category = $2',
        [unitEggs * item.quantity, item.category]
      );
    }

    await client.query('COMMIT');
    return { sale: sale.rows[0], lowCrossed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addExpense(input: z.infer<typeof expenseSchema>, userId: string) {
  return queryOne(
    `INSERT INTO expenses (expense_date, category, supplier, amount, notes, created_by, galpon_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.expenseDate, input.category, input.supplier, input.amount, input.notes, userId, input.galponId ?? null]
  );
}

type Source = 'direct' | 'sync';

async function notifyCollection(input: z.infer<typeof collectionSchema>, actorName: string, source: Source) {
  const eggs = input.pequeno + input.mediano + input.grande + input.extraGrande + input.jumbo;
  await addNotification({
    type: 'collection',
    title: `${actorName} registro recoleccion`,
    body: `${eggs} huevos buenos${input.rotos ? ` · ${input.rotos} rotos` : ''}`,
    actorName,
    source
  });
}

async function notifySale(
  input: z.infer<typeof saleSchema>,
  sale: { total: number | string },
  lowCrossed: Array<{ category: string; remaining: number }>,
  actorName: string,
  source: Source
) {
  const eggs = input.items.reduce((sum, item) => sum + eggsPerUnit(item.productType) * item.quantity, 0);
  await addNotification({
    type: 'sale',
    title: `${actorName} registro venta`,
    body: `${formatQ(Number(sale.total))} · ${eggs} huevos`,
    actorName,
    source
  });
  for (const crossed of lowCrossed) {
    await addNotification({
      type: 'low_inventory',
      title: 'Inventario bajo',
      body: `${categoryLabel[crossed.category] ?? crossed.category}: ${crossed.remaining} huevos disponibles`,
      source
    });
  }
}

async function notifyExpense(input: z.infer<typeof expenseSchema>, actorName: string, source: Source) {
  await addNotification({
    type: 'expense',
    title: `${actorName} registro gasto`,
    body: `${formatQ(input.amount)} · ${input.category}`,
    actorName,
    source
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await queryOne<AuthUser & { password_hash: string; active: boolean }>(
      'SELECT id, email, name, role, password_hash, active FROM users WHERE email = $1',
      [input.email.toLowerCase()]
    );

    if (!user || !user.active) return res.status(401).json({ message: 'Correo o contrasena incorrectos.' });
    const valid = await bcrypt.compare(input.password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Correo o contrasena incorrectos.' });

    const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    setSessionCookie(res, signSession(sessionUser));
    res.json({ user: sessionUser });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('elrancho_session');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const input = z.object({ email: z.string().email() }).parse(req.body);
    const user = await queryOne<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = $1 AND active = true', [
      input.email.toLowerCase()
    ]);

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'30 minutes\')',
        [user.id, tokenHash]
      );
      console.info(`Token de recuperacion para ${user.email}: ${token}`);
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ message: 'Si el correo existe, se enviaron instrucciones.', devToken: token });
      }
    }

    res.json({ message: 'Si el correo existe, se enviaron instrucciones.' });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const input = z.object({ token: z.string().min(20), password: z.string().min(8) }).parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
    const reset = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [tokenHash]
    );

    if (!reset) return res.status(400).json({ message: 'Token invalido o vencido.' });
    const passwordHash = await bcrypt.hash(input.password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, reset.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [reset.id]);
    res.json({ message: 'Contrasena actualizada.' });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/dashboard/today', requireAuth, requireRole('admin'), async (_req, res) => {
  const [collection, sales, expenses, inventory, salesYesterday, expensesYesterday, birds] = await Promise.all([
    queryOne(
      `SELECT COALESCE(sum(pequeno),0)::int pequeno, COALESCE(sum(mediano),0)::int mediano,
              COALESCE(sum(grande),0)::int grande, COALESCE(sum(extra_grande),0)::int extra_grande,
              COALESCE(sum(jumbo),0)::int jumbo, COALESCE(sum(rotos),0)::int rotos
       FROM daily_collections WHERE collection_date = CURRENT_DATE`
    ),
    queryOne('SELECT COALESCE(sum(total),0)::float total, count(*)::int count FROM sales WHERE sale_date = CURRENT_DATE'),
    queryOne('SELECT COALESCE(sum(amount),0)::float total, count(*)::int count FROM expenses WHERE expense_date = CURRENT_DATE'),
    query('SELECT category, quantity FROM inventory ORDER BY category'),
    queryOne("SELECT COALESCE(sum(total),0)::float total FROM sales WHERE sale_date = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne("SELECT COALESCE(sum(amount),0)::float total FROM expenses WHERE expense_date = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne('SELECT COALESCE(sum(bird_count),0)::int birds FROM galpones WHERE active')
  ]);

  const profit = Number(sales?.total || 0) - Number(expenses?.total || 0);
  const profitYesterday = Number(salesYesterday?.total || 0) - Number(expensesYesterday?.total || 0);

  res.json({ collection, sales, expenses, inventory, profit, profitYesterday, birds: Number(birds?.birds || 0) });
});

app.get('/api/reports', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const period = z.coerce.number().int().refine((value) => [7, 30, 365].includes(value), 'Periodo invalido.').parse(req.query.period ?? 7);
    const granularity = period === 365 ? 'month' : 'day';
    const eggsExpr = 'pequeno + mediano + grande + extra_grande + jumbo';

    let series;
    if (granularity === 'day') {
      series = await query(
        `WITH days AS (
           SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day')::date AS d
         ),
         col AS (SELECT collection_date d, sum(${eggsExpr})::int eggs FROM daily_collections WHERE collection_date > CURRENT_DATE - $1::int GROUP BY collection_date),
         sal AS (SELECT sale_date d, sum(total)::float total FROM sales WHERE sale_date > CURRENT_DATE - $1::int GROUP BY sale_date),
         exp AS (SELECT expense_date d, sum(amount)::float total FROM expenses WHERE expense_date > CURRENT_DATE - $1::int GROUP BY expense_date)
         SELECT to_char(days.d, 'DD/MM') label, days.d::text date,
                COALESCE(col.eggs,0)::int eggs,
                COALESCE(sal.total,0)::float sales,
                COALESCE(exp.total,0)::float expenses,
                (COALESCE(sal.total,0) - COALESCE(exp.total,0))::float profit
         FROM days
         LEFT JOIN col ON col.d = days.d
         LEFT JOIN sal ON sal.d = days.d
         LEFT JOIN exp ON exp.d = days.d
         ORDER BY days.d`,
        [period]
      );
    } else {
      series = await query(
        `WITH months AS (
           SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS d
         ),
         col AS (SELECT date_trunc('month', collection_date)::date d, sum(${eggsExpr})::int eggs FROM daily_collections WHERE collection_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months' GROUP BY 1),
         sal AS (SELECT date_trunc('month', sale_date)::date d, sum(total)::float total FROM sales WHERE sale_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months' GROUP BY 1),
         exp AS (SELECT date_trunc('month', expense_date)::date d, sum(amount)::float total FROM expenses WHERE expense_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months' GROUP BY 1)
         SELECT to_char(months.d, 'Mon') label, months.d::text date,
                COALESCE(col.eggs,0)::int eggs,
                COALESCE(sal.total,0)::float sales,
                COALESCE(exp.total,0)::float expenses,
                (COALESCE(sal.total,0) - COALESCE(exp.total,0))::float profit
         FROM months
         LEFT JOIN col ON col.d = months.d
         LEFT JOIN sal ON sal.d = months.d
         LEFT JOIN exp ON exp.d = months.d
         ORDER BY months.d`
      );
    }

    const since = `CURRENT_DATE - ${period}::int`;
    const [byCategoryProduction, byCategorySales, birds] = await Promise.all([
      queryOne(
        `SELECT COALESCE(sum(pequeno),0)::int pequeno, COALESCE(sum(mediano),0)::int mediano,
                COALESCE(sum(grande),0)::int grande, COALESCE(sum(extra_grande),0)::int extra_grande,
                COALESCE(sum(jumbo),0)::int jumbo
         FROM daily_collections WHERE collection_date > ${since}`
      ),
      query(
        `SELECT si.category, sum(si.line_total)::float total, sum(si.quantity * si.eggs_per_unit)::int eggs
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.sale_date > ${since}
         GROUP BY si.category`
      ),
      queryOne('SELECT COALESCE(sum(bird_count),0)::int birds FROM galpones WHERE active')
    ]);

    res.json({ period, granularity, series, byCategoryProduction, byCategorySales, birds: Number(birds?.birds || 0) });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/inventory', requireAuth, requireRole('admin'), async (_req, res) => {
  res.json({ inventory: await query('SELECT category, quantity, updated_at FROM inventory ORDER BY category') });
});

app.patch('/api/inventory/:category', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const category = categorySchema.parse(req.params.category);
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(0) }).parse(req.body);
    const previous = await queryOne<{ quantity: number }>('SELECT quantity FROM inventory WHERE category = $1', [category]);
    const inventory = await queryOne(
      'UPDATE inventory SET quantity = $1, updated_at = now() WHERE category = $2 RETURNING category, quantity, updated_at',
      [quantity, category]
    );
    if (!inventory) return res.status(404).json({ message: 'Categoria no encontrada.' });
    await addNotification({
      type: 'low_inventory',
      title: 'Inventario ajustado',
      body: `${categoryLabel[category] ?? category}: ${Number(previous?.quantity || 0)} → ${quantity} huevos`,
      actorName: req.user!.name
    });
    res.json({ inventory });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

const galponCreateSchema = z.object({
  name: z.string().min(1).max(80),
  birdCount: z.coerce.number().int().min(0).default(0)
});

const galponUpdateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    birdCount: z.coerce.number().int().min(0).optional(),
    active: z.boolean().optional()
  })
  .refine((value) => value.name !== undefined || value.birdCount !== undefined || value.active !== undefined, {
    message: 'Nada que actualizar.'
  });

app.get('/api/galpones', requireAuth, async (req, res) => {
  const all = req.query.all === 'true' && req.user!.role === 'admin';
  res.json({
    galpones: await query(`SELECT id, name, bird_count, active FROM galpones ${all ? '' : 'WHERE active'} ORDER BY name ASC`)
  });
});

app.post('/api/galpones', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const input = galponCreateSchema.parse(req.body);
    const galpon = await queryOne(
      'INSERT INTO galpones (name, bird_count) VALUES ($1, $2) RETURNING id, name, bird_count, active',
      [input.name, input.birdCount]
    );
    res.json({ galpon });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.patch('/api/galpones/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = galponUpdateSchema.parse(req.body);
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      values.push(input.name);
      updates.push(`name = $${values.length}`);
    }
    if (input.birdCount !== undefined) {
      values.push(input.birdCount);
      updates.push(`bird_count = $${values.length}`);
    }
    if (input.active !== undefined) {
      values.push(input.active);
      updates.push(`active = $${values.length}`);
    }
    values.push(id);
    const galpon = await queryOne(
      `UPDATE galpones SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, name, bird_count, active`,
      values
    );
    if (!galpon) return res.status(404).json({ message: 'Galpon no encontrado.' });
    res.json({ galpon });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/registros', requireAuth, async (req, res) => {
  if (req.user!.role === 'admin') {
    const registros = await query(
      `SELECT * FROM (
         SELECT 'collection' AS type, dc.created_at, u.name AS actor_name, g.name AS galpon_name,
                (dc.pequeno + dc.mediano + dc.grande + dc.extra_grande + dc.jumbo)::int AS eggs,
                NULL::numeric AS amount
         FROM daily_collections dc
         LEFT JOIN users u ON u.id = dc.created_by
         LEFT JOIN galpones g ON g.id = dc.galpon_id
         UNION ALL
         SELECT 'sale', s.created_at, u.name, NULL, NULL::int, s.total
         FROM sales s LEFT JOIN users u ON u.id = s.created_by
         UNION ALL
         SELECT 'expense', e.created_at, u.name, g.name, NULL::int, e.amount
         FROM expenses e
         LEFT JOIN users u ON u.id = e.created_by
         LEFT JOIN galpones g ON g.id = e.galpon_id
       ) feed
       ORDER BY created_at DESC
       LIMIT 30`
    );
    return res.json({ registros });
  }

  const registros = await query(
    `SELECT 'collection' AS type, dc.created_at, u.name AS actor_name, g.name AS galpon_name,
            (dc.pequeno + dc.mediano + dc.grande + dc.extra_grande + dc.jumbo)::int AS eggs,
            NULL::numeric AS amount
     FROM daily_collections dc
     LEFT JOIN users u ON u.id = dc.created_by
     LEFT JOIN galpones g ON g.id = dc.galpon_id
     WHERE dc.created_by = $1
     ORDER BY dc.created_at DESC
     LIMIT 30`,
    [req.user!.id]
  );
  res.json({ registros });
});

app.post('/api/collections', requireAuth, async (req, res) => {
  try {
    const input = collectionSchema.parse(req.body);
    const collection = await addCollection(input, req.user!.id);
    await notifyCollection(input, req.user!.name, 'direct');
    res.json({ collection });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/collections', requireAuth, requireRole('admin'), async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  res.json({ collections: await query('SELECT * FROM daily_collections WHERE collection_date = $1 ORDER BY created_at DESC', [date]) });
});

app.post('/api/sales', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const input = saleSchema.parse(req.body);
    const { sale, lowCrossed } = await addSale(input, req.user!.id);
    await notifySale(input, sale, lowCrossed, req.user!.name, 'direct');
    res.json({ sale });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/sales', requireAuth, requireRole('admin'), async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  res.json({ sales: await query('SELECT * FROM sales WHERE sale_date = $1 ORDER BY created_at DESC', [date]) });
});

app.post('/api/expenses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const input = expenseSchema.parse(req.body);
    const expense = await addExpense(input, req.user!.id);
    await notifyExpense(input, req.user!.name, 'direct');
    res.json({ expense });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/expenses', requireAuth, requireRole('admin'), async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  res.json({ expenses: await query('SELECT * FROM expenses WHERE expense_date = $1 ORDER BY created_at DESC', [date]) });
});

const userCreateSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  role: z.enum(['admin', 'trabajador']).default('trabajador'),
  password: z.string().min(8).max(200)
});

const userUpdateSchema = z
  .object({
    role: z.enum(['admin', 'trabajador']).optional(),
    active: z.boolean().optional()
  })
  .refine((value) => value.role !== undefined || value.active !== undefined, { message: 'Nada que actualizar.' });

app.get('/api/users', requireAuth, requireRole('admin'), async (_req, res) => {
  res.json({
    users: await query('SELECT id, email, name, role, active, created_at FROM users ORDER BY active DESC, name ASC')
  });
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const input = userCreateSchema.parse(req.body);
    const exists = await queryOne('SELECT id FROM users WHERE email = $1', [input.email.toLowerCase()]);
    if (exists) return res.status(409).json({ message: 'Ya existe un usuario con ese correo.' });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await queryOne(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, active, created_at`,
      [input.email.toLowerCase(), input.name, passwordHash, input.role]
    );
    res.json({ user });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.patch('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = userUpdateSchema.parse(req.body);

    if (id === req.user!.id && input.active === false) {
      return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' });
    }
    if (id === req.user!.id && input.role === 'trabajador') {
      return res.status(400).json({ message: 'No puedes quitarte el rol de administrador.' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.role !== undefined) {
      values.push(input.role);
      updates.push(`role = $${values.length}`);
    }
    if (input.active !== undefined) {
      values.push(input.active);
      updates.push(`active = $${values.length}`);
    }
    values.push(id);

    const user = await queryOne(
      `UPDATE users SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id, email, name, role, active, created_at`,
      values
    );
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    res.json({ user });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.get('/api/notifications', requireAuth, requireRole('admin'), async (req, res) => {
  const [notifications, unread] = await Promise.all([
    query('SELECT id, type, title, body, actor_name, source, created_at FROM notifications ORDER BY created_at DESC LIMIT 50'),
    queryOne<{ count: number }>(
      `SELECT count(*)::int count FROM notifications n
       WHERE n.created_at > COALESCE((SELECT last_seen_at FROM notification_reads WHERE user_id = $1), 'epoch')`,
      [req.user!.id]
    )
  ]);
  res.json({ notifications, unreadCount: unread?.count ?? 0 });
});

app.post('/api/notifications/read', requireAuth, requireRole('admin'), async (req, res) => {
  await query(
    `INSERT INTO notification_reads (user_id, last_seen_at) VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()`,
    [req.user!.id]
  );
  res.json({ ok: true });
});

app.get('/api/push/public-key', requireAuth, (_req, res) => {
  res.json({ publicKey: pushEnabled ? vapidPublic : '' });
});

const pushSubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) })
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = pushSubSchema.parse(req.body);
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user!.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user!.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

app.post('/api/sync', requireAuth, async (req, res) => {
  try {
    const operations = z.array(z.object({ type: z.enum(['collection', 'sale', 'expense']), payload: z.unknown() })).parse(req.body.operations);
    const results = [];

    const actor = req.user!.name;
    for (const operation of operations) {
      if (operation.type === 'collection') {
        const input = collectionSchema.parse(operation.payload);
        results.push(await addCollection(input, req.user!.id));
        await notifyCollection(input, actor, 'sync');
      }
      if (operation.type === 'sale') {
        if (req.user!.role !== 'admin') throw new Error('Solo admin puede sincronizar ventas.');
        const input = saleSchema.parse(operation.payload);
        const { sale, lowCrossed } = await addSale(input, req.user!.id);
        results.push(sale);
        await notifySale(input, sale, lowCrossed, actor, 'sync');
      }
      if (operation.type === 'expense') {
        if (req.user!.role !== 'admin') throw new Error('Solo admin puede sincronizar gastos.');
        const input = expenseSchema.parse(operation.payload);
        results.push(await addExpense(input, req.user!.id));
        await notifyExpense(input, actor, 'sync');
      }
    }

    res.json({ synced: results.length, results });
  } catch (error) {
    res.status(400).json(parseError(error));
  }
});

// En Vercel el frontend estatico lo sirve el CDN y esta funcion solo atiende /api/*.
// Para correr local en modo produccion (npm start) servimos el dist desde Express.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

// Vercel invoca el app como handler serverless; no abrimos puerto ahi.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`API El Rancho escuchando en http://localhost:${port}`);
  });
}

export default app;
