// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  callAppsScript,
  AppsScriptError,
} from '@/lib/apps-script-client';

const ORIGINAL_ENV = { ...process.env };

describe('callAppsScript', () => {
  beforeEach(() => {
    process.env.APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/TEST/exec';
    process.env.APPS_SCRIPT_INTERNAL_TOKEN = 'test-token-secret';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('returns data on successful call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { ok: true, timestamp: 'iso' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await callAppsScript<{ ok: boolean; timestamp: string }>(
      'health',
    );
    expect(result).toEqual({ ok: true, timestamp: 'iso' });
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe('https://script.google.com/macros/s/TEST/exec');
    expect((calledInit as RequestInit).method).toBe('POST');
    expect((calledInit as RequestInit).headers).toMatchObject({
      'X-Internal-Token': 'test-token-secret',
    });
  });

  it('throws AppsScriptError when Apps Script returns success=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: 'BU tidak ditemukan' },
        }),
        { status: 200 },
      ),
    );

    try {
      await callAppsScript('bu.get', { id: 'x' });
      expect.fail('Expected callAppsScript to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppsScriptError);
      expect((err as AppsScriptError).message).toBe('BU tidak ditemukan');
      expect((err as AppsScriptError).code).toBe('NOT_FOUND');
    }
  });

  it('throws CONFIG_MISSING when env not set', async () => {
    delete process.env.APPS_SCRIPT_WEB_APP_URL;
    await expect(callAppsScript('health')).rejects.toThrow(/APPS_SCRIPT_WEB_APP_URL/);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Server Error', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: 'recovered' }), { status: 200 }),
      );

    const result = await callAppsScript<string>('health');
    expect(result).toBe('recovered');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
