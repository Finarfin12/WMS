/**
 * Transaction library — typed wrapper untuk RPC transaksi.
 *
 * Phase 4a (2026-05-31). Backend handler di Transaction.gs.
 *
 * 3 actions:
 *   - saveTransaction(payload)   → insert 1 row MASUK
 *   - voidTransaction(buName, txId, reason?)
 *   - batchOutbound(payload)     → batch SJ keluar (multi-item)
 */

import { callAppsScript } from './apps-script-client';
import { callAppsScriptResilient, type ResilientResponse } from './apps-script-resilient';
import { getActorContext } from './auth';

// ============================================================================
// Types
// ============================================================================

export interface TransactionInboundPayload {
  bu: string;
  tanggal?: string;          // ISO. Default: now
  nama: string;
  uom: string;
  masuk: number;             // qty masuk (> 0)
  keluar?: number;           // optional, kalau ada penyesuaian dual

  harga?: number;
  satuan_harga?: 'IDR' | 'USD' | 'EUR';
  keterangan?: string;
  customer?: string;
  no_po?: string;
  no_sj?: string;
  user?: string;
  link?: string;

  // BU-specific (auto-skip kalau flag has_* false di registry):
  warna?: string;
  ukuran?: string;
  lebar?: string | number;
  berat?: number;            // Kg (Canvas)
  hpp?: number;              // Atrione
  diskon?: number;           // % (0-100, Atrione)

  // Atrione delivery (cuma terisi kalau has_delivery_fields=true):
  payment_method?: string;
  delivery_date?: string;
  resi?: string;
  courier?: string;
  delivery_cost?: number;
}

export interface BatchOutboundItem {
  nama: string;
  qty: number;
  uom?: string;
  harga?: number;
  satuan_harga?: 'IDR' | 'USD' | 'EUR';
  keterangan?: string;

  // BU-specific:
  warna?: string;
  ukuran?: string;
  lebar?: string | number;
  berat?: number;
  diskon?: number;
  hpp?: number;
}

export interface BatchOutboundPayload {
  bu: string;
  no_sj: string;
  tanggal?: string;
  customer: string;
  no_po?: string;
  remarks?: string;
  user?: string;
  items: BatchOutboundItem[];

  // Atrione delivery (header SJ):
  payment_method?: string;
  delivery_date?: string;
  resi?: string;
  courier?: string;
  delivery_cost?: number;
}

export interface TransactionSaveResult {
  ok: true;
  id: string;
  bu: string;
  tanggal: string;
}

export interface TransactionVoidResult {
  ok: true;
  tx_id: string;
  mode: 'void';
}

export interface BatchOutboundResult {
  ok: true;
  sj_id: string;
  no_sj: string;
  rows_written: number;
  items_count: number;
  fifo: boolean;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Save 1 transaksi MASUK (inbound). Resilient — fallback ke write queue
 * kalau backend down (return queued response).
 *
 * @example
 *   const result = await saveTransaction({
 *     bu: 'Atrione',
 *     nama: 'Sepatu A31 Sport',
 *     uom: 'Pasang',
 *     ukuran: '42',
 *     warna: 'Hitam',
 *     masuk: 10,
 *     harga: 250000,
 *     hpp: 180000,
 *   });
 *   if (result.ok) toast(`Tersimpan: ${result.data.id}`);
 *   else toast(`Backend down, masuk antrian: ${result.queue_id}`);
 */
export async function saveTransaction(
  payload: TransactionInboundPayload,
): Promise<ResilientResponse<TransactionSaveResult>> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.nama) throw new Error('nama wajib');
  if (!payload.uom) throw new Error('uom wajib');
  if (!(payload.masuk > 0) && !((payload.keluar ?? 0) > 0)) {
    throw new Error('masuk atau keluar harus > 0');
  }
  const actor = getActorContext();
  return callAppsScriptResilient<TransactionSaveResult, TransactionInboundPayload>(
    'transaction.save',
    { ...payload, ...actor },
    { user: actor._actor_email },
  );
}

/**
 * Void transaksi by ID. Resilient — queue fallback kalau down.
 */
export async function voidTransaction(
  buName: string,
  txId: string,
  reason?: string,
): Promise<ResilientResponse<TransactionVoidResult>> {
  if (!buName) throw new Error('buName wajib');
  if (!txId) throw new Error('txId wajib');
  const actor = getActorContext();
  return callAppsScriptResilient<
    TransactionVoidResult,
    { bu: string; tx_id: string; reason?: string; _actor_role: string; _actor_email: string }
  >('transaction.void', { bu: buName, tx_id: txId, reason, ...actor }, { user: actor._actor_email });
}

/**
 * Submit batch Surat Jalan keluar (multi-item). Resilient — queue fallback.
 *
 * Behavior per BU:
 *   - has_fifo (Chemical): split per batch dari MD, tag "(FIFO Batch)" / "(FIFO Excess)"
 *   - has_discount (Atrione): hitung Harga Akhir = Harga - (Harga * diskon%)
 *   - has_delivery_fields (Atrione): isi Payment/Delivery/Resi/Courier/Cost di tiap row
 */
export async function batchOutbound(
  payload: BatchOutboundPayload,
): Promise<ResilientResponse<BatchOutboundResult>> {
  if (!payload.bu) throw new Error('bu wajib');
  if (!payload.no_sj) throw new Error('no_sj wajib');
  if (!payload.customer) throw new Error('customer wajib');
  if (!payload.items || payload.items.length === 0) {
    throw new Error('items wajib (min 1)');
  }
  const actor = getActorContext();
  return callAppsScriptResilient<BatchOutboundResult, BatchOutboundPayload>(
    'transaction.batchOutbound',
    { ...payload, ...actor } as BatchOutboundPayload,
    { user: actor._actor_email },
  );
}

// Tetap export callAppsScript untuk konsumen lain yang tidak butuh resilient
export { callAppsScript };
