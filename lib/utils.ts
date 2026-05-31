/**
 * General utilities — formatting, parsing, helpers.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class name combiner (tailwind-merge + clsx) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format angka jadi string Indonesian (1234567 -> "1.234.567") */
export function formatNumberID(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

/** Format currency IDR */
export function formatIDR(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);
}

/** Alias untuk formatIDR (consistency dengan UI lama) */
export const formatCurrency = formatIDR;

/** Format tanggal ISO -> "31 Mei 2026" */
export function formatDateID(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Sleep helper untuk retry/backoff */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sanitasi text input — prevent XSS basic. MASTER_SPEC §3.3 */
export function sanitizeText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
