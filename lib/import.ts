/**
 * Import library — typed wrapper untuk bulk insert.
 *
 * Phase 5b (2026-05-31).
 */

import { callAppsScript } from './apps-script-client';
import { callAppsScriptResilient, type ResilientResponse } from './apps-script-resilient';
import { getActorContext } from './auth';

// ============================================================================
// Types
// ============================================================================

export type ImportType = 'transaction' | 'masterData';

/**
 * Schema metadata yang dikembalikan backend di preview & template response.
 * Frontend WAJIB pakai ini untuk render kondisional, jangan re-derive dari
 * bu_name string. Lihat skill multi-tenant-schema-aware-dev step 4-5.
 */
export interface ImportSchema {
  bu_id: string;
  bu_name: string;
  default_uom: string;
  has_color: boolean;
  has_size: boolean;
  has_width: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;
  allowed_uoms: string[];
  allowed_currencies: string[];
}

export interface ImportRowValidation {
  row: number;
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewPayload {
  bu: string;
  type: ImportType;
  rows: Record<string, unknown>[];
}

export interface ImportPreviewResult {
  bu: string;
  type: ImportType;
  total: number;
  ready: number;
  error_count: number;
  warning_count: number;
  validations: ImportRowValidation[];
  schema: ImportSchema;
}

export interface ImportExecutePayload extends ImportPreviewPayload {
  skip_invalid?: boolean;
  user?: string;
}

export interface ImportExecuteResult {
  bu: string;
  type: ImportType;
  total: number;
  success: number;
  failure: number;
  successes: Array<{ row: number; id: string }>;
  failures: Array<{ row: number; errors: string[]; skipped: boolean }>;
}

export interface ImportTemplateResult {
  bu: string;
  type: ImportType;
  headers: string[];
  sample: Record<string, unknown>[];
  filename: string;
  schema: ImportSchema;
}

// ============================================================================
// Functions
// ============================================================================

export async function previewImport(
  payload: ImportPreviewPayload,
): Promise<ImportPreviewResult> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.type) throw new Error('type wajib');
  return callAppsScript<ImportPreviewResult, ImportPreviewPayload>(
    'import.preview',
    payload,
  );
}

/**
 * Execute bulk import — write rows ke target BU sheet.
 * Resilient — fallback ke write queue kalau backend down (preserve data).
 *
 * NOTE: dry_run preview pakai `previewImport` (read-only, callAppsScript langsung).
 */
export async function executeImport(
  payload: ImportExecutePayload,
): Promise<ResilientResponse<ImportExecuteResult>> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.type) throw new Error('type wajib');
  const actor = getActorContext();
  return callAppsScriptResilient<ImportExecuteResult, ImportExecutePayload>(
    'import.execute',
    { ...payload, ...actor } as ImportExecutePayload,
    { user: actor._actor_email },
  );
}

export async function getImportTemplate(
  buName: string,
  type: ImportType,
): Promise<ImportTemplateResult> {
  if (!buName) throw new Error('buName wajib');
  if (!type) throw new Error('type wajib');
  return callAppsScript<ImportTemplateResult, { bu: string; type: ImportType }>(
    'import.template',
    { bu: buName, type },
  );
}
