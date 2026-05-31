/**
 * Reports library — typed wrapper untuk laporan + PDF.
 *
 * Phase 4e (2026-05-31).
 */

import { callAppsScript } from './apps-script-client';

// ============================================================================
// Profit Report
// ============================================================================

export interface ProfitGroup {
  key: string;
  qty: number;
  uom: string;
  penjualan: number;
  hpp: number;
  laba_kotor: number;
  margin_pct: number;
}

export interface ProfitSummary {
  total_qty_keluar: number;
  total_penjualan: number;
  total_hpp: number;
  total_laba_kotor: number;
  overall_margin_pct: number;
}

export interface ReportSchema {
  has_size: boolean;
  has_color: boolean;
  has_lebar: boolean;
  has_hpp: boolean;
}

export interface ProfitReport {
  bu: string;
  from: string;
  to: string;
  group_by: 'product' | 'customer' | 'date';
  /** True kalau BU punya HPP (Atrione) → tampil laba kotor + margin. False (Canvas/Chemical) → sales report only. */
  has_hpp: boolean;
  schema: ReportSchema;
  groups: ProfitGroup[];
  summary: ProfitSummary;
}

export async function getProfitReport(payload: {
  bu: string;
  from: string;
  to: string;
  group_by?: 'product' | 'customer' | 'date';
}): Promise<ProfitReport> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.from || !payload.to) throw new Error('from/to wajib');
  return callAppsScript<ProfitReport, typeof payload>('reports.profit', payload);
}

// ============================================================================
// Export Report (untuk Excel render di client)
// ============================================================================

export interface ExportPayload {
  bu: string;
  type: 'history' | 'stock' | 'profit';
  from?: string;
  to?: string;
  group_by?: 'product' | 'customer' | 'date';
}

export interface ExportResult<T = Record<string, unknown>> {
  type: 'history' | 'stock' | 'profit';
  title: string;
  rows: T[];
  total?: number;
  summary?: ProfitSummary;
}

export async function getExportData<T = Record<string, unknown>>(
  payload: ExportPayload,
): Promise<ExportResult<T>> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.type) throw new Error('type wajib');
  return callAppsScript<ExportResult<T>, ExportPayload>('reports.export', payload);
}

// ============================================================================
// PDF — Surat Jalan
// ============================================================================

export interface PdfGenerateResult {
  pdf_url: string;
  pdf_id: string;
  doc_name: string;
  template: 'canvas' | 'chemical' | 'default';
}

export async function generateSuratJalanPdf(
  buName: string,
  noSj: string,
): Promise<PdfGenerateResult> {
  if (!buName) throw new Error('buName wajib');
  if (!noSj) throw new Error('noSj wajib');
  return callAppsScript<PdfGenerateResult, { bu: string; no_sj: string }>(
    'pdf.generate',
    { bu: buName, no_sj: noSj },
  );
}
