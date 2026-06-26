import 'dotenv/config';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import { z } from 'zod';
import { pool, query, queryOne } from './db.js';
import { requireAuth, requireRole, setSessionCookie, signSession, type AuthUser } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const categories = ['pequeno', 'mediano', 'grande', 'extra_grande', 'jumbo'] as const;
const categorySchema = z.enum(categories);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const countSchema = z.coerce.number().int().min(0).default(0);

const collectionSchema = z.object({
  collectionDate: dateSchema,
  pequeno: countSchema,
  mediano: countSchema,
  grande: countSchema,
  extraGrande: countSchema,
  jumbo: countSchema,
  rotos: countSchema,
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
  notes: z.string().max(500).optional().default('')
});

function eggsPerUnit(productType: 'cajon' | 'oferta_grande') {
  return productType === 'oferta_grande' ? 90 : 360;
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
       (collection_date, pequeno, mediano, grande, extra_grande, jumbo, rotos, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [input.collectionDate, input.pequeno, input.mediano, input.grande, input.extraGrande, input.jumbo, input.rotos, input.notes, userId]
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

    for (const [category, required] of requiredByCategory) {
      const inventory = await client.query<{ quantity: number }>(
        'SELECT quantity FROM inventory WHERE category = $1 FOR UPDATE',
        [category]
      );
      const available = inventory.rows[0]?.quantity ?? 0;
      if (available < required) {
        throw new Error(`Inventario insuficiente para ${category}. Disponible: ${available}, requerido: ${required}.`);
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
    return sale.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addExpense(input: z.infer<typeof expenseSchema>, userId: string) {
  return queryOne(
    `INSERT INTO expenses (expense_date, category, supplier, amount, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.expenseDate, input.category, input.supplier, input.amount, input.notes, userId]
  );
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
  const [collection, sales, expenses, inventory] = await Promise.all([
    queryOne(
      `SELECT COALESCE(sum(pequeno),0)::int pequeno, COALESCE(sum(mediano),0)::int mediano,
              COALESCE(sum(grande),0)::int grande, COALESCE(sum(extra_grande),0)::int extra_grande,
              COALESCE(sum(jumbo),0)::int jumbo, COALESCE(sum(rotos),0)::int rotos
       FROM daily_collections WHERE collection_date = CURRENT_DATE`
    ),
    queryOne('SELECT COALESCE(sum(total),0)::float total, count(*)::int count FROM sales WHERE sale_date = CURRENT_DATE'),
    queryOne('SELECT COALESCE(sum(amount),0)::float total, count(*)::int count FROM expenses WHERE expense_date = CURRENT_DATE'),
    query('SELECT category, quantity FROM inventory ORDER BY category')
  ]);

  res.json({ collection, sales, expenses, inventory, profit: Number(sales?.total || 0) - Number(expenses?.total || 0) });
});

app.get('/api/inventory', requireAuth, requireRole('admin'), async (_req, res) => {
  res.json({ inventory: await query('SELECT category, quantity, updated_at FROM inventory ORDER BY category') });
});

app.post('/api/collections', requireAuth, async (req, res) => {
  try {
    const input = collectionSchema.parse(req.body);
    res.json({ collection: await addCollection(input, req.user!.id) });
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
    res.json({ sale: await addSale(input, req.user!.id) });
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
    res.json({ expense: await addExpense(input, req.user!.id) });
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

app.post('/api/sync', requireAuth, async (req, res) => {
  try {
    const operations = z.array(z.object({ type: z.enum(['collection', 'sale', 'expense']), payload: z.unknown() })).parse(req.body.operations);
    const results = [];

    for (const operation of operations) {
      if (operation.type === 'collection') results.push(await addCollection(collectionSchema.parse(operation.payload), req.user!.id));
      if (operation.type === 'sale') {
        if (req.user!.role !== 'admin') throw new Error('Solo admin puede sincronizar ventas.');
        results.push(await addSale(saleSchema.parse(operation.payload), req.user!.id));
      }
      if (operation.type === 'expense') {
        if (req.user!.role !== 'admin') throw new Error('Solo admin puede sincronizar gastos.');
        results.push(await addExpense(expenseSchema.parse(operation.payload), req.user!.id));
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
