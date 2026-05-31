/**
 * Resilient Apps Script call — wrap callAppsScript dengan circuit breaker
 * + write queue fallback.
 *
 * Decision matrix:
 *
 *   Circuit closed/half-open + call sukses → return data, breaker reset
 *   Circuit closed/half-open + call gagal  → record failure, throw
 *   Circuit open                           → enqueue (write only) atau throw (read)
 *
 * Use untuk write yang TIDAK boleh hilang (transaction.save, masterData.save,
 * import.execute). Untuk read (stock.get, history.search), tetap pakai
 * callAppsScript langsung — read failure cuma annoying, bukan data loss.
 */

import {
  callAppsScript,
  AppsScriptError,
  type AppsScriptAction,
} from './apps-script-client';
import {
  shouldAllowCall,
  recordSuccess,
  recordFailure,
} from './circuit-breaker';
import { enqueueWrite } from './write-queue';

const SERVICE_NAME = 'apps-script';

export interface ResilientResult<T> {
  /** True kalau call beneran sukses ke Apps Script. */
  ok: true;
  data: T;
  source: 'live';
}

export interface QueuedResult {
  ok: false;
  queued: true;
  queue_id: string;
  source: 'queue';
  message: string;
}

export type ResilientResponse<T> = ResilientResult<T> | QueuedResult;

/**
 * Resilient call: try Apps Script, fallback ke queue kalau down.
 *
 * Caller WAJIB cek `result.ok` — kalau false, write masuk queue dan akan
 * di-flush async. UX-wise: tampilkan toast "tersimpan, akan ter-sync" ke user.
 *
 * @param action Apps Script RPC action
 * @param payload data
 * @param opts.user pelaku (untuk audit trail di queue)
 * @param opts.allowQueueFallback default true. Set false kalau read-only call
 *   yang tidak boleh masuk queue.
 */
export async function callAppsScriptResilient<TData, TPayload = unknown>(
  action: AppsScriptAction,
  payload: TPayload,
  opts: { user?: string; allowQueueFallback?: boolean } = {},
): Promise<ResilientResponse<TData>> {
  const allowQueue = opts.allowQueueFallback !== false;

  // 1. Cek circuit
  const gate = await shouldAllowCall(SERVICE_NAME);

  if (!gate.allowed) {
    // Breaker open — langsung enqueue tanpa coba call
    if (!allowQueue) {
      throw new AppsScriptError(
        gate.reason || 'Circuit open, call refused',
        'CIRCUIT_OPEN',
      );
    }
    const item = await enqueueWrite({ action, payload, user: opts.user });
    return {
      ok: false,
      queued: true,
      queue_id: item.id,
      source: 'queue',
      message: `Backend sedang down, write masuk antrian (id ${item.id}). Akan ter-sync otomatis.`,
    };
  }

  // 2. Coba call live
  try {
    const data = await callAppsScript<TData, TPayload>(action, payload);
    await recordSuccess(SERVICE_NAME);
    return { ok: true, data, source: 'live' };
  } catch (err) {
    const newState = await recordFailure(SERVICE_NAME);

    // Klasifikasi error: kalau bukan transient (NETWORK / TIMEOUT / HTTP 5xx),
    // jangan enqueue — itu bug user input, bukan backend down.
    const isTransient =
      err instanceof AppsScriptError &&
      ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(err.code) &&
      (err.code !== 'HTTP_ERROR' || (err.statusCode ?? 0) >= 500);

    if (!isTransient || !allowQueue) {
      throw err;
    }

    // Transient + breaker baru open atau half-open gagal → fallback ke queue
    if (newState === 'open' || newState === 'half-open') {
      const item = await enqueueWrite({ action, payload, user: opts.user });
      return {
        ok: false,
        queued: true,
        queue_id: item.id,
        source: 'queue',
        message: `Backend tidak bisa dihubungi, write masuk antrian (id ${item.id}).`,
      };
    }

    throw err;
  }
}

/**
 * Helper untuk caller yang sudah pakai pola try/catch lama —
 * unwrap ResilientResponse jadi T atau throw kalau queued.
 *
 * Pakai kalau caller TIDAK butuh tahu apakah live atau queued (read-only flow).
 */
export async function callAppsScriptOrThrow<TData, TPayload = unknown>(
  action: AppsScriptAction,
  payload: TPayload,
  opts?: { user?: string },
): Promise<TData> {
  const result = await callAppsScriptResilient<TData, TPayload>(action, payload, {
    ...opts,
    allowQueueFallback: false,
  });
  if (result.ok) return result.data;
  // result.ok=false di sini hanya bisa terjadi via queue path; tapi karena
  // allowQueueFallback=false, callAppsScriptResilient akan throw sebelum return ini.
  throw new AppsScriptError(
    'queued' in result ? result.message : 'Unknown failure',
    'QUEUED',
  );
}
