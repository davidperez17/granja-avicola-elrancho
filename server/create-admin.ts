import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Administrador El Rancho';

if (!email || !password) {
  throw new Error('Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de ejecutar create-admin.');
}

const passwordHash = await bcrypt.hash(password, 12);

await pool.query(
  `INSERT INTO users (email, name, password_hash, role)
   VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email)
   DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = 'admin', active = true, updated_at = now()`,
  [email.toLowerCase(), name, passwordHash]
);

await pool.end();
console.log(`Admin listo: ${email}`);
