/**
 * Persistent circuit breaker — three-state (closed/open/half-open) per service.
 *
 * State stored in KV supaya konsisten antar Vercel function instance.
 *
 * Use case:
 *   - Apps Script call gagal 5x berturut-turut → buka breaker (skip call selama
 *     30 detik, langsung enqueue ke write-queue)
 *   - Setelah cooldown → half-open (1 trial call)
 *   - Kalau trial sukses → tutup breaker; kalau gagal → buka lagi
 *
 * State machine:
 *   closed   ↘ failure_count >= threshold → open
 *   open     ↘ now > opened_at + cooldown → half-open
 *   half-open → success → closed
 *   half-open → failure → open (reset cooldown)
 */

import { getKv, KV_KEYS } from './kv-client';

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitConfig {
  failureThreshold: number;    // berapa failure sebelum open
  cooldownSeconds: number;     // open → half-open setelah berapa detik
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  cooldownSeconds: 30,
};

interface CircuitData {
  state: CircuitState;
  failures: number;
  opened_at: string | null;    // ISO timestamp
}

async function readState(service: string): Promise<CircuitData> {
  const kv = getKv();
  const data = await kv.hgetall<Record<string, unknown>>(KV_KEYS.circuitState(service));
  if (!data) {
    return { state: 'closed', failures: 0, opened_at: null };
  }
  return {
    state: (data.state as CircuitState) || 'closed',
    failures: Number(data.failures) || 0,
    opened_at: (data.opened_at as string) || null,
  };
}

async function writeState(service: string, data: CircuitData): Promise<void> {
  const kv = getKv();
  await kv.hset(KV_KEYS.circuitState(service), {
    state: data.state,
    failures: data.failures,
    opened_at: data.opened_at ?? '',
  });
}

/**
 * Cek apakah service boleh dipanggil. Return true kalau boleh, false kalau breaker open.
 *
 * Side effect: kalau open dan sudah lewat cooldown, transisi ke half-open.
 */
export async function shouldAllowCall(
  service: string,
  config: CircuitConfig = DEFAULT_CONFIG,
): Promise<{ allowed: boolean; state: CircuitState; reason?: string }> {
  const data = await readState(service);

  if (data.state === 'closed') {
    return { allowed: true, state: 'closed' };
  }

  if (data.state === 'open') {
    const openedAt = data.opened_at ? new Date(data.opened_at).getTime() : 0;
    const cooldownMs = config.cooldownSeconds * 1000;
    if (Date.now() - openedAt >= cooldownMs) {
      // Transisi ke half-open
      await writeState(service, {
        state: 'half-open',
        failures: data.failures,
        opened_at: data.opened_at,
      });
      return { allowed: true, state: 'half-open' };
    }
    return {
      allowed: false,
      state: 'open',
      reason: `Circuit open ${service}. Cooldown sampai ${new Date(openedAt + cooldownMs).toISOString()}`,
    };
  }

  // half-open — izinkan 1 call trial
  return { allowed: true, state: 'half-open' };
}

/**
 * Catat success — reset failure count, tutup breaker kalau half-open.
 */
export async function recordSuccess(service: string): Promise<void> {
  await writeState(service, {
    state: 'closed',
    failures: 0,
    opened_at: null,
  });
}

/**
 * Catat failure — increment counter, buka breaker kalau threshold tercapai.
 */
export async function recordFailure(
  service: string,
  config: CircuitConfig = DEFAULT_CONFIG,
): Promise<CircuitState> {
  const data = await readState(service);
  const failures = data.failures + 1;

  if (failures >= config.failureThreshold || data.state === 'half-open') {
    // Threshold tercapai ATAU half-open trial gagal → buka breaker
    await writeState(service, {
      state: 'open',
      failures,
      opened_at: new Date().toISOString(),
    });
    return 'open';
  }

  await writeState(service, {
    state: data.state,
    failures,
    opened_at: data.opened_at,
  });
  return data.state;
}

/**
 * Inspect — untuk health endpoint / monitoring.
 */
export async function getCircuitInfo(service: string): Promise<CircuitData> {
  return readState(service);
}

/**
 * Force reset — untuk admin override.
 */
export async function resetCircuit(service: string): Promise<void> {
  await writeState(service, { state: 'closed', failures: 0, opened_at: null });
}

export const _circuitBreakerInternals = {
  DEFAULT_CONFIG,
};
