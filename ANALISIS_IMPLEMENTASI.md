# Analisis Implementasi — wms-gudang (Next.js 16 + Apps Script Backend)

**Tanggal:** 2026-05-31
**Reviewer:** AI Code Review — Implementation Analysis
**Objek:** `C:\antigravity\wms-gudang` — Fase 1 implementation
**Status:** ✅ Fase 1 selesai, ada perubahan arsitektur signifikan dari MASTER_SPEC

---

## 0. Temuan Utama: ADR-15 — Perubahan Arsitektur Besar

Project ini **tidak mengikuti ADR-01 MASTER_SPEC** (Vercel API Routes → Sheets API langsung). Sebaliknya, `.env.example` mendefinisikan **ADR-15**:

```
ADR-15 (2026-05-31): Backend pakai Apps Script Web App.
Tidak ada lagi Service Account / Cloud Console / Spreadsheet IDs di sini —
semua diatur Apps Script side via Script Properties.
```

**Dampak arsitektur:**

| Aspek | MASTER_SPEC (ADR-01) | Implementasi (ADR-15) |
|-------|---------------------|----------------------|
| Backend call | `google.sheets({ version: 'v4' })` dari Vercel | `fetch(APPS_SCRIPT_URL, { body: {action, payload, token} })` |
| Auth | JWT verify di Vercel middleware | JWT verify di Vercel middleware (sama) |
| Service Account | Perlu GCP project + SA JSON | **Tidak perlu** — Apps Script handle |
| API Routes | 30 individual route files | **1 RPC client** (`apps-script-client.ts`) — semua action via POST |
| Rate limit | Sheets API 300 req/min | Apps Script 90 min/day |
| Latency | 200-1000ms (Sheets API) | 500-3000ms (Apps Script + fetch) |
| Code reuse | Rewrite semua logic di TypeScript | **Reuse 4,000+ baris** Database.gs, Auth.gs, dll |
| Cost | Vercel Pro (KV + longer timeout) | **Vercel Hobby (gratis) + Apps Script (gratis)** |

**Kesimpulan:** Ini keputusan yang **pragmatis dan tepat** untuk proyek skala ini. Full free, reuse logic existing yang sudah production-tested. Trade-off latency dan single-point-of-failure acceptable karena Apps Script sudah terbukti jalan bertahun-tahun.

**MASTER_SPEC perlu di-update** — ADR-01 harus diganti ADR-15.

---

## 1. Fase 1 — Apa yang Sudah Selesai

### 1.1 Project Skeleton ✅

```
wms-gudang/
├── app/
│   ├── layout.tsx                    ✅ Root layout + metadata + lang="id"
│   ├── page.tsx                      ✅ Redirect / → /dashboard
│   ├── globals.css                   ✅ Tailwind v4 + dark mode + component classes
│   ├── (authenticated)/
│   │   └── dashboard/
│   │       └── page.tsx              ✅ Placeholder Phase 1
│   ├── login/                        📁 Empty (Phase 3)
│   ├── api/
│   │   └── system/
│   │       └── health/
│   │           └── route.ts          ✅ Health check + deep ping
│   └── favicon.ico                   ✅
├── lib/
│   ├── apps-script-client.ts         ✅ Core RPC layer (complete)
│   └── utils.ts                      ✅ Formatters + sanitizeText
├── types/
│   ├── index.ts                      ✅ Re-exports
│   ├── api.ts                        ✅ ApiResponse, ApiError, ok(), fail()
│   └── bu-registry.ts               ✅ BUConfig, BUType, Role, UserAccount
├── components/                       📁 10 dirs, all EMPTY (Phase 2-4)
├── hooks/                            📁 Empty (Phase 3-4)
├── __tests__/
│   ├── setup.ts                      ✅ Vitest + jest-dom setup
│   ├── lib/
│   │   ├── apps-script-client.test.ts ✅ 4 tests passing
│   │   └── utils.test.ts             ✅ 5 tests passing
├── .env.example                      ✅ Updated for ADR-15
├── vitest.config.ts                  ✅ React + jsdom + alias working
├── tsconfig.json                     ✅ Strict mode, aliases correct
├── next.config.ts                    ⚠️ Empty — security headers not added
├── package.json                      ✅ Deps sesuai
└── postcss.config.mjs                ✅ Tailwind v4 PostCSS plugin
```

