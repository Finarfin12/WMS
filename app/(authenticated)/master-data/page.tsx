'use client';

/**
 * Master Data — list + form CRUD per BU.
 *
 * MD bersifat schema-aware: kolom adjust per BU (Atrione: warna+ukuran+HPP, Canvas: lebar+berat, dst).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Database,
  Plus,
  PencilSimple,
  Trash,
  ArrowsClockwise,
  MagnifyingGlass,
  X,
  CaretDown,
  CaretRight,
  StackSimple,
} from '@phosphor-icons/react';
import {
  listMasterData,
  saveMasterData,
  deleteMasterData,
  type MasterDataSavePayload,
} from '@/lib/master-data';
import { listBus, getBuFlags, type BUConfig } from '@/lib/bu-registry';
import { RadialLoading } from '@/lib/RadialLoading';
import { confirm, toast, alertError, withLoading } from '@/lib/swal';
import { formatCurrency, formatDateDmy, parseHargaID, formatHargaDisplay } from '@/lib/utils';
import { ContextMenu } from '@/components/ContextMenu';

// Helper format tanggal (dipakai di grouping batch)
function formatDate(iso: string): string {
  return formatDateDmy(iso);
}

type MdRow = Record<string, unknown> & { ID?: string };

interface BatchGroup {
  key: string;
  nama: string;
  warna: string;
  ukuran: string;
  lebar: string;
  uom: string;
  totalStok: number;
  hargaMin: number;
  hargaMax: number;
  satuan: string;
  batches: MdRow[];
}

/**
 * Group MD rows by composite key (nama + variasi).
 * Untuk BU FIFO (Canvas, Chemical): material sama tapi harga/tanggal beda
 * akan di-merge sebagai 1 grup dengan multiple batch.
 */
function groupBatches(items: MdRow[]): BatchGroup[] {
  const map = new Map<string, BatchGroup>();
  for (const item of items) {
    const nama = String(item['Nama'] || item['Nama Material'] || item['Nama Barang'] || '');
    const warna = String(item['Warna'] || '');
    const ukuran = String(item['Ukuran'] || '');
    const lebar = String(item['Lebar'] || '');
    const key = `${nama}|${warna}|${ukuran}|${lebar}`;
    const harga = Number(item['Harga Jual']) || 0;
    const stok = Number(item['Stok Awal']) || 0;

    let grp = map.get(key);
    if (!grp) {
      grp = {
        key,
        nama,
        warna,
        ukuran,
        lebar,
        uom: String(item['UoM'] || ''),
        totalStok: 0,
        hargaMin: harga,
        hargaMax: harga,
        satuan: String(item['Satuan Harga'] || 'IDR'),
        batches: [],
      };
      map.set(key, grp);
    }
    grp.totalStok += stok;
    if (harga < grp.hargaMin) grp.hargaMin = harga;
    if (harga > grp.hargaMax) grp.hargaMax = harga;
    grp.batches.push(item);
  }

  // Sort batch dalam grup: tanggal ASC (FIFO order)
  for (const grp of map.values()) {
    grp.batches.sort((a, b) => {
      const da = new Date(String(a['Tanggal'] || '')).getTime() || 0;
      const db = new Date(String(b['Tanggal'] || '')).getTime() || 0;
      return da - db;
    });
  }

  return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
}

