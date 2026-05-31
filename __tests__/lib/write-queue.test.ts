// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueueWrite,
  dequeueWrite,
  requeueWrite,
  getQueueStats,
  _writeQueueInternals,
} from '@/lib/write-queue';
import { __resetKvForTesting } from '@/lib/kv-client';

beforeEach(() => {
  __resetKvForTesting();
  // Pastikan production guard tidak nyala
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('KV_REST_API_URL', '');
  vi.stubEnv('KV_REST_API_TOKEN', '');
});

describe('write-queue', () => {
  it('enqueue → dequeue FIFO order', async () => {
    const a = await enqueueWrite({ action: 'transaction.save', payload: { qty: 1 } });
    const b = await enqueueWrite({ action: 'transaction.save', payload: { qty: 2 } });
    const c = await enqueueWrite({ action: 'masterData.save', payload: { nama: 'X' } });

    expect(a.id).not.toBe(b.id);
    expect(b.id).not.toBe(c.id);
    expect(a.attempt).toBe(0);

    const stats = await getQueueStats();
    expect(stats.pending).toBe(3);
    expect(stats.oldest_enqueued_at).toBe(a.enqueued_at);

    // FIFO: a keluar dulu
    const popped1 = await dequeueWrite();
    expect(popped1?.id).toBe(a.id);
    const popped2 = await dequeueWrite();
    expect(popped2?.id).toBe(b.id);
    const popped3 = await dequeueWrite();
    expect(popped3?.id).toBe(c.id);

    const empty = await dequeueWrite();
    expect(empty).toBeNull();
  });

  it('requeueWrite increment attempt + drop kalau >= MAX_ATTEMPTS', async () => {
    const item = await enqueueWrite({ action: 'transaction.save', payload: {} });

    // Pop, fail, requeue — sampai MAX
    let current = item;
    for (let i = 0; i < _writeQueueInternals.MAX_ATTEMPTS - 1; i++) {
      const popped = await dequeueWrite();
      expect(popped).not.toBeNull();
      const requeued = await requeueWrite(popped!, 'simulated network error');
      expect(requeued).toBe(true);
      current = popped!;
    }

    // Final attempt — should drop
    const popped = await dequeueWrite();
    expect(popped).not.toBeNull();
    expect(popped!.attempt).toBe(_writeQueueInternals.MAX_ATTEMPTS - 1);
    const dropped = await requeueWrite(popped!, 'final fail');
    expect(dropped).toBe(false);

    // Queue sekarang kosong
    const empty = await dequeueWrite();
    expect(empty).toBeNull();
  });

  it('getQueueStats kosong → pending 0, oldest null', async () => {
    const stats = await getQueueStats();
    expect(stats.pending).toBe(0);
    expect(stats.oldest_enqueued_at).toBeNull();
  });

  it('item carry user info untuk audit', async () => {
    await enqueueWrite({
      action: 'transaction.save',
      payload: { qty: 5 },
      user: 'ii@kgm-group.com',
    });
    const popped = await dequeueWrite();
    expect(popped?.user).toBe('ii@kgm-group.com');
    expect(popped?.attempt).toBe(0);
    expect(popped?.enqueued_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
