'use client';

/**
 * AppShell — sidebar + topbar + main area untuk halaman authenticated.
 *
 * Layout match versi lama:
 *   ├─ Sidebar (260px, biru primary, collapsible)
 *   │   ├─ Logo
 *   │   ├─ Nav items (Dashboard, Transaksi, Stock, MD, History, Reports, Users)
 *   │   └─ User profile bottom
 *   └─ Main wrapper
 *       ├─ Tab BU header (Atrione | Canvas | Chemical)
 *       └─ Content area
 */

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  House,
  Receipt,
  Package,
  Database,
  ClockCounterClockwise,
  Clock,
  Buildings,
  ChartLine,
  ChartPieSlice,
  Users as UsersIcon,
  Upload,
  Gear,
  SignOut,
  List,
  Moon,
  Sun,
  ClipboardText,
  type Icon as IconType,
} from '@phosphor-icons/react';
import { logout } from '@/lib/auth';
import { listBus, type BUConfig } from '@/lib/bu-registry';
import { confirm, toast } from '@/lib/swal';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  adminOnly?: boolean;          // Admin atau Superadmin
  superadminOnly?: boolean;     // Hanya Superadmin
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: House },
  { href: '/global-summary', label: 'Global Summary', icon: ChartPieSlice },
  { href: '/transaction', label: 'Transaksi', icon: Receipt },
  { href: '/stock', label: 'Stok', icon: Package },
  { href: '/master-data', label: 'Master Data', icon: Database },
  { href: '/history', label: 'History', icon: ClockCounterClockwise },
  { href: '/reports', label: 'Laporan', icon: ChartLine },
  { href: '/import', label: 'Import', icon: Upload, adminOnly: true },
  { href: '/audit-log', label: 'Audit Log', icon: ClipboardText, adminOnly: true },
  { href: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/last-activity', label: 'Aktivitas Terakhir', icon: Clock },
  { href: '/settings', label: 'Pengaturan', icon: Gear, adminOnly: true },
  { href: '/bu-registry', label: 'BU Registry', icon: Buildings, superadminOnly: true },
];

interface UserSession {
  email: string;
  role: 'Admin' | 'User' | 'Superadmin';
  username: string;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [bus, setBus] = useState<BUConfig[]>([]);
  const [activeBu, setActiveBu] = useState<string>('');

  // Load user dari localStorage + theme
  useEffect(() => {
    const stored = localStorage.getItem('wms_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // ignore parse error, redirect ke login
        router.push('/login');
      }
    } else {
      router.push('/login');
    }

    const theme = localStorage.getItem('wms_theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      setDarkMode(true);
    }

    const storedBu = localStorage.getItem('wms_active_bu');
    if (storedBu) setActiveBu(storedBu);
  }, [router]);

  // Load BU list
  useEffect(() => {
    listBus()
      .then((data) => {
        setBus(data);
        if (!activeBu && data.length > 0) {
          setActiveBu(data[0].bu_name);
          localStorage.setItem('wms_active_bu', data[0].bu_name);
        }
      })
      .catch((err) => toast(`Gagal load BU: ${err.message}`, 'error'));
  }, [activeBu]);

  function toggleDarkMode() {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.body.classList.toggle('dark-mode', newMode);
    localStorage.setItem('wms_theme', newMode ? 'dark' : 'light');
  }

  function selectBu(buName: string) {
    setActiveBu(buName);
    localStorage.setItem('wms_active_bu', buName);
    // Trigger custom event biar page bisa react
    window.dispatchEvent(new CustomEvent('bu-changed', { detail: buName }));
  }

  async function handleLogout() {
    const ok = await confirm('Keluar dari aplikasi?', undefined, {
      confirmText: 'Logout',
      type: 'warning',
    });
    if (!ok) return;

    try {
      await logout();
    } catch {
      // ignore — logout di server best effort
    }
    localStorage.removeItem('wms_user');
    localStorage.removeItem('wms_active_bu');
    router.push('/login');
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[var(--bg-color)] gap-4">
        <div className="radial-loading spin" style={{ width: '60px', height: '60px' }} />
        <span className="text-sm font-semibold text-[var(--text-muted)]">Memuat Sesi...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={cn('sidebar', sidebarCollapsed && 'collapsed')}>
        <div className="px-5 mb-6 flex items-center justify-between">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-extrabold text-white sidebar-label">WMS</h1>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-white p-1 hover:bg-white/10 rounded"
            aria-label="Toggle sidebar"
          >
            <List size={22} weight="bold" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto">
          {MAIN_NAV_ITEMS.filter((item) => {
            if (item.superadminOnly) return user.role === 'Superadmin';
            if (item.adminOnly) return user.role === 'Admin' || user.role === 'Superadmin';
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('nav-item', isActive && 'active')}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Nav */}
        <nav className="border-t border-white/10 pt-2 pb-2">
          {BOTTOM_NAV_ITEMS.filter((item) => {
            if (item.superadminOnly) return user.role === 'Superadmin';
            if (item.adminOnly) return user.role === 'Admin' || user.role === 'Superadmin';
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('nav-item', isActive && 'active')}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile bottom */}
        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-white shrink-0">
            {(user.username || user.email || '?')[0].toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0 sidebar-label">
              <p className="text-sm font-semibold text-white truncate">{user.username || user.email}</p>
              <p className="text-xs text-white/70 truncate">{user.role}</p>
            </div>
          )}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={handleLogout}
              className="text-white/70 hover:text-white p-1 sidebar-label"
              title="Logout"
            >
              <SignOut size={18} weight="bold" />
            </button>
          )}
        </div>
      </aside>

      {/* Main wrapper */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar dengan dark mode toggle */}
        <div className="flex justify-between items-center px-6 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
          <div className="text-sm text-muted">
            Login sebagai <strong>{user.email}</strong>
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-2 rounded hover:bg-[var(--bg-color)]"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={20} weight="fill" /> : <Moon size={20} weight="fill" />}
          </button>
        </div>

        {/* Tab BU header — hanya muncul di page yang relevan */}
        {bus.length > 0 && shouldShowBuTabs(pathname) && (
          <div className="tab-header">
            {bus.map((bu) => (
              <button
                key={bu.bu_id}
                type="button"
                onClick={() => selectBu(bu.bu_name)}
                className={cn('tab-btn', activeBu === bu.bu_name && 'active')}
              >
                <span>{bu.bu_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-color)' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function shouldShowBuTabs(pathname: string): boolean {
  // BU tabs muncul di: transaction, stock, master-data, history, reports
  return /^\/(transaction|stock|master-data|history|reports)/.test(pathname);
}
