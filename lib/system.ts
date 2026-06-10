/**
 * System library — typed wrapper untuk system ops.
 *
 * Phase 5c (2026-05-31).
 */

import { callAppsScript } from './apps-script-client';

// ============================================================================
// Reconcile
// ============================================================================

export interface ReconcileBuReport {
  bu: string;
  items?: number;
  total_stok_awal?: number;
  total_masuk?: number;
  total_keluar?: number;
  total_stok_realtime?: number;
  diff?: number;
  error?: string;
}

export interface ReconcileResult {
  timestamp: string;
  bus_checked: number;
  report: ReconcileBuReport[];
}

export async function reconcileStock(buName?: string): Promise<ReconcileResult> {
  return callAppsScript<ReconcileResult, { bu?: string }>('system.reconcile', {
    bu: buName,
  });
}

// ============================================================================
// Verify Integrity
// ============================================================================

export interface DbVerifyReport {
  role: string;
  id: string;
  name: string;
  ok: string[];
  missing: string[];
  headerMismatch: Array<{ sheet: string; missing?: string[]; reason?: string }>;
  error?: string;
}

export interface VerifyIntegrityResult {
  ok: boolean;
  reason?: string;
  timestamp: string;
  summary: {
    ok_count: number;
    missing_count: number;
    header_mismatch_count: number;
  };
  databases?: DbVerifyReport[];
  ok_sheets: string[];
  missing_sheets: string[];
  header_mismatches: Array<{ sheet: string; missing?: string[]; reason?: string }>;
}

export async function verifyIntegrity(): Promise<VerifyIntegrityResult> {
  return callAppsScript<VerifyIntegrityResult>('system.verifyIntegrity');
}

// ============================================================================
// System Configuration & Branding
// ============================================================================

export interface SystemConfig {
  system_logo_url: string | null;
  system_logo_id: string | null;
  system_name: string;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  // Try fetching from the public Next.js API first (for client-side components)
  try {
    const res = await fetch('/api/system/config');
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch (err) {
    // Fallback if not in a browser environment or API fails
  }
  
  // Fallback to AppsScript directly
  return callAppsScript<SystemConfig, {}>('system.getConfig', {});
}

export async function saveSystemConfig(payload: { system_name: string }): Promise<{ ok: boolean }> {
  return callAppsScript<{ ok: boolean }, { system_name: string }>('system.saveConfig', payload);
}

export interface UploadLogoPayload {
  data_base64: string;
  mime_type: string;
}

export interface UploadLogoResult {
  ok: true;
  file_id: string;
  file_url: string;
}

export async function uploadSystemLogo(payload: UploadLogoPayload): Promise<UploadLogoResult> {
  return callAppsScript<UploadLogoResult, UploadLogoPayload>('system.uploadLogo', payload);
}
