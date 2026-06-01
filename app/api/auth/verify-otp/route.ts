import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  callAuthAction,
  errorResponse,
  parseJwtExp,
  verifySessionJwt,
} from '../_helpers';
import type { ApiResponse } from '@/types/api';
import type { VerifyOtpResult } from '@/lib/auth';

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<VerifyOtpResult>>> {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    otp?: unknown;
  } | null;

  if (!body || typeof body.email !== 'string' || !body.email.includes('@')) {
    return errorResponse('Email tidak valid', 'VALIDATION_ERROR', 400);
  }
  if (typeof body.otp !== 'string' || body.otp.trim().length !== 6) {
    return errorResponse('OTP harus 6 digit', 'VALIDATION_ERROR', 400);
  }

  const data = await callAuthAction<
    VerifyOtpResult,
    { email: string; otp: string }
  >('auth.verifyOtp', {
    email: body.email.toLowerCase().trim(),
    otp: body.otp.trim(),
  });

  if (data instanceof NextResponse) return data;

  const jwtValid = await verifySessionJwt(data.token);
  if (!jwtValid) {
    return errorResponse(
      'OTP benar, tapi token login ditolak Vercel. Pastikan JWT_SECRET di Vercel sama persis dengan SESSION_SECRET di Apps Script.',
      'SESSION_SECRET_MISMATCH',
      500,
    );
  }

  const response = NextResponse.json({ success: true, data });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: data.token,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: parseJwtExp(data.token),
  });

  return response;
}
