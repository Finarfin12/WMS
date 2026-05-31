/**
 * Master Data library — typed wrapper.
 *
 * Phase 4b (2026-05-31). Backend handler di MasterData.gs.
 */

import { callAppsScript } from './apps-script-client';
import { callAppsScriptResilient, type ResilientResponse } from './apps-script-resilient';
import { getActorContext } from './auth';

// ============================================================================
// Types
// ============================================================================

export interface MasterDataItem {
  ID: string;
  Tanggal: string;
  Tipe: string;
  Nama: string;
  UoM: string;
  'Harga Jual': number;
  'Satuan Harga': string;
  'Stok Awal': number;

  // BU-specific (optional):
  Warna?: string;
  Ukuran?: string;
  Lebar?: string | number;
  Berat?: number;
  HPP?: number;
}

export interface MasterDataListPayload {
  bu: string;
  tipe?: string;
  search?: string;
}

export interface MasterDataSavePayload {
  bu: string;
  id?: string;          // present → UPDATE, absent → INSERT
  tipe: string;
  nama: string;
  tanggal?: string;
  uom?: string;
  harga_jual?: number;
  satuan_harga: 'IDR' | 'USD';
  stok_awal?: number;

  // BU-specific:
  warna?: string;
  ukuran?: string;
  lebar?: string | number;
  berat?: number;
  hpp?: number;
}

export interface MasterDataSaveResult {
  ok: true;
  id: string;
  mode: 'create' | 'update';
}

export type MasterDataPayload = MasterDataSavePayload;

export interface MasterDataDeleteResult {
  ok: true;
  id: string;
  mode: 'delete';
}

// ============================================================================
// Functions
// ============================================================================

/**
 * List master data per BU (newest first).
 *
 * @example
 *   const items = await listMasterData({ bu: 'Atrione', tipe: 'Produk Baru' });
 */
export async function listMasterData(
  payload: MasterDataListPayload,
): Promise<MasterDataItem[]> {
  if (!payload.bu) throw new Error('bu wajib');
  return callAppsScript<MasterDataItem[], MasterDataListPayload>(
    'masterData.list',
    payload,
  );
}

/**
 * Save master data — insert kalau ID kosong, update kalau ID ada.
 * Resilient — fallback ke write queue kalau backend down.
 *
 * @example
 *   const result = await saveMasterData({ bu: 'Atrione', tipe: 'Produk Baru', nama: ..., ... });
 *   if (result.ok) toast(`Tersimpan: ${result.data.id}`);
 *   else toast(`Masuk antrian: ${result.queue_id}`);
 */
export async function saveMasterData(
  payload: MasterDataSavePayload,
): Promise<ResilientResponse<MasterDataSaveResult>> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.tipe) throw new Error('tipe wajib');
  if (!payload.nama) throw new Error('nama wajib');
  const actor = getActorContext();
  return callAppsScriptResilient<MasterDataSaveResult, MasterDataSavePayload>(
    'masterData.save',
    { ...payload, ...actor } as MasterDataSavePayload,
    { user: actor._actor_email },
  );
}

/**
 * Delete master data row by ID. Resilient — queue fallback.
 */
export async function deleteMasterData(
  buName: string,
  id: string,
): Promise<ResilientResponse<MasterDataDeleteResult>> {
  if (!buName) throw new Error('buName wajib');
  if (!id) throw new Error('id wajib');
  const actor = getActorContext();
  return callAppsScriptResilient<
    MasterDataDeleteResult,
    { bu: string; id: string; _actor_role: string; _actor_email: string }
  >('masterData.delete', { bu: buName, id, ...actor }, { user: actor._actor_email });
}
