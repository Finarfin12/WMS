'use client';

/**
 * Reports — laporan laba kotor dengan grouping + export Excel.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChartLine,
  MagnifyingGlass,
  FileXls,
  TrendUp,
  TrendDown,
  Package,
} from '@phosphor-icons/react';
import { getProfitReport, getExportData, type ProfitReport } from '@/lib/reports';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast, withLoading } from '@/lib/swal';
import { formatCurrency, formatDateDmy } from '@/lib/utils';

type GroupBy = 'product' | 'customer' | 'date';

export default function ReportsPage() {
  const [bu, setBu] = useState('');
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    group_by: 'product' as GroupBy,
  });

  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);
    const handler = (e: Event) => setBu((e as CustomEvent<string>).detail);
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  async function handleGenerate() {
    if (!bu) {
      toast('Pilih BU dulu di tab atas', 'warning');
      return;
    }
    setLoading(true);
    try {
      const result = await getProfitReport({
        bu,
        from: filters.from,
        to: filters.to,
        group_by: filters.group_by,
      });
      setReport(result);
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(type: 'history' | 'stock' | 'profit') {
    if (!bu) {
      toast('Pilih BU dulu', 'warning');
      return;
    }
    const result = await withLoading(
      () =>
        getExportData({
          bu,
          type,
          from: filters.from,
          to: filters.to,
          group_by: filters.group_by,
        }),
      { loadingText: 'Generate Excel data…' },
    );

    if (result) {
      try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(result.title.slice(0, 31));

        // 1. Add Title row (A2)
        worksheet.addRow([]); // Row 1 empty
        worksheet.mergeCells('A2:H2');
        const titleCell = worksheet.getCell('A2');
        titleCell.value = `${result.title} - BU ${bu}`;
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(2).height = 30;

        // 2. Add Period row (A3)
        worksheet.mergeCells('A3:H3');
        const periodCell = worksheet.getCell('A3');
        periodCell.value = `Periode: ${formatDateDmy(filters.from)} s/d ${formatDateDmy(filters.to)}`;
        periodCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
        periodCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(3).height = 20;

        worksheet.addRow([]); // Row 4 empty

        // 3. Add Headers (Row 5)
        const keys = Object.keys(result.rows[0] || {});
        if (keys.length > 0) {
          const headers = keys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
          const headerRow = worksheet.addRow(headers);
          headerRow.height = 25;
          headerRow.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF2563EB' }, // Primary blue color
            };
            cell.font = {
              name: 'Arial',
              size: 10,
              bold: true,
              color: { argb: 'FFFFFFFF' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF94A3B8' } },
              bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
              left: { style: 'thin', color: { argb: 'FF94A3B8' } },
              right: { style: 'thin', color: { argb: 'FF94A3B8' } },
            };
          });

          // 4. Add Data Rows
          result.rows.forEach((rowObj: any) => {
            const values = keys.map((key) => rowObj[key]);
            const dataRow = worksheet.addRow(values);
            dataRow.height = 20;

            dataRow.eachCell((cell, colNumber) => {
              const keyName = keys[colNumber - 1].toLowerCase();
              const val = cell.value;

              cell.font = { name: 'Arial', size: 9 };
              cell.alignment = { vertical: 'middle' };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              };

              // Number formatting
              if (typeof val === 'number') {
                if (
                  keyName.includes('harga') ||
                  keyName.includes('hpp') ||
                  keyName.includes('value') ||
                  keyName.includes('penjualan') ||
                  keyName.includes('laba') ||
                  keyName.includes('margin')
                ) {
                  const isUsd = String(rowObj['Mata Uang'] || rowObj['currency'] || '').toUpperCase() === 'USD';
                  cell.numFmt = isUsd ? '$#,##0.00' : '"Rp"#,##0';
                  cell.alignment = { vertical: 'middle', horizontal: 'right' };
                } else if (
                  keyName.includes('qty') ||
                  keyName.includes('masuk') ||
                  keyName.includes('keluar') ||
                  keyName.includes('stok') ||
                  keyName.includes('jumlah')
                ) {
                  cell.numFmt = '#,##0';
                  cell.alignment = { vertical: 'middle', horizontal: 'right' };
                } else {
                  cell.alignment = { vertical: 'middle', horizontal: 'right' };
                }
              } else {
                if (keyName.includes('tanggal') || keyName.includes('date')) {
                  cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                  cell.alignment = { vertical: 'middle', horizontal: 'left' };
                }
              }
            });
          });

          // 5. Auto-fit column widths
          worksheet.columns.forEach((column) => {
            let maxLength = 0;
            column.eachCell?.({ includeEmpty: true }, (cell) => {
              const cellLength = cell.value ? String(cell.value).length : 0;
              if (cellLength > maxLength) {
                maxLength = cellLength;
              }
            });
            column.width = Math.max(maxLength + 4, 12);
          });
        }

        // 6. Write buffer and trigger download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `${result.title}_${filters.from}_${filters.to}.xlsx`;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);

        toast(`File ${filename} ter-download`, 'success');
      } catch (err: any) {
        alertError(err, 'Gagal mengexport file');
      }
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <ChartLine size={32} weight="fill" className="text-primary" />
          Reports {bu}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/reports/stock" className="btn btn-secondary">
            <Package size={16} weight="bold" />
            Rekap Stok
          </Link>
          <button
            type="button"
            onClick={() => handleExport('history')}
            className="btn btn-secondary"
          >
            <FileXls size={16} weight="bold" />
            Export History
          </button>
          <button
            type="button"
            onClick={() => handleExport('stock')}
            className="btn btn-secondary"
          >
            <FileXls size={16} weight="bold" />
            Export Stok
          </button>
          {report && (
            <button
              type="button"
              onClick={() => handleExport('profit')}
              className="btn btn-secondary"
            >
              <FileXls size={16} weight="bold" />
              Export Laba
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <h3 className="card-title">
          {report?.has_hpp === false ? 'Laporan Penjualan' : 'Laporan Laba Kotor'}
          {report && (
            <span className="text-sm text-muted font-normal ml-2">
              {report.has_hpp ? '(dengan HPP & margin)' : '(qty + revenue)'}
            </span>
          )}
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="form-group">
            <label>Dari Tanggal</label>
            <input
              type="date"
              className="form-control"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Sampai Tanggal</label>
            <input
              type="date"
              className="form-control"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Group By</label>
            <select
              className="form-control"
              value={filters.group_by}
              onChange={(e) => setFilters({ ...filters, group_by: e.target.value as GroupBy })}
            >
              <option value="product">Produk</option>
              <option value="customer">Customer</option>
              <option value="date">Tanggal</option>
            </select>
          </div>
          <div className="form-group flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <RadialLoading size={18} />
              ) : (
                <>
                  <MagnifyingGlass size={18} weight="bold" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      {report && !loading && (
        <>
          <div className={`grid ${report.has_hpp ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-4 mb-4`}>
            <div className="card">
              <p className="stat-label">Total Penjualan</p>
              <p className="stat-value">{formatCurrency(report.summary.total_penjualan)}</p>
            </div>
            <div className="card">
              <p className="stat-label">Total Qty Keluar</p>
              <p className="stat-value">
                {report.summary.total_qty_keluar.toLocaleString('id-ID')}
              </p>
            </div>
            {report.has_hpp && (
              <>
                <div className="card">
                  <p className="stat-label">Total HPP</p>
                  <p className="stat-value text-danger">
                    {formatCurrency(report.summary.total_hpp)}
                  </p>
                </div>
                <div className="card">
                  <p className="stat-label">Laba Kotor / Margin</p>
                  <p className="stat-value text-success">
                    {formatCurrency(report.summary.total_laba_kotor)}
                  </p>
                  <p className="text-sm text-muted flex items-center gap-1 mt-1">
                    {report.summary.overall_margin_pct >= 0 ? (
                      <TrendUp className="text-success" size={16} weight="fill" />
                    ) : (
                      <TrendDown className="text-danger" size={16} weight="fill" />
                    )}
                    {report.summary.overall_margin_pct.toFixed(1)}% margin
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Detail table */}
          <div className="card">
            <h3 className="card-title">
              Detail per{' '}
              {filters.group_by === 'product'
                ? 'Produk'
                : filters.group_by === 'customer'
                  ? 'Customer'
                  : 'Tanggal'}
            </h3>
            {report.groups.length === 0 ? (
              <p className="text-center text-muted py-8">Tidak ada data di rentang ini</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>
                        {filters.group_by === 'product'
                          ? 'Produk'
                          : filters.group_by === 'customer'
                            ? 'Customer'
                            : 'Tanggal'}
                      </th>
                      <th className="text-right">Qty</th>
                      <th>UoM</th>
                      <th className="text-right">Penjualan</th>
                      {report.has_hpp && (
                        <>
                          <th className="text-right">HPP</th>
                          <th className="text-right">Laba Kotor</th>
                          <th className="text-right">Margin</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.groups.map((g, i) => (
                      <tr key={i}>
                        <td className="font-semibold">{g.key}</td>
                        <td className="text-right">{g.qty.toLocaleString('id-ID')}</td>
                        <td className="text-xs text-muted">{g.uom || '-'}</td>
                        <td className="text-right">{formatCurrency(g.penjualan)}</td>
                        {report.has_hpp && (
                          <>
                            <td className="text-right text-danger">
                              {formatCurrency(g.hpp)}
                            </td>
                            <td className="text-right text-success font-semibold">
                              {formatCurrency(g.laba_kotor)}
                            </td>
                            <td className="text-right">
                              <span
                                className={
                                  g.margin_pct >= 0 ? 'text-success' : 'text-danger'
                                }
                              >
                                {g.margin_pct.toFixed(1)}%
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="card text-center py-12">
          <ChartLine size={64} weight="duotone" className="text-primary mx-auto mb-3" />
          <p className="text-muted">Klik &ldquo;Generate&rdquo; untuk membuat laporan</p>
          <p className="text-xs text-muted mt-2">
            Atrione: laba kotor + margin · Canvas/Chemical: penjualan + qty
          </p>
        </div>
      )}
    </div>
  );
}
