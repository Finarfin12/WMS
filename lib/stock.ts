/**
 * Stock library — read-time stock calculation per ADR-09.
 *
 * Phase 4c (2026-05-31). Backend handler di Stock.gs.
 */

import { callAppsScript } from './apps-script-client';

// ============================================================================
// Types
// ============================================================================

export interface StockItem {
  nama: string;
  warna: string | null;
  ukuran: string | null;
  lebar: string | null;
  uom: string;
  stok: number;
  stok_awal: number;
  total_masuk: number;
  total_keluar: number;
  harga_jual: number;
  hpp: number | null;
  satuan_harga: string;
  last_update: string;
}

export interface StockGetPayload {
  bu: string;
  nama?: string;
  search?: string;
  warna?: string;
  ukuran?: string;
  limit?: number;
  offset?: number;
  include_zero?: boolean;
}

export interface StockGetResult {
  bu: string;
  total_items: number;
  total_stock: number;
  offset: number;
  limit: number;
  items: StockItem[];
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Get stock realtime per BU.
 *
 * Stok dihitung read-time:
 *   stok = MD.Stok_Awal + SUM(transaksi.Masuk) - SUM(transaksi.Keluar)
 *
 * Group key per BU:
 *   - Atrione (has_color + has_size): Nama + Warna + Ukuran
 *   - Canvas (has_color + has_width): Nama + Warna + Lebar
 *   - Chemical: Nama
 *
 * UoM Canvas auto-convert meter↔yard ke default_uom.
 *
 * @example
 *   const stock = await getStock({ bu: 'Atrione' });
 *   console.log(stock.total_items, stock.total_stock);
 *   stock.items.forEach(it => console.log(it.nama, it.stok, it.uom));
 */
export async function getStock(
  payload: StockGetPayload,
): Promise<StockGetResult> {
  if (!payload.bu) throw new Error('bu wajib');
  return callAppsScript<StockGetResult, StockGetPayload>('stock.get', payload);
}

/**
 * Helper: filter items below threshold (low stock alert).
 */
export function getLowStockItems(
  items: StockItem[],
  threshold: number,
): StockItem[] {
  return items.filter((it) => it.stok < threshold);
}

/**
 * Helper: total nilai inventory (Σ stok × harga_jual).
 */
export function getInventoryValue(items: StockItem[]): number {
  return items.reduce((sum, it) => sum + it.stok * it.harga_jual, 0);
}

// ============================================================================
// Stock Rekap — sister handler untuk Canvas/Chemical (has_hpp=false)
// ============================================================================

export interface StockSchema {
  bu_id: string;
  bu_name: string;
  has_color: boolean;
  has_size: boolean;
  has_width: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_fifo: boolean;
}

export type StockGroupBy = 'nama' | 'warna' | 'ukuran' | 'lebar';

export interface StockRekapPayload {
  bu: string;
  group_by?: StockGroupBy;
  include_zero?: boolean;
}

export interface StockRekapGroup {
  key: string;
  stok: number;
  stok_awal: number;
  total_masuk: number;
  total_keluar: number;
  value_now: number;
  hpp_value: number;
  count: number;
  uom: string;
  uom_mix: boolean;
}

export interface StockRekapSummary {
  total_items: number;
  total_stock: number;
  totals_by_uom: Record<string, number>;     // multi-UoM bucket
  primary_uom: string;
  total_value_initial: number;
  total_value_now: number;
  total_hpp_value: number | null;            // null kalau has_hpp=false
}

export interface StockRekapResult {
  bu: string;
  group_by: StockGroupBy;
  has_hpp: boolean;
  summary: StockRekapSummary;
  groups: StockRekapGroup[];
  schema: StockSchema;
}

/**
 * Rekap stok per BU. Pattern multi-tenant-schema-aware:
 *   - has_hpp=false → total_hpp_value null, frontend hide kolom HPP
 *   - dual-UoM (Chemical) → totals_by_uom bucket Kg/Liter terpisah, JANGAN sum
 *   - group_by 'warna'|'ukuran'|'lebar' di-validate di backend (reject kalau BU
 *     tidak track dimensi tsb)
 */
export async function rekapStock(
  payload: StockRekapPayload,
): Promise<StockRekapResult> {
  if (!payload.bu) throw new Error('bu wajib');
  return callAppsScript<StockRekapResult, StockRekapPayload>(
    'stock.rekap',
    payload,
  );
}
