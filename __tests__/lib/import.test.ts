// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  previewImport,
  executeImport,
  getImportTemplate,
  type ImportSchema,
  type ImportPreviewResult,
} from '@/lib/import';

/**
 * Tests untuk lib/import.ts — typed wrapper.
 *
 * Tidak meng-test logic validasi backend (`_validateImportRow_` di Apps Script);
 * itu hidup di runtime Apps Script. Yang kita test di sini:
 *   1. Wrapper memanggil callAppsScript dengan action + payload yang benar
 *   2. Type ImportSchema dipropagasi end-to-end (compile-time check via TS)
 *   3. Validation argumen wajib (bu, type)
 */

const ORIGINAL_ENV = { ...process.env };

const ATRIONE_SCHEMA: ImportSchema = {
  bu_id: 'atrione',
  bu_name: 'Atrione',
  default_uom: 'Pasang',
  has_color: true,
  has_size: true,
  has_width: false,
  has_weight: false,
  has_hpp: true,
  has_discount: true,
  has_fifo: false,
  has_delivery_fields: true,
  allowed_uoms: ['Unit', 'Pasang', 'Pcs'],
  allowed_currencies: ['IDR', 'USD'],
};

const CHEMICAL_SCHEMA: ImportSchema = {
  bu_id: 'chemical',
  bu_name: 'Chemical',
  default_uom: 'Kg',
  has_color: false,
  has_size: false,
  has_width: false,
  has_weight: true,
  has_hpp: false,
  has_discount: false,
  has_fifo: true,
  has_delivery_fields: false,
  allowed_uoms: ['Kg', 'Gram', 'Liter'],
  allowed_currencies: ['IDR', 'USD'],
};

