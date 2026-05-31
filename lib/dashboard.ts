/**
 * Dashboard library — typed wrapper untuk halaman dashboard utama.
 *
 * Phase 4d (2026-05-31).
 */

import { callAppsScript } from './apps-script-client';

export interface BuSummary {
  bu: string;
  bu_id: string;
  icon: string;
  bu_type?: string;
  total_items: number;
  total_stock: number;
  /** Stok per UoM (Chemical: { Kg: 100, Liter: 200 }, Atrione: { Pasang: 50 }) */
  totals_by_uom: Record<string, number>;
  inventory_value: number;
  low_stock_count: number;
  error?: string;
}

export interface LowStockAlert {
  bu: string;
  nama: string;
  warna: string | null;
  ukuran: string | null;
  uom?: string;
  stok: number;
  threshold: number;
}

export interface RecentTransaction {
  bu: string;
  [key: string]: unknown;
}

export interface DashboardData {
  timestamp: string;
  bu_summaries: BuSummary[];
  total_inventory_value: number;
  total_items: number;
  low_stock_alerts: LowStockAlert[];
  recent_transactions: RecentTransaction[];
}

export async function getDashboardLive(): Promise<DashboardData> {
  return callAppsScript<DashboardData>('dashboard.live');
}
