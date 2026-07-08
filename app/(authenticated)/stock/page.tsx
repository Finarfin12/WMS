'use client';

/**
 * Stock — read-time list per BU dengan filter search.
 *
 * BU active dipilih dari tab di AppShell (event 'bu-changed').
 */

import React, { useEffect, useState, useCallback } from 'react';
import { MagnifyingGlass, Package, ArrowsClockwise, CaretDown, CaretRight } from '@phosphor-icons/react';
import { getStock, type StockGetResult } from '@/lib/stock';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError, toast } from '@/lib/swal';
import { formatCurrency, formatCompactIDR } from '@/lib/utils';
import { ContextMenu } from '@/components/ContextMenu';

export default function StockPage() {
  const [bu, setBu] = useState<string>('');
  const [data, setData] = useState<StockGetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: any } | null>(null);
  
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());

  // items already one row per item by backend (batches[] tracks individual prices)
  const rows = data?.items ?? [];

  useEffect(() => {
    setExpandedKeys(new Set(rows.reduce<number[]>((acc, it, i) => {
      if (it.batches && it.batches.length > 0) acc.push(i);
      return acc;
    }, [])));
  }, [rows]);

  function toggleExpand(idx: number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // Sync BU dari localStorage + listen event tab change
  useEffect(() => {
    const initial = localStorage.getItem('wms_active_bu') || '';
    setBu(initial);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setBu(detail);
    };
    window.addEventListener('bu-changed', handler);
    return () => window.removeEventListener('bu-changed', handler);
  }, []);

  const load = useCallback(async (isMounted = { current: true }) => {
    if (!bu) return;
    setLoading(true);
    try {
      const result = await getStock({
        bu,
        search: search || undefined,
        include_zero: includeZero,
        limit: 1000,
      });
      if (isMounted.current) setData(result);
    } catch (err) {
      if (isMounted.current) alertError(err, 'Gagal memuat stok');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [bu, search, includeZero]);

  useEffect(() => {
    const isMounted = { current: true };
    load(isMounted);
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <Package size={32} weight="fill" className="text-primary" />
            Stok {bu}
          </h1>
          {data && (
            <p className="text-sm text-muted">
              {rows.length} item · Total stok: {data.total_stock.toLocaleString('id-ID')}
            </p>
          )}
        </div>
        <button type="button" onClick={() => load()} className="btn btn-secondary" disabled={loading}>
          <ArrowsClockwise size={18} weight="bold" className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <MagnifyingGlass
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            className="form-control"
            placeholder="Cari nama barang…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
          />
          Tampilkan stok 0
        </label>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RadialLoading size={60} />
          </div>
        ) : !data || rows.length === 0 ? (
          <p className="text-center text-muted py-12">Tidak ada data stok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-10"></th>
                  <th>Nama</th>
                  <th>Variasi</th>
                  <th>UoM</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Stok Awal</th>
                  <th className="text-right">Masuk</th>
                  <th className="text-right">Keluar</th>
                  <th className="text-right">Harga Beli</th>
                  <th className="text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, i) => {
                  const hasBatches = item.batches && item.batches.length > 0;
                  const isOpen = expandedKeys.has(i);
                  
                  return (
                    <React.Fragment key={i}>
                      <tr 
                        onClick={() => hasBatches && toggleExpand(i)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, item });
                        }}
                        className={`hover:bg-slate-800/50 ${hasBatches ? 'cursor-pointer' : 'cursor-context-menu'}`}
                      >
                        <td className="text-center">
                          {hasBatches && (
                            isOpen ? (
                              <CaretDown size={16} weight="bold" className="text-primary inline-block" />
                            ) : (
                              <CaretRight size={16} weight="bold" className="text-muted inline-block" />
                            )
                          )}
                        </td>
                        <td className="font-semibold">{item.nama}</td>
                        <td className="text-sm text-muted">
                          {[item.warna, item.ukuran, item.lebar].filter(Boolean).join(' / ') || '-'}
                        </td>
                        <td>{item.uom}</td>
                        <td className="text-right font-bold">
                          <span className={item.stok < 10 ? 'text-danger' : ''}>{item.stok}</span>
                        </td>
                        <td className="text-right text-muted">{item.stok_awal}</td>
                        <td className="text-right text-success">+{item.total_masuk}</td>
                        <td className="text-right text-danger">-{item.total_keluar}</td>
                        <td className="text-right">
                          {item.batches && item.batches.length > 1 ? (
                            <span className="text-warning font-semibold text-sm px-2 py-1 rounded bg-warning/10" title="Multi-batch dengan harga berbeda">
                              {item.batches.length} Batch
                            </span>
                          ) : (
                            formatCurrency(item.harga_jual)
                          )}
                        </td>
                        <td className="text-right font-semibold" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.batches ? item.batches.reduce((v, b) => v + (b.stok || 0) * (b.harga || 0), 0) : item.stok * item.harga_jual)}>
                          {formatCompactIDR(item.batches ? item.batches.reduce((v, b) => v + (b.stok || 0) * (b.harga || 0), 0) : item.stok * item.harga_jual)}
                        </td>
                      </tr>
                      
                      {isOpen && hasBatches && item.batches!.map((batch, bi) => (
                        <tr 
                          key={`${i}-${bi}`}
                          className="bg-[var(--bg-color)] text-sm hover:bg-slate-800/50"
                        >
                          <td></td>
                          <td colSpan={3} className="pl-6 text-muted">
                            ↳ Batch {bi + 1}
                          </td>
                          <td className="text-right font-bold text-primary">
                            {batch.stok}
                          </td>
                          <td colSpan={3}></td>
                          <td className="text-right text-muted">
                            {formatCurrency(batch.harga)}
                          </td>
                          <td className="text-right font-semibold text-muted" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(batch.stok * batch.harga)}>
                            {formatCompactIDR(batch.stok * batch.harga)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          options={[
            {
              label: 'Salin Nama Barang',
              onClick: () => navigator.clipboard.writeText(contextMenu.item.nama),
            },
            {
              label: 'Lihat Riwayat Transaksi',
              onClick: () => {
                // To filter history, we could navigate or open a modal. For now, copy name.
                navigator.clipboard.writeText(contextMenu.item.nama);
                toast('Nama disalin, tempel di pencarian History', 'success');
              }
            }
          ]}
        />
      )}
    </div>
  );
}
