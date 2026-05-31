'use client';

/**
 * RadialLoading — spinner conic-gradient.
 *
 * Modes:
 *   - <RadialLoading />                    — spinning indeterminate
 *   - <RadialLoading progress={45} />      — determinate (0-100)
 *   - <RadialLoading.Overlay text="..." /> — full-screen overlay
 */

import { cn } from './utils';

export interface RadialLoadingProps {
  progress?: number;
  size?: number;
  className?: string;
}

export function RadialLoading({ progress, size = 60, className }: RadialLoadingProps) {
  const isIndeterminate = progress === undefined;
  const pct = Math.max(0, Math.min(100, progress ?? 0));

  return (
    <div
      className={cn('radial-loading', isIndeterminate && 'spin', className)}
      style={
        {
          width: size,
          height: size,
          '--p': isIndeterminate ? '0%' : `${pct}%`,
        } as React.CSSProperties
      }
      role="status"
      aria-label={isIndeterminate ? 'Loading' : `Progress ${pct}%`}
    >
      {!isIndeterminate && (
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
          style={{ color: 'var(--primary)' }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}

export interface OverlayProps {
  text?: string;
  visible?: boolean;
}

RadialLoading.Overlay = function Overlay({ text = 'Memproses…', visible = true }: OverlayProps) {
  if (!visible) return null;

  return (
    <div className="loading-overlay">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center gap-4 min-w-[200px]">
        <RadialLoading size={80} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
          {text}
        </p>
      </div>
    </div>
  );
};
