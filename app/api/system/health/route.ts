/**
 * Health check endpoint — MASTER_SPEC §5.3
 * Public endpoint (tanpa auth) untuk monitoring uptime + connectivity.
 *
 * ADR-15: Backend pakai Apps Script Web App.
 * Phase 1 scope: cek environment vars + status (tidak panggil Apps Script — biar tetap fast).
 * Phase 5 expansion: opsional ping Apps Script kalau ?deep=true.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { ApiResponse } from '@/types/api';
import { pingAppsScript, AppsScriptError } from '@/lib/apps-script-client';

interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  env_check: {
    apps_script_url: boolean;
    apps_script_token: boolean;
    jwt_secret: boolean;
    vercel_kv: boolean;
  };
  apps_script?: {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  };
  version: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<HealthData>>> {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === 'true';

  const env_check = {
    apps_script_url: !!process.env.APPS_SCRIPT_WEB_APP_URL,
    apps_script_token: !!process.env.APPS_SCRIPT_INTERNAL_TOKEN,
    jwt_secret: !!process.env.JWT_SECRET,
    vercel_kv: !!(
      process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ),
  };

  const envOk = Object.values(env_check).every(Boolean);
  let status: HealthData['status'] = envOk ? 'ok' : 'degraded';
  let apps_script: HealthData['apps_script'] | undefined;

  // Deep check: ping Apps Script (hanya kalau env OK)
  if (deep && envOk) {
    try {
      const ping = await pingAppsScript();
      apps_script = { reachable: ping.ok, latencyMs: ping.latencyMs };
      if (!ping.ok) status = 'degraded';
    } catch (err) {
      const msg = err instanceof AppsScriptError ? err.message : String(err);
      apps_script = { reachable: false, error: msg };
      status = 'down';
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      status,
      timestamp: new Date().toISOString(),
      env_check,
      ...(apps_script && { apps_script }),
      version: '0.1.0',
    },
  });
}
