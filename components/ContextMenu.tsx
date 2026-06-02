'use client';

import { useEffect, useRef } from 'react';

export interface ContextMenuOption {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}

export function ContextMenu({ x, y, options, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    
    // Slight delay to prevent immediate close if triggered by a click
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 10);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Ensure menu stays within viewport
  const style: React.CSSProperties = { top: y, left: x };
  if (typeof window !== 'undefined') {
    if (x + 200 > window.innerWidth) style.left = window.innerWidth - 220;
    if (y + (options.length * 40) > window.innerHeight) style.top = window.innerHeight - (options.length * 40) - 20;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl py-2 overflow-hidden ring-1 ring-black/5"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-2 mb-1 border-b border-slate-100 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aksi Cepat</p>
      </div>
      {options.map((opt, i) => (
        <button
          key={i}
          className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors ${
            opt.danger 
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' 
              : 'text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            opt.onClick();
            onClose();
          }}
        >
          {opt.icon && <span className="opacity-80">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
