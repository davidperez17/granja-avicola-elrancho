import type {
  AdminUser,
  AppNotification,
  CollectionPayload,
  CollectionRecord,
  CreateUserPayload,
  ExpensePayload,
  ExpenseRecord,
  Galpon,
  GalponHistory,
  GalponOverview,
  RegistroItem,
  ReportData,
  Role,
  SalePayload,
  SaleRecord,
  User
} from '../types';

type ApiOptions = RequestInit & { json?: unknown };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.json ? JSON.stringify(options.json) : options.body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo completar la accion.');
  }
  return data as T;
}

export function getMe() {
  return api<{ user: User }>('/api/auth/me');
}

export function login(email: string, password: string) {
  return api<{ user: User }>('/api/auth/login', { method: 'POST', json: { email, password } });
}

export function logout() {
  return api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function forgotPassword(email: string) {
  return api<{ message: string; devToken?: string }>('/api/auth/forgot-password', { method: 'POST', json: { email } });
}

export function resetPassword(token: string, password: string) {
  return api<{ message: string }>('/api/auth/reset-password', { method: 'POST', json: { token, password } });
}

export function getDashboard() {
  return api<{
    collection: Record<string, number>;
    sales: { total: number; count: number };
    expenses: { total: number; count: number };
    inventory: Array<{ category: string; quantity: number }>;
    profit: number;
    profitYesterday: number;
    birds: number;
  }>('/api/dashboard/today');
}

export function postCollection(payload: CollectionPayload) {
  return api('/api/collections', { method: 'POST', json: payload });
}

export function postSale(payload: SalePayload) {
  return api('/api/sales', { method: 'POST', json: payload });
}

export function postExpense(payload: ExpensePayload) {
  return api('/api/expenses', { method: 'POST', json: payload });
}

export function getReports(period: 7 | 30 | 365) {
  return api<ReportData>(`/api/reports?period=${period}`);
}

export function getInventory() {
  return api<{ inventory: Array<{ category: string; quantity: number; updated_at: string }> }>('/api/inventory');
}

export function getUsers() {
  return api<{ users: AdminUser[] }>('/api/users');
}

export function createUser(payload: CreateUserPayload) {
  return api<{ user: AdminUser }>('/api/users', { method: 'POST', json: payload });
}

export function updateUser(id: string, changes: { role?: Role; active?: boolean }) {
  return api<{ user: AdminUser }>(`/api/users/${id}`, { method: 'PATCH', json: changes });
}

export function adjustInventory(category: string, quantity: number) {
  return api<{ inventory: { category: string; quantity: number; updated_at: string } }>(`/api/inventory/${category}`, {
    method: 'PATCH',
    json: { quantity }
  });
}

export function getGalpones(all = false) {
  return api<{ galpones: Galpon[] }>(`/api/galpones${all ? '?all=true' : ''}`);
}

export function createGalpon(payload: { name: string; birdCount: number }) {
  return api<{ galpon: Galpon }>('/api/galpones', { method: 'POST', json: payload });
}

export function updateGalpon(id: string, changes: { name?: string; birdCount?: number; active?: boolean }) {
  return api<{ galpon: Galpon }>(`/api/galpones/${id}`, { method: 'PATCH', json: changes });
}

export function getGalponesOverview() {
  return api<{ galpones: GalponOverview[] }>('/api/galpones/overview');
}

export function getGalponHistory(id: string, period: 7 | 30 | 365) {
  return api<GalponHistory>(`/api/galpones/${id}/history?period=${period}`);
}

export function postBirdEvent(id: string, payload: { type: 'ingreso' | 'muerte'; quantity: number; reason?: string; date?: string }) {
  return api<{ galpon: Galpon }>(`/api/galpones/${id}/birds`, { method: 'POST', json: payload });
}

export function voidBirdEvent(eventId: string) {
  return api<{ ok: boolean }>(`/api/galpones/birds/${eventId}`, { method: 'DELETE' });
}

export function getRegistros() {
  return api<{ registros: RegistroItem[] }>('/api/registros');
}

// Historial completo (admin)
export function getCollectionsAll() {
  return api<{ collections: CollectionRecord[] }>('/api/collections?all=true');
}

export function getSalesAll() {
  return api<{ sales: SaleRecord[] }>('/api/sales?all=true');
}

export function getExpensesAll() {
  return api<{ expenses: ExpenseRecord[] }>('/api/expenses?all=true');
}

// Editar / anular (admin)
export function updateCollection(id: string, payload: CollectionPayload) {
  return api(`/api/collections/${id}`, { method: 'PATCH', json: payload });
}

export function voidCollection(id: string) {
  return api(`/api/collections/${id}`, { method: 'DELETE' });
}

export function updateSale(id: string, payload: SalePayload) {
  return api(`/api/sales/${id}`, { method: 'PATCH', json: payload });
}

export function voidSale(id: string) {
  return api(`/api/sales/${id}`, { method: 'DELETE' });
}

export function updateExpense(id: string, payload: ExpensePayload) {
  return api(`/api/expenses/${id}`, { method: 'PATCH', json: payload });
}

export function voidExpense(id: string) {
  return api(`/api/expenses/${id}`, { method: 'DELETE' });
}

export function getNotifications() {
  return api<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications');
}

export function markNotificationsRead() {
  return api<{ ok: boolean }>('/api/notifications/read', { method: 'POST' });
}
