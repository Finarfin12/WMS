'use client';

/**
 * Batch Outbound — Surat Jalan keluar multi-item.
 *
 * Phase 6: UI-3 (pre-validasi stok) + UI-4 (pakta integritas popup)
 *
 * Flow:
 *   1. Isi header SJ (No SJ, Customer, Tanggal)
 *   2. Tambah items (material + qty + variasi per BU)
 *   3. Per item: auto-fetch stok available, highlight merah kalau kurang
 *   4. Submit: kalau totalQty >= 100 → modal pakta centang
 *   5. Kirim batchOutbound → handle resilient response
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Plus,
  Trash,
  PaperPlaneTilt,
  ArrowsClockwise,
  ArrowDown,
  ArrowUp,
  Warning,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react';
import { batchOutbound, type BatchOutboundPayload } from '@/lib/transaction';
import { getStock, type StockItem } from '@/lib/stock';
import { listBus, getBuFlags, type BUConfig } from '@/lib/bu-registry';
import { getMasterDataOptions } from '@/lib/master-data';
import { formatDateDmy, parseHargaID, formatHargaDisplay } from '@/lib/utils';
import { toast, alertError } from '@/lib/swal';
import { RadialLoading } from '@/lib/RadialLoading';

// ============================================================================
// Types
// ============================================================================

interface ItemRow {
  id: string;
  nama: string;
  warna: string;
  ukuran: string;
  lebar: string;
  qty: string;
  uom: string;
  hargaDisplay: string;
  harga: string;
  hppDisplay: string;
  hpp: string;
  diskon: string;
  keterangan: string;
  stokAvailable: number | null;
  stokLoading: boolean;
}

let _itemCounter = 0;
function nextId(): string {
  _itemCounter++;
  return `item-${Date.now()}-${_itemCounter}`;
}

// ============================================================================
// Page
// ============================================================================

export default function BatchOutboundPage() {
  // === BU state ===
  const [bu, setBu] = useState('');
  const [buConfig, setBuConfig] = useState<BUConfig | null>(null);

  // === Header ===
  const [header, setHeader] = useState({
    no_sj: `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`,
    tanggal: new Date().toISOString().slice(0, 10),
    customer: '',
    no_po: '',
    remarks: '',
    payment_method: '',
    delivery_date: '',
    resi: '',
    courier: '',
    delivery_cost: '',
  });

  // === Items ===
  const [items, setItems] = useState<ItemRow[]>([]);

  // === UI states ===
  const [showPakta, setShowPakta] = useState(false);
  const [paktaChecked, setPaktaChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // === Options (cascading / datalist) ===
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [lebarOptions, setLebarOptions] = useState<string[]>([]);
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({});

  // Sync BU
  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => setBu((e as CustomEvent<string>).detail);
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Load BU config + preload options
  useEffect(() => {
    if (!bu) return;
    listBus().then((bus) => {
      const found = bus.find((b) => b.bu_name === bu);
      if (found) {
        setBuConfig(found);
        // Preload material options
        getMasterDataOptions({ bu: found.bu_name, child_field: 'Nama' })
          .then((r) => setMaterialOptions(r.values))
          .catch(() => {});
        // Preload lebar untuk Canvas
        if (found.bu_id === 'canvas' && found.has_width) {
          getMasterDataOptions({ bu: found.bu_name, child_field: 'Lebar' })
            .then((r) => setLebarOptions(r.values))
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }, [bu]);

  const flags = buConfig ? getBuFlags(buConfig) : null;
  const isAtrione = buConfig?.bu_id === 'atrione';
  const isCanvas = buConfig?.bu_id === 'canvas';

  // ==========================================================================
  // Item management
  // ==========================================================================

  function addItem() {
    const id = nextId();
    setItems((prev) => [
      ...prev,
      {
        id,
        nama: '',
        warna: '',
        ukuran: '',
        lebar: '',
        qty: '',
        uom: buConfig?.default_uom || '',
        hargaDisplay: '',
        harga: '',
        hppDisplay: '',
        hpp: '',
        diskon: '',
        keterangan: '',
        stokAvailable: null,
        stokLoading: false,
      },
    ]);
  }

  function updateItem(id: string, field: keyof ItemRow, value: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // ==========================================================================
  // UI-3: Stok preview
  // ==========================================================================

  const fetchStokForItem = useCallback(
    async (itemId: string, nama: string, warna: string, ukuran: string) => {
      if (!bu || !nama) return;

      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, stokLoading: true } : it)),
      );

      try {
        const result = await getStock({ bu, nama, warna: warna || undefined, ukuran: ukuran || undefined, limit: 1 });
        const available = result.items[0]?.stok ?? 0;
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, stokAvailable: available, stokLoading: false } : it,
          ),
        );
      } catch {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, stokAvailable: null, stokLoading: false } : it,
          ),
        );
      }
    },
    [bu],
  );

  // Debounced stok fetch saat nama/warna/ukuran berubah
  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    items.forEach((it) => {
      if (!it.nama) return;
      if (timers[it.id]) clearTimeout(timers[it.id]);
      timers[it.id] = setTimeout(() => {
        fetchStokForItem(it.id, it.nama, it.warna, it.ukuran);
      }, 600);
    });
    return () => Object.values(timers).forEach(clearTimeout);
  }, [items.map((it) => `${it.id}:${it.nama}:${it.warna}:${it.ukuran}`).join('|')]);

  // ==========================================================================
  // UI-4: Pakta Integritas
  // ==========================================================================

  const totalQty = items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0), 0);
  const insufficientItems = items.filter(
    (it) => it.stokAvailable !== null && parseFloat(it.qty) > it.stokAvailable,
  );
  const canSubmit =
    items.length > 0 &&
    insufficientItems.length === 0 &&
    header.customer.trim() !== '' &&
    header.no_sj.trim() !== '' &&
    items.every((it) => it.nama.trim() !== '' && parseFloat(it.qty) > 0);

  // ==========================================================================
  // Submit
  // ==========================================================================

  async function handleSubmit() {
    if (!canSubmit) return;

    // Cek pakta
    if (totalQty >= 100 && !paktaChecked) {
      setShowPakta(true);
      return;
    }

    setSubmitting(true);
    const payload: BatchOutboundPayload = {
      bu,
      no_sj: header.no_sj,
      tanggal: header.tanggal,
      customer: header.customer,
      no_po: header.no_po || undefined,
      remarks: header.remarks || undefined,
      items: items.map((it) => ({
        nama: it.nama,
        qty: parseFloat(it.qty),
        uom: it.uom || undefined,
        harga: it.harga ? parseFloat(it.harga) : (it.hargaDisplay ? parseHargaID(it.hargaDisplay) : undefined),
        diskon: it.diskon ? parseFloat(it.diskon) : undefined,
        hpp: it.hpp ? parseFloat(it.hpp) : (it.hppDisplay ? parseHargaID(it.hppDisplay) : undefined),
        warna: it.warna || undefined,
        ukuran: it.ukuran || undefined,
        lebar: it.lebar || undefined,
        keterangan: it.keterangan || undefined,
      })),
      payment_method: header.payment_method || undefined,
      delivery_date: header.delivery_date || undefined,
      resi: header.resi || undefined,
      courier: header.courier || undefined,
      delivery_cost: header.delivery_cost ? parseHargaID(header.delivery_cost) : undefined,
      pakta_confirmed: totalQty >= 100 ? true : undefined,
    };

    try {
      const result = await batchOutbound(payload);
      if (result.ok) {
        toast(
          `SJ ${result.data.no_sj} tersimpan · ${result.data.rows_written} baris · ${result.data.items_count} item` +
            (result.data.fifo ? ' [FIFO]' : ''),
          'success',
        );
        // Reset
        setItems([]);
        setHeader((h) => ({
          ...h,
          no_sj: `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`,
          customer: '',
          no_po: '',
          remarks: '',
        }));
        setPaktaChecked(false);
        setShowPakta(false);
      } else {
        toast(`Backend down — masuk antrian (id: ${result.queue_id}), akan ter-sync otomatis`, 'warning');
      }
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_STOCK') {
        toast(`Stok tidak cukup: ${err.message}`, 'error');
      } else if (err?.code === 'PAKTA_REQUIRED') {
        setShowPakta(true);
      } else {
        alertError(err, 'Gagal menyimpan Surat Jalan');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================================================
  // Cascading helpers (Atrione)
  // ==========================================================================

  async function handleMaterialChange(itemId: string, nama: string) {
    updateItem(itemId, 'nama', nama);
    updateItem(itemId, 'ukuran', '');
    updateItem(itemId, 'warna', '');
    if (!isAtrione || !nama) return;

    const cacheKey = `ukuran:${nama}`;
    if (!optionsCache[cacheKey]) {
      try {
        const res = await getMasterDataOptions({ bu: buConfig!.bu_name, parent_field: 'Nama', parent_value: nama, child_field: 'Ukuran' });
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      } catch {}
    }
  }

  async function handleUkuranChange(itemId: string, ukuran: string, nama: string) {
    updateItem(itemId, 'ukuran', ukuran);
    updateItem(itemId, 'warna', '');
    if (!isAtrione || !nama || !ukuran) return;

    const cacheKey = `warna:${nama}:${ukuran}`;
    if (!optionsCache[cacheKey]) {
      try {
        const res = await getMasterDataOptions({ bu: buConfig!.bu_name, parent_field: 'Ukuran', parent_value: ukuran, child_field: 'Warna' });
        setOptionsCache((c) => ({ ...c, [cacheKey]: res.values }));
      } catch {}
    }
  }

  function getUkuranOptions(nama: string): string[] {
    return optionsCache[`ukuran:${nama}`] || [];
  }

  function getWarnaOptions(nama: string, ukuran: string): string[] {
    return optionsCache[`warna:${nama}:${ukuran}`] || [];
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Package size={32} weight="fill" className="text-primary" />
          Surat Jalan Keluar
          {bu && <span className="text-base font-normal text-muted">· {bu}</span>}
        </h1>
      </div>

      {!bu ? (
        <div className="card text-center py-12">
          <Package size={48} weight="duotone" className="text-primary mx-auto mb-3" />
          <p className="text-muted">Pilih Business Unit di tab atas untuk mulai</p>
        </div>
      ) : (
        <>
          {/* === Header Form === */}
          <div className="card">
            <h3 className="card-title">Detail Surat Jalan</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="form-group">
                <label>No Surat Jalan *</label>
                <input type="text" className="form-control" value={header.no_sj} onChange={(e) => setHeader({ ...header, no_sj: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tanggal</label>
                <input type="date" className="form-control" value={header.tanggal} onChange={(e) => setHeader({ ...header, tanggal: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <input type="text" className="form-control" value={header.customer} onChange={(e) => setHeader({ ...header, customer: e.target.value })} placeholder="Nama customer/toko" required />
              </div>
              <div className="form-group">
                <label>No PO</label>
                <input type="text" className="form-control" value={header.no_po} onChange={(e) => setHeader({ ...header, no_po: e.target.value })} />
              </div>
              <div className="form-group md:col-span-2">
                <label>Remarks</label>
                <input type="text" className="form-control" value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
              </div>
            </div>

            {/* Delivery fields (Atrione) */}
            {flags?.has_delivery_fields && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h4 className="text-sm font-semibold mb-3 text-muted">Delivery Details</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="form-group">
                    <label>Payment Method</label>
                    <input type="text" className="form-control" value={header.payment_method} onChange={(e) => setHeader({ ...header, payment_method: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Delivery Date</label>
                    <input type="date" className="form-control" value={header.delivery_date} onChange={(e) => setHeader({ ...header, delivery_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Resi / AWB</label>
                    <input type="text" className="form-control" value={header.resi} onChange={(e) => setHeader({ ...header, resi: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Courier</label>
                    <input type="text" className="form-control" value={header.courier} onChange={(e) => setHeader({ ...header, courier: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Delivery Cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">Rp</span>
                      <input type="text" className="form-control" style={{ paddingLeft: '2.5rem' }} value={header.delivery_cost} onChange={(e) => setHeader({ ...header, delivery_cost: e.target.value })} onBlur={() => { const n = parseHargaID(header.delivery_cost); setHeader({ ...header, delivery_cost: formatHargaDisplay(n) }); }} placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* === Items Table === */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="card-title m-0">Items ({items.length})</h3>
              <button type="button" onClick={addItem} className="btn btn-primary">
                <Plus size={18} weight="bold" /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-center text-muted py-8">Belum ada item. Klik &ldquo;Add Item&rdquo; untuk mulai.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Material</th>
                      {flags?.has_size && <th>Ukuran</th>}
                      {flags?.has_color && <th>Warna</th>}
                      {flags?.has_width && <th>Lebar</th>}
                      <th className="text-right w-24">Qty</th>
                      <th>UoM</th>
                      <th className="text-right w-20">Stok</th>
                      <th className="text-right">Harga</th>
                      {flags?.has_discount && <th className="text-right w-20">Diskon%</th>}
                      {flags?.has_hpp && <th className="text-right">HPP</th>}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const qtyNum = parseFloat(it.qty) || 0;
                      const stokOk = it.stokAvailable === null || qtyNum <= it.stokAvailable;
                      const ukuranOpts = getUkuranOptions(it.nama);
                      const warnaOpts = getWarnaOptions(it.nama, it.ukuran);

                      return (
                        <tr key={it.id} className={!stokOk && it.stokAvailable !== null ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <td className="text-muted text-sm">{idx + 1}</td>

                          {/* Material */}
                          <td>
                            {isAtrione && materialOptions.length > 0 ? (
                              <select className="form-control text-sm py-1" value={it.nama} onChange={(e) => handleMaterialChange(it.id, e.target.value)}>
                                <option value="">-- Pilih --</option>
                                {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            ) : (
                              <input type="text" className="form-control text-sm py-1" value={it.nama} onChange={(e) => { updateItem(it.id, 'nama', e.target.value); }} list={isCanvas ? 'bo-lebar-options' : undefined} />
                            )}
                          </td>

                          {/* Ukuran (Atrione cascading) */}
                          {flags?.has_size && (
                            <td>
                              {isAtrione && ukuranOpts.length > 0 ? (
                                <select className="form-control text-sm py-1" value={it.ukuran} onChange={(e) => handleUkuranChange(it.id, e.target.value, it.nama)}>
                                  <option value="">--</option>
                                  {ukuranOpts.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                              ) : (
                                <input type="text" className="form-control text-sm py-1" value={it.ukuran} onChange={(e) => updateItem(it.id, 'ukuran', e.target.value)} />
                              )}
                            </td>
                          )}

                          {/* Warna (Atrione cascading) */}
                          {flags?.has_color && (
                            <td>
                              {isAtrione && warnaOpts.length > 0 ? (
                                <select className="form-control text-sm py-1" value={it.warna} onChange={(e) => updateItem(it.id, 'warna', e.target.value)}>
                                  <option value="">--</option>
                                  {warnaOpts.map((w) => <option key={w} value={w}>{w}</option>)}
                                </select>
                              ) : (
                                <input type="text" className="form-control text-sm py-1" value={it.warna} onChange={(e) => updateItem(it.id, 'warna', e.target.value)} />
                              )}
                            </td>
                          )}

                          {/* Lebar (Canvas datalist) */}
                          {flags?.has_width && (
                            <td>
                              <input type="text" className="form-control text-sm py-1" value={it.lebar} onChange={(e) => updateItem(it.id, 'lebar', e.target.value)} list="bo-lebar-options" />
                            </td>
                          )}

                          {/* Qty */}
                          <td>
                            <input type="number" step="any" min="0" className="form-control text-sm py-1 text-right" value={it.qty} onChange={(e) => updateItem(it.id, 'qty', e.target.value)} />
                          </td>

                          {/* UoM */}
                          <td>
                            <input type="text" className="form-control text-sm py-1" style={{ width: 70 }} value={it.uom} onChange={(e) => updateItem(it.id, 'uom', e.target.value)} />
                          </td>

                          {/* Stok preview (UI-3) */}
                          <td className="text-right">
                            {it.stokLoading ? (
                              <RadialLoading size={14} />
                            ) : it.stokAvailable === null ? (
                              <span className="text-muted text-xs">-</span>
                            ) : stokOk ? (
                              <span className="text-success text-sm font-semibold">{it.stokAvailable}</span>
                            ) : (
                              <span className="text-danger text-sm font-bold">{it.stokAvailable}</span>
                            )}
                          </td>

                          {/* Harga */}
                          <td>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs">Rp</span>
                              <input type="text" className="form-control text-sm py-1 text-right" style={{ paddingLeft: '1.75rem', minWidth: 100 }} value={it.hargaDisplay} onChange={(e) => updateItem(it.id, 'hargaDisplay', e.target.value)} onBlur={() => { const n = parseHargaID(it.hargaDisplay); updateItem(it.id, 'harga', String(n)); updateItem(it.id, 'hargaDisplay', n ? formatHargaDisplay(n) : ''); }} placeholder="0" />
                            </div>
                          </td>

                          {/* Diskon */}
                          {flags?.has_discount && (
                            <td>
                              <input type="number" min="0" max="100" className="form-control text-sm py-1 text-right" style={{ width: 60 }} value={it.diskon} onChange={(e) => updateItem(it.id, 'diskon', e.target.value)} />
                            </td>
                          )}

                          {/* HPP */}
                          {flags?.has_hpp && (
                            <td>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs">Rp</span>
                                <input type="text" className="form-control text-sm py-1 text-right" style={{ paddingLeft: '1.75rem', minWidth: 100 }} value={it.hppDisplay} onChange={(e) => updateItem(it.id, 'hppDisplay', e.target.value)} onBlur={() => { const n = parseHargaID(it.hppDisplay); updateItem(it.id, 'hpp', String(n)); updateItem(it.id, 'hppDisplay', n ? formatHargaDisplay(n) : ''); }} placeholder="0" />
                              </div>
                            </td>
                          )}

                          {/* Delete */}
                          <td>
                            <button type="button" onClick={() => removeItem(it.id)} className="text-danger hover:text-red-700 p-1" title="Hapus item">
                              <Trash size={16} weight="bold" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary footer */}
            {items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
                <div>
                  <span className="text-sm text-muted">Total Qty: </span>
                  <span className={`text-lg font-bold ${totalQty >= 100 ? 'text-warning' : ''}`}>
                    {totalQty.toLocaleString('id-ID')} unit
                  </span>
                  {totalQty >= 100 && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-1 rounded-full">
                      <Warning size={12} weight="fill" className="inline mr-1" />
                      Pakta Integritas
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  {insufficientItems.length > 0 && (
                    <span className="text-danger mr-4">
                      {insufficientItems.length} item stok tidak cukup
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="btn btn-primary"
            >
              {submitting ? (
                <RadialLoading size={18} />
              ) : (
                <>
                  <PaperPlaneTilt size={18} weight="bold" />
                  Submit Surat Jalan
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Datalist lebar Canvas (global, dipakai semua row) */}
      {isCanvas && lebarOptions.length > 0 && (
        <datalist id="bo-lebar-options">
          {lebarOptions.map((v) => <option key={v} value={v} />)}
        </datalist>
      )}

      {/* === Pakta Integritas Modal (UI-4) === */}
      {showPakta && (
        <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPakta(false)}>
          <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
                <Warning size={22} weight="fill" className="text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Pakta Integritas</h3>
                <p className="text-sm text-muted">
                  Total Qty: <strong className="text-warning">{totalQty.toLocaleString('id-ID')} unit</strong> (melebihi threshold 100)
                </p>
              </div>
            </div>

            <hr className="border-[var(--border)] mb-4" />

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-[var(--bg)] transition">
              <input
                type="checkbox"
                checked={paktaChecked}
                onChange={(e) => setPaktaChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary"
              />
              <span className="text-sm leading-relaxed">
                <strong>Pakta Integritas:</strong> Saya menyatakan bahwa jumlah barang
                yang di-input sudah sesuai dengan fisik yang keluar dari gudang.
              </span>
            </label>

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => { setShowPakta(false); setPaktaChecked(false); }}
                className="btn btn-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { setShowPakta(false); handleSubmit(); }}
                disabled={!paktaChecked}
                className="btn btn-primary"
              >
                Ya, Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
