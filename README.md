# WMS Gudang — Frontend (Vercel)

Warehouse Management System untuk multi business unit. Frontend Next.js 15 + Tailwind, deploy ke Vercel. Backend di Apps Script terpisah (lihat repo `wms-gudang-appscript`).

> **Status:** Phase 1-5c complete (49 fitur, 60/60 unit tests pass, tsc 0 error). Siap deploy ke production setelah setup env (~30 menit).

## Highlights

- **Multi-tenant** — 3+ business unit dengan flag-driven schema (tambah BU baru tanpa coding)
- **Auth OTP + JWT** — login email + 6-digit code (no password reusable), role hierarchy 3-tier (Superadmin / Admin / User)
- **Resilient writes** — circuit breaker + offline-tolerant write queue, auto-recovery via Vercel Cron tiap menit
- **Auto-archive** — backend Apps Script trigger pindahin data >3/6/9/12 bulan ke 5 spreadsheet shard secara otomatis, sistem tetap responsif walau data jutaan baris
- **Audit log** — setiap perubahan tercatat (siapa, kapan, apa)
- **Surat Jalan PDF** — auto-generate dengan logo BU per template (default/canvas/chemical)
- **Bulk import** — upload Excel/CSV dengan dry-run preview sebelum commit

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript 5, Tailwind v4, Phosphor Icons |
| State / Validation | React Server Components + Client Components, Zod-style runtime validation |
| Storage offline | Vercel KV (write queue, circuit breaker state) |
| Auth | OTP via Resend → JWT HS256 (8h expire) |
| Tests | Vitest + React Testing Library |
| Backend | Apps Script Web App (5 spreadsheet shard + Drive folder logos) |

## Quick start (development)

```bash
# Clone
git clone https://github.com/Finarfin12/WMS.git
cd WMS

# Install
npm install

# Setup env
cp .env.example .env.local
# Edit .env.local — isi APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN, SESSION_SECRET, KV_*, RESEND_API_KEY

# Dev server
npm run dev
```

Buka http://localhost:3000

## Production deploy

Lihat panduan setup canonical:
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — env vars + Vercel deploy + cron config

Atau guide lengkap (Apps Script + Vercel + Cron):
- `WMS_Install_Guide_v1.0_2026-05-31.md` (di folder hermes-memory vault)

```bash
vercel --prod
```

## Verifikasi

```bash
npx tsc --noEmit  # 0 error
npx vitest run    # 60/60 pass
```

## Struktur

```
app/                Next.js App Router pages
  (authenticated)/  Auth-gated pages (transaction, master-data, settings, ...)
  api/              Route handlers (cron, system endpoints)
  login/            Login OTP flow

components/         Shared UI components (AppShell, modals, ...)

lib/                Business logic
  apps-script-client.ts      RPC client (typed actions)
  apps-script-resilient.ts   Circuit breaker + queue wrapper
  auth.ts                    JWT, role helpers
  bu-registry.ts             BU CRUD + logo upload
  transaction.ts             Transaction RPC
  master-data.ts             Master data RPC
  history.ts                 History (multi-shard query)
  import.ts                  Bulk import
  users.ts                   User management
  write-queue.ts             KV-backed write queue
  circuit-breaker.ts         Apps Script circuit breaker

types/              TypeScript types
__tests__/          Unit tests (Vitest)
vercel.json         Vercel Cron + function config
```

## License

Proprietary — internal use only.

## Author

([@Finarfin12](https://github.com/Finarfin12))

Built dengan partnership Hiraeth.
