// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldAllowCall,
  recordSuccess,
  recordFailure,
  getCircuitInfo,
  resetCircuit,
} from '@/lib/circuit-breaker';
import { __resetKvForTesting } from '@/lib/kv-client';

const SVC = 'apps-script';

beforeEach(() => {
  __resetKvForTesting();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('KV_REST_API_URL', '');
  vi.stubEnv('KV_REST_API_TOKEN', '');
});

describe('circuit-breaker', () => {
  it('default state closed, allow all calls', async () => {
    const gate = await shouldAllowCall(SVC);
    expect(gate.allowed).toBe(true);
    expect(gate.state).toBe('closed');

    const info = await getCircuitInfo(SVC);
    expect(info.state).toBe('closed');
    expect(info.failures).toBe(0);
  });

  it('5 failure beruntun → state open, refuse call', async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailure(SVC);
    }
    const info = await getCircuitInfo(SVC);
    expect(info.state).toBe('open');
    expect(info.failures).toBe(5);

    const gate = await shouldAllowCall(SVC);
    expect(gate.allowed).toBe(false);
    expect(gate.state).toBe('open');
    expect(gate.reason).toMatch(/Cooldown/);
  });

  it('success di state closed reset failure count', async () => {
    await recordFailure(SVC);
    await recordFailure(SVC);
    let info = await getCircuitInfo(SVC);
    expect(info.failures).toBe(2);

    await recordSuccess(SVC);
    info = await getCircuitInfo(SVC);
    expect(info.failures).toBe(0);
    expect(info.state).toBe('closed');
  });

  it('open → half-open setelah cooldown', async () => {
    // Buka breaker
    for (let i = 0; i < 5; i++) await recordFailure(SVC);
    let info = await getCircuitInfo(SVC);
    expect(info.state).toBe('open');

    // Mock waktu jalan ke depan 31 detik (cooldown 30s)
    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      const gate = await shouldAllowCall(SVC);
      expect(gate.allowed).toBe(true);
      expect(gate.state).toBe('half-open');
    } finally {
      Date.now = realNow;
    }

    info = await getCircuitInfo(SVC);
    expect(info.state).toBe('half-open');
  });

  it('half-open trial sukses → state closed', async () => {
    for (let i = 0; i < 5; i++) await recordFailure(SVC);

    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      await shouldAllowCall(SVC); // transisi half-open
    } finally {
      Date.now = realNow;
    }

    await recordSuccess(SVC);
    const info = await getCircuitInfo(SVC);
    expect(info.state).toBe('closed');
    expect(info.failures).toBe(0);
  });

  it('half-open trial gagal → kembali ke open', async () => {
    for (let i = 0; i < 5; i++) await recordFailure(SVC);

    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      await shouldAllowCall(SVC); // half-open
    } finally {
      Date.now = realNow;
    }

    const newState = await recordFailure(SVC);
    expect(newState).toBe('open');

    const info = await getCircuitInfo(SVC);
    expect(info.state).toBe('open');
  });

  it('resetCircuit bisa dipakai admin override', async () => {
    for (let i = 0; i < 5; i++) await recordFailure(SVC);
    let info = await getCircuitInfo(SVC);
    expect(info.state).toBe('open');

    await resetCircuit(SVC);
    info = await getCircuitInfo(SVC);
    expect(info.state).toBe('closed');
    expect(info.failures).toBe(0);
  });
});
