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

export interface VerifyIntegrityResult {
  ok: boolean;
  reason?: string;
  timestamp: string;
  summary: {
    ok_count: number;
    missing_count: number;
    header_mismatch_count: number;
  };
  ok_sheets: string[];
  missing_sheets: string[];
  header_mismatches: Array<{ sheet: string; missing?: string[]; reason?: string }>;
}

export async function verifyIntegrity(): Promise<VerifyIntegrityResult> {
  return callAppsScript<VerifyIntegrityResult>('system.verifyIntegrity');
}
