/**
 * Proxy — verify session JWT di setiap request, redirect ke /login kalau invalid.
 *
 * Phase 3 (2026-05-31). Signature verify pakai jose.
 *
 * Public routes (skip auth):
 *   - /login, /api/auth/*  (login flow)
 *   - /_next/*, /public/*  (static assets)
 *   - /api/system/health   (health check publik)
 *   - /api/cron/*          (cron/background jobs)
 *
 * JWT_SECRET wajib di-set di Vercel env vars, sama persis dengan
 * Apps Script Script Properties.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'wms_session';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/system/health',
  '/api/cron',
  '/_next',
  '/favicon.ico',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

async function verifySession(token: string, secret: string) {
  const encoded = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, encoded, {
      algorithms: ['HS256'],
    });
    return payload as { sub: string; company: string | null; role: string; iat: number; exp: number };
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    console.error('[proxy] JWT_SECRET / SESSION_SECRET tidak set');
    return NextResponse.redirect(new URL('/login?reason=config', req.url));
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const session = await verifySession(token, secret);
  if (!session) {
    const res = NextResponse.redirect(new URL('/login?reason=expired', req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-email', session.sub);
  requestHeaders.set('x-user-role', session.role || 'User');
  if (session.company) {
    requestHeaders.set('x-user-company', session.company);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match semua route kecuali:
     * - api/auth/* (login flow)
     * - api/cron/* (background jobs)
     * - _next/static, _next/image (assets)
     * - favicon.ico
     */
    '/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)',
  ],
};
