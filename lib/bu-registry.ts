/**
 * BU Registry library — typed wrapper untuk RPC ke Apps Script.
 *
 * Phase 2 (2026-05-31). Backend handler di BuRegistry.gs.
 *
 * Pattern:
 *   - Server Component / API route call function di sini
 *   - Function ini call callAppsScript() dengan action yang tepat
 *   - Return typed BUConfig / BUConfig[]
 *
 * Cache: TODO Phase 4 — Vercel KV wrap di sini, TTL 60 detik untuk listBus.
 *
 * @example Server Component:
 *   import { listBus } from '@/lib/bu-registry';
 *   export default async function Page() {
 *     const bus = await listBus();
 *     return <BUSelector items={bus} />;
 *   }
 */

import { callAppsScript } from './apps-script-client';
import type { BUConfig } from '@/types/bu-registry';

// Re-export untuk backward compat (alias BuRecord = BUConfig)
export type { BUConfig };
export type BuRecord = BUConfig;

// ============================================================================
// Sync helper — extract flags dari BUConfig object (tanpa Promise)
// ============================================================================

/**
 * Sync version: extract flags langsung dari BUConfig object.
 * Pakai ini di komponen UI yang sudah punya BUConfig di state.
 */
export function getBuFlags(bu: BUConfig): {
  has_color: boolean;
  has_width: boolean;
  has_size: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;
} {
  return {
    has_color: !!bu.has_color,
    has_width: !!bu.has_width,
    has_size: !!bu.has_size,
    has_weight: !!bu.has_weight,
    has_hpp: !!bu.has_hpp,
    has_discount: !!bu.has_discount,
    has_fifo: !!bu.has_fifo,
    has_delivery_fields: !!bu.has_delivery_fields,
  };
}

// ============================================================================
// Read operations
// ============================================================================

interface ListBusOptions {
  /** Include is_active=false records (default false). Untuk admin panel. */
  includeInactive?: boolean;
}

/**
 * List semua BU yang aktif (default), sorted by sort_order ASC.
 *
 * @example
 *   const bus = await listBus();              // 3 BU aktif
 *   const all = await listBus({ includeInactive: true });  // termasuk yg di-soft-delete
 */
export async function listBus(opts: ListBusOptions = {}): Promise<BUConfig[]> {
  return callAppsScript<BUConfig[], ListBusOptions>('bu.list', opts);
}

/**
 * Get 1 BU by bu_id. Throw kalau tidak ditemukan.
 *
 * @example
 *   const atrione = await getBu('atrione');
 *   if (atrione.has_discount) showDiscountField();
 */
export async function getBu(buId: string): Promise<BUConfig> {
  if (!buId) throw new Error('buId wajib diisi');
  return callAppsScript<BUConfig, { bu_id: string }>('bu.get', {
    bu_id: buId.toLowerCase().trim(),
  });
}

// ============================================================================
// Write operations
// ============================================================================

/**
 * Payload untuk create BU baru. Semua flag wajib explicit.
 */
export interface CreateBuPayload {
  bu_id: string;
  bu_name: string;
  bu_type: BUConfig['bu_type'];
  icon?: string;
  default_uom?: string;
  low_stock_threshold?: number;

  has_color: boolean;
  has_width: boolean;
  has_size: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;

  surat_jalan_template?: BUConfig['surat_jalan_template'];
  uom_options?: string[];
  currency_options?: string[];

  is_active?: boolean;
  sort_order?: number;
}

/**
 * Payload update — semua field optional, kecuali bu_id (immutable identifier).
 */
export type UpdateBuPayload = Partial<Omit<CreateBuPayload, 'bu_id'>> & {
  bu_id: string;
};

/**
 * Save BU — insert kalau bu_id baru, update kalau sudah ada.
 *
 * Side effect insert:
 *   - Apps Script auto-create sheet [bu_name] + MD_[bu_name] di Main DB
 *   - Auto-create sheet [bu_name] di 4 archive (transaksi only, tidak MD)
 *   - Audit log entry "bu.create"
 *
 * Side effect update:
 *   - Audit log entry "bu.update"
 *
 * @throws AppsScriptError kalau validation fail (bu_id format, bu_type enum, dll)
 */
export async function saveBu(
  payload: CreateBuPayload | UpdateBuPayload,
): Promise<BUConfig> {
  return callAppsScript<BUConfig, CreateBuPayload | UpdateBuPayload>(
    'bu.save',
    payload,
  );
}

interface DeleteBuOptions {
  /**
   * Hard delete (true): hapus row dari sheet permanen. Sheet [bu_name] +
   * MD_[bu_name] TIDAK ikut dihapus. Audit log tetap masuk.
   *
   * Default false → soft delete (set is_active=false).
   */
  hard?: boolean;
}

