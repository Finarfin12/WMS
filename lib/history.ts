/**
 * History library — typed wrapper untuk search transaksi cross-archive.
 *
 * Phase 4d (2026-05-31).
 */

import { callAppsScript } from './apps-script-client';

/**
 * Schema metadata yang dikembalikan backend di history search & rekap response.
 * Frontend pakai untuk render kondisional kolom variasi.
 */
export interface HistorySchema {
  bu_id: string;
  bu_name: string;
  has_color: boolean;
  has_size: boolean;
  has_width: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;
}

export type HistoryTipe = 'all' | 'masuk' | 'keluar' | 'void';

export interface HistorySearchPayload {
  bu: string;
  from: string;        // ISO date (yyyy-mm-dd)
  to: string;          // ISO date
  nama?: string;       // contains
  customer?: string;   // contains
  no_sj?: string;      // exact
  tipe?: HistoryTipe;  // default 'all'
  user?: string;       // contains
  include_grand?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryItem {
  _source: 'main' | 'archive1' | 'archive2' | 'archive3' | 'grand';
  ID?: string;
  Tanggal: string;
  [key: string]: unknown;
}

export interface HistorySearchResult {
  bu: string;
  total: number;
  offset: number;
  limit: number;
  items: HistoryItem[];
  sources_searched: string[];
  schema: HistorySchema;
}

export type HistoryGroupBy = 'nama' | 'customer' | 'tanggal' | 'user';

export interface HistoryRekapPayload {
  bu: string;
  from: string;
  to: string;
  group_by?: HistoryGroupBy;
  tipe?: HistoryTipe;
  include_grand?: boolean;
}

export interface HistoryRekapGroup {
  key: string;
  qty_masuk: number;
  qty_keluar: number;
  value: number;
  count: number;
  uom: string;
}

export interface HistoryRekapResult {
  bu: string;
  group_by: HistoryGroupBy;
  from: string;
  to: string;
  total_groups: number;
  total_qty_masuk: number;
  total_qty_keluar: number;
  total_value: number;
  groups: HistoryRekapGroup[];
  schema: HistorySchema;
}

/**
 * Search transaksi historis dengan filter tanggal range + tipe + user.
 *
 * Smart routing: backend otomatis pilih spreadsheet yang relevan berdasar tanggal.
 *   - 0-3 bulan: Main DB
 *   - 3-6 bulan: Archive 1
 *   - 6-9 bulan: Archive 2
 *   - 9-12 bulan: Archive 3
 *   - >12 bulan: Grand Archive (kalau include_grand=true)
 */
export async function searchHistory(
  payload: HistorySearchPayload,
): Promise<HistorySearchResult> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.from) throw new Error('from wajib');
  if (!payload.to) throw new Error('to wajib');
  return callAppsScript<HistorySearchResult, HistorySearchPayload>(
    'history.search',
    payload,
  );
}

/**
 * Rekap transaksi: group by nama/customer/tanggal/user dengan total Masuk/Keluar/Value.
 * Reuse search backend dengan limit=2000 lalu group di Apps Script side.
 */
export async function rekapHistory(
  payload: HistoryRekapPayload,
): Promise<HistoryRekapResult> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.from) throw new Error('from wajib');
  if (!payload.to) throw new Error('to wajib');
  return callAppsScript<HistoryRekapResult, HistoryRekapPayload>(
    'history.rekap',
    payload,
  );
}
