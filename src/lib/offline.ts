import { openDB } from 'idb';
import { nanoid } from 'nanoid';
import { api } from './api';
import type { OfflineOperation } from '../types';

const dbPromise = openDB('el-rancho-offline', 1, {
  upgrade(db) {
    db.createObjectStore('operations', { keyPath: 'id' });
  }
});

export async function enqueueOperation(operation: Omit<OfflineOperation, 'id' | 'createdAt'>) {
  const db = await dbPromise;
  const queued: OfflineOperation = {
    ...operation,
    id: nanoid(),
    createdAt: new Date().toISOString()
  };
  await db.put('operations', queued);
  return queued;
}

export async function getQueuedOperations() {
  const db = await dbPromise;
  return db.getAll('operations') as Promise<OfflineOperation[]>;
}

export async function clearQueuedOperations(ids: string[]) {
  const db = await dbPromise;
  const tx = db.transaction('operations', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function syncQueuedOperations() {
  const operations = await getQueuedOperations();
  if (operations.length === 0) return { synced: 0 };

  await api('/api/sync', {
    method: 'POST',
    json: { operations: operations.map(({ type, payload }) => ({ type, payload })) }
  });
  await clearQueuedOperations(operations.map((operation) => operation.id));
  return { synced: operations.length };
}
