'use client';

/**
 * Last Activity — list 20 transaksi terbaru lintas BU.
 */

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Clock } from '@phosphor-icons/react';
import { getDashboardLive, type DashboardData } from '@/lib/dashboard';
import { listUsers } from '@/lib/users';
import { RadialLoading } from '@/lib/RadialLoading';
import { alertError } from '@/lib/swal';
import { formatDateDmy } from '@/lib/utils';

export default function LastActivityPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const result = await getDashboardLive();
      setData(result);
    } catch (err) {
      alertError(err, 'Gagal memuat aktivitas terakhir');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60_000);
    
    // Fetch users for mapping email to Username
    listUsers().then((users) => {
      const map: Record<string, string> = {};
      users.forEach((u) => {
        map[u.Email] = u.Username;
      });
      setUsersMap(map);
    }).catch(() => { /* ignore */ });
    
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RadialLoading size={80} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--text-main)' }}>
            Aktivitas Terakhir
          </h1>
          <p className="text-sm text-muted">
            Daftar 20 transaksi terbaru lintas Business Unit · Last update: {new Date(data.timestamp).toLocaleTimeString('id-ID')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="btn btn-secondary"
          disabled={refreshing}
        >
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Main card containing the table */}
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <Clock size={20} weight="fill" className="text-primary" />
          Transaksi Terbaru
        </h3>
        <div className="overflow-x-auto">
          {data.recent_transactions.length === 0 ? (
            <div className="text-center py-8 text-muted">
              Belum ada aktivitas transaksi terdaftar.
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>BU</th>
                  <th>Nama Barang</th>
                  <th className="text-right">Masuk</th>
                  <th className="text-right">Keluar</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_transactions.slice(0, 20).map((tx, i) => {
                  const materialName = (tx['Nama Material'] || tx['Nama Barang'] || '-') as string;
                  const isAtrione = String(tx.bu).toLowerCase().trim() === 'atrione';
                  
                  // Safe cast
                  const rawUom = (tx['UoM'] || tx['uom'] || '') as string;
                  const cleanUom = isAtrione && (rawUom.toLowerCase() === 'box' || rawUom.toLowerCase() === 'prs') ? 'prs' : rawUom;

                  return (
                    <tr key={i}>
                      <td>{formatDateDmy(tx.Tanggal as string)}</td>
                      <td>
                        <strong>{tx.bu}</strong>
                      </td>
                      <td>{materialName}</td>
                      <td className="text-right text-success font-semibold">
                        {tx.Masuk ? (
                          <>
                            {(tx.Masuk as number).toLocaleString('id-ID')}{' '}
                            <span className="text-xs text-muted">{cleanUom}</span>
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="text-right text-danger font-semibold">
                        {tx.Keluar ? (
                          <>
                            {(tx.Keluar as number).toLocaleString('id-ID')}{' '}
                            <span className="text-xs text-muted">{cleanUom}</span>
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="text-xs text-muted">
                        {usersMap[String(tx['User'])] ? (
                          <span title={String(tx['User'])}>
                            {usersMap[String(tx['User'])]}
                          </span>
                        ) : (
                          String(tx['User'] || '-')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
