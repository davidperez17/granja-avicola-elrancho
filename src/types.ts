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
    productType: 'cajon' | 'oferta_grande';
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

export type OfflineOperation = {
  id: string;
  type: 'collection' | 'sale' | 'expense';
  payload: CollectionPayload | SalePayload | ExpensePayload;
  createdAt: string;
};
