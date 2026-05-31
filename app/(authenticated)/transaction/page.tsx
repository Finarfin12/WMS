'use client';

/**
 * Transaction — input form + list transaksi terkini.
 *
 * Phase 6 updates:
 *   - UI-1: Cascading dropdown Atrione (material → ukuran → warna) via masterData.options
 *   - UI-2: Datalist Lebar Canvas via masterData.options
 *   - UI-6: Display tanggal pakai formatDateDmy (DD/MM/YYYY)
 *   - UI-7: Input harga auto-format Indonesia (parseHargaID + formatHargaDisplay)
 */

import { useEffect, useState, useCallback } from 'react';
import { Receipt, Plus, ArrowsClockwise, ArrowDown, ArrowUp, ListBullets } from '@phosphor-icons/react';
import { saveTransaction } from '@/lib/transaction';
import { searchHistory, type HistoryItem } from '@/lib/history';
import { listBus, getBuFlags, type BUConfig } from '@/lib/bu-registry';
import { getMasterDataOptions } from '@/lib/master-data';
import { RadialLoading } from '@/lib/RadialLoading';
import { toast, alertError, withLoading } from '@/lib/swal';
import { formatDateDmy, parseHargaID, formatHargaDisplay } from '@/lib/utils';

type Tab = 'masuk' | 'keluar' | 'list';