export default function MasterDataPage() {
  const [bu, setBu] = useState('');
  const [buConfig, setBuConfig] = useState<BUConfig | null>(null);
  const [items, setItems] = useState<MdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item?: MdRow; isGroup?: boolean; groupName?: string } | null>(null);

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [form, setForm] = useState({
    tipe: 'Material Baru',
    tanggal: new Date().toISOString().slice(0, 10),
    nama: '',
    warna: '',
    ukuran: '',
    lebar: '',
    uom: '',
    harga_jual: '',
    hpp: '',
    satuan_harga: 'IDR',
    stok_awal: '',
    alamat: '',
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
          const defaultType = found.bu_id === 'atrione' ? 'Produk Baru' : 'Material Baru';
          setForm((f) => ({ ...f, tipe: defaultType, uom: found.default_uom || '' }));
        }
      })
      .catch(alertError);
  }, [bu]);

  const load = useCallback(async () => {
    if (!bu) return;
    setLoading(true);
    try {
      const result = await listMasterData({ bu, search: search || undefined });
      setItems(((result || []) as unknown) as MdRow[]);
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
    }
  }, [bu, search]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    const isAtrione = buConfig?.bu_id === 'atrione';
    const defaultType = isAtrione ? 'Produk Baru' : 'Material Baru';
    setEditingId(null);
    setForm({
      tipe: defaultType,
      tanggal: new Date().toISOString().slice(0, 10),
      nama: '',
      warna: '',
      ukuran: '',
      lebar: '',
      uom: buConfig?.default_uom || '',
      harga_jual: '',
      hpp: '',
      satuan_harga: 'IDR',
      stok_awal: '',
      alamat: '',
    });
    setShowForm(true);
  }

  function openEdit(item: MdRow) {
    const isAtrione = buConfig?.bu_id === 'atrione';
    const defaultType = isAtrione ? 'Produk Baru' : 'Material Baru';
    setEditingId((item.ID as string) || null);
    setForm({
      tipe: (item['Tipe'] as string) || defaultType,
      tanggal: (item['Tanggal'] as string)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      nama: (item['Nama'] || item['Nama Material'] || item['Nama Barang'] || '') as string,
      warna: (item['Warna'] as string) || '',
      ukuran: (item['Ukuran'] as string) || '',
      lebar: (item['Lebar'] as string) || '',
      uom: (item['UoM'] as string) || buConfig?.default_uom || '',
      harga_jual: String(item['Harga Jual'] || ''),
      hpp: String(item['HPP'] || ''),
      satuan_harga: (item['Satuan Harga'] as string) || 'IDR',
      stok_awal: String(item['Stok Awal'] || ''),
      alamat: (item['Alamat'] as string) || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama) {
      toast('Nama wajib diisi', 'error');
      return;
    }

    const hideExtraFields = form.tipe === 'Customer Baru' || form.tipe === 'Payment Method';

    const payload: MasterDataSavePayload = {
      bu,
      tipe: form.tipe,
      tanggal: form.tanggal,
      nama: form.nama,
      uom: hideExtraFields ? (buConfig?.default_uom || 'Unit') : form.uom,
      warna: !hideExtraFields && form.warna ? form.warna : undefined,
      ukuran: !hideExtraFields && form.ukuran ? form.ukuran : undefined,
      lebar: !hideExtraFields && form.lebar ? form.lebar : undefined,
      harga_jual: !hideExtraFields && form.harga_jual ? parseFloat(form.harga_jual) : 0,
      hpp: !hideExtraFields && form.hpp ? parseFloat(form.hpp) : undefined,
      satuan_harga: (!hideExtraFields ? form.satuan_harga : 'IDR') as 'IDR' | 'USD',
      stok_awal: !hideExtraFields && form.stok_awal ? parseFloat(form.stok_awal) : 0,
      alamat: form.tipe === 'Customer Baru' && form.alamat ? form.alamat : undefined,
    };

    if (editingId) {
      payload.id = editingId;
    }

    const result = await withLoading(() => saveMasterData(payload), {
      loadingText: editingId ? 'Mengupdate…' : 'Menyimpan…',
    });

    if (result) {
      if (result.ok) {
        toast(editingId ? 'Master data ter-update' : 'Master data tersimpan', 'success');
      } else {
        toast(`Backend down — masuk antrian (id: ${result.queue_id})`, 'warning');
      }
      setShowForm(false);
      load();
    }
  }

  async function handleDelete(id: string, nama: string) {
    const ok = await confirm(`Hapus "${nama}"?`, 'Soft delete (data masih bisa di-restore)', {
      type: 'warning',
      confirmText: 'Hapus',
    });
    if (!ok) return;

    const result = await withLoading(() => deleteMasterData(bu, id), {
      loadingText: 'Menghapus…',
    });
    if (result) {
      if (result.ok) {
        toast('Master data dihapus', 'success');
      } else {
        toast(`Backend down — delete masuk antrian (id: ${result.queue_id})`, 'warning');
      }
      load();
    }
  }

  const flags = buConfig ? getBuFlags(buConfig) : null;
  const isAtrione = buConfig?.bu_id === 'atrione';
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Database size={32} weight="fill" className="text-primary" />
          Master Data {bu}
        </h1>
        <button type="button" onClick={openNew} className="btn btn-primary">
          <Plus size={18} weight="bold" />
          Tambah Baru
        </button>
      </div>

      {/* Filter */}
      <div className="card flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            className="form-control"
            placeholder="Cari nama…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
        <button type="button" onClick={load} className="btn btn-secondary" disabled={loading}>
          <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="py-12 flex justify-center">
            <RadialLoading size={60} />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted py-12">Belum ada master data</p>
        ) : flags?.has_fifo ? (
          // === FIFO BU (Canvas, Chemical): grouping by nama+variasi ===
          <div className="overflow-x-auto">
            <p className="text-xs text-muted mb-2 flex items-center gap-1">
              <StackSimple size={14} weight="bold" />
              Material sama dengan harga/tanggal berbeda di-grup. Klik baris untuk lihat batch FIFO.
            </p>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Nama</th>
                  <th>Variasi</th>
                  <th>UoM</th>
                  <th className="text-right">Total Stok</th>
                  <th className="text-right">Range Harga</th>
                  <th className="text-center">Batch</th>
                </tr>
              </thead>
              <tbody>
                {groupBatches(items).map((grp) => {
                  const isOpen = expandedKeys.has(grp.key);
                  const variasi = [grp.warna, grp.ukuran, grp.lebar].filter(Boolean).join(' / ');
                  const hargaLabel =
                    grp.hargaMin === grp.hargaMax
                      ? formatCurrency(grp.hargaMin)
                      : `${formatCurrency(grp.hargaMin)} – ${formatCurrency(grp.hargaMax)}`;
                  return (
                    <>
                      <tr
                        key={grp.key}
                        onClick={() => toggleExpand(grp.key)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, isGroup: true, groupName: grp.nama });
                        }}
                        className="cursor-pointer hover:bg-slate-800/50"
                      >
                        <td>
                          {isOpen ? (
                            <CaretDown size={16} weight="bold" className="text-primary" />
                          ) : (
                            <CaretRight size={16} weight="bold" className="text-muted" />
                          )}
                        </td>
                        <td className="font-semibold">{grp.nama}</td>
                        <td className="text-sm text-muted">{variasi || '-'}</td>
                        <td>{grp.uom || '-'}</td>
                        <td className="text-right font-bold">
                          <span className={grp.totalStok < 10 ? 'text-danger' : ''}>
                            {grp.totalStok.toLocaleString('id-ID')}
                          </span>
                        </td>
                        <td className="text-right">
                          {grp.hargaMin === grp.hargaMax ? (
                            <span>{hargaLabel}</span>
                          ) : (
                            <span className="text-warning font-semibold" title="Multi-batch dengan harga berbeda">
                              {hargaLabel}
                            </span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white font-semibold shadow-sm">
                            {grp.batches.length}
                          </span>
                        </td>
                      </tr>
                      {isOpen &&
                        grp.batches.map((batch, i) => (
                          <tr
                            key={`${grp.key}-${i}`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, item: batch, isGroup: false });
                            }}
                            className="bg-[var(--bg-color)] text-sm hover:bg-slate-800/50 cursor-context-menu"
                          >
                            <td></td>
                            <td colSpan={2} className="pl-6 text-muted">
                              ↳ Batch {i + 1} · {formatDate(batch['Tanggal'] as string)}
                            </td>
                            <td className="text-xs text-muted">
                              {(batch['Tipe'] as string) || '-'}
                            </td>
                            <td className="text-right">
                              {(batch['Stok Awal'] as number) || 0}
                            </td>
                            <td className="text-right">
                              {formatCurrency(Number(batch['Harga Jual']) || 0)}
                            </td>
                            <td className="text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEdit(batch);
                                  }}
                                  className="text-primary hover:text-primary-hover p-1"
                                  title="Edit batch"
                                >
                                  <PencilSimple size={14} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(
                                      (batch.ID as string) || '',
                                      `Batch ${grp.nama}`,
                                    );
                                  }}
                                  className="text-danger hover:text-red-700 p-1"
                                  title="Hapus batch"
                                >
                                  <Trash size={14} weight="bold" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // === Non-FIFO BU (Atrione): flat list, 1 row per SKU ===
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipe</th>
                  <th>Nama</th>
                  <th>Variasi</th>
                  <th>UoM</th>
                  <th className="text-right">Harga Jual</th>
                  {flags?.has_hpp && <th className="text-right">HPP</th>}
                  <th className="text-right">Stok Awal</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr 
                    key={(item.ID as string) || i}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, item: item, isGroup: false });
                    }}
                    className="hover:bg-slate-800/50 cursor-context-menu"
                  >
                    <td>
                      <span className="text-xs px-2 py-1 rounded bg-[var(--bg-color)] text-muted">
                        {(item['Tipe'] as string) || '-'}
                      </span>
                    </td>
                    <td className="font-semibold">
                      {(item['Nama'] || item['Nama Material'] || item['Nama Barang'] || '-') as string}
                    </td>
                    <td className="text-sm text-muted">
                      {[item['Warna'], item['Ukuran'], item['Lebar']]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </td>
                    <td>{(item['UoM'] as string) || '-'}</td>
                    <td className="text-right">
                      {formatCurrency(Number(item['Harga Jual']) || 0)}
                    </td>
                    {flags?.has_hpp && (
                      <td className="text-right">
                        {formatCurrency(Number(item['HPP']) || 0)}
                      </td>
                    )}
                    <td className="text-right">
                      {(item['Stok Awal'] as number) || 0}
                    </td>
                    <td className="text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="text-primary hover:text-primary-hover p-1"
                          title="Edit"
                        >
                          <PencilSimple size={18} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(
                              (item.ID as string) || '',
                              (item['Nama Material'] || item['Nama Barang'] || '') as string,
                            )
                          }
                          className="text-danger hover:text-red-700 p-1"
                          title="Hapus"
                        >
                          <Trash size={18} weight="bold" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          options={
            contextMenu.isGroup
              ? [
                  {
                    label: `Tambah Batch ${contextMenu.groupName}`,
                    icon: <Plus weight="bold" />,
                    onClick: () => {
                      setShowForm(true);
                      setEditingId(null);
                      setForm({
                        tipe: isAtrione ? 'Produk Baru' : 'Material Baru',
                        tanggal: new Date().toISOString().slice(0, 10),
                        nama: contextMenu.groupName || '',
                        warna: '',
                        ukuran: '',
                        lebar: '',
                        uom: '',
                        harga_jual: '',
                        hpp: '',
                        satuan_harga: 'IDR',
                        stok_awal: '',
                      });
                    },
                  },
                ]
              : [
                  {
                    label: 'Salin Nama',
                    onClick: () =>
                      navigator.clipboard.writeText(
                        (contextMenu.item?.['Nama Material'] ||
                          contextMenu.item?.['Nama Barang'] ||
                          '') as string
                      ),
                  },
                  {
                    label: 'Edit Data',
                    icon: <PencilSimple weight="bold" />,
                    onClick: () => contextMenu.item && openEdit(contextMenu.item),
                  },
                  {
                    label: 'Hapus',
                    icon: <Trash weight="bold" />,
                    danger: true,
                    onClick: () => {
                      if (contextMenu.item) {
                        handleDelete(
                          (contextMenu.item.ID as string) || '',
                          (contextMenu.item['Nama Material'] ||
                            contextMenu.item['Nama Barang'] ||
                            '') as string
                        );
                      }
                    },
                  },
                ]
          }
        />
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-extrabold">
                {editingId ? 'Edit' : 'Tambah'} Master Data
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-muted hover:text-danger p-1"
              >
                <X size={24} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Tipe</label>
                  <select
                    className="form-control"
                    value={form.tipe}
                    onChange={(e) => setForm({ ...form, tipe: e.target.value })}
                  >
                    {isAtrione ? (
                      <>
                        <option value="Produk Baru">Produk Baru</option>
                        <option value="Customer Baru">Customer Baru</option>
                        <option value="Payment Method">Payment Method</option>
                      </>
                    ) : (
                      <>
                        <option value="Material Baru">Material Baru</option>
                        <option value="Customer Baru">Customer Baru</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Tanggal</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.tanggal}
                    onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  />
                </div>
                <div className="form-group md:col-span-2">
                  <label>{(form.tipe === 'Customer Baru' || form.tipe === 'Payment Method') ? 'Nama' : 'Nama Barang'}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.nama}
                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                    required
                  />
                </div>

                {form.tipe === 'Customer Baru' && (
                  <div className="form-group md:col-span-2">
                    <label>Alamat (Dicetak di Surat Jalan)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={form.alamat || ''}
                      onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                      placeholder="Masukkan alamat lengkap pengiriman..."
                    />
                  </div>
                )}

                {/* Hide fields for Customer and Payment Method */}
                {form.tipe !== 'Customer Baru' && form.tipe !== 'Payment Method' && (
                  <>
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
                      <label>UoM</label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.uom}
                        onChange={(e) => setForm({ ...form, uom: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Harga Jual</label>
                      <input
                        type="number"
                        className="form-control"
                        value={form.harga_jual}
                        onChange={(e) => setForm({ ...form, harga_jual: e.target.value })}
                      />
                    </div>
                    {flags?.has_hpp && (
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
                    <div className="form-group">
                      <label>Satuan Harga</label>
                      <select
                        className="form-control"
                        value={form.satuan_harga}
                        onChange={(e) => setForm({ ...form, satuan_harga: e.target.value })}
                      >
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Stok Awal</label>
                      <input
                        type="number"
                        className="form-control"
                        value={form.stok_awal}
                        onChange={(e) => setForm({ ...form, stok_awal: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update' : 'Simpan'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
