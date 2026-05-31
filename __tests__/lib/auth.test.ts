// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkDomain,
  requestOtp,
  verifyOtp,
  logout,
  decodeJwtPayload,
  isTokenExpired,
} from '@/lib/auth';

const ORIGINAL_ENV = { ...process.env };

function mockOk<T>(data: T) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockErr(code: string, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('lib/auth', () => {
  beforeEach(() => {
    process.env.APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/TEST/exec';
    process.env.APPS_SCRIPT_INTERNAL_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  // ============================================================================
  // checkDomain
  // ============================================================================
  describe('checkDomain', () => {
    it('returns allowed=true with company_name', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ allowed: true, company_name: 'KGM Group' }),
      );

      const result = await checkDomain('User@KGM-Group.com');
      expect(result).toEqual({ allowed: true, company_name: 'KGM Group' });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('auth.checkDomain');
      expect(body.payload.email).toBe('user@kgm-group.com'); // lowercased
    });

    it('returns allowed=false for unknown domain', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ allowed: false }),
      );

      const result = await checkDomain('user@random.com');
      expect(result.allowed).toBe(false);
    });

    it('throws on empty email', async () => {
      await expect(checkDomain('')).rejects.toThrow('email wajib');
    });
  });

  // ============================================================================
  // requestOtp
  // ============================================================================
  describe('requestOtp', () => {
    it('triggers OTP send + returns expires_in', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ ok: true, expires_in: 300 }),
      );

      const result = await requestOtp('user@kgm-group.com');
      expect(result).toEqual({ ok: true, expires_in: 300 });
    });

    it('propagates rate-limit error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockErr('INTERNAL_ERROR', 'Terlalu banyak request OTP. Coba lagi dalam 1 jam.'),
      );

      await expect(requestOtp('user@kgm-group.com')).rejects.toThrow(
        'Terlalu banyak request OTP',
      );
    });
  });

  // ============================================================================
  // verifyOtp
  // ============================================================================
  describe('verifyOtp', () => {
    it('returns JWT + user info on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({
          token: 'header.payload.sig',
          user: { email: 'user@kgm-group.com', company_name: 'KGM Group' },
          expires_at: '2026-06-01T00:00:00.000Z',
        }),
      );

      const result = await verifyOtp('user@kgm-group.com', '123456');
      expect(result.token).toBe('header.payload.sig');
      expect(result.user.email).toBe('user@kgm-group.com');
    });

    it('throws on wrong code', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockErr('INTERNAL_ERROR', 'Kode OTP salah'),
      );

      await expect(
        verifyOtp('user@kgm-group.com', '999999'),
      ).rejects.toThrow('Kode OTP salah');
    });

    it('throws on missing email/otp', async () => {
      await expect(verifyOtp('', '123456')).rejects.toThrow('email wajib');
      await expect(verifyOtp('user@kgm-group.com', '')).rejects.toThrow('otp wajib');
    });
  });

  // ============================================================================
  // logout
  // ============================================================================
  describe('logout', () => {
    it('calls auth.logout with token', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ ok: true }),
      );

      await logout('header.payload.sig');

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('auth.logout');
      expect(body.payload.token).toBe('header.payload.sig');
    });
  });

  // ============================================================================
  // decodeJwtPayload
  // ============================================================================
  describe('decodeJwtPayload', () => {
    function buildToken(payload: Record<string, unknown>): string {
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
        .toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${headerB64}.${payloadB64}.fake-sig`;
    }

    it('decodes valid JWT payload', () => {
      const token = buildToken({
        sub: 'user@kgm-group.com',
        company: 'KGM Group',
        iat: 1717000000,
        exp: 1717086400,
      });

      const result = decodeJwtPayload(token);
      expect(result).toEqual({
        sub: 'user@kgm-group.com',
        company: 'KGM Group',
        iat: 1717000000,
        exp: 1717086400,
      });
    });

    it('returns null for malformed token', () => {
      expect(decodeJwtPayload('not.a.token')).toBeNull();
      expect(decodeJwtPayload('')).toBeNull();
      expect(decodeJwtPayload('only.two')).toBeNull();
    });
  });

  // ============================================================================
  // isTokenExpired
  // ============================================================================
  describe('isTokenExpired', () => {
    function buildTokenExp(exp: number): string {
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256' }))
        .toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify({
        sub: 'x', company: null, iat: 0, exp,
      })).toString('base64url');
      return `${headerB64}.${payloadB64}.sig`;
    }

    it('returns true for past exp', () => {
      const past = Math.floor(Date.now() / 1000) - 3600;
      expect(isTokenExpired(buildTokenExp(past))).toBe(true);
    });

    it('returns false for future exp', () => {
      const future = Math.floor(Date.now() / 1000) + 3600;
      expect(isTokenExpired(buildTokenExp(future))).toBe(false);
    });

    it('returns true for invalid token', () => {
      expect(isTokenExpired('garbage')).toBe(true);
    });
  });
});
