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

/** Format currency IDR (Compact) */
export function formatCompactIDR(n: number): string {
  if (n >= 1e12) return `Rp ${(n / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 2 })} T`;
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Jt`;
  return formatIDR(n);
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

// ============================================================================
// TASK-6 (Phase 6): Format Tanggal DD/MM/YYYY (WMS Indonesian display)
// ============================================================================

/** Format ISO date → DD/MM/YYYY (Indonesian). WMS lama format canonical. */
export function formatDateDmy(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return String(isoOrDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

// ============================================================================
// TASK-7 (Phase 6): Parse Harga Indonesia (titik thousand + koma decimal)
// ============================================================================

/**
 * Parse harga format Indonesia.
 *
 * Examples:
 *   '1.000.000,00'   → 1000000
 *   '1,000,000.00'   → 1000000 (US format, koma ribuan + titik desimal)
 *   '1000000'        → 1000000
 *   'Rp 50.000,00'   → 50000
 *   '50.000,50'      → 50000.5
 *   ''               → 0
 */
export function parseHargaID(input: string): number {
  if (!input || typeof input !== 'string') return 0;
  let s = input.trim();

  // Strip prefix 'Rp' atau 'rp'
  s = s.replace(/^rp\s*/i, '');

  // Detect format: kalau ada 2 separators, pisahkan ribuan dan desimal
  // Format ID: 1.000.000,00 → titik = ribuan, koma = desimal
  // Format US: 1,000,000.00 → koma = ribuan, titik = desimal
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Cek mana separator terakhir → itu desimal
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // ID format: titik = thousand, koma = decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: koma = thousand, titik = decimal
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Hanya koma — cek apakah koma desimal (2 digit setelah) atau ribuan
    const afterComma = s.split(',').pop() || '';
    if (afterComma.length <= 2) {
      // Desimal: "50,50" atau "1500,00"
      s = s.replace(',', '.');
    } else {
      // Ribuan: "15000" atau "1,500" -> hapus koma
      s = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    // Hanya titik — bisa ribuan ("50.000") atau desimal ("50.50")
    const parts = s.split('.');
    const last = parts.pop() || '';
    if (parts.length > 1 || last.length !== 2) {
      // "1.000.000" atau "50.000" → titik = thousand separator
      s = s.replace(/\./g, '');
    } else {
      // "50.50" → titik desimal, biarkan
      s = parts.join('') + '.' + last;
    }
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Auto-format number ke display IDR (1.000.000) tanpa desimal.
 * Dipakai di onBlur input harga.
 */
export function formatHargaDisplay(value: number | string): string {
  const n = typeof value === 'string' ? parseHargaID(value) : value;
  return new Intl.NumberFormat('id-ID').format(n);
}
