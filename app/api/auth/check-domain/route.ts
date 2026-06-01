import { NextResponse, type NextRequest } from 'next/server';
import { callAuthAction, errorResponse } from '../_helpers';
import type { ApiResponse } from '@/types/api';
import type { CheckDomainResult } from '@/lib/auth';

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<CheckDomainResult>>> {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;

  if (!body || typeof body.email !== 'string' || !body.email.includes('@')) {
    return errorResponse('Email tidak valid', 'VALIDATION_ERROR', 400);
  }

  const data = await callAuthAction<CheckDomainResult, { email: string }>(
    'auth.checkDomain',
    { email: body.email.toLowerCase().trim() },
  );

  if (data instanceof NextResponse) return data;
  return NextResponse.json({ success: true, data });
}
