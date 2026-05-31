'use client';

/**
 * History — search transaksi dengan smart routing cross-archive.
 *
 * Filter: BU + tanggal (from/to) + nama + customer + no SJ + tipe + user.
 * Result: tabel + total summary (count, total masuk, total keluar, value).
 * Aksi: Generate PDF Surat Jalan + Modal Rekap (group by nama/customer/tanggal/user).
 *
 * Schema-aware (multi-tenant-schema-aware-dev skill):
 *   - Kolom variasi (Warna/Ukuran/Lebar) hanya muncul kalau BU support
 *   - Harga column hanya kalau has_hpp atau has_discount
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ClockCounterClockwise,
  MagnifyingGlass,
  ArrowsClockwise,
  CalendarBlank,
  FilePdf,
  ChartBar,
  X,
} from '@phosphor-icons/react';
import {
  searchHistory,
  rekapHistory,
  type HistoryItem,
  type HistorySchema,
  type HistoryTipe,
  type HistoryGroupBy,
  type HistoryRekapResult,
} from '@/lib/history';
import { generateSuratJalanPdf } from '@/lib/reports';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast, withLoading } from '@/lib/swal';
import { formatCurrency, formatDateDmy } from '@/lib/utils';

const TIPE_OPTIONS: { value: HistoryTipe; label: string }[] = [
  { value: 'all',    label: 'Semua' },
  { value: 'masuk',  label: 'Stok Masuk' },
  { value: 'keluar', label: 'Stok Keluar' },
  { value: 'void',   label: 'Void' },
];

const GROUP_BY_OPTIONS: { value: HistoryGroupBy; label: string }[] = [
  { value: 'nama',     label: 'Per Nama Barang' },
  { value: 'customer', label: 'Per Customer' },
  { value: 'tanggal',  label: 'Per Tanggal' },
  { value: 'user',     label: 'Per User' },
];

export default function HistoryPage() {
  const [bu, setBu] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [schema, setSchema] = useState<HistorySchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    nama: '',
    customer: '',
    no_sj: '',
    user: '',
    tipe: 'all' as HistoryTipe,
  });
  const [meta, setMeta] = useState<{ total: number; sources: string[] } | null>(null);

  // Rekap modal state
  const [rekapOpen, setRekapOpen] = useState(false);
  const [rekapGroupBy, setRekapGroupBy] = useState<HistoryGroupBy>('nama');
  const [rekapData, setRekapData] = useState<HistoryRekapResult | null>(null);
  const [rekapLoading, setRekapLoading] = useState(false);

  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => {
      setBu((e as CustomEvent<string>).detail);
      // BU ganti — reset hasil
      setItems([]);
      setSchema(null);
      setMeta(null);
      setRekapData(null);
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  async function handleGeneratePdf(noSj: string) {
    if (!bu) return;
    const result = await withLoading(() => generateSuratJalanPdf(bu, noSj), {
      loadingText: `Generate PDF SJ ${noSj}…`,
    });
    if (result?.pdf_url) {
      window.open(result.pdf_url, '_blank');
      toast(`PDF terbuka: ${result.doc_name}`, 'success');
    }
  }

  async function handleSearch() {
    if (!bu) {
      toast('Pilih BU dulu di tab atas', 'warning');
      return;
    }
    setLoading(true);
    try {
      const result = await searchHistory({
        bu,
        from: filters.from,
        to: filters.to,
        nama: filters.nama || undefined,
        customer: filters.customer || undefined,
        no_sj: filters.no_sj || undefined,
        user: filters.user || undefined,
        tipe: filters.tipe,
        limit: 1000,
      });
      setItems(result.items);
      setSchema(result.schema);
      setMeta({
        total: result.total,
        sources: result.sources_searched || [],
      });
    } catch (err) {
      alertError(err, 'Gagal search history');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenRekap() {
    if (!bu) {
      toast('Pilih BU dulu', 'warning');
      return;
    }
    setRekapOpen(true);
    setRekapLoading(true);
    try {
      const result = await rekapHistory({
        bu,
        from: filters.from,
        to: filters.to,
        group_by: rekapGroupBy,
        tipe: filters.tipe,
      });
      setRekapData(result);
    } catch (err) {
      alertError(err, 'Gagal generate rekap');
      setRekapOpen(false);
    } finally {
      setRekapLoading(false);
    }
  }

  async function handleRekapGroupChange(g: HistoryGroupBy) {
    setRekapGroupBy(g);
    setRekapLoading(true);
    try {
      const result = await rekapHistory({
        bu,
        from: filters.from,
        to: filters.to,
        group_by: g,
        tipe: filters.tipe,
      });
      setRekapData(result);
    } catch (err) {
      alertError(err, 'Gagal generate rekap');
    } finally {
      setRekapLoading(false);
    }
  }

  const totalMasuk = useMemo(
    () => items.reduce((s, x) => s + (Number(x['Masuk']) || 0), 0),
    [items],
  );
  const totalKeluar = useMemo(
    () => items.reduce((s, x) => s + (Number(x['Keluar']) || 0), 0),
    [items],
  );
  const totalValue = useMemo(
    () =>
      items.reduce((s, x) => {
        const harga = Number(x['Harga Akhir'] || x['Harga']) || 0;
        return s + harga * (Number(x['Keluar']) || 0);
      }, 0),
    [items],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <ClockCounterClockwise size={32} weight="fill" className="text-primary" />
          History {bu}
        </h1>
        {meta && items.length > 0 && (
          <button type="button" onClick={handleOpenRekap} className="btn btn-secondary">
            <ChartBar size={16} weight="bold" />
            Rekap Group
          </button>
        )}
      </div>

      {/* Filter form */}
      <div className="card">
        <h3 className="card-title">Filter Pencarian</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="form-group">
            <label className="flex items-center gap-1">
              <CalendarBlank size={14} /> Dari Tanggal
            </label>
            <input
              type="date"
              className="form-control"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="flex items-center gap-1">
              <CalendarBlank size={14} /> Sampai Tanggal
            </label>
            <input
              type="date"
              className="form-control"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Tipe Transaksi</label>
            <select
              className="form-control"
              value={filters.tipe}
              onChange={(e) => setFilters({ ...filters, tipe: e.target.value as HistoryTipe })}
            >
              {TIPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nama Barang</label>
            <input
              type="text"
              className="form-control"
              placeholder="Optional, contains"
              value={filters.nama}
              onChange={(e) => setFilters({ ...filters, nama: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Customer / Supplier</label>
            <input
              type="text"
              className="form-control"
              placeholder="Optional, contains"
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>No Surat Jalan</label>
            <input
              type="text"
              className="form-control"
              placeholder="Optional, exact"
              value={filters.no_sj}
              onChange={(e) => setFilters({ ...filters, no_sj: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>User</label>
            <input
              type="text"
              className="form-control"
              placeholder="Optional, contains"
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            />
          </div>
          <div className="form-group flex items-end md:col-span-2">
            <button
              type="button"
              onClick={handleSearch}
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <RadialLoading size={18} />
              ) : (
                <>
                  <MagnifyingGlass size={18} weight="bold" />
                  Cari
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Summary stat */}
      {meta && !loading && (
        <div className="grid md:grid-cols-4 gap-4 mb-4">
          <div className="card">
            <p className="stat-label">Total Transaksi</p>
            <p className="stat-value">{meta.total}</p>
          </div>
          <div className="card">
            <p className="stat-label">Total Masuk</p>
            <p className="stat-value text-success">{totalMasuk.toLocaleString('id-ID')}</p>
          </div>
          <div className="card">
            <p className="stat-label">Total Keluar</p>
            <p className="stat-value text-danger">{totalKeluar.toLocaleString('id-ID')}</p>
          </div>
          <div className="card">
            <p className="stat-label">Nilai Penjualan</p>
            <p className="stat-value">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      )}

      {/* Sources searched */}
      {meta && meta.sources.length > 0 && (
        <p className="text-xs text-muted mb-3 flex items-center gap-2">
          <ArrowsClockwise size={12} />
          Mencari di: {meta.sources.join(', ')}
        </p>
      )}

      {/* Result table — kolom variasi dispatch by schema */}
      <div className="card">
        {loading ? (
          <div className="py-12 flex justify-center">
            <RadialLoading size={60} />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted py-12">
            {meta ? 'Tidak ada transaksi sesuai filter' : 'Klik "Cari" untuk mulai pencarian'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nama</th>
                  {schema?.has_color && <th>Warna</th>}
                  {schema?.has_size && <th>Ukuran</th>}
                  {schema?.has_width && <th>Lebar</th>}
                  <th className="text-right">Masuk</th>
                  <th className="text-right">Keluar</th>
                  <th>UoM</th>
                  <th className="text-right">Harga</th>
                  <th>Customer</th>
                  <th>No SJ</th>
                  <th>User</th>
                  <th>Ket</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx, i) => {
                  const noSj = (tx['No SJ'] as string) || '';
                  const isOutbound = (Number(tx['Keluar']) || 0) > 0;
                  return (
                    <tr key={i}>
                      <td>{formatDateDmy(tx['Tanggal'] as string)}</td>
                      <td className="font-semibold">
                        {(tx['Nama Material'] || tx['Nama Barang'] || '-') as string}
                      </td>
                      {schema?.has_color && (
                        <td className="text-sm">{(tx['Warna'] as string) || '-'}</td>
                      )}
                      {schema?.has_size && (
                        <td className="text-sm">{(tx['Ukuran'] as string) || '-'}</td>
                      )}
                      {schema?.has_width && (
                        <td className="text-sm">{(tx['Lebar'] as string) || '-'}</td>
                      )}
                      <td className="text-right text-success">
                        {(tx['Masuk'] as number) || ''}
                      </td>
                      <td className="text-right text-danger">
                        {(tx['Keluar'] as number) || ''}
                      </td>
                      <td className="text-xs text-muted">{(tx['UoM'] as string) || '-'}</td>
                      <td className="text-right">
                        {tx['Harga'] || tx['Harga Akhir']
                          ? formatCurrency(Number(tx['Harga Akhir'] || tx['Harga']))
                          : '-'}
                      </td>
                      <td>{(tx['Customer/Supplier'] as string) || '-'}</td>
                      <td className="font-mono text-xs">{noSj || '-'}</td>
                      <td className="text-xs">{(tx['User'] as string) || '-'}</td>
                      <td className="text-xs text-muted">
                        {(tx['Keterangan'] as string) || ''}
                      </td>
                      <td className="text-center">
                        {noSj && isOutbound ? (
                          <button
                            type="button"
                            onClick={() => handleGeneratePdf(noSj)}
                            className="text-primary hover:text-primary-hover p-1"
                            title={`Generate PDF Surat Jalan ${noSj}`}
                          >
                            <FilePdf size={18} weight="bold" />
                          </button>
                        ) : (
                          <span className="text-muted text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Rekap */}
      {rekapOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setRekapOpen(false)}
        >
          <div
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--card-bg)]">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ChartBar size={22} weight="fill" className="text-primary" />
                Rekap History — {bu}
              </h3>
              <button
                type="button"
                onClick={() => setRekapOpen(false)}
                className="text-muted hover:text-primary"
                aria-label="Tutup"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5">
              {/* Group by selector */}
              <div className="flex flex-wrap gap-2 mb-4">
                {GROUP_BY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleRekapGroupChange(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                      rekapGroupBy === opt.value
                        ? 'bg-primary text-white border-primary'
                        : 'border-[var(--border)] text-muted hover:border-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {rekapLoading ? (
                <div className="py-12 flex justify-center">
                  <RadialLoading size={48} />
                </div>
              ) : rekapData && rekapData.groups.length > 0 ? (
                <>
                  <div className="grid md:grid-cols-4 gap-3 mb-4">
                    <div className="card !p-3">
                      <p className="stat-label">Group</p>
                      <p className="stat-value">{rekapData.total_groups}</p>
                    </div>
                    <div className="card !p-3">
                      <p className="stat-label">Σ Masuk</p>
                      <p className="stat-value text-success">
                        {rekapData.total_qty_masuk.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="card !p-3">
                      <p className="stat-label">Σ Keluar</p>
                      <p className="stat-value text-danger">
                        {rekapData.total_qty_keluar.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="card !p-3">
                      <p className="stat-label">Σ Value</p>
                      <p className="stat-value">{formatCurrency(rekapData.total_value)}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>{GROUP_BY_OPTIONS.find((o) => o.value === rekapData.group_by)?.label}</th>
                          <th className="text-right">Masuk</th>
                          <th className="text-right">Keluar</th>
                          <th>UoM</th>
                          <th className="text-right">Value</th>
                          <th className="text-right">Tx Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekapData.groups.map((g, i) => (
                          <tr key={i}>
                            <td className="font-semibold">{g.key}</td>
                            <td className="text-right text-success">
                              {g.qty_masuk.toLocaleString('id-ID')}
                            </td>
                            <td className="text-right text-danger">
                              {g.qty_keluar.toLocaleString('id-ID')}
                            </td>
                            <td className="text-xs text-muted">{g.uom || '-'}</td>
                            <td className="text-right">{formatCurrency(g.value)}</td>
                            <td className="text-right text-muted">{g.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-center text-muted py-8">
                  Tidak ada data di rentang ini
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

