'use client';

/**
 * Stock — read-time list per BU dengan filter search.
 *
 * BU active dipilih dari tab di AppShell (event 'bu-changed').
 */

import { useEffect, useState, useCallback } from 'react';
import { MagnifyingGlass, Package, ArrowsClockwise } from '@phosphor-icons/react';
import { getStock, type StockGetResult } from '@/lib/stock';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError } from '@/lib/swal';
import { formatCurrency } from '@/lib/utils';

export default function StockPage() {
  const [bu, setBu] = useState<string>('');
  const [data, setData] = useState<StockGetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(false);

  // Sync BU dari localStorage + listen event tab change
  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setBu(detail);
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  const load = useCallback(async () => {
    if (!bu) return;
    setLoading(true);
    try {
      const result = await getStock({
        bu,
        search: search || undefined,
        include_zero: includeZero,
        limit: 1000,
      });
      setData(result);
    } catch (err) {
      alertError(err, 'Gagal memuat stok');
    } finally {
      setLoading(false);
    }
  }, [bu, search, includeZero]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <Package size={32} weight="fill" className="text-primary" />
            Stok {bu}
          </h1>
          {data && (
            <p className="text-sm text-muted">
              {data.total_items} item · Total stok: {data.total_stock.toLocaleString('id-ID')}
            </p>
          )}
        </div>
        <button type="button" onClick={load} className="btn btn-secondary" disabled={loading}>
          <ArrowsClockwise size={18} weight="bold" className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <MagnifyingGlass
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            className="form-control"
            placeholder="Cari nama barang…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
          />
          Tampilkan stok 0
        </label>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RadialLoading size={60} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-center text-muted py-12">Tidak ada data stok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Variasi</th>
                  <th>UoM</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Stok Awal</th>
                  <th className="text-right">Masuk</th>
                  <th className="text-right">Keluar</th>
                  <th className="text-right">Harga Jual</th>
                  <th className="text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{item.nama}</td>
                    <td className="text-sm text-muted">
                      {[item.warna, item.ukuran, item.lebar].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td>{item.uom}</td>
                    <td className="text-right font-bold">
                      <span className={item.stok < 10 ? 'text-danger' : ''}>{item.stok}</span>
                    </td>
                    <td className="text-right text-muted">{item.stok_awal}</td>
                    <td className="text-right text-success">+{item.total_masuk}</td>
                    <td className="text-right text-danger">-{item.total_keluar}</td>
                    <td className="text-right">{formatCurrency(item.harga_jual)}</td>
                    <td className="text-right font-semibold">
                      {formatCurrency(item.stok * item.harga_jual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
