import { api } from './api';

export type PushStatus = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  installed: boolean;
  ios: boolean;
};

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function getPushStatus(): Promise<PushStatus> {
  const supported = pushSupported();
  if (!supported) {
    return { supported: false, permission: 'unsupported', subscribed: false, installed: isStandalone(), ios: isIOS() };
  }
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscribed = Boolean(await registration.pushManager.getSubscription());
  } catch {
    subscribed = false;
  }
  return { supported: true, permission: Notification.permission, subscribed, installed: isStandalone(), ios: isIOS() };
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'no-soportado' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permiso-denegado' };

  const { publicKey } = await api<{ publicKey: string }>('/api/push/public-key');
  if (!publicKey) return { ok: false, reason: 'sin-configurar' };

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));

  await api('/api/push/subscribe', { method: 'POST', json: subscription.toJSON() });
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: subscription.endpoint } }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