interface DeleteBuResult {
  ok: true;
  mode: 'soft' | 'hard';
  bu_id: string;
}

/**
 * Delete BU. Soft delete by default (is_active=false), hard delete kalau opts.hard=true.
 *
 * Soft delete RECOMMENDED — preserve audit trail dan referential integrity
 * (transaksi historis di sheet [bu_name] masih valid di-query).
 *
 * Hard delete WARNING:
 *   - Sheet [bu_name] + MD_[bu_name] TIDAK ikut dihapus (potensi data orphan)
 *   - Hapus manual via Drive kalau benar-benar mau bersih
 *   - Audit log tetap masuk dengan mode "hard"
 */
export async function deleteBu(
  buId: string,
  opts: DeleteBuOptions = {},
): Promise<DeleteBuResult> {
  if (!buId) throw new Error('buId wajib diisi');
  return callAppsScript<DeleteBuResult, { bu_id: string; hard?: boolean }>(
    'bu.delete',
    {
      bu_id: buId.toLowerCase().trim(),
      hard: opts.hard === true,
    },
  );
}

// ============================================================================
// Logo upload (Phase 5b — Superadmin only)
// ============================================================================

export interface UploadBuLogoPayload {
  bu_id: string;
  filename: string;
  mime_type: string;        // 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/webp'
  data_base64: string;
}

export interface UploadBuLogoResult {
  ok: true;
  bu_id: string;
  file_id: string;
  file_url: string;
  download_url: string;
}

/**
 * Upload logo file BU. Backend simpan ke Drive folder WMS_Logos, set
 * `logo_file_id` di registry. Logo lama (kalau ada) dipindah ke trash.
 *
 * Auth: Hanya Superadmin (di-enforce di backend).
 *
 * @example
 *   const file = inputRef.current?.files?.[0];
 *   if (!file) return;
 *   const reader = new FileReader();
 *   reader.onload = async (e) => {
 *     const dataUrl = e.target?.result as string;
 *     const base64 = dataUrl.split(',')[1];
 *     await uploadBuLogo({
 *       bu_id: 'atrione',
 *       filename: file.name,
 *       mime_type: file.type,
 *       data_base64: base64,
 *     });
 *   };
 *   reader.readAsDataURL(file);
 */
export async function uploadBuLogo(
  payload: UploadBuLogoPayload,
): Promise<UploadBuLogoResult> {
  if (!payload.bu_id) throw new Error('bu_id wajib');
  if (!payload.data_base64) throw new Error('data_base64 wajib');
  if (!payload.mime_type) throw new Error('mime_type wajib');

  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
  if (!allowed.includes(payload.mime_type.toLowerCase())) {
    throw new Error(`mime_type harus: ${allowed.join(', ')}`);
  }

  return callAppsScript<UploadBuLogoResult, UploadBuLogoPayload>(
    'bu.uploadLogo',
    payload,
  );
}

/**
 * Helper — convert File ke base64 (browser File API).
 * Pakai bersama uploadBuLogo: const b64 = await fileToBase64(file).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader gagal baca file'));
        return;
      }
      // Strip "data:image/...;base64," prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Convenience helpers
// ============================================================================

/**
 * Build map { bu_id → BUConfig } untuk fast lookup di komponen UI.
 *
 * @example
 *   const buMap = await getBuMap();
 *   const bu = buMap[selectedBuId];
 *   if (bu?.has_color) showColorField();
 */
export async function getBuMap(): Promise<Record<string, BUConfig>> {
  const list = await listBus();
  return list.reduce((acc, bu) => {
    acc[bu.bu_id] = bu;
    return acc;
  }, {} as Record<string, BUConfig>);
}

/**
 * Resolve flag has_* untuk render conditional di form input/master data.
 * Throw kalau bu_id tidak ditemukan atau is_active=false.
 *
 * @example
 *   const flags = await resolveBuFlags('atrione');
 *   {flags.has_size && <SizeField />}
 *   {flags.has_discount && <DiscountField />}
 */
export async function resolveBuFlags(buId: string): Promise<{
  has_color: boolean;
  has_width: boolean;
  has_size: boolean;
  has_weight: boolean;
  has_hpp: boolean;
  has_discount: boolean;
  has_fifo: boolean;
  has_delivery_fields: boolean;
}> {
  const bu = await getBu(buId);
  if (!bu.is_active) {
    throw new Error(`BU "${buId}" tidak aktif`);
  }
  return {
    has_color: bu.has_color,
    has_width: bu.has_width,
    has_size: bu.has_size,
    has_weight: bu.has_weight,
    has_hpp: bu.has_hpp,
    has_discount: bu.has_discount,
    has_fifo: bu.has_fifo,
    has_delivery_fields: bu.has_delivery_fields,
  };
}
