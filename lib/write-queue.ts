/**
 * Persistent write queue — buffer Apps Script RPC writes saat backend down.
 *
 * Pattern: producer pushes ke list di KV, cron job (atau next request) pops
 * dan flush ke Apps Script. Tidak hilang saat Vercel cold start.
 *
 * Use case di WMS:
 *   - User input transaksi → callAppsScript('transaction.save', ...)
 *   - Apps Script down (deploy / quota / network) → enqueue ke KV
 *   - Cron /api/cron/flush-queue jalan tiap menit → drain queue
 *
 * Tradeoff:
 *   - Eventual consistency: write yang ter-queue tidak langsung terlihat di Sheets
 *   - User feedback: app harus tampilkan "queued — akan ter-sync" supaya jelas
 *   - Tidak cocok untuk read (stale data risk)
 */

import { getKv, KV_KEYS } from './kv-client';

export interface QueuedWrite {
  id: string;                 // unique untuk idempotency (UUID-ish)
  action: string;             // RPC action name (e.g. 'transaction.save')
  payload: unknown;
  user?: string;              // pelaku (untuk audit)
  enqueued_at: string;        // ISO timestamp
  attempt: number;            // increment per retry
  last_error?: string;
}

const MAX_QUEUE_SIZE = 1000;     // safety — kalau overload, refuse new pushes
const MAX_ATTEMPTS = 5;

/**
 * Generate id unik untuk write — bukan crypto-grade, cukup untuk idempotency.
 */
function genId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Enqueue 1 write untuk diproses async.
 * Throws kalau queue penuh (>= MAX_QUEUE_SIZE).
 */
export async function enqueueWrite(input: {
  action: string;
  payload: unknown;
  user?: string;
}): Promise<QueuedWrite> {
  const kv = getKv();
  const len = await kv.llen(KV_KEYS.writeQueue);
  if (len >= MAX_QUEUE_SIZE) {
    throw new Error(`Write queue penuh (${len}/${MAX_QUEUE_SIZE}). Cek backend dan flush.`);
  }

  const item: QueuedWrite = {
    id: genId(),
    action: input.action,
    payload: input.payload,
    user: input.user,
    enqueued_at: new Date().toISOString(),
    attempt: 0,
  };

  await kv.lpush(KV_KEYS.writeQueue, JSON.stringify(item));
  return item;
}

/**
 * Pop 1 write dari queue (FIFO — rpop dari list yang di-lpush).
 * Returns null kalau queue kosong.
 */
export async function dequeueWrite(): Promise<QueuedWrite | null> {
  const kv = getKv();
  const raw = await kv.rpop(KV_KEYS.writeQueue);
  if (!raw) return null;

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as QueuedWrite;
    } catch {
      return null; // corrupted — drop
    }
  }
  return raw as QueuedWrite;
}

/**
 * Re-queue write yang failed (increment attempt). Drop kalau attempt >= MAX_ATTEMPTS.
 *
 * Returns true kalau di-requeue, false kalau di-drop.
 */
export async function requeueWrite(item: QueuedWrite, error: string): Promise<boolean> {
  const next: QueuedWrite = {
    ...item,
    attempt: item.attempt + 1,
    last_error: error,
  };

  if (next.attempt >= MAX_ATTEMPTS) {
    // Pindahkan ke dead-letter log (write log) untuk audit manual
    const kv = getKv();
    await kv.hset(KV_KEYS.writeLog(item.id), {
      action: item.action,
      payload: JSON.stringify(item.payload),
      enqueued_at: item.enqueued_at,
      final_error: error,
      dropped_at: new Date().toISOString(),
      attempts: next.attempt,
    });
    return false;
  }

  const kv = getKv();
  await kv.lpush(KV_KEYS.writeQueue, JSON.stringify(next));
  return true;
}

/**
 * Inspect queue — tidak destruktif. Untuk health endpoint / dashboard.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  oldest_enqueued_at: string | null;
}> {
  const kv = getKv();
  const pending = await kv.llen(KV_KEYS.writeQueue);
  if (pending === 0) {
    return { pending: 0, oldest_enqueued_at: null };
  }

  // FIFO: rpop dari kanan, jadi oldest = item paling kanan = lrange(-1, -1)
  const oldest = await kv.lrange<string>(KV_KEYS.writeQueue, -1, -1);
  if (oldest.length === 0) return { pending, oldest_enqueued_at: null };

  try {
    const parsed = typeof oldest[0] === 'string' ? JSON.parse(oldest[0]) : oldest[0];
    return { pending, oldest_enqueued_at: (parsed as QueuedWrite).enqueued_at };
  } catch {
    return { pending, oldest_enqueued_at: null };
  }
}

export const _writeQueueInternals = {
  MAX_QUEUE_SIZE,
  MAX_ATTEMPTS,
};