### 1.2 Tech Stack (Reality vs Plan)

| Teknologi | MASTER_SPEC Plan | Actual Implementation |
|-----------|-----------------|----------------------|
| Next.js | 15 | **16.2.6** |
| Tailwind | v3 | **v4** (with `@tailwindcss/postcss`) |
| React | 19.0 | **19.2.4** |
| TypeScript | 5.5 | **5.x** |
| Vitest | 2.0 | **3.2.4** |
| googleapis | ✅ dipakai | **❌ tidak dipakai** (ADR-15) |
| xlsx | ✅ | ❌ belum ditambah |
| @vercel/kv | ✅ | ✅ (v3.0.0) |
| jose | ✅ | ✅ (v5.10.0) |
| bcryptjs | ✅ | ✅ |
| chart.js | ✅ | ✅ |
| nodemailer | ✅ | ✅ |

---

## 2. lib/apps-script-client.ts — Analisis Mendalam

### 2.1 Rating: 9/10 — Sangat solid

File ini adalah **jantung arsitektur ADR-15**. Menggantikan 30 route files individual dengan satu RPC client yang bersih.

**Yang sudah benar:**
- ✅ Type-safe: `AppsScriptAction` union type mencakup semua 30 action
- ✅ Retry logic: 1 retry (2 attempts total) untuk 5xx errors
- ✅ Timeout: 30 detik default (Apps Script max 6 menit)
- ✅ Error handling: `AppsScriptError` class dengan `code` + `message`
- ✅ Config validation: throw jelas kalau env belum di-set
- ✅ AbortController: timeout bisa dibatalkan
- ✅ Token di header `X-Internal-Token` (bukan query param)
- ✅ Health check: `pingAppsScript()` terpisah dengan lower timeout (10s)

### 2.2 Concern & Improvement

#### ⚠️ Retry strategy bisa lebih baik

```typescript
// Saat ini: retry semua 5xx
if (res.status >= 500 && attempt < retries) { ... continue; }

// Lebih baik: bedakan retry-able vs non-retry-able errors
// 503 Service Unavailable → retry
// 501 Not Implemented → jangan retry
// 429 Too Many Requests → retry with Retry-After header
const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
```

#### ⚠️ Belum ada circuit breaker integration

Apps Script kadang bisa intermittent error (quota exceeded, rate limit). Client ini punya retry, tapi belum terintegrasi dengan `PersistentCircuitBreaker` yang direncanakan. **OK untuk sekarang** — circuit breaker ditambahkan di Fase 5 (Addendum).

#### ⚠️ Concurrent request batching

Kalau dashboard perlu 3-5 API calls, client ini akan membuat 3-5 request terpisah. Apps Script bisa handle concurrent calls, tapi lebih efisien kalau ada **action batching** — kirim multiple actions dalam 1 request. Tidak urgent untuk MVP.

#### ⚠️ Response caching belum ada

Setiap call bypass cache. Untuk data yang jarang berubah (BU Registry, Options), ini boros. **Cache layer perlu ditambahkan sebelum Fase 4.**

### 2.3 Apps Script Side yang Harus Diimplement

Agar client ini berfungsi, Apps Script harus implement `doPost(e)`:

```javascript
// Code.gs — Wajib ditambah
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Verify internal token
    var storedToken = PropertiesService.getScriptProperties().getProperty('INTERNAL_TOKEN');
    if (data.token !== storedToken) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Route action ke fungsi yang sesuai
    var result = routeAction(data.action, data.payload);
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: e.message }
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function routeAction(action, payload) {
  switch (action) {
    case 'health':
      return { success: true, data: { ok: true, timestamp: new Date().toISOString() } };
    case 'bu.list':
      return { success: true, data: getBUList() };
    case 'bu.get':
      var config = getBUConfig(payload.id);
      return config 
        ? { success: true, data: config }
        : { success: false, error: { code: 'NOT_FOUND', message: 'BU tidak ditemukan' } };
    // ... semua action lainnya
    default:
      return { success: false, error: { code: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action } };
  }
}
```

**Prioritas:** Ini harus diimplement di Apps Script **sebelum Fase 2 dimulai** — tanpanya, semua API call Vercel akan gagal.

---

