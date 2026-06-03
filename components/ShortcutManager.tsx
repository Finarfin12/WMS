'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, X } from '@phosphor-icons/react';

export function ShortcutManager() {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Avoid triggering when user is typing in inputs or textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Navigasi dengan tombol Alt
      if (e.altKey) {
        const key = e.key.toLowerCase();
        
        // Alt + 1, 2, 3 for switching BU tabs (by simulating click on tab buttons)
        if (['1', '2', '3'].includes(key)) {
          e.preventDefault();
          const tabBtns = document.querySelectorAll('.tab-header .tab-btn');
          const idx = parseInt(key) - 1;
          if (tabBtns[idx]) {
            (tabBtns[idx] as HTMLElement).click();
          }
        }

        // Alt + Huruf for Menu Navigation
        if (key === 'd') { e.preventDefault(); router.push('/dashboard'); }
        if (key === 't') { e.preventDefault(); router.push('/transaction'); }
        if (key === 's') { e.preventDefault(); router.push('/stock'); }
        if (key === 'm') { e.preventDefault(); router.push('/master-data'); }
        if (key === 'h') { e.preventDefault(); router.push('/history'); }
        if (key === 'l') { e.preventDefault(); router.push('/reports'); }
        if (key === 'g') { e.preventDefault(); router.push('/global-summary'); }
        if (key === 'i') { e.preventDefault(); router.push('/import'); }
        if (key === 'b') { e.preventDefault(); router.push('/bu-registry'); }
        if (key === 'u') { e.preventDefault(); router.push('/users'); }
        if (key === 'a') { e.preventDefault(); router.push('/audit-log'); }
      }

      // Ctrl + S for Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('shortcut-save'));
      }

      // Ctrl + K for Global Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-search'));
      }

      // Ctrl + / or Cmd + / for showing shortcut modal
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowModal(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // Expose a method to open the modal from outside (via a custom event)
  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener('open-shortcuts', handler);
    return () => window.removeEventListener('open-shortcuts', handler);
  }, []);

  if (!showModal) return null;

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <kbd className="px-2 py-1 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-xs font-mono font-bold text-slate-800 dark:text-slate-100 shadow-sm whitespace-nowrap">
      {children}
    </kbd>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-xl font-extrabold flex items-center gap-3 text-slate-800 dark:text-white">
            <Keyboard size={28} weight="duotone" className="text-primary" />
            Panduan Pintasan Pintar
          </h2>
          <button
            onClick={() => setShowModal(false)}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors p-1.5 rounded-lg"
          >
            <X size={24} weight="bold" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Kolom 1: Menu Utama */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Menu Utama (Alt)</h3>
              <ul className="space-y-3">
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Dashboard</span>
                  <Kbd>Alt + D</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Global Summary</span>
                  <Kbd>Alt + G</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Transaksi</span>
                  <Kbd>Alt + T</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Stok</span>
                  <Kbd>Alt + S</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Master Data</span>
                  <Kbd>Alt + M</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">History</span>
                  <Kbd>Alt + H</Kbd>
                </li>
              </ul>
            </div>

            {/* Kolom 2: Analitik & Sistem */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Analitik & Sistem (Alt)</h3>
              <ul className="space-y-3">
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Laporan</span>
                  <Kbd>Alt + L</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Import</span>
                  <Kbd>Alt + I</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Audit Log</span>
                  <Kbd>Alt + A</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Users</span>
                  <Kbd>Alt + U</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">BU Registry</span>
                  <Kbd>Alt + B</Kbd>
                </li>
              </ul>
            </div>

            {/* Kolom 3: Aksi Cepat & BU */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Aksi Cepat</h3>
              <ul className="space-y-3">
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Simpan Form</span>
                  <Kbd>Ctrl + S</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Cetak Resi / Laporan</span>
                  <Kbd>Ctrl + P</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Fokus Pencarian</span>
                  <Kbd>Ctrl + K</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Pilih BU Tab</span>
                  <Kbd>Alt + 1 / 2 / 3</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Buka Panduan Ini</span>
                  <Kbd>Ctrl + /</Kbd>
                </li>
                <li className="flex justify-between items-center group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors">Tutup Pop-up</span>
                  <Kbd>Esc</Kbd>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-start gap-3">
            <div className="text-primary mt-0.5">💡</div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong>Tips Pro:</strong> Menggunakan pintasan *keyboard* dapat mempercepat pekerjaanmu hingga 3x lipat dibandingkan menggunakan *mouse*. Pintasan akan dinonaktifkan sementara ketika kamu sedang mengetik teks di dalam kotak isian.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
