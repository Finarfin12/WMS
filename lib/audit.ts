/**
 * Audit Log library — typed wrapper untuk baca audit_log sheet.
 *
 * Phase 6 (2026-06-01). Backend handler di SystemOps.gs:197+.
 */

import { callAppsScript } from './apps-script-client';

export interface AuditLogEntry {
  timestamp: string;
  user: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
}

export interface AuditListPayload {
  action?: string;
  user?: string;
  target?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListResult {
  total: number;
  offset: number;
  limit: number;
  items: AuditLogEntry[];
}

export async function listAuditLogs(
  payload: AuditListPayload = {},
): Promise<AuditListResult> {
  return callAppsScript<AuditListResult, AuditListPayload>('audit.list', payload);
}