## 3. Kualitas Kode — Per File

### 3.1 types/api.ts — 10/10

Clean, sederhana, tepat. `ok()` dan `fail()` helpers akan dipakai di mana-mana. Type `ApiResponse<T>` dengan generic bagus.

### 3.2 types/bu-registry.ts — 10/10

Match MASTER_SPEC §1.2. Semua field ada. `BUType` union type strict. `UserAccount` 10 kolom sesuai final schema.

### 3.3 lib/utils.ts — 9/10

`formatNumberID`, `formatIDR`, `formatDateID`, `sleep`, `sanitizeText` — semua dibutuhkan. 

**Minor:** `sanitizeText` escape `&` dulu baru `<` — ini sudah benar (hindari double-escape). Tapi belum handle null/undefined input. Kalau input kosong dari API, `sanitizeText(null)` akan error.

```typescript
export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    // ...
```

### 3.4 app/api/system/health/route.ts — 9/10

Health check dengan `?deep=true` untuk ping Apps Script. Env check granular. Status: ok/degraded/down. 

**Minor:** Belum ada Vercel KV health check (cek koneksi KV). Bisa ditambah sebagai `vercel_kv` di `apps_script` section atau terpisah.

### 3.5 app/globals.css — 7/10

**Yang baik:** Tailwind v4 `@theme` syntax bersih. Dark mode via `.dark` class pada `<html>`. Component classes di-port dari styles.html lama.

