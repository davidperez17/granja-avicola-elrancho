CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'trabajador');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE egg_category AS ENUM ('pequeno', 'mediano', 'grande', 'extra_grande', 'jumbo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_product_type AS ENUM ('cajon', 'oferta_grande');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE sale_product_type ADD VALUE IF NOT EXISTS 'carton';

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'trabajador',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  category egg_category PRIMARY KEY,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO inventory (category, quantity)
VALUES ('pequeno', 0), ('mediano', 0), ('grande', 0), ('extra_grande', 0), ('jumbo', 0)
ON CONFLICT (category) DO NOTHING;

CREATE TABLE IF NOT EXISTS daily_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_date date NOT NULL DEFAULT CURRENT_DATE,
  pequeno integer NOT NULL DEFAULT 0 CHECK (pequeno >= 0),
  mediano integer NOT NULL DEFAULT 0 CHECK (mediano >= 0),
  grande integer NOT NULL DEFAULT 0 CHECK (grande >= 0),
  extra_grande integer NOT NULL DEFAULT 0 CHECK (extra_grande >= 0),
  jumbo integer NOT NULL DEFAULT 0 CHECK (jumbo >= 0),
  rotos integer NOT NULL DEFAULT 0 CHECK (rotos >= 0),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_collections_date_idx ON daily_collections(collection_date);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  customer text,
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_type sale_product_type NOT NULL,
  category egg_category NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  eggs_per_unit integer NOT NULL CHECK (eggs_per_unit > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(sale_date);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  supplier text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value)
VALUES (
  'prices',
  '{"cajon":{"pequeno":0,"mediano":0,"grande":0,"extra_grande":0,"jumbo":0},"oferta_grande":0}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  actor_name text,
  source text NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS galpones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bird_count integer NOT NULL DEFAULT 0 CHECK (bird_count >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_collections ADD COLUMN IF NOT EXISTS galpon_id uuid REFERENCES galpones(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS galpon_id uuid REFERENCES galpones(id);

-- Movimientos de aves por galpon. delta firmado: ingreso (+), muerte (-),
-- ajuste (correccion manual, +/-). bird_count en galpones se deriva de estos
-- eventos (cada uno ajusta bird_count en transaccion). voided_at = anulado.
DO $$ BEGIN
  CREATE TYPE bird_event_type AS ENUM ('ingreso', 'muerte', 'ajuste');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS galpon_bird_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galpon_id uuid NOT NULL REFERENCES galpones(id),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  type bird_event_type NOT NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE INDEX IF NOT EXISTS galpon_bird_events_galpon_idx ON galpon_bird_events(galpon_id, event_date DESC);

-- Soft delete (anular): NULL = activo. Los registros anulados quedan para
-- auditoria pero no cuentan en totales, reportes ni inventario.
ALTER TABLE daily_collections ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Novedades de la app (changelog). Canal separado de notifications: lo publica
-- el desarrollador (DEV_EMAIL) y el cliente solo lo lee. Badge propio via reads.
CREATE TABLE IF NOT EXISTS app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_updates_created_idx ON app_updates(created_at DESC);

CREATE TABLE IF NOT EXISTS app_update_reads (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
