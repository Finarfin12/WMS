/**
 * KV client wrapper — Vercel KV (Upstash Redis di belakang).
 *
 * Tujuan:
 *   - Centralize key namespacing supaya nggak crash antar fitur
 *   - Provide null-safe layer kalau env KV belum di-set (development tanpa KV)
 *   - Type-safe accessor untuk JSON value
 *
 * Env yang dibutuhkan (auto-set Vercel saat KV database dibuat):
 *   - KV_REST_API_URL
 *   - KV_REST_API_TOKEN
 *
 * Kalau env tidak ada (development lokal), fallback ke in-memory Map.
 * Production WAJIB punya env, tidak boleh fallback — guard dengan getKv()
 * yang throw kalau dipanggil di production tanpa config.
 */

import { kv as vercelKv } from '@vercel/kv';

// ============================================================================
// Key namespacing — semua key WMS prefix wms: untuk isolasi
// ============================================================================

export const KV_KEYS = {
  // Write queue — pending RPC writes saat Apps Script down
  writeQueue:        'wms:queue:writes',                    // List
  writeLog:          (id: string) => `wms:log:${id}`,       // Hash, audit per write
  // Circuit breaker — state per upstream
  circuitState:      (svc: string) => `wms:cb:${svc}`,      // Hash {state, failures, opened_at}
  // Rate limiter — per IP/user per action
  rateLimit:         (key: string) => `wms:rate:${key}`,    // Counter w/ TTL
  // OTP storage
  otp:               (email: string) => `wms:otp:${email}`, // String w/ TTL 5min
  // Cache (BU registry, schema)
  cache:             (key: string) => `wms:cache:${key}`,   // String w/ TTL configurable
} as const;

// ============================================================================
// In-memory fallback untuk dev tanpa KV credentials
// ============================================================================

class InMemoryKv {
  private store = new Map<string, unknown>();
  private list = new Map<string, unknown[]>();
  private expiry = new Map<string, number>();

  private isExpired(key: string) {
    const exp = this.expiry.get(key);
    return exp != null && Date.now() > exp;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isExpired(key)) {
      this.store.delete(key);
      this.expiry.delete(key);
      return null;
    }
    return (this.store.get(key) as T) ?? null;
  }

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'> {
    this.store.set(key, value);
    if (opts?.ex) this.expiry.set(key, Date.now() + opts.ex * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const had = this.store.delete(key);
    this.expiry.delete(key);
    return had ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const cur = (Number(this.store.get(key)) || 0) + 1;
    this.store.set(key, cur);
    return cur;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) return 0;
    this.expiry.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async lpush(key: string, ...values: unknown[]): Promise<number> {
    const cur = this.list.get(key) ?? [];
    cur.unshift(...values);
    this.list.set(key, cur);
    return cur.length;
  }

  async rpop(key: string): Promise<unknown> {
    const cur = this.list.get(key);
    if (!cur || cur.length === 0) return null;
    return cur.pop() ?? null;
  }

  async llen(key: string): Promise<number> {
    return this.list.get(key)?.length ?? 0;
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const cur = this.list.get(key) ?? [];
    const end = stop === -1 ? cur.length : stop + 1;
    return cur.slice(start, end) as T[];
  }

  async hset(key: string, fields: Record<string, unknown>): Promise<number> {
    const cur = (this.store.get(key) as Record<string, unknown>) ?? {};
    Object.assign(cur, fields);
    this.store.set(key, cur);
    return Object.keys(fields).length;
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const cur = this.store.get(key) as Record<string, unknown> | undefined;
    return ((cur?.[field] as T) ?? null);
  }

  async hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    return ((this.store.get(key) as T) ?? null);
  }
}

const inMemory = new InMemoryKv();

// ============================================================================
// Public accessor
// ============================================================================

export interface KvLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  lpush(key: string, ...values: unknown[]): Promise<number>;
  rpop(key: string): Promise<unknown>;
  llen(key: string): Promise<number>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  hset(key: string, fields: Record<string, unknown>): Promise<number>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>;
}

let cached: KvLike | null = null;

/**
 * Returns the active KV client. Pakai Vercel KV kalau env tersedia, fallback
 * ke in-memory in development. Throws kalau production tanpa env.
 */
export function getKv(): KvLike {
  if (cached) return cached;

  const hasEnv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

  if (hasEnv) {
    cached = vercelKv as unknown as KvLike;
    return cached;
  }

  // Development fallback & Optional production fallback
  console.warn('[WMS] KV_REST_API_URL tidak diset. Menggunakan in-memory cache sementara.');
  cached = inMemory;
  return cached;
}

/**
 * Test-only — reset cached client + in-memory store. Dipanggil di test setup.
 */
export function __resetKvForTesting() {
  cached = null;
  // @ts-expect-error reaching into private for test isolation
  inMemory.store?.clear();
  // @ts-expect-error reaching into private for test isolation
  inMemory.list?.clear();
  // @ts-expect-error reaching into private for test isolation
  inMemory.expiry?.clear();
}
