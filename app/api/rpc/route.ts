import { NextResponse, type NextRequest } from 'next/server';
import {
  AppsScriptError,
  callAppsScript,
  type AppsScriptAction,
} from '@/lib/apps-script-client';
import type { ApiResponse } from '@/types/api';

const AUTH_ACTIONS = new Set<AppsScriptAction>([
  'auth.checkDomain',
  'auth.requestOtp',
  'auth.verifyOtp',
  'auth.logout',
]);

function errorResponse(
  message: string,
  code: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<unknown>>> {
  let body: { action?: unknown; payload?: unknown };

  try {
    body = (await request.json()) as { action?: unknown; payload?: unknown };
  } catch {
    return errorResponse('Body JSON tidak valid', 'VALIDATION_ERROR', 400);
  }

  if (typeof body.action !== 'string') {
    return errorResponse('action wajib diisi', 'VALIDATION_ERROR', 400);
  }

  const action = body.action as AppsScriptAction;
  if (AUTH_ACTIONS.has(action)) {
    return errorResponse(
      'Auth action harus lewat /api/auth',
      'VALIDATION_ERROR',
      400,
    );
  }

  // Securely inject actor context from request headers verified by middleware
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role');
  if (userEmail && userRole) {
    if (!body.payload || typeof body.payload !== 'object') {
      body.payload = {};
    }
    const payload = body.payload as Record<string, unknown>;
    payload._actor_email = userEmail;
    payload._actor_role = userRole;
  }

  try {
    const data = await callAppsScript(action, body.payload);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof AppsScriptError) {
      const status =
        err.code === 'CONFIG_MISSING' ? 500 : err.statusCode ?? 502;
      return errorResponse(err.message, err.code, status);
    }

    return errorResponse(String(err), 'UNKNOWN_ERROR', 500);
  }
}
