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
