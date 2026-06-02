'use client';

import { useEffect, useState } from 'react';
import { Keyboard, X } from '@phosphor-icons/react';

export function ShortcutManager() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Avoid triggering when user is typing in inputs or textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Alt + 1, Alt + 2, Alt + 3 for switching BU tabs (by simulating click on tab buttons)
      if (e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        const tabBtns = document.querySelectorAll('.tab-header .tab-btn');
        const idx = parseInt(e.key) - 1;
        if (tabBtns[idx]) {
          (tabBtns[idx] as HTMLElement).click();
        }
      }

      // Ctrl + / or Cmd + / for showing shortcut modal
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowModal(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Expose a method to open the modal from outside (via a custom event)
  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener('open-shortcuts', handler);
    return () => window.removeEventListener('open-shortcuts', handler);
  }, []);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Keyboard size={24} weight="duotone" className="text-primary" />
            Panduan Pintasan (Shortcuts)
          </h2>
          <button
            onClick={() => setShowModal(false)}
            className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="p-6">
          <ul className="space-y-4">
            <li className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Buka Panduan Ini</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono font-bold">Ctrl + /</kbd>
            </li>
            <li className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pilih BU Tab Ke-1 (Kiri)</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono font-bold">Alt + 1</kbd>
            </li>
            <li className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pilih BU Tab Ke-2 (Tengah)</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono font-bold">Alt + 2</kbd>
            </li>
            <li className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pilih BU Tab Ke-3 (Kanan)</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono font-bold">Alt + 3</kbd>
            </li>
          </ul>
          <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs rounded-lg border border-blue-100 dark:border-blue-900/50">
            <p><strong>Tips:</strong> Pintasan tidak akan berfungsi jika kursor Anda sedang aktif mengetik di dalam kolom input atau catatan.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
