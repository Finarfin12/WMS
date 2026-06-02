'use client';

/**
 * Audit Log — read-only log semua aktivitas sistem.
 *
 * Phase 6 (2026-06-01). Backend: SystemOps.gs handleAuditList.
 *
 * Features:
 *   - Filter: action prefix, user, target, date range, search all columns
 *   - Badge warna per kategori action
 *   - Detail expand modal
 *   - Pagination 50 rows/page
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardText,
  Funnel,
  Eye,
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  X,
  Robot,
} from '@phosphor-icons/react';
import { listAuditLogs, type AuditLogEntry, type AuditListResult } from '@/lib/audit';
import { formatDateDmy } from '@/lib/utils';
import { alertError } from '@/lib/swal';
import { RadialLoading } from '@/lib/RadialLoading';

// ============================================================================
// Constants
// ============================================================================

const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: '', label: 'Semua Action' },
  { value: 'transaction', label: 'Transaksi' },
  { value: 'masterData', label: 'Master Data' },
  { value: 'auth', label: 'Auth' },
  { value: 'bu', label: 'BU Registry' },
  { value: 'users', label: 'Users' },
  { value: 'import', label: 'Import' },
  { value: 'archive', label: 'Archive' },
  { value: 'pdf', label: 'PDF' },
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'pakta', label: 'Pakta' },
  { value: 'system', label: 'System' },
  { value: 'migration', label: 'Migration' },
];

const ACTION_COLORS: Record<string, string> = {
  transaction: 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100',
  masterData: 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100',
  auth: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100',
  bu: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100',
  users: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100',
  import: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100',
  archive: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  pdf: 'bg-pink-100 text-pink-900 dark:bg-pink-900/30 dark:text-pink-100',
  superadmin: 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100',
  pakta: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/30 dark:text-cyan-100',
  system: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  migration: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-100',
};

const DEFAULT_COLOR = 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100';

function getActionBadge(action: string): string {
  const prefix = action.split('.')[0] || '';
  return ACTION_COLORS[prefix] || DEFAULT_COLOR;
}

function formatTimestamp(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${formatDateDmy(iso)} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

// ============================================================================
// Page
// ============================================================================

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    action: '',
    user: '',
    target: '',
    date_from: '',
    date_to: '',
    search: '',
  });
  const [expandedDetail, setExpandedDetail] = useState<AuditLogEntry | null>(null);

  const limit = 50;

  const fetchLogs = useCallback(
    async (newOffset: number) => {
      setLoading(true);
      try {
        const result: AuditListResult = await listAuditLogs({
          action: filters.action || undefined,
          user: filters.user || undefined,
          target: filters.target || undefined,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
          search: filters.search || undefined,
          limit,
          offset: newOffset,
        });
        setItems(result.items);
        setTotal(result.total);
        setOffset(result.offset);
      } catch (err) {
        alertError(err, 'Gagal load audit log');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchLogs(0);
  }, []);

  function handleSearch() {
    fetchLogs(0);
  }

  function handleReset() {
    setFilters({ action: '', user: '', target: '', date_from: '', date_to: '', search: '' });
    setOffset(0);
  }

  function handlePrev() {
    if (offset > 0) fetchLogs(Math.max(0, offset - limit));
  }

  function handleNext() {
    if (offset + limit < total) fetchLogs(offset + limit);
  }

  function handleRefresh() {
    fetchLogs(offset);
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + limit, total);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <ClipboardText size={32} weight="fill" className="text-primary" />
          Audit Log
        </h1>
        <button type="button" onClick={handleRefresh} className="btn btn-secondary" disabled={loading}>
          <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <Funnel size={16} weight="bold" />
          Filter
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="form-group">
            <label>Action</label>
            <select
              className="form-control"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              {ACTION_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>User</label>
            <input
              type="text"
              className="form-control"
              placeholder="Email"
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Target</label>
            <input
              type="text"
              className="form-control"
              placeholder="ID transaksi / BU / email"
              value={filters.target}
              onChange={(e) => setFilters({ ...filters, target: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Search</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search semua kolom"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Dari Tanggal</label>
            <input
              type="date"
              className="form-control"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Sampai Tanggal</label>
            <input
              type="date"
              className="form-control"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            />
          </div>
          <div className="form-group flex items-end gap-2">
            <button type="button" onClick={handleSearch} className="btn btn-primary" disabled={loading}>
              {loading ? <RadialLoading size={16} /> : 'Cari'}
            </button>
            <button type="button" onClick={handleReset} className="btn btn-secondary">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="py-12 flex justify-center">
            <RadialLoading size={60} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardText size={48} weight="duotone" className="text-muted mx-auto mb-3" />
            <p className="text-muted">
              {total === 0 ? 'Belum ada log' : 'Tidak ada log sesuai filter'}
            </p>
            {total === 0 && <p className="text-xs text-muted mt-1">Log akan muncul otomatis saat ada aktivitas</p>}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted mb-4">
              Menampilkan {showingFrom}-{showingTo} dari {total.toLocaleString('id-ID')} entri
            </div>

            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th className="text-center" style={{ width: 60 }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry, i) => (
                    <tr key={i}>
                      <td className="text-sm font-mono">{formatTimestamp(entry.timestamp)}</td>
                      <td className="text-sm">
                        <span className={entry.user === 'system' ? 'text-muted italic flex items-center gap-1' : ''}>
                          {entry.user === 'system' ? <><Robot size={16} /> system</> : entry.user}
                        </span>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getActionBadge(entry.action)}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="text-sm font-mono max-w-[200px] truncate" title={entry.target}>
                        {entry.target || '-'}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedDetail(entry)}
                          className="text-primary hover:text-primary-hover p-1"
                          title="Lihat detail"
                        >
                          <Eye size={16} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={offset === 0}
                  className="btn btn-secondary flex items-center gap-1 disabled:opacity-50"
                >
                  <ArrowLeft size={14} /> Prev
                </button>
                <span className="text-sm text-muted">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={offset + limit >= total}
                  className="btn btn-secondary flex items-center gap-1 disabled:opacity-50"
                >
                  Next <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {expandedDetail && (
        <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setExpandedDetail(null)}>
          <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Eye size={20} weight="fill" className="text-primary" />
                Detail Audit Log
              </h3>
              <button type="button" onClick={() => setExpandedDetail(null)} className="text-muted hover:text-primary">
                <X size={20} weight="bold" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted">Timestamp:</span>{' '}
                <strong>{formatTimestamp(expandedDetail.timestamp)}</strong>
              </div>
              <div>
                <span className="text-muted">User:</span>{' '}
                <strong>{expandedDetail.user || '-'}</strong>
              </div>
              <div>
                <span className="text-muted">Action:</span>{' '}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getActionBadge(expandedDetail.action)}`}>
                  {expandedDetail.action}
                </span>
              </div>
              <div>
                <span className="text-muted">Target:</span>{' '}
                <strong className="font-mono">{expandedDetail.target || '-'}</strong>
              </div>
              <div>
                <span className="text-muted">Detail:</span>
                <pre className="mt-2 p-3 bg-[var(--bg)] rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap max-h-64">
                  {JSON.stringify(expandedDetail.detail, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