export default function TransactionPage() {
  const [bu, setBu] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('masuk');
  const [buConfig, setBuConfig] = useState<BUConfig | null>(null);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // === UI-1 + UI-2: Cascading options state ===
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [ukuranOptions, setUkuranOptions] = useState<string[]>([]);
  const [warnaOptions, setWarnaOptions] = useState<string[]>([]);
  const [lebarOptions, setLebarOptions] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState({ material: false, ukuran: false, warna: false, lebar: false });
  // Cache: skip refetch kalau parent value sama
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    nama: '',
    warna: '',
    ukuran: '',
    lebar: '',
    uom: '',
    qty: '',
    hargaDisplay: '',
    harga: '',   // actual number value
    hppDisplay: '',
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

  // Load BU config + initial options
  useEffect(() => {
    if (!bu) return;
    listBus()
      .then(async (bus) => {
        const found = bus.find((b) => b.bu_name === bu);
        if (found) {
          setBuConfig(found);
          setForm((f) => ({ ...f, uom: found.default_uom || '' }));

          // Preload master data options
          // Atrione cascading: material list
          if (found.bu_id === 'atrione') {
            setOptionsLoading((o) => ({ ...o, material: true }));
            try {
              const result = await getMasterDataOptions({ bu: found.bu_name, child_field: 'Nama' });
              setMaterialOptions(result.values);
            } catch { /* ignore */ }
            setOptionsLoading((o) => ({ ...o, material: false }));
          }
          // Canvas datalist: lebar
          if (found.bu_id === 'canvas' && found.has_width) {
            setOptionsLoading((o) => ({ ...o, lebar: true }));
            try {
              const result = await getMasterDataOptions({ bu: found.bu_name, child_field: 'Lebar' });
              setLebarOptions(result.values);
            } catch { /* ignore */ }
            setOptionsLoading((o) => ({ ...o, lebar: false }));
          }
        }
      })
      .catch((err) => alertError(err));
  }, [bu]);

  // === UI-1: Cascading Atrione ===
  // Material berubah → fetch ukuran
  useEffect(() => {
    if (!buConfig || buConfig.bu_id !== 'atrione' || !form.nama) {
      setUkuranOptions([]);
      setWarnaOptions([]);
      setForm((f) => ({ ...f, ukuran: '', warna: '' }));
      return;
    }
    const cacheKey = `ukuran:${form.nama}`;
    if (optionsCache[cacheKey]) {
      setUkuranOptions(optionsCache[cacheKey]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, ukuran: true }));
    getMasterDataOptions({
      bu: buConfig.bu_name,
      parent_field: 'Nama',
      parent_value: form.nama,
      child_field: 'Ukuran',
    })
      .then((res) => {
        setUkuranOptions(res.values);
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      })
      .catch(() => setUkuranOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, ukuran: false })));
  }, [form.nama, buConfig]);

  // Ukuran berubah → fetch warna
  useEffect(() => {
    if (!buConfig || buConfig.bu_id !== 'atrione' || !form.ukuran) {
      setWarnaOptions([]);
      setForm((f) => ({ ...f, warna: '' }));
      return;
    }
    const cacheKey = `warna:${form.nama}:${form.ukuran}`;
    if (optionsCache[cacheKey]) {
      setWarnaOptions(optionsCache[cacheKey]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, warna: true }));
    getMasterDataOptions({
      bu: buConfig.bu_name,
      parent_field: 'Ukuran',
      parent_value: form.ukuran,
      child_field: 'Warna',
    })
      .then((res) => {
        setWarnaOptions(res.values);
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      })
      .catch(() => setWarnaOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, warna: false })));
  }, [form.ukuran, buConfig]);

  // === UI-2: Preload datalist Canvas lebar ===
  // (sudah di-fetch di useEffect BU config di atas)

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
          harga: form.harga ? parseFloat(form.harga) : (form.hargaDisplay ? parseHargaID(form.hargaDisplay) : undefined),
          hpp: form.hpp ? parseFloat(form.hpp) : (form.hppDisplay ? parseHargaID(form.hppDisplay) : undefined),
          diskon: form.diskon ? parseFloat(form.diskon) : undefined,
          customer: form.customer || undefined,
          no_sj: form.no_sj || undefined,
          keterangan: form.keterangan || undefined,
          user: userEmail,
        }),
      {
        loadingText: 'Menyimpan transaksi…',
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
        hargaDisplay: '',
        hpp: '',
        hppDisplay: '',
        diskon: '',
        customer: '',
        no_sj: '',
        keterangan: '',
      });
    }
  }

  const flags = buConfig ? getBuFlags(buConfig) : null;
  const isAtrione = buConfig?.bu_id === 'atrione';
  const isCanvas = buConfig?.bu_id === 'canvas';

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
                      <td>{formatDateDmy(tx.Tanggal as string)}</td>
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

            {/* === UI-1: Cascading Atrione — Material dropdown === */}
            <div className="form-group">
              <label>Nama Barang</label>
              {isAtrione && materialOptions.length > 0 ? (
                optionsLoading.material ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : (
                  <select
                    className="form-control"
                    value={form.nama}
                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Produk --</option>
                    {materialOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )
              ) : (
                <input
                  type="text"
                  className="form-control"
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  list={isAtrione ? 'material-suggestions' : undefined}
                  required
                />
              )}
              {isAtrione && materialOptions.length > 0 && (
                <datalist id="material-suggestions">
                  {materialOptions.map((m) => <option key={m} value={m} />)}
                </datalist>
              )}
            </div>

            {/* === UI-1: Cascading Atrione — Ukuran dropdown === */}
            {flags?.has_size && (
              <div className="form-group">
                <label>Ukuran</label>
                {isAtrione && ukuranOptions.length > 0 ? (
                  <select
                    className="form-control"
                    value={form.ukuran}
                    onChange={(e) => setForm({ ...form, ukuran: e.target.value })}
                  >
                    <option value="">-- Pilih Ukuran --</option>
                    {ukuranOptions.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                ) : optionsLoading.ukuran ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={form.ukuran}
                    onChange={(e) => setForm({ ...form, ukuran: e.target.value })}
                  />
                )}
              </div>
            )}

            {/* === UI-1: Cascading Atrione — Warna dropdown === */}
            {flags?.has_color && (
              <div className="form-group">
                <label>Warna</label>
                {isAtrione && warnaOptions.length > 0 ? (
                  <select
                    className="form-control"
                    value={form.warna}
                    onChange={(e) => setForm({ ...form, warna: e.target.value })}
                  >
                    <option value="">-- Pilih Warna --</option>
                    {warnaOptions.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                ) : optionsLoading.warna ? (
                  <div className="form-control flex items-center"><RadialLoading size={16} /></div>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={form.warna}
                    onChange={(e) => setForm({ ...form, warna: e.target.value })}
                  />
                )}
              </div>
            )}

            {/* === UI-2: Datalist Lebar Canvas === */}
            {flags?.has_width && (
              <div className="form-group">
                <label>Lebar</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.lebar}
                  onChange={(e) => setForm({ ...form, lebar: e.target.value })}
                  list={isCanvas && lebarOptions.length > 0 ? 'lebar-options' : undefined}
                  placeholder={isCanvas ? 'Cari lebar...' : undefined}
                />
                {isCanvas && lebarOptions.length > 0 && (
                  <datalist id="lebar-options">
                    {lebarOptions.map((v) => <option key={v} value={v} />)}
                  </datalist>
                )}
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

            {/* === UI-7: Input Harga auto-format Indonesia === */}
            {activeTab === 'keluar' && (
              <div className="form-group">
                <label>Harga Jual</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">Rp</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '2.5rem' }}
                    value={form.hargaDisplay}
                    onChange={(e) => setForm({ ...form, hargaDisplay: e.target.value })}
                    onBlur={() => {
                      const num = parseHargaID(form.hargaDisplay);
                      setForm({ ...form, harga: String(num), hargaDisplay: formatHargaDisplay(num) });
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {flags?.has_hpp && activeTab === 'keluar' && (
              <div className="form-group">
                <label>HPP</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">Rp</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '2.5rem' }}
                    value={form.hppDisplay}
                    onChange={(e) => setForm({ ...form, hppDisplay: e.target.value })}
                    onBlur={() => {
                      const num = parseHargaID(form.hppDisplay);
                      setForm({ ...form, hpp: String(num), hppDisplay: formatHargaDisplay(num) });
                    }}
                    placeholder="0"
                  />
                </div>
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
