/**
 * GET /api/cron/flush-queue
 *
 * Drain write queue ke Apps Script. Dipanggil periodik via Vercel Cron
 * (vercel.json) — setiap 1 menit.
 *
 * Auth: Vercel Cron pakai header Authorization: Bearer <CRON_SECRET>.
 * Manual trigger juga OK selama tahu CRON_SECRET.
 *
 * Strategy: pop satu per satu, call Apps Script langsung (bukan resilient,
 * karena resilient akan re-enqueue dan kita masuk loop). Kalau gagal,
 * requeueWrite increment attempt; kalau attempt >= MAX, item dibuang ke
 * dead-letter log.
 *
 * Budget: 1 cron run = max 50 item supaya nggak hit Vercel function timeout
 * (10s hobby, 60s pro). Sisa item akan ke-process di run berikutnya.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dequeueWrite,
  requeueWrite,
  getQueueStats,
  type QueuedWrite,
} from '@/lib/write-queue';
import { callAppsScript } from '@/lib/apps-script-client';
import { recordSuccess, recordFailure } from '@/lib/circuit-breaker';
import type { AppsScriptAction } from '@/lib/apps-script-client';
import { jwtVerify } from 'jose';

const MAX_ITEMS_PER_RUN = 50;
const SERVICE_NAME = 'apps-script';

export async function GET(req: NextRequest) {
  // Hanya ijinkan eksekusi jika user terautentikasi (mencegah public DoS)
  const token = req.cookies.get('wms_session')?.value;
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  
  if (!token || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const encoded = new TextEncoder().encode(secret);
    await jwtVerify(token, encoded, { algorithms: ['HS256'] });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const initial = await getQueueStats();
  let processed = 0;
  let succeeded = 0;
  let requeued = 0;
  let dropped = 0;
  const errors: { id: string; action: string; error: string }[] = [];

  for (let i = 0; i < MAX_ITEMS_PER_RUN; i++) {
    const item: QueuedWrite | null = await dequeueWrite();
    if (!item) break;
    processed++;

    try {
      await callAppsScript(item.action as AppsScriptAction, item.payload);
      await recordSuccess(SERVICE_NAME);
      succeeded++;
    } catch (err) {
      await recordFailure(SERVICE_NAME);
      const errMsg = err instanceof Error ? err.message : String(err);
      const requeueResult = await requeueWrite(item, errMsg);
      if (requeueResult) {
        requeued++;
      } else {
        dropped++;
        errors.push({ id: item.id, action: item.action, error: errMsg });
      }

      // Stop early kalau breaker open — sisanya re-process di cron next run
      if (errors.length >= 5) break;
    }
  }

  const final = await getQueueStats();

  return NextResponse.json({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    initial_pending: initial.pending,
    final_pending: final.pending,
    processed,
    succeeded,
    requeued,
    dropped,
    errors,
  });
}
