// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listBus,
  getBu,
  saveBu,
  deleteBu,
  getBuMap,
  resolveBuFlags,
} from '@/lib/bu-registry';
import type { BUConfig } from '@/types/bu-registry';

const ORIGINAL_ENV = { ...process.env };

const SAMPLE_BU: BUConfig = {
  bu_id: 'atrione',
  bu_name: 'Atrione',
  bu_type: 'product',
  icon: '👟',
  default_uom: 'Pasang',
  low_stock_threshold: 50,
  has_color: true,
  has_width: false,
  has_size: true,
  has_weight: false,
  has_hpp: true,
  has_discount: true,
  has_fifo: false,
  has_delivery_fields: true,
  surat_jalan_template: 'default',
  uom_options: ['Unit', 'Pasang', 'Pcs'],
  currency_options: ['IDR'],
  is_active: true,
  sort_order: 3,
  logo_file_id: '',
};

const SAMPLE_BU_LIST: BUConfig[] = [
  { ...SAMPLE_BU, bu_id: 'canvas', bu_name: 'Canvas', bu_type: 'fabric', sort_order: 1 },
  { ...SAMPLE_BU, bu_id: 'chemical', bu_name: 'Chemical', bu_type: 'chemical', sort_order: 2 },
  SAMPLE_BU,
];

function mockOk<T>(data: T) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockErr(code: string, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('lib/bu-registry', () => {
  beforeEach(() => {
    process.env.APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/TEST/exec';
    process.env.APPS_SCRIPT_INTERNAL_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  // ============================================================================
  // listBus
  // ============================================================================
  describe('listBus', () => {
    it('returns sorted list of active BUs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU_LIST),
      );

      const result = await listBus();
      expect(result).toEqual(SAMPLE_BU_LIST);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('bu.list');
      expect(body.payload).toEqual({});
    });

    it('passes includeInactive flag when set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU_LIST),
      );

      await listBus({ includeInactive: true });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.payload.includeInactive).toBe(true);
    });
  });

  // ============================================================================
  // getBu
  // ============================================================================
  describe('getBu', () => {
    it('returns single BU by id (lowercased)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU),
      );

      const result = await getBu('Atrione'); // mixed case input
      expect(result).toEqual(SAMPLE_BU);

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('bu.get');
      expect(body.payload.bu_id).toBe('atrione'); // lowercased
    });

    it('throws on empty buId', async () => {
      await expect(getBu('')).rejects.toThrow('buId wajib diisi');
    });

    it('propagates not-found error from Apps Script', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockErr('NOT_FOUND', 'BU "xyz" tidak ditemukan'),
      );

      await expect(getBu('xyz')).rejects.toThrow('BU "xyz" tidak ditemukan');
    });
  });

  // ============================================================================
  // saveBu
  // ============================================================================
  describe('saveBu', () => {
    it('sends full payload for create', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU),
      );

      const result = await saveBu({
        bu_id: 'atrione',
        bu_name: 'Atrione',
        bu_type: 'product',
        has_color: true,
        has_width: false,
        has_size: true,
        has_weight: false,
        has_hpp: true,
        has_discount: true,
        has_fifo: false,
        has_delivery_fields: true,
      });

      expect(result).toEqual(SAMPLE_BU);
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('bu.save');
      expect(body.payload.bu_id).toBe('atrione');
      expect(body.payload.has_size).toBe(true);
    });

    it('propagates validation error from Apps Script', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockErr('BAD_REQUEST', 'bu_id format invalid'),
      );

      await expect(
        saveBu({
          bu_id: 'INVALID-CASE',
          bu_name: 'X',
          bu_type: 'product',
          has_color: false,
          has_width: false,
          has_size: false,
          has_weight: false,
          has_hpp: false,
          has_discount: false,
          has_fifo: false,
          has_delivery_fields: false,
        }),
      ).rejects.toThrow('bu_id format invalid');
    });
  });

  // ============================================================================
  // deleteBu
  // ============================================================================
  describe('deleteBu', () => {
    it('soft-deletes by default', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ ok: true, mode: 'soft', bu_id: 'atrione' }),
      );

      const result = await deleteBu('atrione');
      expect(result).toEqual({ ok: true, mode: 'soft', bu_id: 'atrione' });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.payload.hard).toBe(false);
    });

    it('hard-deletes when opts.hard=true', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ ok: true, mode: 'hard', bu_id: 'atrione' }),
      );

      await deleteBu('atrione', { hard: true });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.payload.hard).toBe(true);
    });

    it('throws on empty buId', async () => {
      await expect(deleteBu('')).rejects.toThrow('buId wajib diisi');
    });
  });

  // ============================================================================
  // getBuMap
  // ============================================================================
  describe('getBuMap', () => {
    it('builds bu_id-keyed lookup map', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU_LIST),
      );

      const map = await getBuMap();
      expect(Object.keys(map)).toEqual(['canvas', 'chemical', 'atrione']);
      expect(map['atrione'].bu_name).toBe('Atrione');
      expect(map['canvas'].bu_type).toBe('fabric');
    });
  });

  // ============================================================================
  // resolveBuFlags
  // ============================================================================
  describe('resolveBuFlags', () => {
    it('returns flag subset for active BU', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk(SAMPLE_BU),
      );

      const flags = await resolveBuFlags('atrione');
      expect(flags).toEqual({
        has_color: true,
        has_width: false,
        has_size: true,
        has_weight: false,
        has_hpp: true,
        has_discount: true,
        has_fifo: false,
        has_delivery_fields: true,
      });
    });

    it('throws if BU is inactive', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockOk({ ...SAMPLE_BU, is_active: false }),
      );

      await expect(resolveBuFlags('atrione')).rejects.toThrow(
        'BU "atrione" tidak aktif',
      );
    });
  });
});
