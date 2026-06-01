'use client';

import { useEffect } from 'react';

const FLUSH_INTERVAL_MS = 30000;

export default function FlushQueueProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function flush() {
      const lastFlush = localStorage.getItem('wms_last_flush');
      const now = Date.now();
      if (lastFlush && now - Number(lastFlush) < FLUSH_INTERVAL_MS) return;
      localStorage.setItem('wms_last_flush', String(now));

      const headers: Record<string, string> = {};
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET;
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      fetch('/api/cron/flush-queue', { headers }).catch(() => {
        // silent fail — background task
      });
    }

    flush();

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}
