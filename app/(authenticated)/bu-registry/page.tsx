'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Buildings,
  Plus,
  PencilSimple,
  CheckCircle,
  XCircle,
  X,
  FloppyDisk,
} from '@phosphor-icons/react';
import { listBus, saveBu, type BUConfig, type CreateBuPayload } from '@/lib/bu-registry';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast, withLoading } from '@/lib/swal';

const CANVAS_TEMPLATE: CreateBuPayload = {
  bu_id: '',
  bu_name: '',
  bu_type: 'raw_material',
  icon: 'Package',
  default_uom: 'Meter',
  low_stock_threshold: 10,
  has_color: false,
  has_width: false,
  has_size: false,
  has_weight: false,
  has_hpp: false,
  has_discount: false,
  has_fifo: true,
  has_delivery_fields: false,
  surat_jalan_template: 'canvas',
  uom_options: ['Meter', 'Roll', 'Yard', 'Pcs'],
  currency_options: ['IDR'],
  is_active: true,
  sort_order: 10,
};

export default function BuRegistryPage() {
  const router = useRouter();
  const [bus, setBus] = useState<BUConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateBuPayload>(CANVAS_TEMPLATE);

  useEffect(() => {
    const stored = localStorage.getItem('wms_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user.role === 'Superadmin') {
          setIsSuperadmin(true);
          loadData();
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await listBus({ includeInactive: true });
      setBus(data);
    } catch (err) {
      alertError(err, 'Gagal memuat data BU');
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    setEditingId(null);
    setForm({ ...CANVAS_TEMPLATE });
    setModalOpen(true);
  }

  function handleEdit(bu: BUConfig) {
    setEditingId(bu.bu_id);
    setForm({
      bu_id: bu.bu_id,
      bu_name: bu.bu_name,
      bu_type: bu.bu_type,
      icon: bu.icon || 'Package',
      default_uom: bu.default_uom || 'Meter',
      low_stock_threshold: bu.low_stock_threshold || 0,
      has_color: !!bu.has_color,
      has_width: !!bu.has_width,
      has_size: !!bu.has_size,
      has_weight: !!bu.has_weight,
      has_hpp: !!bu.has_hpp,
      has_discount: !!bu.has_discount,
      has_fifo: !!bu.has_fifo,
      has_delivery_fields: !!bu.has_delivery_fields,
      surat_jalan_template: bu.surat_jalan_template || 'default',
      uom_options: bu.uom_options || ['Meter'],
      currency_options: bu.currency_options || ['IDR'],
      is_active: !!bu.is_active,
      sort_order: bu.sort_order || 10,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bu_id.trim() || !form.bu_name.trim()) {
      toast('BU ID dan BU Name wajib diisi', 'warning');
      return;
    }

    try {
      await withLoading(
        () => saveBu(form),
        { loadingText: 'Menyimpan konfigurasi BU...' }
      );
      toast('Berhasil menyimpan BU', 'success');
      setModalOpen(false);
      loadData();
      // Auto-reload window to update sidebar if BU name changes
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      alertError(err, 'Gagal menyimpan BU');
    }
  }

  const toggleFlag = (key: keyof CreateBuPayload) => {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  };

  if (!isSuperadmin) return null; // Will redirect in useEffect

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3" style={{ color: 'var(--text-main)' }}>
          <Buildings size={32} weight="fill" className="text-primary" />
          BU Registry
        </h1>
        <button type="button" onClick={handleAdd} className="btn btn-primary">
          <Plus size={18} weight="bold" /> Tambah BU Baru
        </button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-12 flex justify-center"><RadialLoading size={50} /></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nama BU</th>
                <th>Tipe</th>
                <th>UoM Utama</th>
                <th>Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {bus.map((b) => (
                <tr key={b.bu_id} className={!b.is_active ? 'opacity-50' : ''}>
                  <td className="font-mono text-sm">{b.bu_id}</td>
                  <td className="font-bold">{b.bu_name}</td>
                  <td className="text-sm uppercase text-muted">{b.bu_type.replace('_', ' ')}</td>
                  <td>{b.default_uom}</td>
                  <td>
                    {b.is_active ? (
                      <span className="badge badge-success"><CheckCircle size={14} /> Aktif</span>
                    ) : (
                      <span className="badge badge-danger"><XCircle size={14} /> Inactive</span>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => handleEdit(b)}
                      className="text-primary hover:text-primary-hover p-1"
                      title="Edit BU"
                    >
                      <PencilSimple size={18} weight="bold" />
                    </button>
                  </td>
                </tr>
              ))}
              {bus.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted">Belum ada data BU.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-muted hover:text-danger p-1"
            >
              <X size={24} weight="bold" />
            </button>
            <div className="p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                {editingId ? 'Edit Business Unit' : 'Tambah Business Unit Baru'}
              </h2>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Kolom Kiri: Info Dasar */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-primary border-b border-[var(--border)] pb-2 mb-4">Informasi Dasar</h3>
                  <div className="form-group">
                    <label>BU ID <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control font-mono"
                      value={form.bu_id}
                      onChange={(e) => setForm({ ...form, bu_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                      placeholder="contoh: canvas_pu"
                      disabled={!!editingId} // Immutable
                      required
                    />
                    <small className="text-muted block mt-1">Lowercase, tanpa spasi (permanen setelah dibuat).</small>
                  </div>

                  <div className="form-group">
                    <label>Nama BU <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.bu_name}
                      onChange={(e) => setForm({ ...form, bu_name: e.target.value })}
                      placeholder="Contoh: Divisi Canvas"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Tipe BU</label>
                    <select
                      className="form-select"
                      value={form.bu_type}
                      onChange={(e) => setForm({ ...form, bu_type: e.target.value as any })}
                    >
                      <option value="raw_material">Raw Material (Bahan Baku)</option>
                      <option value="fabric">Fabric (Kain/Canvas)</option>
                      <option value="chemical">Chemical (Kimia)</option>
                      <option value="product_finished">Product Finished (Barang Jadi)</option>
                      <option value="service">Service (Jasa)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label>UoM Default</label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.default_uom}
                        onChange={(e) => setForm({ ...form, default_uom: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Low Stock Threshold</label>
                      <input
                        type="number"
                        className="form-control"
                        value={form.low_stock_threshold}
                        onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>UoM Options (Pisahkan dgn koma)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.uom_options?.join(', ')}
                      onChange={(e) => setForm({ ...form, uom_options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    />
                  </div>
                </div>

                {/* Kolom Kanan: Fitur & Flag */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-primary border-b border-[var(--border)] pb-2 mb-4">Fitur & Schema Flags</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'has_color', label: 'Warna (Color)' },
                      { key: 'has_size', label: 'Ukuran (Size)' },
                      { key: 'has_width', label: 'Lebar (Width)' },
                      { key: 'has_weight', label: 'Berat (Weight)' },
                      { key: 'has_hpp', label: 'Harga Pokok (HPP)' },
                      { key: 'has_discount', label: 'Diskon (Discount)' },
                      { key: 'has_fifo', label: 'Sistem FIFO' },
                      { key: 'has_delivery_fields', label: 'Delivery Fields' },
                      { key: 'is_active', label: 'BU Aktif' },
                    ].map((flag) => (
                      <div
                        key={flag.key}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition flex items-center gap-3 select-none ${form[flag.key as keyof CreateBuPayload] ? 'border-primary bg-primary/5' : 'border-[var(--border)]'}`}
                        onClick={() => toggleFlag(flag.key as keyof CreateBuPayload)}
                      >
                        <input
                          type="checkbox"
                          checked={!!form[flag.key as keyof CreateBuPayload]}
                          readOnly
                          className="w-5 h-5 accent-primary cursor-pointer"
                        />
                        <span className="font-medium text-sm text-[var(--text-main)]">{flag.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="form-group mt-4">
                    <label>Template Surat Jalan</label>
                    <select
                      className="form-select"
                      value={form.surat_jalan_template}
                      onChange={(e) => setForm({ ...form, surat_jalan_template: e.target.value as any })}
                    >
                      <option value="canvas">Canvas (Bahan/Kain)</option>
                      <option value="chemical">Chemical (Kimia/Drum)</option>
                      <option value="default">Default / Standar</option>
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                  <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <FloppyDisk size={18} weight="bold" /> {editingId ? 'Simpan Perubahan' : 'Buat BU Baru'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