function mockResponse<T>(data: T) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('lib/import.ts wrappers', () => {
  beforeEach(() => {
    process.env.APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/TEST/exec';
    process.env.APPS_SCRIPT_INTERNAL_TOKEN = 'test-token-secret';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  describe('previewImport', () => {
    it('panggil action import.preview dengan payload lengkap', async () => {
      const fakeResult: ImportPreviewResult = {
        bu: 'Atrione',
        type: 'masterData',
        total: 2,
        ready: 1,
        error_count: 1,
        warning_count: 0,
        validations: [
          { row: 1, errors: [], warnings: [] },
          { row: 2, errors: ['Tanggal kosong'], warnings: [] },
        ],
        schema: ATRIONE_SCHEMA,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockResponse(fakeResult),
      );

      const result = await previewImport({
        bu: 'Atrione',
        type: 'masterData',
        rows: [
          { Tanggal: '2026-05-31', 'Nama Material': 'Sepatu A' },
          { Tanggal: '', 'Nama Material': 'X' },
        ],
      });

      expect(result).toEqual(fakeResult);
      expect(result.schema.has_hpp).toBe(true);
      expect(result.schema.allowed_uoms).toContain('Pasang');

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('import.preview');
      expect(body.payload.bu).toBe('Atrione');
      expect(body.payload.rows).toHaveLength(2);
    });

    it('reject kalau bu kosong', async () => {
      await expect(
        previewImport({ bu: '', type: 'transaction', rows: [] }),
      ).rejects.toThrow('bu wajib');
    });

    it('reject kalau type kosong', async () => {
      await expect(
        previewImport({ bu: 'Atrione', type: '' as 'transaction', rows: [] }),
      ).rejects.toThrow('type wajib');
    });

    it('schema metadata propagated untuk Chemical (dual-uom, no HPP)', async () => {
      const result: ImportPreviewResult = {
        bu: 'Chemical',
        type: 'transaction',
        total: 1,
        ready: 1,
        error_count: 0,
        warning_count: 0,
        validations: [{ row: 1, errors: [], warnings: [] }],
        schema: CHEMICAL_SCHEMA,
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse(result));

      const r = await previewImport({
        bu: 'Chemical',
        type: 'transaction',
        rows: [{ Tanggal: '2026-05-31', 'Nama Barang': 'Reactive Red' }],
      });

      expect(r.schema.has_hpp).toBe(false);
      expect(r.schema.has_color).toBe(false);
      expect(r.schema.has_fifo).toBe(true);
      expect(r.schema.allowed_uoms).toEqual(['Kg', 'Gram', 'Liter']);
    });
  });

  describe('executeImport', () => {
    it('panggil action import.execute dengan skip_invalid + user', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockResponse({
          bu: 'Canvas',
          type: 'masterData',
          total: 3,
          success: 2,
          failure: 1,
          successes: [{ row: 1, id: 'MD-1' }, { row: 3, id: 'MD-3' }],
          failures: [{ row: 2, errors: ['Lebar kosong'], skipped: true }],
        }),
      );

      const result = await executeImport({
        bu: 'Canvas',
        type: 'masterData',
        rows: [{ Tanggal: '2026-05-31', 'Nama Material': 'Cordura', Lebar: 1.5 }],
        skip_invalid: true,
        user: 'ii@kgm-group.com',
      });

      // Phase 5b: executeImport sekarang return ResilientResponse
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(2);
        expect(result.data.failure).toBe(1);
      }

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('import.execute');
      expect(body.payload.skip_invalid).toBe(true);
      expect(body.payload.user).toBe('ii@kgm-group.com');
    });

    it('reject kalau bu kosong', async () => {
      await expect(
        executeImport({ bu: '', type: 'transaction', rows: [] }),
      ).rejects.toThrow('bu wajib');
    });
  });

  describe('getImportTemplate', () => {
    it('return headers + sample + schema', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockResponse({
          bu: 'Atrione',
          type: 'masterData',
          headers: ['Tanggal', 'Nama Material', 'Ukuran', 'Warna', 'UoM', 'Tipe', 'Harga Jual', 'HPP', 'Satuan Harga', 'Stok Awal'],
          sample: [{
            Tanggal: '2026-05-31',
            UoM: 'Pasang',
            'Satuan Harga': 'IDR',
            Tipe: 'Produk Baru',
            'Harga Jual': 0,
            HPP: 0,
            'Stok Awal': 0,
          }],
          filename: 'Template_Import_masterData_Atrione.xlsx',
          schema: ATRIONE_SCHEMA,
        }),
      );

      const result = await getImportTemplate('Atrione', 'masterData');
      expect(result.headers).toContain('HPP');
      expect(result.headers).toContain('Ukuran');
      expect(result.headers).not.toContain('Lebar');
      expect(result.schema.has_hpp).toBe(true);
      expect(result.filename).toMatch(/Atrione/);

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.action).toBe('import.template');
      expect(body.payload).toEqual({ bu: 'Atrione', type: 'masterData' });
    });

    it('reject kalau bu kosong', async () => {
      await expect(getImportTemplate('', 'transaction')).rejects.toThrow('buName wajib');
    });
  });
});

/**
 * Schema-aware behavior tests — verify type-level guarantee bahwa frontend
 * tidak boleh re-derive flag dari bu_name string.
 */
describe('ImportSchema shape contract', () => {
  it('Atrione punya HPP + size + delivery, tapi tidak FIFO/width', () => {
    expect(ATRIONE_SCHEMA.has_hpp).toBe(true);
    expect(ATRIONE_SCHEMA.has_size).toBe(true);
    expect(ATRIONE_SCHEMA.has_delivery_fields).toBe(true);
    expect(ATRIONE_SCHEMA.has_fifo).toBe(false);
    expect(ATRIONE_SCHEMA.has_width).toBe(false);
  });

  it('Chemical punya FIFO + weight, tapi tidak HPP/color/size/width', () => {
    expect(CHEMICAL_SCHEMA.has_fifo).toBe(true);
    expect(CHEMICAL_SCHEMA.has_weight).toBe(true);
    expect(CHEMICAL_SCHEMA.has_hpp).toBe(false);
    expect(CHEMICAL_SCHEMA.has_color).toBe(false);
    expect(CHEMICAL_SCHEMA.has_size).toBe(false);
    expect(CHEMICAL_SCHEMA.has_width).toBe(false);
  });

  it('allowed_uoms harus non-empty untuk semua BU production', () => {
    expect(ATRIONE_SCHEMA.allowed_uoms.length).toBeGreaterThan(0);
    expect(CHEMICAL_SCHEMA.allowed_uoms.length).toBeGreaterThan(0);
  });
});
