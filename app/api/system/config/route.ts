import { NextResponse } from 'next/server';
import { callAppsScript } from '@/lib/apps-script-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await callAppsScript('system.getConfig' as any, {});
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || String(err) } },
      { status: 500 }
    );
  }
}
