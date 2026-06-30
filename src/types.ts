export type Role = 'admin' | 'trabajador';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type AdminUser = User & {
  active: boolean;
  created_at: string;
};

export type CreateUserPayload = {
  name: string;
  email: string;
  role: Role;
  password: string;
};

export type CategoryKey = 'pequeno' | 'mediano' | 'grande' | 'extra_grande' | 'jumbo';

export type CollectionPayload = {
  collectionDate: string;
  pequeno: number;
  mediano: number;
  grande: number;
  extraGrande: number;
  jumbo: number;
  rotos: number;
  galponId?: string | null;
  notes?: string;
};

export type Galpon = {
  id: string;
  name: string;
  bird_count: number;
  active: boolean;
};

export type BirdEventType = 'ingreso' | 'muerte' | 'ajuste';

export type BirdEvent = {
  id: string;
  event_date: string;
  type: BirdEventType;
  delta: number;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
};

export type GalponOverview = {
  id: string;
  name: string;
  bird_count: number;
  active: boolean;
  eggs_today: number;
  rotos_today: number;
};

export type GalponCollectionRecord = {
  id: string;
  collection_date: string;
  pequeno: number;
  mediano: number;
  grande: number;
  extra_grande: number;
  jumbo: number;
  rotos: number;
  eggs: number;
  actor_name: string | null;
  created_at: string;
};

export type GalponHistory = {
  id: string;
  name: string;
  bird_count: number;
  active: boolean;
  period: number;
  granularity: 'day' | 'month';
  series: Array<{ label: string; date: string; eggs: number; rotos: number }>;
  events: BirdEvent[];
  collections: GalponCollectionRecord[];
  totals: { eggs: number; rotos: number; netBirds: number };
};

export type ClienteSummary = {
  customer: string | null; // null = "Sin cliente"
  sales: number;
  total: number;
  eggs: number;
  last_sale: string;
};

export type RegistroItem = {
  type: 'collection' | 'sale' | 'expense';
  created_at: string;
  actor_name: string | null;
  galpon_name: string | null;
  eggs: number | null;
  amount: number | null;
};

export type SalePayload = {
  saleDate: string;
  customer?: string;
  notes?: string;
  items: Array<{
    productType: 'cajon' | 'oferta_grande' | 'carton';
    category: CategoryKey;
    quantity: number;
    unitPrice: number;
  }>;
};

export type ExpensePayload = {
  expenseDate: string;
  category: string;
  supplier?: string;
  amount: number;
  galponId?: string | null;
  notes?: string;
};

export type ReportSeriesPoint = {
  label: string;
  date: string;
  eggs: number;
  sales: number;
  expenses: number;
  profit: number;
};

export type ReportData = {
  period: number;
  granularity: 'day' | 'month';
  series: ReportSeriesPoint[];
  byCategoryProduction: Record<'pequeno' | 'mediano' | 'grande' | 'extra_grande' | 'jumbo', number>;
  byCategorySales: Array<{ category: string; total: number; eggs: number }>;
  birds: number;
};

export type NotificationType = 'collection' | 'sale' | 'expense' | 'low_inventory';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  actor_name: string | null;
  source: 'direct' | 'sync';
  created_at: string;
};

// Registros completos para el historial / administracion (incluye anulados).
export type CollectionRecord = {
  id: string;
  collection_date: string;
  pequeno: number;
  mediano: number;
  grande: number;
  extra_grande: number;
  jumbo: number;
  rotos: number;
  notes: string | null;
  galpon_id: string | null;
  actor_name: string | null;
  galpon_name: string | null;
  eggs: number;
  voided_at: string | null;
  created_at: string;
};

export type SaleItemRecord = {
  product_type: 'cajon' | 'oferta_grande' | 'carton';
  category: CategoryKey;
  quantity: number;
  eggs_per_unit: number;
  unit_price: number | string;
  line_total: number | string;
};

export type SaleRecord = {
  id: string;
  sale_date: string;
  customer: string | null;
  total: number | string;
  notes: string | null;
  actor_name: string | null;
  items: SaleItemRecord[];
  eggs: number;
  voided_at: string | null;
  created_at: string;
};

export type ExpenseRecord = {
  id: string;
  expense_date: string;
  category: string;
  supplier: string | null;
  amount: number | string;
  notes: string | null;
  galpon_id: string | null;
  galpon_name: string | null;
  actor_name: string | null;
  voided_at: string | null;
  created_at: string;
};

export type OfflineOperation = {
  id: string;
  type: 'collection' | 'sale' | 'expense';
  payload: CollectionPayload | SalePayload | ExpensePayload;
  createdAt: string;
};
