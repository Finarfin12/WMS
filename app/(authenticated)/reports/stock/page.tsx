'use client';

/**
 * Reports — Stok Rekap (sister page dari /reports profit).
 *
 * Khusus untuk BU has_hpp=false (Canvas, Chemical) atau ringkasan inventory
 * cross-BU. Schema-aware:
 *   - Kolom HPP/laba hanya tampil kalau has_hpp=true
 *   - Multi-UoM bucket: Chemical Kg vs Liter ditampilkan terpisah
 *   - Group by: nama (default), warna, ukuran, lebar — tergantung schema
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Package,
  ChartBar,
  ArrowsClockwise,
  ArrowLeft,
} from '@phosphor-icons/react';
import {
  rekapStock,
  type StockRekapResult,
  type StockGroupBy,
} from '@/lib/stock';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast } from '@/lib/swal';
import { formatCurrency, formatCompactIDR } from '@/lib/utils';

export default function StockRekapPage() {
  const [bu, setBu] = useState('');
  const [report, setReport] = useState<StockRekapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<StockGroupBy>('nama');
  const [includeZero, setIncludeZero] = useState(false);

  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => {
      setBu((e as CustomEvent<string>).detail);
      setReport(null);
      setGroupBy('nama'); // safe default — selalu didukung semua BU
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Group-by options yang valid per schema
  const groupByOptions = useMemo(() => {
    const opts: { value: StockGroupBy; label: string; available: boolean }[] = [
      { value: 'nama',   label: 'Per Nama', available: true },
      { value: 'warna',  label: 'Per Warna',  available: !!report?.schema.has_color },
      { value: 'ukuran', label: 'Per Ukuran', available: !!report?.schema.has_size },
      { value: 'lebar',  label: 'Per Lebar',  available: !!report?.schema.has_width },
    ];
    return opts;
  }, [report]);

  async function handleGenerate(g: StockGroupBy = groupBy) {
    if (!bu) {
      toast('Pilih BU dulu di tab atas', 'warning');
      return;
    }
    setLoading(true);
    try {
      const result = await rekapStock({
        bu,
        group_by: g,
        include_zero: includeZero,
      });
      setReport(result);
      setGroupBy(g);
    } catch (err) {
      alertError(err, 'Gagal generate rekap stok');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Package size={32} weight="fill" className="text-primary" />
          Rekap Stok {bu}
        </h1>
        <Link href="/reports" className="btn btn-secondary">
          <ArrowLeft size={16} weight="bold" />
          Laporan Laba
        </Link>
      </div>

      {/* Filter card */}
      <div className="card">
        <h3 className="card-title">Opsi Rekap</h3>
        <div className="grid md:grid-cols-3 gap-4 items-end">
          <div className="form-group">
            <label>Group By</label>
            <select
              className="form-control"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as StockGroupBy)}
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={!opt.available}>
                  {opt.label}
                  {!opt.available ? ' (tidak tersedia di BU ini)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="flex items-center gap-2 mt-7">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
              />
              <span>Tampilkan stok kosong (=0)</span>
            </label>
          </div>
          <div className="form-group">
            <button
              type="button"
              onClick={() => handleGenerate(groupBy)}
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? <RadialLoading size={18} /> : <ArrowsClockwise size={18} weight="bold" />}
              Generate
            </button>
          </div>
        </div>
      </div>

      {!report && !loading && (
        <div className="card text-center py-12">
          <ChartBar size={64} weight="duotone" className="text-primary mx-auto mb-3" />
          <p className="text-muted">Klik &ldquo;Generate&rdquo; untuk membuat rekap stok</p>
          <p className="text-xs text-muted mt-2">
            Atrione: stok dengan HPP & nilai · Canvas/Chemical: stok + nilai jual
          </p>
        </div>
      )}

      {loading && (
        <div className="card py-12 flex justify-center">
          <RadialLoading size={60} />
        </div>
      )}

      {report && !loading && (
        <>
          {/* Summary cards — adaptive ke has_hpp */}
          <div
            className={`grid ${report.has_hpp ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-4`}
          >
            <div className="card">
              <p className="stat-label">Total Item Unik</p>
              <p className="stat-value">
                {report.summary.total_items.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="card">
              <p className="stat-label">Total Stok</p>
              {Object.keys(report.summary.totals_by_uom).length > 1 ? (
                <div>
                  {Object.entries(report.summary.totals_by_uom).map(([uom, qty]) => (
                    <p key={uom} className="text-2xl font-bold">
                      {qty.toLocaleString('id-ID')} <span className="text-base text-muted">{uom}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="stat-value">
                  {report.summary.total_stock.toLocaleString('id-ID')}{' '}
                  <span className="text-base text-muted">{report.summary.primary_uom}</span>
                </p>
              )}
            </div>
            <div className="card">
              <p className="stat-label">Nilai Jual Sekarang</p>
              <p className="stat-value" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(report.summary.total_value_now)}>{formatCompactIDR(report.summary.total_value_now)}</p>
              <p className="text-xs text-muted" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(report.summary.total_value_initial)}>
                Awal: {formatCompactIDR(report.summary.total_value_initial)}
              </p>
            </div>
            {report.has_hpp && (
              <div className="card">
                <p className="stat-label">Total HPP</p>
                <p className="stat-value text-danger" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(report.summary.total_hpp_value || 0)}>
                  {formatCompactIDR(report.summary.total_hpp_value || 0)}
                </p>
              </div>
            )}
          </div>

          {/* Detail table */}
          <div className="card">
            <h3 className="card-title">
              Detail per{' '}
              {groupByOptions.find((o) => o.value === report.group_by)?.label.replace('Per ', '') ||
                report.group_by}
            </h3>
            {report.groups.length === 0 ? (
              <p className="text-center text-muted py-8">Tidak ada data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>
                        {groupByOptions.find((o) => o.value === report.group_by)?.label.replace(
                          'Per ',
                          '',
                        )}
                      </th>
                      <th className="text-right">Stok Awal</th>
                      <th className="text-right">Σ Masuk</th>
                      <th className="text-right">Σ Keluar</th>
                      <th className="text-right">Stok Sekarang</th>
                      <th>UoM</th>
                      <th className="text-right">Nilai Jual</th>
                      {report.has_hpp && <th className="text-right">Nilai HPP</th>}
                      <th className="text-right">Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.groups.map((g, i) => (
                      <tr key={i}>
                        <td className="font-semibold">{g.key}</td>
                        <td className="text-right">{g.stok_awal.toLocaleString('id-ID')}</td>
                        <td className="text-right text-success">
                          {g.total_masuk.toLocaleString('id-ID')}
                        </td>
                        <td className="text-right text-danger">
                          {g.total_keluar.toLocaleString('id-ID')}
                        </td>
                        <td className="text-right font-semibold">
                          {g.stok.toLocaleString('id-ID')}
                        </td>
                        <td className="text-xs">
                          {g.uom_mix ? (
                            <span className="text-warning" title="Campuran UoM di group ini">
                              {g.uom} +mix
                            </span>
                          ) : (
                            g.uom || '-'
                          )}
                        </td>
                        <td className="text-right" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(g.value_now)}>{formatCompactIDR(g.value_now)}</td>
                        {report.has_hpp && (
                          <td className="text-right text-danger" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(g.hpp_value)}>
                            {formatCompactIDR(g.hpp_value)}
                          </td>
                        )}
                        <td className="text-right text-muted">{g.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
