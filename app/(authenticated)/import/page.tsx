'use client';

/**
 * Import — bulk insert dari Excel/CSV via paste atau upload.
 *
 * Flow: pilih type → paste/upload → preview validation → execute
 *
 * Schema-aware (multi-tenant-schema-aware-dev skill):
 *   - Render schema chip dari preview.schema, bukan re-derive dari bu code
 *   - Preview row data ditampilkan supaya user bisa cross-check sebelum execute
 *   - Validation per BU dispatch di backend, frontend cuma display result
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  CheckCircle,
  XCircle,
  Warning,
  Download,
  PaperPlaneTilt,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import {
  previewImport,
  executeImport,
  getImportTemplate,
  type ImportType,
  type ImportPreviewResult,
  type ImportSchema,
} from '@/lib/import';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast, withLoading, confirm } from '@/lib/swal';

const PREVIEW_ROWS_VISIBLE = 10;

/**
 * Build label list dari schema flag — untuk display chip "BU profile".
 * Empty kalau schema undefined supaya UI tidak crash sebelum preview.
 */
function buildSchemaChips(schema: ImportSchema | null): { label: string; on: boolean }[] {
  if (!schema) return [];
  return [
    { label: 'Color',    on: schema.has_color  },
    { label: 'Size',     on: schema.has_size   },
    { label: 'Width',    on: schema.has_width  },
    { label: 'Weight',   on: schema.has_weight },
    { label: 'HPP',      on: schema.has_hpp    },
    { label: 'Discount', on: schema.has_discount },
    { label: 'FIFO',     on: schema.has_fifo   },
    { label: 'Delivery', on: schema.has_delivery_fields },
  ];
}

