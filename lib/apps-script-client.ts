/**
 * Apps Script Web App client — RPC layer ke backend.
 *
 * ADR-15 (2026-05-31): Backend pakai Apps Script Web App, BUKAN Sheets API direct.
 * Alasan: full free, tidak perlu Google Cloud Service Account, reuse logic existing
 *         (Database.gs, Auth.gs, DocumentHelper.gs, Archiver.gs).
 *
 * Kontrak:
 * - Apps Script di-deploy sebagai Web App: "Execute as: Me, Access: Anyone"
 * - URL `/exec` accept POST request dengan body { action, payload, token }
 * - Header: X-Internal-Token harus match APPS_SCRIPT_INTERNAL_TOKEN di server
 * - Response shape: { success: boolean, data?: any, error?: { code, message } }
 *
 * Apps Script side (Code.gs) wajib implement doPost(e):
 *   - Parse JSON body
 *   - Verify e.parameter.token === SCRIPT_PROPERTY 'INTERNAL_TOKEN'
 *   - Switch (action) dispatch ke Database.gs / Auth.gs / dst
 *   - Return ContentService.createTextOutput(JSON.stringify(...))
 *
 * Phase 1 scope: skeleton client + healthcheck action.
 * Phase 2-5: action-handler dispatch table di Apps Script + matching method di sini.
 */

import type { ApiError } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

/** RPC actions yang akan diimplement di Apps Script side. Diperluas per fase. */
export type AppsScriptAction =
  // System
  | 'health'
  // BU Registry (Phase 2)
  | 'bu.list'
  | 'bu.get'
  | 'bu.save'
  | 'bu.delete'
  // Auth (Phase 3)
  | 'auth.checkDomain'
  | 'auth.requestOtp'
  | 'auth.verifyOtp'
  | 'auth.logout'
  // Transaction (Phase 4)
  | 'transaction.save'
  | 'transaction.void'
  | 'transaction.batchOutbound'
  // Stock & Master Data (Phase 4)
  | 'stock.get'
  | 'stock.rekap'
  | 'masterData.list'
  | 'masterData.save'
  | 'masterData.delete'
  | 'masterData.options'
  // Dashboard, History, Reports (Phase 4)
  | 'dashboard.live'
  | 'history.search'
  | 'history.rekap'
  | 'reports.profit'
  | 'reports.export'
  | 'pdf.generate'
  // Import (Phase 4d)
  | 'import.preview'
  | 'import.execute'
  | 'import.template'
  // Users (Phase 5a)
  | 'users.list'
  | 'users.save'
  | 'users.delete'
  | 'users.unlock'
  | 'users.resetPassword'
  // BU Logo (Phase 5b)
  | 'bu.uploadLogo'
  // System ops (Phase 5)
  | 'system.reconcile'
  | 'system.verifyIntegrity'
  | 'audit.list';

/** Standard response dari Apps Script Web App */
export interface AppsScriptResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/** Error class untuk failure pada layer Apps Script call */
export class AppsScriptError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause_?: unknown,
  ) {
    super(message);
    this.name = 'AppsScriptError';
  }
}

// ============================================================================
// Config
// ============================================================================

interface CallOptions {
  /** Timeout per request in ms. Apps Script max execution = 6 menit. */
  timeoutMs?: number;
  /** Retry on network failure or 5xx. Default 1 retry (= 2 attempts total). */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 1;
const RPC_PROXY_PATH = '/api/rpc';

function getConfig() {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  const token = process.env.APPS_SCRIPT_INTERNAL_TOKEN;

  if (!url) {
    throw new AppsScriptError(
      'APPS_SCRIPT_WEB_APP_URL belum diset. Lihat .env.example.',
      'CONFIG_MISSING',
    );
  }
  if (!token) {
    throw new AppsScriptError(
      'APPS_SCRIPT_INTERNAL_TOKEN belum diset. Lihat .env.example.',
      'CONFIG_MISSING',
    );
  }

  return { url, token };
}

async function callAppsScriptViaApi<TData = unknown, TPayload = unknown>(
  action: AppsScriptAction,
  payload?: TPayload,
  options: CallOptions = {},
): Promise<TData> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(RPC_PROXY_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const json = (await res.json()) as {
        success: boolean;
        data?: TData;
        error?: ApiError;
      };

      if (!res.ok || !json.success) {
        const message =
          json.error?.message ?? `Server RPC HTTP ${res.status}`;
        const code = json.error?.code ?? 'RPC_ERROR';
        const error = new AppsScriptError(message, code, res.status);

        if (res.status >= 500 && attempt < retries) {
          lastError = error;
          continue;
        }

        throw error;
      }

      return json.data as TData;
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new AppsScriptError(
          `Server RPC timeout setelah ${timeoutMs}ms`,
          'TIMEOUT',
          undefined,
          err,
        );
        if (attempt < retries) continue;
        throw lastError;
      }

