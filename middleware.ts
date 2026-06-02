import { NextRequest } from 'next/server';
import { proxy } from './lib/auth-proxy';

export async function middleware(req: NextRequest) {
  return proxy(req);
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
