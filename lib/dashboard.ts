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
  default_uom?: string;
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
  const data = await callAppsScript<DashboardData>('dashboard.live');
  const stripEmoji = (str: string) => str?.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim() || str;
  
  if (data?.bu_summaries) {
    data.bu_summaries = data.bu_summaries.map(b => ({ ...b, bu: stripEmoji(b.bu) }));
  }
  if (data?.low_stock_alerts) {
    data.low_stock_alerts = data.low_stock_alerts.map(a => ({ ...a, bu: stripEmoji(a.bu) }));
  }
  if (data?.recent_transactions) {
    data.recent_transactions = data.recent_transactions.map(t => ({ ...t, bu: stripEmoji(t.bu) }));
  }
  
  return data;
}
