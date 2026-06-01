import { NextResponse } from 'next/server';
import {
  AppsScriptError,
  callAppsScript,
  type AppsScriptAction,
} from '@/lib/apps-script-client';
import type { ApiResponse } from '@/types/api';

export const SESSION_COOKIE_NAME = 'wms_session';

export function errorResponse(
  message: string,
  code: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function callAuthAction<TData, TPayload>(
  action: AppsScriptAction,
  payload: TPayload,
): Promise<TData | NextResponse<ApiResponse<never>>> {
  try {
    return await callAppsScript<TData, TPayload>(action, payload);
  } catch (err) {
    if (err instanceof AppsScriptError) {
      const status =
        err.code === 'CONFIG_MISSING' ? 500 : err.statusCode ?? 502;
      return errorResponse(err.message, err.code, status);
    }

    return errorResponse(String(err), 'UNKNOWN_ERROR', 500);
  }
}

export function parseJwtExp(token: string): Date | undefined {
  const [, payload] = token.split('.');
  if (!payload) return undefined;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    return decoded.exp ? new Date(decoded.exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}
