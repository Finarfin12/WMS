import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  callAuthAction,
} from '../_helpers';
import type { ApiResponse } from '@/types/api';

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await callAuthAction<{ ok: true }, { token: string }>('auth.logout', {
      token,
    });
  }

  const response = NextResponse.json({
    success: true,
    data: { ok: true as const },
  });
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