      if (err instanceof AppsScriptError) throw err;

      lastError = new AppsScriptError(
        `Network error calling Server RPC: ${(err as Error).message}`,
        'NETWORK_ERROR',
        undefined,
        err,
      );
      if (attempt < retries) continue;
      throw lastError;
    }
  }

  throw lastError ?? new AppsScriptError('Unknown error', 'UNKNOWN_ERROR');
}

// ============================================================================
// Core RPC
// ============================================================================

/**
 * Call Apps Script Web App dengan action + payload.
 *
 * @example
 *   const buList = await callAppsScript<BUConfig[]>('bu.list');
 *   const stock = await callAppsScript<StockData>('stock.get', { bu: 'fabric' });
 *
 * @throws {AppsScriptError} Jika config missing, network error, timeout, atau response invalid.
 */
export async function callAppsScript<TData = unknown, TPayload = unknown>(
  action: AppsScriptAction,
  payload?: TPayload,
  options: CallOptions = {},
): Promise<TData> {
  if (typeof window !== 'undefined') {
    return callAppsScriptViaApi<TData, TPayload>(action, payload, options);
  }

  const { url, token } = getConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': token,
        },
        body: JSON.stringify({ action, payload, token }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Non-2xx — Apps Script sering return 200 walaupun ada error,
      // tapi kalau benar 5xx, biasanya networking/quota issue.
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          lastError = new AppsScriptError(
            `Apps Script HTTP ${res.status}, retrying...`,
            'HTTP_ERROR',
            res.status,
          );
          continue;
        }
        throw new AppsScriptError(
          `Apps Script HTTP ${res.status}`,
          'HTTP_ERROR',
          res.status,
        );
      }

      const json = (await res.json()) as AppsScriptResponse<TData>;

      if (!json.success) {
        throw new AppsScriptError(
          json.error?.message ?? 'Unknown error from Apps Script',
          json.error?.code ?? 'UNKNOWN_ERROR',
          res.status,
        );
      }

      return json.data as TData;
    } catch (err) {
      clearTimeout(timer);

      // AbortError (timeout) — retry kalau masih ada attempt
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new AppsScriptError(
          `Apps Script timeout setelah ${timeoutMs}ms`,
          'TIMEOUT',
          undefined,
          err,
        );
        if (attempt < retries) continue;
        throw lastError;
      }

      // Apps Script error yang kita raise sendiri — propagate
      if (err instanceof AppsScriptError) throw err;

      // Network/fetch error — retry kalau masih ada attempt
      lastError = new AppsScriptError(
        `Network error calling Apps Script: ${(err as Error).message}`,
        'NETWORK_ERROR',
        undefined,
        err,
      );
      if (attempt < retries) continue;
      throw lastError;
    }
  }

  // Tidak akan tercapai (loop selalu return atau throw), tapi TypeScript butuh
  throw lastError ?? new AppsScriptError('Unknown error', 'UNKNOWN_ERROR');
}

/**
 * Healthcheck ringan ke Apps Script — test konektivitas + secret.
 * Apps Script harus implement action 'health' yang return { ok: true, timestamp }.
 */
export async function pingAppsScript(): Promise<{
  ok: boolean;
  timestamp: string;
  latencyMs: number;
}> {
  const start = Date.now();
  const data = await callAppsScript<{ ok: boolean; timestamp: string }>(
    'health',
    undefined,
    { timeoutMs: 10_000, retries: 0 },
  );
  return { ...data, latencyMs: Date.now() - start };
}
