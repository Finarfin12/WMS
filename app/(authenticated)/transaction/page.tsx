'use client';

/**
 * Transaction — input form + list transaksi terkini.
 *
 * Tabs:
 *   - Tab "Masuk" → form input barang masuk
 *   - Tab "Keluar" → form input barang keluar
 *   - Tab "List" → tabel 50 transaksi terakhir
 */

import { useEffect, useState, useCallback } from 'react';
import { Receipt, Plus, ArrowsClockwise, ArrowDown, ArrowUp, ListBullets } from '@phosphor-icons/react';
import { saveTransaction } from '@/lib/transaction';
import { searchHistory, type HistoryItem } from '@/lib/history';
import { listBus, getBuFlags, type BUConfig } from '@/lib/bu-registry';
import { RadialLoading } from '@/lib/RadialLoading';
import { toast, alertError, withLoading } from '@/lib/swal';

type Tab = 'masuk' | 'keluar' | 'list';

export default function TransactionPage() {
  const [bu, setBu] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('masuk');
  const [buConfig, setBuConfig] = useState<BUConfig | null>(null);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [form, setForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    nama: '',
    warna: '',
    ukuran: '',
    lebar: '',
    uom: '',
    qty: '',
    harga: '',
    hpp: '',
    diskon: '',
    customer: '',
    no_sj: '',
    keterangan: '',
  });

  // Sync BU
  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);

    const handler = (e: Event) => setBu((e as CustomEvent<string>).detail);
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Load BU config
  useEffect(() => {
    if (!bu) return;
    listBus()
      .then((bus) => {
        const found = bus.find((b) => b.bu_name === bu);
        if (found) {
          setBuConfig(found);
          setForm((f) => ({ ...f, uom: found.default_uom || '' }));
        }
      })
      .catch((err) => alertError(err));
  }, [bu]);

  // Load recent transactions
  const loadRecent = useCallback(async () => {
    if (!bu) return;
    setLoadingList(true);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      const result = await searchHistory({
        bu,
        from: fromDate.toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
        limit: 50,
      });
      setRecent(result.items);
    } catch (err) {
      alertError(err);
    } finally {
      setLoadingList(false);
    }
  }, [bu]);

  useEffect(() => {
    if (activeTab === 'list') loadRecent();
  }, [activeTab, loadRecent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bu || !form.nama || !form.qty) {
      toast('Nama dan Quantity wajib diisi', 'error');
      return;
    }

    const qty = parseFloat(form.qty);
    if (qty <= 0) {
      toast('Quantity harus > 0', 'error');
      return;
    }

    const userEmail = JSON.parse(localStorage.getItem('wms_user') || '{}').email || 'unknown';

    const result = await withLoading(
      () =>
        saveTransaction({
          bu,
          tanggal: form.tanggal,
          nama: form.nama,
          uom: form.uom,
          masuk: activeTab === 'masuk' ? qty : 0,
          keluar: activeTab === 'keluar' ? qty : 0,
          warna: form.warna || undefined,
          ukuran: form.ukuran || undefined,
          lebar: form.lebar || undefined,
          harga: form.harga ? parseFloat(form.harga) : undefined,
          hpp: form.hpp ? parseFloat(form.hpp) : undefined,
          diskon: form.diskon ? parseFloat(form.diskon) : undefined,
          customer: form.customer || undefined,
          no_sj: form.no_sj || undefined,
          keterangan: form.keterangan || undefined,
          user: userEmail,
        }),
      {
        loadingText: 'Menyimpan transaksi…',
        // Custom success message berdasarkan source (live vs queued)
      },
    );

    if (result) {
      if (result.ok) {
        toast(`Transaksi tersimpan (ID: ${result.data.id})`, 'success');
      } else {
        toast(
          `Backend down — masuk antrian (id: ${result.queue_id}), akan ter-sync otomatis`,
          'warning',
        );
      }
      // Reset form (keep tanggal + uom)
      setForm({
        tanggal: form.tanggal,
        nama: '',
        warna: '',
        ukuran: '',
        lebar: '',
        uom: form.uom,
        qty: '',
        harga: '',
        hpp: '',
        diskon: '',
        customer: '',
        no_sj: '',
        keterangan: '',
      });
    }
  }

  const flags = buConfig ? getBuFlags(buConfig) : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Receipt size={32} weight="fill" className="text-primary" />
          Transaksi {bu}
        </h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
        {[
          { id: 'masuk' as const, label: 'Barang Masuk', icon: ArrowDown, color: 'text-success' },
          { id: 'keluar' as const, label: 'Barang Keluar', icon: ArrowUp, color: 'text-danger' },
          { id: 'list' as const, label: 'List Terkini', icon: ListBullets, color: 'text-primary' },
        ].map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === id
                ? `border-[var(--primary)] ${color}`
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            <Icon size={18} weight="bold" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'list' ? (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title m-0">50 Transaksi Terakhir (30 hari)</h3>
            <button type="button" onClick={loadRecent} className="btn btn-secondary">
              <ArrowsClockwise size={16} weight="bold" />
              Refresh
            </button>
          </div>
          {loadingList ? (
            <div className="py-12 flex justify-center">
              <RadialLoading size={60} />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-center text-muted py-12">Tidak ada transaksi 30 hari terakhir</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nama</th>
                    <th>Variasi</th>
                    <th className="text-right">Masuk</th>
                    <th className="text-right">Keluar</th>
                    <th>Customer</th>
                    <th>No SJ</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((tx, i) => (
                    <tr key={i}>
                      <td>{formatDate(tx.Tanggal as string)}</td>
                      <td>{(tx['Nama Material'] || tx['Nama Barang'] || '-') as string}</td>
                      <td className="text-sm text-muted">
                        {[tx['Warna'], tx['Ukuran'], tx['Lebar']].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="text-right text-success">{(tx['Masuk'] as number) || ''}</td>
                      <td className="text-right text-danger">{(tx['Keluar'] as number) || ''}</td>
                      <td>{(tx['Customer/Supplier'] as string) || '-'}</td>
                      <td className="font-mono text-xs">{(tx['No SJ'] as string) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card max-w-3xl">
          <h3 className="card-title">
            Form {activeTab === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="form-group">
              <label>Tanggal</label>
              <input
                type="date"
                className="form-control"
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Nama Barang</label>
              <input
                type="text"
                className="form-control"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                required
              />
            </div>

            {flags?.has_color && (
              <div className="form-group">
                <label>Warna</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.warna}
                  onChange={(e) => setForm({ ...form, warna: e.target.value })}
                />
              </div>
            )}

            {flags?.has_size && (
              <div className="form-group">
                <label>Ukuran</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.ukuran}
                  onChange={(e) => setForm({ ...form, ukuran: e.target.value })}
                />
              </div>
            )}

            {flags?.has_width && (
              <div className="form-group">
                <label>Lebar</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.lebar}
                  onChange={(e) => setForm({ ...form, lebar: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label>UoM (Satuan)</label>
              <input
                type="text"
                className="form-control"
                value={form.uom}
                onChange={(e) => setForm({ ...form, uom: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                step="any"
                className="form-control"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
                min="0"
              />
            </div>

            {activeTab === 'keluar' && (
              <div className="form-group">
                <label>Harga Jual</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.harga}
                  onChange={(e) => setForm({ ...form, harga: e.target.value })}
                />
              </div>
            )}

            {flags?.has_hpp && activeTab === 'keluar' && (
              <div className="form-group">
                <label>HPP</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.hpp}
                  onChange={(e) => setForm({ ...form, hpp: e.target.value })}
                />
              </div>
            )}

            {flags?.has_discount && activeTab === 'keluar' && (
              <div className="form-group">
                <label>Diskon (%)</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.diskon}
                  onChange={(e) => setForm({ ...form, diskon: e.target.value })}
                  min="0"
                  max="100"
                />
              </div>
            )}

            <div className="form-group">
              <label>Customer / Supplier</label>
              <input
                type="text"
                className="form-control"
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>No Surat Jalan</label>
              <input
                type="text"
                className="form-control"
                value={form.no_sj}
                onChange={(e) => setForm({ ...form, no_sj: e.target.value })}
              />
            </div>

            <div className="form-group md:col-span-2">
              <label>Keterangan</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.keterangan}
                onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-4">
            <Plus size={18} weight="bold" />
            Simpan Transaksi
          </button>
        </form>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
}
