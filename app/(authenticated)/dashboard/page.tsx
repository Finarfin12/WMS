'use client';

/**
 * Dashboard — live aggregate semua BU.
 *
 * Match versi lama:
 *   - 4 stat box atas: Total Inventory Value, Total Items, Low Stock Count, Active BU
 *   - Per-BU summary cards (glass effect)
 *   - Low stock alerts table
 *   - Recent transactions table
 */

import { useEffect, useState } from 'react';
import {
  CurrencyDollar,
  Package,
  Warning,
  Buildings,
  ArrowsClockwise,
  MapPin,
  TShirt,
  Flask,
  Sneaker,
  Shapes,
} from '@phosphor-icons/react';
import { getDashboardLive, type DashboardData } from '@/lib/dashboard';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError } from '@/lib/swal';
import { formatCurrency, formatDateDmy } from '@/lib/utils';
import { DashboardCharts } from '@/components/DashboardCharts';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const result = await getDashboardLive();
      setData(result);
    } catch (err) {
      alertError(err, 'Gagal memuat dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh tiap 60 detik
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RadialLoading size={80} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--text-main)' }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted">
            Aggregate semua BU · Last update: {new Date(data.timestamp).toLocaleTimeString('id-ID')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="btn btn-secondary"
          disabled={refreshing}
        >
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* 4 stat boxes utama */}
      <div className="flex-grid">
        <StatBox
          icon={<CurrencyDollar size={28} weight="fill" />}
          title="Total Inventory Value"
          value={formatCurrency(data.total_inventory_value)}
          color="success"
        />
        <StatBox
          icon={<Package size={28} weight="fill" />}
          title="Total Items"
          value={data.total_items.toLocaleString('id-ID')}
          color="info"
        />
        <StatBox
          icon={<Warning size={28} weight="fill" />}
          title="Low Stock Alerts"
          value={data.low_stock_alerts.length.toString()}
          color={data.low_stock_alerts.length > 0 ? 'danger' : 'success'}
        />
        <StatBox
          icon={<Buildings size={28} weight="fill" />}
          title="Active BU"
          value={data.bu_summaries.length.toString()}
          color="primary"
        />
      </div>

      {/* Operational Live View (BU Stock Cards) */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-main)' }}>
          Operational Live View
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.bu_summaries.flatMap((bu) => {
            const isAtrione = bu.bu.toLowerCase().trim() === 'atrione';
            const uomEntries = Object.entries(bu.totals_by_uom || {}).filter(
              ([, v]) => v > 0,
            );

            // Calculate status progress (Ratio of OK items to total items)
            const totalItemsCount = bu.total_items;
            const lowStockCount = bu.low_stock_count;
            const okItemsCount = Math.max(0, totalItemsCount - lowStockCount);
            const okPercentage = totalItemsCount > 0 ? (okItemsCount / totalItemsCount) * 100 : 100;

            // Calculate daily In/Out (last 24 hours) from recent transactions
            let dailyIn = 0;
            let dailyOut = 0;
            data.recent_transactions.forEach((tx) => {
              if (tx.bu === bu.bu) {
                // Check if transaction is in last 24h
                const txDate = new Date(tx.Tanggal as string);
                const diffMs = Date.now() - txDate.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);
                if (diffHours <= 24) {
                  dailyIn += (tx.Masuk as number) || 0;
                  dailyOut += (tx.Keluar as number) || 0;
                }
              }
            });

            // If no UoM, return a generic card
            if (uomEntries.length === 0) {
              return [(
                <div key={`${bu.bu_id}-generic`} className="stat-box hover:border-[var(--primary)] transition-all flex flex-col justify-between bg-white" style={{ minHeight: '190px' }}>
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4 text-[var(--text-muted)]">
                      BU {bu.bu.toUpperCase()}
                    </h3>
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <p className="text-3xl font-extrabold text-[var(--text-main)]">0</p>
                        <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-1">
                          {isAtrione ? 'prs' : (bu.default_uom || 'ITEMS')}
                        </p>
                      </div>
                      {/* Progress Circle */}
                      <div className="relative flex items-center justify-center shrink-0">
                        <svg className="w-16 h-16 transform -rotate-90">
                          <circle cx="32" cy="32" r="26" stroke="var(--border)" strokeWidth="5" fill="transparent" />
                          <circle
                            cx="32" cy="32" r="26"
                            stroke={lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'}
                            strokeWidth="5" fill="transparent"
                            strokeDasharray={2 * Math.PI * 26}
                            strokeDashoffset={2 * Math.PI * 26 * (1 - okPercentage / 100)}
                            strokeLinecap="round" className="transition-all duration-500"
                          />
                        </svg>
                        <span className="absolute text-xs font-bold text-[var(--text-main)]">{Math.round(okPercentage)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[var(--border)] pt-3 mt-2 flex justify-between items-center text-xs font-semibold">
                    <div className="flex gap-3 text-muted">
                      <span className="text-success flex items-center gap-0.5">↑ {dailyIn.toLocaleString('id-ID')}</span>
                      <span className="text-danger flex items-center gap-0.5">↓ {dailyOut.toLocaleString('id-ID')}</span>
                    </div>
                    <span className="text-[var(--text-muted)]">Total: {bu.total_items} Item{bu.total_items !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )];
            }

            // Return a card for EACH UoM
            return uomEntries.map(([uom, qty]) => {
              const cleanUom = isAtrione ? 'prs' : uom;
              return (
                <div key={`${bu.bu_id}-${cleanUom}`} className="stat-box hover:border-[var(--primary)] transition-all flex flex-col justify-between bg-white" style={{ minHeight: '190px' }}>
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4 text-[var(--text-muted)]">
                      BU {bu.bu.toUpperCase()} {uomEntries.length > 1 ? `(${cleanUom.toUpperCase()})` : ''}
                    </h3>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col">
                          <span className="text-3xl font-extrabold text-[var(--text-main)] leading-none">
                            {qty.toLocaleString('id-ID')}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-1">
                            {cleanUom}
                          </span>
                        </div>
                      </div>
                      {/* Progress Circle */}
                      <div className="relative flex items-center justify-center shrink-0">
                        <svg className="w-16 h-16 transform -rotate-90">
                          <circle cx="32" cy="32" r="26" stroke="var(--border)" strokeWidth="5" fill="transparent" />
                          <circle
                            cx="32" cy="32" r="26"
                            stroke={lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'}
                            strokeWidth="5" fill="transparent"
                            strokeDasharray={2 * Math.PI * 26}
                            strokeDashoffset={2 * Math.PI * 26 * (1 - okPercentage / 100)}
                            strokeLinecap="round" className="transition-all duration-500"
                          />
                        </svg>
                        <span className="absolute text-xs font-bold text-[var(--text-main)]">{Math.round(okPercentage)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[var(--border)] pt-3 mt-2 flex justify-between items-center text-xs font-semibold">
                    <div className="flex gap-3 text-muted">
                      <span className="text-success flex items-center gap-0.5">↑ {dailyIn.toLocaleString('id-ID')}</span>
                      <span className="text-danger flex items-center gap-0.5">↓ {dailyOut.toLocaleString('id-ID')}</span>
                    </div>
                    <span className="text-[var(--text-muted)]">Total: {bu.total_items} Item{bu.total_items !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Charts: bar + doughnut */}
      <DashboardCharts bus={data.bu_summaries} trends={data.trends_7d} />

      {/* Per-BU summary */}
      <div className="card">
        <h3 className="card-title">Ringkasan per Business Unit</h3>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>BU</th>
                <th className="text-right">Items</th>
                <th className="text-right">Stok</th>
                <th className="text-right">Inventory Value</th>
                <th className="text-right">Low Stock</th>
              </tr>
            </thead>
            <tbody>
              {data.bu_summaries.map((bu) => {
                const uomEntries = Object.entries(bu.totals_by_uom || {}).filter(
                  ([, v]) => v > 0,
                );
                return (
                  <tr key={bu.bu_id}>
                    <td>
                      <strong>{bu.bu}</strong>
                      {bu.bu_type && (
                        <span className="text-xs text-muted ml-2">({bu.bu_type})</span>
                      )}
                    </td>
                    <td className="text-right">{bu.total_items.toLocaleString('id-ID')}</td>
                    <td className="text-right">
                      {uomEntries.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : uomEntries.length === 1 ? (
                        // Single UoM: tampil sederhana "100 Kg"
                        <span>
                          {uomEntries[0][1].toLocaleString('id-ID')}{' '}
                          <span className="text-xs text-muted">
                            {bu.bu.toLowerCase().trim() === 'atrione' ? 'prs' : uomEntries[0][0]}
                          </span>
                        </span>
                      ) : (
                        // Multi-UoM (Chemical): "100 Kg / 50 Liter"
                        <div className="flex flex-col items-start gap-0.5">
                          {uomEntries.map(([uom, qty]) => {
                            const cleanUom = bu.bu.toLowerCase().trim() === 'atrione' ? 'prs' : uom;
                            return (
                              <div key={uom} className="text-xs">
                                <span className="font-semibold">
                                  {qty.toLocaleString('id-ID')}
                                </span>{' '}
                                <span className="text-muted">{cleanUom}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-semibold">
                      {formatCurrency(bu.inventory_value)}
                    </td>
                    <td className="text-right">
                      {bu.low_stock_count > 0 ? (
                        <span className="text-danger font-semibold">{bu.low_stock_count}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low stock alerts */}
      {data.low_stock_alerts.length > 0 && (
        <div className="card">
          <h3 className="card-title flex items-center gap-2">
            <Warning size={20} weight="fill" className="text-danger" />
            Peringatan Stok Rendah
          </h3>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>BU</th>
                  <th>Nama Barang</th>
                  <th>Variasi</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {data.low_stock_alerts.slice(0, 20).map((item, i) => (
                  <tr key={i}>
                    <td>{item.bu}</td>
                    <td>{item.nama}</td>
                    <td className="text-muted text-sm">
                      {[item.warna, item.ukuran].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="text-right text-danger font-bold">{item.stok}</td>
                    <td className="text-right text-muted">{item.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* (Moved Operational Live View up) */}
    </div>
  );
}

function StatBox({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: 'primary' | 'success' | 'danger' | 'info';
}) {
  const colorMap = {
    primary: 'var(--primary)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    info: 'var(--info)',
  };
  return (
    <div className="stat-box">
      <div className="flex justify-between items-start mb-4">
        <h3
          className="text-xs uppercase font-bold"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
        >
          {title}
        </h3>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
          style={{ background: colorMap[color] }}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-extrabold" style={{ color: 'var(--text-main)' }}>
        {value}
      </p>
    </div>
  );
}


