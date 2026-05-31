import { describe, it, expect } from 'vitest';
import { formatNumberID, formatIDR, sanitizeText } from '@/lib/utils';

describe('formatNumberID', () => {
  it('formats integer with Indonesian thousand separator', () => {
    expect(formatNumberID(1234567)).toBe('1.234.567');
  });

  it('handles zero', () => {
    expect(formatNumberID(0)).toBe('0');
  });

  it('handles negative numbers', () => {
    expect(formatNumberID(-1500)).toBe('-1.500');
  });
});

describe('formatIDR', () => {
  it('formats as Indonesian Rupiah without decimals', () => {
    const result = formatIDR(50000);
    expect(result).toMatch(/Rp.*50\.000/);
  });
});

describe('sanitizeText', () => {
  it('escapes HTML special chars', () => {
    expect(sanitizeText('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand first to prevent double-escape', () => {
    expect(sanitizeText('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(sanitizeText("it's")).toBe('it&#x27;s');
  });
});

// ============================================================================
// TASK-6 (Phase 6): Format Tanggal DD/MM/YYYY
// ============================================================================

import { formatDateDmy } from '@/lib/utils';

describe('formatDateDmy', () => {
  it('formats ISO date to DD/MM/YYYY', () => {
    expect(formatDateDmy('2026-05-31')).toBe('31/05/2026');
  });

  it('handles Date object', () => {
    expect(formatDateDmy(new Date('2026-01-01'))).toBe('01/01/2026');
  });

  it('returns original string on invalid date', () => {
    expect(formatDateDmy('not-a-date')).toBe('not-a-date');
  });
});

// ============================================================================
// TASK-7 (Phase 6): Parse Harga Indonesia
// ============================================================================

import { parseHargaID, formatHargaDisplay } from '@/lib/utils';

describe('parseHargaID', () => {
  it('parses ID format: 1.000.000,00', () => {
    expect(parseHargaID('1.000.000,00')).toBe(1000000);
  });

  it('parses US format: 1,000,000.00', () => {
    expect(parseHargaID('1,000,000.00')).toBe(1000000);
  });

  it('parses plain number', () => {
    expect(parseHargaID('1000000')).toBe(1000000);
  });

  it('strips Rp prefix', () => {
    expect(parseHargaID('Rp 50.000,00')).toBe(50000);
  });

  it('handles decimal', () => {
    expect(parseHargaID('50.000,50')).toBe(50000.5);
  });

  it('handles empty string', () => {
    expect(parseHargaID('')).toBe(0);
  });

  it('handles single comma as decimal (2 digits)', () => {
    expect(parseHargaID('1500,50')).toBe(1500.5);
  });

  it('handles single comma as thousand (3+ digits after)', () => {
    expect(parseHargaID('1,500')).toBe(1500);
  });
});

describe('formatHargaDisplay', () => {
  it('formats 1000000 to 1.000.000', () => {
    expect(formatHargaDisplay(1000000)).toBe('1.000.000');
  });

  it('formats from string ID format', () => {
    expect(formatHargaDisplay('1.000.000,00')).toBe('1.000.000');
  });
});
