'use client';

import { useState } from 'react';
import { ShieldCheck, ArrowsClockwise } from '@phosphor-icons/react';
import { verifyIntegrity, reconcileStock } from '@/lib/system';
import { alertError, alertSuccess } from '@/lib/swal';
import Swal from 'sweetalert2';

export default function SettingsPage() {
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [auditingData, setAuditingData] = useState(false);

  async function handleHealthCheck() {
    setCheckingHealth(true);
    try {
      const res = await verifyIntegrity();
      if (res.ok) {
        alertSuccess(`System Sehat! (${res.summary.ok_count} sheet tervalidasi)`);
      } else {
        const errorList = [
          ...res.missing_sheets.map(s => `Missing: ${s}`),
          ...res.header_mismatches.map(m => `Mismatch: ${m.sheet}`)
        ].join('\n');
        
        Swal.fire({
          icon: 'warning',
          title: 'Perhatian: Ada Skema yang Tidak Sesuai',
          text: errorList || res.reason || 'Terjadi ketidaksesuaian struktur database.',
          confirmButtonColor: 'var(--primary)',
        });
      }
    } catch (err) {
      alertError(err, 'Gagal menjalankan Health Check');
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleAuditSync() {
    const confirm = await Swal.fire({
      title: 'Mulai Audit Data?',
      text: 'Proses ini akan merekap ulang stok dari histori transaksi. Lanjutkan?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Mulai',
      cancelButtonText: 'Batal',
      confirmButtonColor: 'var(--primary)',
    });

    if (!confirm.isConfirmed) return;

    setAuditingData(true);
    try {
      const res = await reconcileStock();
      
      let htmlContent = `<b>${res.bus_checked} BU telah diaudit.</b><br/><br/>`;
      res.report.forEach(r => {
        if (r.error) {
          htmlContent += `<div style="color:red">${r.bu}: Error - ${r.error}</div>`;
        } else if (r.diff !== 0) {
          htmlContent += `<div style="color:orange">${r.bu}: Ditemukan selisih (${r.diff})</div>`;
        } else {
          htmlContent += `<div style="color:green">${r.bu}: Sinkron (OK)</div>`;
        }
      });

      Swal.fire({
        icon: 'info',
        title: 'Hasil Audit & Sync',
        html: htmlContent,
        confirmButtonColor: 'var(--primary)',
      });
    } catch (err) {
      alertError(err, 'Gagal menjalankan Audit Data');
    } finally {
      setAuditingData(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-primary mb-6">Pengaturan Sistem</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* System Health Check Card */}
        <div className="card flex flex-col hover:border-[var(--primary)] transition-all">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={24} weight="bold" className="text-primary" />
            <h2 className="text-xl font-bold text-primary">System Health Check</h2>
          </div>
          <p className="text-muted text-sm mb-6 flex-1">
            Verifikasi koneksi ke 5 Database (Main & Archive) dan struktur tabel.
          </p>
          <button 
            onClick={handleHealthCheck} 
            disabled={checkingHealth}
            className="btn btn-primary w-full sm:w-auto self-start"
          >
            {checkingHealth ? (
              <span className="flex items-center gap-2"><ArrowsClockwise className="animate-spin" /> Mendiagnosa...</span>
            ) : (
              <span className="flex items-center gap-2">Jalankan Diagnosa</span>
            )}
          </button>
        </div>

        {/* Data Audit & Sync Card */}
        <div className="card flex flex-col hover:border-[var(--primary)] transition-all">
          <div className="flex items-center gap-2 mb-2">
            <ArrowsClockwise size={24} weight="bold" className="text-primary" />
            <h2 className="text-xl font-bold text-primary">Data Audit & Sync</h2>
          </div>
          <p className="text-muted text-sm mb-6 flex-1">
            Hitung ulang stok dari seluruh histori transaksi dan sinkronkan ke Master Data.
          </p>
          <button 
            onClick={handleAuditSync} 
            disabled={auditingData}
            className="btn btn-primary w-full sm:w-auto self-start"
          >
            {auditingData ? (
              <span className="flex items-center gap-2"><ArrowsClockwise className="animate-spin" /> Sinkronisasi...</span>
            ) : (
              <span className="flex items-center gap-2">Mulai Audit Data</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
