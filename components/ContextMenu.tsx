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
      className="fixed z-[9999] w-48 bg-card border border-border shadow-xl rounded-md py-1 overflow-hidden"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt, i) => (
        <button
          key={i}
          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors ${
            opt.danger ? 'text-red-400 hover:text-red-300' : 'text-slate-300 hover:text-white'
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