**Yang perlu diperbaiki:**
1. **Warna primary: BIRU (#2563eb)** — tidak match dengan MASTER_SPEC §5 (Tailwind config) yang sebut `#1B5E20` (hijau tua). Styles.html lama pakai biru, jadi ini mungkin disengaja. Tapi MASTER_SPEC harus di-update kalau warnanya biru.

2. **`.sidebar`, `.nav-item`, `.main-wrapper`** — masih pakai vanilla CSS classes. Ini OK sebagai bridge, tapi akan di-refactor ke Tailwind utilities di komponen React.

3. **Missing: loading/empty state styles** — Gap_Coverage_Pages_Patterns.md mendefinisikan skeleton animation, empty state — belum ada di CSS.

### 3.6 next.config.ts — 3/10

Masih kosong. Harus sudah ada di Fase 1:
- ✅ Security headers (CSP, X-Frame-Options, dll) — **BELUM ADA**
- ✅ Vercel Cron config — belum diperlukan (Phase 5)

### 3.7 middleware.ts — 0/10

Belum dibuat. OK untuk Fase 1 (belum ada auth), tapi harus jadi prioritas di Fase 3.

### 3.8 Tests — 8/10

9 tests passing (4 apps-script-client + 5 utils). Sudah cover:
- ✅ Success path
- ✅ Error response from Apps Script
- ✅ Config missing
- ✅ Retry on 5xx
- ✅ Number formatting
- ✅ HTML sanitization

**Missing tests:**
- ❌ Timeout scenario
- ❌ Network failure
- ❌ Concurrent calls batching (future)

---

## 4. Yang BELUM Ada — Prioritas by Fase

### Fase 1 (Current — almost done)

| Item | Status | Prioritas |
|------|--------|-----------|
| Security headers di next.config.ts | ❌ Belum | 🔴 HIGH — sebelum deploy |
| CSP configuration | ❌ Belum | 🔴 HIGH |
| HSTS header | ❌ Belum | 🟡 Nanti (production only) |
| `.env.local` with real values | ❓ Unknown | 🔴 HIGH — sebelum test |

### Fase 2 (BU Registry)

| Item | Status | Prioritas |
|------|--------|-----------|
| Apps Script `doPost()` + action routing | ❌ Belum | 🔴 CRITICAL — tanpa ini, sistem tidak jalan |
| `lib/bu-registry.ts` | ❌ Belum | 🔴 Core |
| `lib/schema-resolver.ts` | ❌ Belum | 🔴 Core |
| `lib/stock-calculator.ts` | ❌ Belum | 🔴 Core |
| Cache layer (Vercel KV) | ❌ Belum | 🟠 Diperlukan sebelum Fase 4 |
| `app/api/bu/list/route.ts` | ❓ Perlu atau tidak? | ⚠️ ADR-15: semua via RPC client |

**Catatan ADR-15:** Dengan arsitektur baru, **30 API route files individual tidak diperlukan**. Semua call via `callAppsScript(action, payload)`. Tapi page-level data fetching bisa langsung panggil dari Server Component:

```typescript
// app/(authenticated)/dashboard/page.tsx (Phase 4)
import { callAppsScript } from '@/lib/apps-script-client';

export default async function DashboardPage() {
  const buList = await callAppsScript<BUConfig[]>('bu.list');
  const liveData = await callAppsScript<DashboardData>('dashboard.live');
  
  return <DashboardView buList={buList} liveData={liveData} />;
}
```

Ini **lebih sederhana** daripada MASTER_SPEC yang merencanakan 30 route files.

### Fase 3 (Auth)

| Item | Status | 
|------|--------|
| `middleware.ts` — JWT verify + RBAC + CSRF + Security headers | ❌ Belum |
| `lib/auth.ts` — JWT create/verify, bcrypt | ❌ Belum |
| `lib/otp.ts` — OTP generate | ❌ Belum |
| `components/auth/LoginForm.tsx` | ❌ Belum |
| `components/auth/OTPInput.tsx` | ❌ Belum |
| `app/login/page.tsx` | ❌ Belum |
| `hooks/useAuth.ts` | ❌ Belum |

**Catatan ADR-15 untuk Auth:** Auth di MASTER_SPEC menyebut "bcrypt di Vercel" — tapi dengan ADR-15, password hashing dilakukan di **Apps Script** (Auth.gs). Vercel hanya verify JWT. Password hash disimpan di Users sheet, Apps Script yang handle `auth.requestOtp` dan `auth.verifyOtp`.

### Fase 4 (Features)

Semua komponen masih kosong. 10 direktori sudah dibuat:
```
components/
├── auth/          📁 Empty
├── dashboard/     📁 Empty
├── laporan/       📁 Empty
├── layout/        📁 Empty
├── master-data/   📁 Empty
├── riwayat/       📁 Empty
├── settings/      📁 Empty
├── shared/        📁 Empty
├── stok/          📁 Empty
└── transaksi/     📁 Empty
```

Progress: **0/35 components** dari rencana NextJS_Project_Structure.md.

---

## 5. Risiko ADR-15 — yang Perlu Dimonitor

### 5.1 Apps Script Quota (90 menit/hari)

Dengan ADR-15, **semua** backend processing jalan di Apps Script:
- Auth (PBKDF2)
- Transaksi (save + stock calc)
- Dashboard (live view data)
- Master Data CRUD
- History search
- PDF generation

**Estimasi quota harian untuk 20 user:**

| Operasi | Freq/hari | Waktu/op | Total |
|---------|-----------|----------|-------|
| Login | 20 | 0.5s | 10s |
| Transaksi | 100 | 1s | 100s |
| Stock view | 50 | 0.5s | 25s |
| Dashboard | 40 | 1.5s | 60s |
| History | 10 | 2s | 20s |
| Master Data | 20 | 0.5s | 10s |
| **TOTAL** | | | **~225 detik ≈ 3.75 menit/hari** |

Masih sangat aman (4.2% dari 90 menit). Tapi kalau scale ke 100+ user, atau bulk import ribuan baris, monitor ketat.

### 5.2 Single Point of Failure

Apps Script down = seluruh sistem down. Mitigasi:
- Health check monitor (`/api/system/health?deep=true`)
- Alert kalau Apps Script gagal >3x berturut-turut (MASTER_SPEC §6.6)
- Tidak ada fallback kedua (Vercel tidak bisa akses Sheets langsung tanpa Service Account)

### 5.3 Cold Start Latency

Apps Script Web App juga punya cold start (~1-3 detik untuk request pertama setelah idle). Vercel KV cache bisa membantu untuk reads.

---

## 6. Rekomendasi — Immediate Next Steps

### Sebelum lanjut Fase 2:

1. **🔴 CRITICAL: Implement `doPost()` di Apps Script**
   - Buat action routing switch
   - Set `INTERNAL_TOKEN` di Script Properties
   - Deploy sebagai Web App (Execute as: Me, Access: Anyone)
   - Test dengan curl: `curl -X POST {URL} -d '{"action":"health","token":"...","payload":null}'`

2. **🔴 HIGH: Add security headers ke next.config.ts**
   - CSP, X-Frame-Options, HSTS — sesuai MASTER_SPEC §3.1
   - Bisa langsung copy-paste dari PANDUAN_PERBAIKAN_KEAMANAN.md §5

3. **🟡 MEDIUM: Buat `.env.local` dengan real values**
   - APPS_SCRIPT_WEB_APP_URL (dari deployment step 1)
   - APPS_SCRIPT_INTERNAL_TOKEN (shared secret)
   - JWT_SECRET (generate: `openssl rand -hex 32`)
   - CRON_SECRET

4. **🟡 MEDIUM: Tambah null check di sanitizeText**
   ```typescript
   export function sanitizeText(input: string | null | undefined): string {
     if (!input) return '';
     // ...
   }
   ```

5. **🟢 LOW: Update MASTER_SPEC dengan ADR-15**
   - Ganti ADR-01: bukan Sheets API langsung, tapi Apps Script Web App RPC
   - Update §5 API Contract: 30 endpoint individual → 1 RPC client dengan 30 actions
   - Tambah ADR-15 sebagai keputusan arsitektur

### Fase 2 dimulai:

6. **Implement `lib/bu-registry.ts`** — call `callAppsScript('bu.list')`, caching dengan Vercel KV
7. **Implement `lib/schema-resolver.ts`** — sama seperti plan, no changes needed
8. **Implement `lib/cache.ts`** — wrapper untuk Vercel KV + cache invalidation
9. **Apps Script side: implement `bu.*` actions** di `routeAction()`

---

## 7. Perbandingan: ADR-01 vs ADR-15 — Final Verdict

| Kriteria | ADR-01 (Sheets API) | ADR-15 (Apps Script RPC) | Winner |
|----------|---------------------|--------------------------|--------|
| Setup complexity | 🔴 High (GCP, SA, IAM) | 🟢 None (deploy Web App) | ADR-15 |
| Cost | 🟡 Vercel Pro ~$20/bln | 🟢 $0 (Hobby + free GAS) | ADR-15 |
| Code reuse | 🔴 Rewrite 4,000+ lines | 🟢 Reuse existing | ADR-15 |
| Latency | 🟢 200-1000ms | 🟡 500-3000ms | ADR-01 |
| Rate limit | 🟡 300 req/min | 🟡 90 min/day | ADR-01 |
| Single point | 🟢 No (stateless API) | 🔴 Yes (Apps Script) | ADR-01 |
| Debugging | 🟢 Independent | 🟡 Through Apps Script | ADR-01 |
| Auth flexibility | 🟢 bcrypt di Vercel | 🟡 PBKDF2 di Apps Script | ADR-01 |
| Maintainability | 🟢 TypeScript all the way | 🟡 JS (GAS) + TS (Vercel) | ADR-01 |

**Kesimpulan:** ADR-15 menang untuk **cost dan simplicity** — dua faktor paling penting untuk proyek skala ini. ADR-01 lebih baik untuk scale besar, latency rendah, dan debugging. Untuk wms-gudang dengan 20 user, ADR-15 adalah **keputusan tepat**.

---

## 8. Checklist Update — Fase 1 Completion

### Done ✅
- [x] Next.js 16 project skeleton
- [x] Tailwind v4 + dark mode + component classes
- [x] TypeScript strict mode, path aliases
- [x] `lib/apps-script-client.ts` — RPC layer complete
- [x] `types/` — ApiResponse, BUConfig, UserAccount
- [x] `app/api/system/health` — health check + deep ping
- [x] Vitest 9 tests passing
- [x] Environment variables template (ADR-15)

### Not Done ❌
- [ ] **Security headers** di next.config.ts
- [ ] **middleware.ts** (auth + CSRF + headers) — Phase 3
- [ ] **Apps Script `doPost()`** + action routing
- [ ] .env.local dengan real values
- [ ] Vercel deploy (test connection)

---

**Footer:** Project Fase 1 sangat solid. ADR-15 adalah perubahan arsitektur yang signifikan tapi tepat. `apps-script-client.ts` adalah pengganti yang baik untuk 30 route files. Satu hal yang harus segera dilakukan: implement `doPost()` di Apps Script — tanpanya, seluruh backend tidak berfungsi.
