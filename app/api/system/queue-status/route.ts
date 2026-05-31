/**
 * GET /api/system/queue-status
 *
 * Public-ish (auth via INTERNAL_TOKEN) endpoint untuk health monitoring:
 *   - Berapa item pending di write queue
 *   - State circuit breaker
 *   - Oldest item enqueued time
 *
 * Dipanggil oleh dashboard admin atau external monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/write-queue';
import { getCircuitInfo } from '@/lib/circuit-breaker';

export async function GET(req: NextRequest) {
  // Auth — pakai INTERNAL_TOKEN supaya nggak bocor publik
  const token = req.headers.get('x-internal-token');
  const expected = process.env.APPS_SCRIPT_INTERNAL_TOKEN;
  if (expected && token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [queue, circuit] = await Promise.all([
    getQueueStats(),
    getCircuitInfo('apps-script'),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    queue,
    circuit_breaker: {
      service: 'apps-script',
      ...circuit,
    },
    healthy:
      queue.pending < 100 &&
      circuit.state !== 'open',
  });
}
