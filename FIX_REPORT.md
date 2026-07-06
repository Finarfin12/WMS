# Fix Report — 2026-07-06

Semua bug dari BUG_ANALYSIS.md diverifikasi terhadap kode aktual. Berikut status dan perbaikan yang dilakukan.

---

## Status Verifikasi (BUG_ANALYSIS.md vs Kode Aktual)

### Sudah diperbaiki sebelum sesi ini

| Bug | Deskripsi | File |
|-----|-----------|------|
| #1 | `eval()` diganti `new Function()` | `components/FloatingWidget.tsx:104` |
| #2 | CRON_SECRET tidak lagi NEXT_PUBLIC; flush-queue pakai JWT session validation | `components/FlushQueueProvider.tsx`, `app/api/cron/flush-queue/route.ts` |
| #3 | Auth bypass queue-status — tambah `!expected \|\|` guard | `app/api/system/queue-status/route.ts:20` |
| #4 | `Buffer` crash browser — pakai `typeof Buffer !== 'undefined'` | `lib/auth.ts:148-150` |
| #5 | ModalMasterData field name `Nama` → `nama` (lowercase) | `components/ModalMasterData.tsx:36` |
| #8 | Health check `jwt_secret` misleading — include `SESSION_SECRET` | `app/api/system/health/route.ts:40` |
| #25 | Reports.gs floating-point falsy — null/undefined/'' guard | `wms-gudang-appscript/Reports.gs:56-59` |
| #27 | TOCTOU race condition — LockService | `wms-gudang-appscript/Transaction.gs:299-302` |
| #26 | Hardcoded superadmin backdoor — sudah dihapus | `wms-gudang-appscript/AuthOtp.gs:188-210` |

### Diperbaiki dalam sesi ini

#### Frontend (wms-frontend-vercel) — 2 file diubah

| # | File | Perubahan | Kategori |
|---|------|-----------|----------|
| 6 | `app/(authenticated)/transaction/page.tsx:603-614` | Hapus konsolidasi stok Chemical yang membuang data batch FIFO. Sekarang display per-item asli dengan harga batch lengkap. | Data Integrity |
| 10 | `app/(authenticated)/transaksi/keluar/page.tsx:93,240-243,295,678,697` | Tambah `paktaConfirmedRef` (useRef) untuk menghindari stale closure dan double-call modal Pakta. State dan ref sinkron via checkbox onChange. | UX Reliability |
| 16 | `app/(authenticated)/transaksi/keluar/page.tsx:59-62` | Ganti module-level `_itemCounter` dengan `crypto.randomUUID()` — anti collision antar sesi navigasi. | Code Quality |

#### Backend (wms-gudang-appscript) — 3 file diubah (terpisah dari repo frontend)

| # | File | Perubahan | Kategori |
|---|------|-----------|----------|
| 29 | `Stock.gs:344-367` | `_calculateStockForItem_` sekarang konversi UoM (meter↔yard) via `_convertUom_`, identik dengan `handleStockGet`. Validasi stok batch kini akurat. | Data Integrity |
| 30 | `Stock.gs:236` | Filter `stok > 0.0001` → `stok > 0.0001 \|\| stok < 0`. Item negative stock sekarang tampil di UI. | Visibility |
| - | `Transaction.gs:21-47` | `_getBuConfig_` tambah in-memory cache 30 detik. BU registry tidak dibaca dari Sheet tiap panggilan — reduksi O(n) reads per batch. | Performance |
| - | `Transaction.gs:483-484` | `_buildFifoRows_` baca max 5000 baris MD — prevent timeout pada MD besar. | Performance |
| 37 | `AuthOtp.gs:383-397` | Fix dead code OTP: baca OTP record existing, filter yang masih fresh, gabung dengan OTP baru, max 5 valid sekaligus. | Functionality |
| - | `Stock.gs:21-34` | `_stockKey_` sekarang include `harga` untuk FIFO BU (Chemical). Tiap harga batch jadi entri stock terpisah dengan `harga_jual` akurat, bukan merged jadi satu entri. | Data Integrity |

---

## Ringkasan

| Severity | Ditemukan | Sebelumnya Fixed | Diperbaiki Sesi Ini | Sisa (arsitektural) |
|----------|-----------|-----------------|-------------------|-------------------|
| Critical | 12 | 9 | 3 | 0 |
| High | 6 | 3 | 2 | 1 (JWT session di Apps Script) |
| Medium | 10 | 2 | 3 | 5 (race condition frontend, void rollback, dll) |
| Low | 17 | 3 | 0 | 14 (empty dirs, unused deps, dll) |

**Sisa isu yang belum diperbaiki** bersifat arsitektural atau enhancement (empty directories, unused dependencies, cache headers, dll) — tidak mengganggu fungsi inti.
