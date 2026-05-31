# Deployment Setup — WMS Frontend Vercel

> Setup steps untuk deploy WMS frontend ke Vercel pertama kali atau setelah env baru.

## 1. Environment Variables

Set semua via `vercel env add <NAME>` atau Vercel dashboard.

### Required (Production + Preview + Development)

| Name | Sumber | Format | Catatan |
|---|---|---|---|
| `APPS_SCRIPT_URL` | Apps Script Web App deploy URL | `https://script.google.com/macros/s/.../exec` | Ganti tiap re-deploy script (kecuali pakai HEAD). Fixed URL: deploy dengan version "Head" |
| `APPS_SCRIPT_TOKEN` | Script Property `API_TOKEN` (random 32 char) | string | Sama dengan yang di Apps Script Properties |
| `SESSION_SECRET` | random 32+ char | string | Untuk verify JWT signature di middleware |
| `KV_REST_API_URL` | Vercel KV dashboard | `https://...vercel-storage.com` | Auto-set saat connect KV |
| `KV_REST_API_TOKEN` | Vercel KV dashboard | string | Auto-set saat connect KV |
| `CRON_SECRET` | random 32 char (mis. `openssl rand -hex 32`) | string | **WAJIB** untuk auth Vercel Cron endpoint `/api/cron/flush-queue` |

### Optional

| Name | Default | Catatan |
|---|---|---|
| `NEXT_PUBLIC_APPS_SCRIPT_URL` | sama dengan `APPS_SCRIPT_URL` | Kalau frontend juga call langsung (tidak via API route) |
| `NODE_ENV` | auto-set Vercel | jangan override |

### Generate secrets

```bash
# CRON_SECRET dan SESSION_SECRET
openssl rand -hex 32

# Atau di PowerShell Windows:
[System.Web.Security.Membership]::GeneratePassword(32, 0)
```

## 2. Vercel Cron — Flush Queue

`vercel.json` di root project sudah konfigurasi cron schedule `* * * * *` (setiap menit) yang trigger `GET /api/cron/flush-queue`.

**Behavior:**
- Endpoint dequeue max 50 item per run, kirim ke Apps Script
- Failed item → re-queue dengan attempt counter, drop ke dead-letter setelah max attempt
- Auth header `Authorization: Bearer ${CRON_SECRET}` di-validate

**Catatan limit Vercel:**
- Hobby plan: cron schedule minimal **1 jam** (kalau pakai `* * * * *` di Hobby, akan throttle ke 1x/jam)
- Pro plan: granularity menit (`* * * * *` jalan tiap menit)

Kalau Hobby, ganti schedule jadi `*/15 * * * *` atau lebih jarang — atau upgrade ke Pro.

## 3. KV Setup

1. Vercel dashboard → Storage → Create Database → KV
2. Connect ke project — `KV_REST_API_URL` + `KV_REST_API_TOKEN` auto-injection
3. Verify: `vercel env ls`

KV namespace yang dipakai:
- `queue:wms-write:*` — pending writes
- `cb:apps-script:*` — circuit breaker state
- `wms:cache:stock:*` — stock query cache (optional, future)

## 4. Manual cron test (sebelum deploy production)

```bash
# Lokal (dev server):
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/flush-queue

# Production:
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/flush-queue
```

Expected response:
```json
{
  "started_at": "2026-05-31T...",
  "finished_at": "2026-05-31T...",
  "initial_pending": 0,
  "final_pending": 0,
  "processed": 0,
  "succeeded": 0,
  "requeued": 0,
  "dropped": 0,
  "errors": []
}
```

## 5. Deploy command

```bash
cd wms-frontend-vercel
vercel --prod
```

Pertama kali: pilih scope, link ke project. Setelah itu re-deploy cukup `vercel --prod`.

## 6. Health check

Setelah deploy:
```bash
curl https://your-app.vercel.app/api/system/health
curl https://your-app.vercel.app/api/system/queue-status
```

`queue-status` harus return `{ pending: 0, ... }` kalau backend sehat.
