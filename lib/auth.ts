/**
 * Auth library — typed wrapper untuk Phase 3 RPC.
 *
 * Flow login:
 *   1. checkDomain(email)     → cek domain di-allow
 *   2. requestOtp(email)      → trigger email OTP
 *   3. verifyOtp(email, otp)  → return session JWT
 *   4. (Vercel set httpOnly cookie dari JWT)
 *
 * Logout: logout(token) → invalidate.
 */

import type { ApiResponse } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

export type UserRole = 'Admin' | 'User' | 'Superadmin';

export interface CheckDomainResult {
  allowed: boolean;
  company_name?: string | null;
  reason?: string;
}

export interface VerifyOtpResult {
  token: string;
  user: {
    email: string;
    company_name: string | null;
    role?: UserRole;
    username?: string;
  };
  role?: UserRole;
  username?: string;
  expires_at: string;
}

export interface RequestOtpResult {
  ok: true;
  expires_in: number;
}

// ============================================================================
// Functions
// ============================================================================

async function postAuth<TData>(
  path: string,
  payload?: unknown,
): Promise<TData> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<TData> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Auth API HTTP ${res.status}`);
  }

  return json.data as TData;
}

/**
 * Check apakah email domain di-allow login.
 *
 * @example
 *   const { allowed } = await checkDomain('user@kgm-group.com');
 *   if (!allowed) showError('Domain tidak diizinkan');
 */
export async function checkDomain(email: string): Promise<CheckDomainResult> {
  if (!email) throw new Error('email wajib diisi');
  return postAuth<CheckDomainResult>('/api/auth/check-domain', {
    email: email.toLowerCase().trim(),
  });
}

/**
 * Request OTP code, dikirim via email.
 * Backend rate-limit: max 5 request/jam per email.
 */
export async function requestOtp(email: string): Promise<RequestOtpResult> {
  if (!email) throw new Error('email wajib diisi');
  return postAuth<RequestOtpResult>('/api/auth/request-otp', {
    email: email.toLowerCase().trim(),
  });
}

/**
 * Verify OTP code dan dapat session JWT.
 *
 * @returns Token JWT untuk di-set sebagai httpOnly cookie via Server Action.
 */
export async function verifyOtp(
  email: string,
  otp: string,
): Promise<VerifyOtpResult> {
  if (!email) throw new Error('email wajib diisi');
  if (!otp) throw new Error('otp wajib diisi');
  return postAuth<VerifyOtpResult>('/api/auth/verify-otp', {
    email: email.toLowerCase().trim(),
    otp: otp.trim(),
  });
}

/**
 * Logout — invalidate token di backend (best-effort, JWT stateless).
 * Vercel side juga harus delete httpOnly cookie.
 */
export async function logout(): Promise<{ ok: true }> {
  return postAuth<{ ok: true }>('/api/auth/logout');
}

// ============================================================================
// JWT decode (client-side, untuk read user info dari cookie)
// ============================================================================

export interface SessionPayload {
  sub: string;          // email
  company: string | null;
  role?: UserRole;      // Phase 5b: JWT carries role
  iat: number;
  exp: number;
}

/**
 * Decode JWT payload tanpa verify signature.
 *
 * IMPORTANT: untuk SECURITY-SENSITIVE check, verify di middleware Edge Runtime
 * pakai `jose` library (verify signature pakai SESSION_SECRET).
 *
 * Function ini hanya buat read user info di Server Component / RSC
 * dimana JWT sudah di-verify upstream oleh middleware.
 */
export function decodeJwtPayload(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // Replace base64url chars to base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    const padded = pad ? b64 + '='.repeat(4 - pad) : b64;
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Check apakah token expired berdasarkan exp claim.
 * Untuk decision UI level (tidak menggantikan signature verify).
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp < Math.floor(Date.now() / 1000);
}

// ============================================================================
// Current user helper (client-side, baca dari localStorage)
// ============================================================================

export interface CurrentUser {
  email: string;
  role: UserRole;
  username: string;
}

/**
 * Baca user info dari localStorage 'wms_user' (di-set di login page setelah verifyOtp).
 * Return null kalau belum login atau JSON corrupt.
 *
 * Pakai ini di Client Component untuk gating UI:
 *   const user = getCurrentUser();
 *   if (user?.role === 'Superadmin') showAdminPanel();
 */
export function getCurrentUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('wms_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CurrentUser>;
    if (!parsed.email) return null;
    return {
      email: parsed.email,
      role: parsed.role || 'User',
      username: parsed.username || parsed.email.split('@')[0],
    };
  } catch {
    return null;
  }
}

/**
 * Convenience: actor identity untuk inject ke RPC payload.
 * Backend handler validate role-nya untuk authorization.
 */
export function getActorContext(): { _actor_role: UserRole; _actor_email: string; _actor_username: string } {
  const u = getCurrentUser();
  return {
    _actor_role: u?.role || 'User',
    _actor_email: u?.email || '',
    _actor_username: u?.username || u?.email?.split('@')[0] || '',
  };
}