export default function ImportPage() {
  const [bu, setBu] = useState('');
  const [type, setType] = useState<ImportType>('transaction');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => {
      setBu((e as CustomEvent<string>).detail);
      // BU ganti → preview lama tidak valid lagi
      setPreview(null);
      setRows([]);
      if (fileRef.current) fileRef.current.value = '';
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  // Schema chip — sumber: preview.schema. Sebelum preview pertama, schema null.
  const schemaChips = useMemo(() => buildSchemaChips(preview?.schema ?? null), [preview]);

  // Header columns dari row pertama (untuk preview table)
  const previewColumns = useMemo<string[]>(() => {
    if (rows.length === 0) return [];
    const keys = new Set<string>();
    for (const r of rows.slice(0, PREVIEW_ROWS_VISIBLE)) {
      Object.keys(r).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }, [rows]);

  async function handleDownloadTemplate() {
    if (!bu) {
      toast('Pilih BU dulu', 'warning');
      return;
    }
    const result = await withLoading(() => getImportTemplate(bu, type), {
      loadingText: 'Generate template…',
    });
    if (!result) return;

    const xlsx = await import('xlsx');
    const ws = xlsx.utils.json_to_sheet(result.sample, { header: result.headers });
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template');
    xlsx.writeFile(wb, result.filename);
    toast(`Template ${result.filename} ter-download`, 'success');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const xlsx = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = xlsx.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws);
    setRows(parsed);
    setPreview(null);
    toast(`${parsed.length} baris dibaca dari ${file.name}`, 'info');
  }

  async function handlePreview() {
    if (!bu) {
      toast('Pilih BU dulu', 'warning');
      return;
    }
    if (rows.length === 0) {
      toast('Upload file Excel/CSV dulu', 'warning');
      return;
    }
    setLoading(true);
    try {
      const result = await previewImport({ bu, type, rows });
      setPreview(result);
      if (result.error_count > 0) {
        toast(`${result.error_count} baris error, ${result.ready} ready`, 'warning');
      } else {
        toast(`${result.ready} baris ready untuk import`, 'success');
      }
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview) return;
    const ok = await confirm(
      `Import ${preview.ready} baris ke ${bu}?`,
      preview.error_count > 0
        ? `${preview.error_count} baris error akan di-skip.`
        : 'Semua baris valid akan di-import.',
      { type: 'warning', confirmText: 'Import' },
    );
    if (!ok) return;

    const userEmail = JSON.parse(localStorage.getItem('wms_user') || '{}').email || 'unknown';

    const result = await withLoading(
      () => executeImport({ bu, type, rows, skip_invalid: true, user: userEmail }),
      { loadingText: `Importing ${preview.ready} baris…` },
    );

    if (result) {
      if (result.ok) {
        toast(`${result.data.success} berhasil, ${result.data.failure} gagal`, 'success');
      } else {
        toast(`Backend down — import masuk antrian (id: ${result.queue_id})`, 'warning');
      }
      // Reset
      setRows([]);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Upload size={32} weight="fill" className="text-primary" />
          Import {bu}
        </h1>
        <button type="button" onClick={handleDownloadTemplate} className="btn btn-secondary">
          <Download size={16} weight="bold" />
          Download Template
        </button>
      </div>

      {/* Schema profile chip — appear setelah preview pertama */}
      {preview?.schema && (
        <div className="card mb-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold mr-2">Profile {preview.schema.bu_name}:</span>
            {schemaChips.map((chip) => (
              <span
                key={chip.label}
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  chip.on
                    ? 'bg-blue-100 text-primary dark:bg-blue-900/30'
                    : 'bg-gray-100 text-muted line-through dark:bg-gray-800'
                }`}
                title={chip.on ? `${chip.label} aktif` : `${chip.label} tidak track di BU ini`}
              >
                {chip.label}
              </span>
            ))}
            {preview.schema.allowed_uoms.length > 0 && (
              <span className="ml-3 text-muted">
                UoM: {preview.schema.allowed_uoms.join(', ')}
              </span>
            )}
            {preview.schema.allowed_currencies.length > 0 && (
              <span className="ml-3 text-muted">
                Currency: {preview.schema.allowed_currencies.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Pilih type */}
      <div className="card">
        <h3 className="card-title">Step 1 — Pilih Tipe Import</h3>
        <div className="flex gap-3">
          {(['transaction', 'masterData'] as ImportType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setRows([]);
                setPreview(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className={`px-4 py-3 rounded-lg font-semibold border-2 transition ${
                type === t
                  ? 'border-[var(--primary)] bg-blue-50 text-primary dark:bg-blue-900/20'
                  : 'border-[var(--border)] text-muted hover:border-[var(--primary)]'
              }`}
            >
              {t === 'transaction' ? '📦 Transaksi' : '🗂️ Master Data'}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Upload file */}
      <div className="card">
        <h3 className="card-title">Step 2 — Upload File Excel/CSV</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:font-semibold hover:file:bg-primary-hover file:cursor-pointer"
        />
        {rows.length > 0 && (
          <p className="text-sm text-muted mt-3">
            ✓ {rows.length} baris terbaca dari file. Klik &ldquo;Preview&rdquo; untuk validasi.
          </p>
        )}

        {/* Preview table — terlihat segera setelah upload, sebelum validation */}
        {rows.length > 0 && previewColumns.length > 0 && (
          <div className="mt-4 overflow-x-auto border rounded-lg">
            <table className="tbl tbl-compact min-w-full">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  {previewColumns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS_VISIBLE).map((r, i) => (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    {previewColumns.map((c) => (
                      <td key={c}>{String(r[c] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > PREVIEW_ROWS_VISIBLE && (
              <p className="text-xs text-muted p-2 text-center">
                Menampilkan {PREVIEW_ROWS_VISIBLE} dari {rows.length} baris
              </p>
            )}
          </div>
        )}
      </div>

      {/* Step 3: Preview */}
      {rows.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title m-0">Step 3 — Preview Validation</h3>
            <button
              type="button"
              onClick={handlePreview}
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? <RadialLoading size={18} /> : <ArrowsClockwise size={18} weight="bold" />}
              Preview
            </button>
          </div>

          {preview && (
            <>
              <div className="grid md:grid-cols-4 gap-3 mb-4">
                <div className="card !p-4">
                  <p className="stat-label">Total</p>
                  <p className="stat-value">{preview.total}</p>
                </div>
                <div className="card !p-4">
                  <p className="stat-label">Ready</p>
                  <p className="stat-value text-success">{preview.ready}</p>
                </div>
                <div className="card !p-4">
                  <p className="stat-label">Error</p>
                  <p className="stat-value text-danger">{preview.error_count}</p>
                </div>
                <div className="card !p-4">
                  <p className="stat-label">Warning</p>
                  <p className="stat-value text-warning">{preview.warning_count}</p>
                </div>
              </div>

              {preview.validations.filter((v) => v.errors.length || v.warnings.length).length >
                0 && (
                <div className="border-l-4 border-warning bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded mb-4 max-h-64 overflow-y-auto">
                  <h4 className="font-semibold mb-2">Issue per Baris:</h4>
                  <ul className="space-y-1 text-sm">
                    {preview.validations
                      .filter((v) => v.errors.length || v.warnings.length)
                      .map((v) => (
                        <li key={v.row} className="flex gap-2 items-start">
                          {v.errors.length > 0 ? (
                            <XCircle className="text-danger flex-shrink-0 mt-0.5" size={16} weight="fill" />
                          ) : (
                            <Warning className="text-warning flex-shrink-0 mt-0.5" size={16} weight="fill" />
                          )}
                          <span>
                            <strong>Baris {v.row}:</strong>{' '}
                            {[...v.errors, ...v.warnings].join(', ')}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {preview.error_count === 0 && preview.ready > 0 && (
                <div className="flex items-center gap-2 text-success mb-4">
                  <CheckCircle size={20} weight="fill" />
                  Semua {preview.ready} baris valid, siap di-import.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 4: Execute */}
      {preview && preview.ready > 0 && (
        <div className="card border-2 border-primary">
          <h3 className="card-title">Step 4 — Execute Import</h3>
          <p className="text-muted mb-4">
            Akan import {preview.ready} baris ke {bu}.
            {preview.error_count > 0 && ` ${preview.error_count} baris error akan di-skip.`}
          </p>
          <button type="button" onClick={handleExecute} className="btn btn-primary">
            <PaperPlaneTilt size={18} weight="bold" />
            Import Sekarang
          </button>
        </div>
      )}
    </div>
  );
}
