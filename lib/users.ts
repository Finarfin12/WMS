/**
 * Users library — typed wrapper untuk CRUD user account.
 *
 * Phase 5a (2026-05-31).
 *
 * Hash di backend (PBKDF2 100K). Plaintext password HANYA dikirim saat save/reset,
 * dan TIDAK pernah di-return.
 */

import { callAppsScript } from './apps-script-client';

// ============================================================================
// Types
// ============================================================================

export type UserRole = 'Admin' | 'User' | 'Superadmin';

export interface UserRecord {
  Email: string;
  Role: UserRole;
  Username: string;
  'Failed Attempts': number;
  'Locked Until': string | null;
  'Password Changed At': string;
  is_active: boolean;
}

export interface UserSavePayload {
  email: string;
  password?: string;     // plaintext, akan di-hash di backend
  role?: UserRole;
  username?: string;
  is_active?: boolean;
  // Injected oleh caller di server route, tidak di-expose ke UI:
  _actor_role?: UserRole;
  _actor_email?: string;
}

export interface UserSaveResult {
  ok: true;
  email: string;
  mode: 'create' | 'update';
}

export interface UserDeleteResult {
  ok: true;
  email: string;
  mode: 'soft';
}

export interface UserUnlockResult {
  ok: true;
  email: string;
}

export interface UserResetPasswordResult {
  ok: true;
  email: string;
  temp_password: string;  // plaintext, return sekali
  note: string;
}

// ============================================================================
// Functions
// ============================================================================

export async function listUsers(opts: { includeInactive?: boolean } = {}): Promise<UserRecord[]> {
  return callAppsScript<UserRecord[], typeof opts>('users.list', opts);
}

export async function saveUser(payload: UserSavePayload): Promise<UserSaveResult> {
  if (!payload.email) throw new Error('email wajib');
  if (payload.password && payload.password.length < 8) {
    throw new Error('Password minimal 8 karakter');
  }
  return callAppsScript<UserSaveResult, UserSavePayload>('users.save', payload);
}

export async function deleteUser(email: string): Promise<UserDeleteResult> {
  if (!email) throw new Error('email wajib');
  return callAppsScript<UserDeleteResult, { email: string }>('users.delete', { email });
}

export async function unlockUser(email: string): Promise<UserUnlockResult> {
  if (!email) throw new Error('email wajib');
  return callAppsScript<UserUnlockResult, { email: string }>('users.unlock', { email });
}

/**
 * Reset password user — generate temp password baru, hash, return plaintext SEKALI.
 *
 * Jangan log atau simpan plaintext-nya. Sampaikan ke user via channel aman
 * (chat 1-on-1, bukan email/group chat).
 */
export async function resetUserPassword(email: string): Promise<UserResetPasswordResult> {
  if (!email) throw new Error('email wajib');
  return callAppsScript<UserResetPasswordResult, { email: string }>(
    'users.resetPassword',
    { email },
  );
}
