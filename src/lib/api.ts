import type { AdminUser, AppNotification, CollectionPayload, CreateUserPayload, ExpensePayload, Role, SalePayload, User } from '../types';

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

export function getNotifications() {
  return api<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications');
}

export function markNotificationsRead() {
  return api<{ ok: boolean }>('/api/notifications/read', { method: 'POST' });
}
