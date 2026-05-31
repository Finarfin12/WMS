'use client';

/**
 * Settings — admin only.
 * Tabs:
 *   - BU Registry: CRUD business unit (toggle flag, edit nama, soft-delete)
 *   - System Ops: reconcile + verify integrity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Gear,
  Buildings,
  Database,
  CheckCircle,
  Warning,
  ShieldCheck,
  ArrowsClockwise,
  ToggleLeft,
  ToggleRight,
  Plus,
  PencilSimple,
  Image as ImageIcon,
  Users as UsersIcon,
  Trash,
  LockKey,
  KeyReturn,
} from '@phosphor-icons/react';
import {
  listBus,
  saveBu,
  deleteBu,
  uploadBuLogo,
  fileToBase64,
  type BUConfig,
  type CreateBuPayload,
} from '@/lib/bu-registry';
import {
  listUsers,
  saveUser,
  deleteUser,
  unlockUser,
  resetUserPassword,
  type UserRecord,
  type UserRole,
} from '@/lib/users';
import { reconcileStock, verifyIntegrity, type ReconcileResult, type VerifyIntegrityResult } from '@/lib/system';
import { RadialLoading } from '@/lib/RadialLoading';
import { confirm, toast, alertError, withLoading } from '@/lib/swal';

type Tab = 'bu' | 'logo' | 'users' | 'system';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('bu');
  const [bus, setBus] = useState<BUConfig[]>([]);
  const [loadingBus, setLoadingBus] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<CreateBuPayload>>({
    bu_id: '',
    bu_name: '',
    bu_type: 'product',
    icon: '📦',
    default_uom: 'Pcs',
    low_stock_threshold: 50,
    has_color: false,
    has_size: false,
    has_width: false,
    has_weight: false,
    has_hpp: false,
    has_discount: false,
    has_fifo: true,
    has_delivery_fields: false,
    surat_jalan_template: 'default',
    sort_order: 99,
  });

  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [integrityResult, setIntegrityResult] = useState<VerifyIntegrityResult | null>(null);

  // === Role detection (dari localStorage 'wms_user' yang di-set saat login) ===
  const [actorRole, setActorRole] = useState<UserRole>('User');
  const [actorEmail, setActorEmail] = useState('');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wms_user');
      if (stored) {
        const parsed = JSON.parse(stored) as { email?: string; role?: UserRole };
        setActorRole(parsed.role || 'User');
        setActorEmail(parsed.email || '');
      }
    } catch {
      // Ignore parse error — default ke User
    }
  }, []);
  const isSuperadmin = actorRole === 'Superadmin';

  // === BU Logo upload state ===
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState<string | null>(null); // bu_id

  // === Users state ===
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    role: 'User' as UserRole,
    password: '',
    is_active: true,
  });

  const loadBus = useCallback(async () => {
    setLoadingBus(true);
    try {
      const result = await listBus({ includeInactive: true });
      setBus(result);
    } catch (err) {
      alertError(err);
    } finally {
      setLoadingBus(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'bu' || tab === 'logo') loadBus();
    if (tab === 'users' && isSuperadmin) loadUsers();
  }, [tab, loadBus, isSuperadmin]);

  // === Logo upload ===
  async function handleLogoUpload(buId: string, file: File) {
    if (!isSuperadmin) {
      toast('Hanya Superadmin yang bisa upload logo', 'error');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast('Logo max 1 MB. Compress dulu.', 'error');
      return;
    }
    setLogoUploading(buId);
    try {
      const base64 = await fileToBase64(file);
      await uploadBuLogo({
        bu_id: buId,
        filename: file.name,
        mime_type: file.type,
        data_base64: base64,
      });
      toast(`Logo ${buId} ter-upload`, 'success');
      await loadBus();
    } catch (err) {
      alertError(err, 'Gagal upload logo');
    } finally {
      setLogoUploading(null);
    }
  }

  // === Users CRUD ===
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const list = await listUsers({ includeInactive: true });
      setUsers(list);
    } catch (err) {
      alertError(err, 'Gagal load users');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  function openNewUser() {
    setEditingUserEmail(null);
    setUserForm({
      email: '',
      username: '',
      role: 'User',
      password: '',
      is_active: true,
    });
    setShowUserForm(true);
  }

  function openEditUser(u: UserRecord) {
    setEditingUserEmail(u.Email);
    setUserForm({
      email: u.Email,
      username: u.Username,
      role: u.Role,
      password: '',
      is_active: u.is_active,
    });
    setShowUserForm(true);
  }

  async function handleSubmitUser(e: React.FormEvent) {
    e.preventDefault();
    if (!isSuperadmin) {
      toast('Hanya Superadmin yang bisa edit users', 'error');
      return;
    }
    if (!userForm.email) {
      toast('Email wajib diisi', 'error');
      return;
    }
    if (!editingUserEmail && !userForm.password) {
      toast('Password wajib untuk user baru', 'error');
      return;
    }
    if (userForm.password && userForm.password.length < 8) {
      toast('Password minimal 8 karakter', 'error');
      return;
    }
    const result = await withLoading(
      () =>
        saveUser({
          email: userForm.email,
          username: userForm.username || undefined,
          role: userForm.role,
          password: userForm.password || undefined,
          is_active: userForm.is_active,
          _actor_role: actorRole,
          _actor_email: actorEmail,
        }),
      {
        loadingText: editingUserEmail ? 'Update user…' : 'Create user…',
        successMessage: editingUserEmail ? 'User ter-update' : 'User baru ter-create',
      },
    );
    if (result) {
      setShowUserForm(false);
      loadUsers();
    }
  }

  async function handleDeleteUser(u: UserRecord) {
    if (!isSuperadmin) return;
    const ok = await confirm(
      `Nonaktifkan user ${u.Email}?`,
      'User akan tidak bisa login. Data tetap tersimpan, bisa diaktifkan kembali nanti.',
      { type: 'warning', confirmText: 'Nonaktifkan' },
    );
    if (!ok) return;
    const result = await withLoading(() => deleteUser(u.Email), {
      loadingText: 'Hapus user…',
      successMessage: 'User dinonaktifkan',
    });
    if (result) loadUsers();
  }

  async function handleUnlockUser(u: UserRecord) {
    if (!isSuperadmin) return;
    const result = await withLoading(() => unlockUser(u.Email), {
      loadingText: 'Unlock user…',
      successMessage: 'Lockout di-reset',
    });
    if (result) loadUsers();
  }

  async function handleResetUserPassword(u: UserRecord) {
    if (!isSuperadmin) return;
    const ok = await confirm(
      `Reset password ${u.Email}?`,
      'Password baru akan di-generate otomatis. Tampilkan SEKALI ke user via channel aman.',
      { type: 'warning', confirmText: 'Reset' },
    );
    if (!ok) return;
    const result = await withLoading(() => resetUserPassword(u.Email), {
      loadingText: 'Reset password…',
    });
    if (result) {
      // Tampilkan password sekali — pakai window.prompt biar gampang di-copy
      window.alert(
        `Password baru untuk ${result.email}:\n\n${result.temp_password}\n\n` +
        'Copy sekarang. Setelah dialog ini ditutup, password tidak bisa di-retrieve lagi.',
      );
      loadUsers();
    }
  }

  function openNewBu() {
    setEditingId(null);
    setForm({
      bu_id: '',
      bu_name: '',
      bu_type: 'product',
      icon: '📦',
      default_uom: 'Pcs',
      low_stock_threshold: 50,
      has_color: false,
      has_size: false,
      has_width: false,
      has_weight: false,
      has_hpp: false,
      has_discount: false,
      has_fifo: true,
      has_delivery_fields: false,
      surat_jalan_template: 'default',
      sort_order: bus.length + 1,
    });
    setShowForm(true);
  }

  function openEditBu(bu: BUConfig) {
    setEditingId(bu.bu_id);
    setForm({ ...bu });
    setShowForm(true);
  }

  async function handleSubmitBu(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bu_id || !form.bu_name) {
      toast('bu_id dan bu_name wajib diisi', 'error');
      return;
    }
    const result = await withLoading(
      () => saveBu(form as CreateBuPayload),
      {
        loadingText: editingId ? 'Update BU…' : 'Create BU + sheet…',
        successMessage: editingId ? 'BU ter-update' : 'BU baru + 5 sheet ter-create',
      },
    );
    if (result) {
      setShowForm(false);
      loadBus();
    }
  }

  async function handleToggleActive(bu: BUConfig) {
    const ok = await confirm(
      `${bu.is_active ? 'Nonaktifkan' : 'Aktifkan'} BU ${bu.bu_name}?`,
      bu.is_active
        ? 'BU akan tidak muncul di tab user. Data tetap tersimpan.'
        : 'BU akan kembali muncul di tab user.',
      { type: 'warning', confirmText: bu.is_active ? 'Nonaktifkan' : 'Aktifkan' },
    );
    if (!ok) return;

    const result = await withLoading(
      async () => {
        if (bu.is_active) {
          await deleteBu(bu.bu_id);
        } else {
          await saveBu({ ...bu, is_active: true });
        }
        return { ok: true };
      },
      {
        loadingText: 'Update status…',
        successMessage: bu.is_active ? 'BU dinonaktifkan' : 'BU diaktifkan',
      },
    );
    if (result) loadBus();
  }

  async function handleReconcile(buName?: string) {
    const ok = await confirm(
      buName ? `Reconcile stok ${buName}?` : 'Reconcile stok SEMUA BU?',
      'Recalculate stok dari awal berdasarkan transaksi (tidak ubah data, hanya update stok awal kalau drift).',
      { type: 'warning', confirmText: 'Reconcile' },
    );
    if (!ok) return;

    const result = await withLoading(() => reconcileStock(buName), {
      loadingText: 'Reconciling…',
    });
    if (result) {
      setReconcileResult(result);
      toast(`Reconcile selesai: ${result.bus_checked} BU`, 'success');
    }
  }

  async function handleVerify() {
    const result = await withLoading(() => verifyIntegrity(), {
      loadingText: 'Verifying integrity…',
    });
    if (result) {
      setIntegrityResult(result);
      const issuesFound = result.summary.missing_count + result.summary.header_mismatch_count;
      toast(
        issuesFound > 0
          ? `${issuesFound} issue ditemukan`
          : 'Tidak ada issue ✓',
        issuesFound > 0 ? 'warning' : 'success',
      );
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Gear size={32} weight="fill" className="text-primary" />
          Settings
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
        {[
          { id: 'bu' as const, label: 'BU Registry', icon: Buildings, hidden: !isSuperadmin },
          { id: 'logo' as const, label: 'Logo BU', icon: ImageIcon, hidden: !isSuperadmin },
          { id: 'users' as const, label: 'Users', icon: UsersIcon, hidden: !isSuperadmin },
          { id: 'system' as const, label: 'System Ops', icon: Database, hidden: false },
        ]
          .filter((t) => !t.hidden)
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-2 font-semibold flex items-center gap-2 border-b-2 transition ${
                tab === id
                  ? 'border-[var(--primary)] text-primary'
                  : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              <Icon size={18} weight="bold" />
              {label}
            </button>
          ))}
      </div>

      {tab === 'bu' && (
        <>
          <div className="card flex justify-between items-center">
            <div>
              <h3 className="card-title m-0">Business Unit Registry</h3>
              <p className="text-sm text-muted">
                CRUD business unit. Tambah BU baru auto-create 5 sheet (MD, transactions, dst).
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={loadBus} className="btn btn-secondary">
                <ArrowsClockwise size={16} className={loadingBus ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button type="button" onClick={openNewBu} className="btn btn-primary">
                <Plus size={18} weight="bold" />
                Tambah BU
              </button>
            </div>
          </div>

          <div className="card">
            {loadingBus ? (
              <div className="py-12 flex justify-center">
                <RadialLoading size={60} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>ID</th>
                      <th>Nama</th>
                      <th>Type</th>
                      <th>Default UoM</th>
                      <th>Flags</th>
                      <th>Template SJ</th>
                      <th className="text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bus.map((bu) => (
                      <tr key={bu.bu_id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(bu)}
                            title={bu.is_active ? 'Aktif (klik nonaktifkan)' : 'Nonaktif (klik aktifkan)'}
                          >
                            {bu.is_active ? (
                              <ToggleRight size={28} weight="fill" className="text-success" />
                            ) : (
                              <ToggleLeft size={28} weight="fill" className="text-muted" />
                            )}
                          </button>
                        </td>
                        <td className="font-mono text-sm">{bu.bu_id}</td>
                        <td className="font-semibold">
                          {bu.icon} {bu.bu_name}
                        </td>
                        <td className="text-sm">{bu.bu_type}</td>
                        <td>{bu.default_uom}</td>
                        <td>
                          <div className="flex flex-wrap gap-1 text-xs">
                            {bu.has_color && <span className="badge">color</span>}
                            {bu.has_size && <span className="badge">size</span>}
                            {bu.has_width && <span className="badge">width</span>}
                            {bu.has_hpp && <span className="badge">hpp</span>}
                            {bu.has_discount && <span className="badge">disc</span>}
                            {bu.has_fifo && <span className="badge bg-blue-100 text-blue-700">FIFO</span>}
                          </div>
                        </td>
                        <td className="text-sm">{bu.surat_jalan_template || 'default'}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => openEditBu(bu)}
                            className="text-primary hover:text-primary-hover p-1"
                            title="Edit"
                          >
                            <PencilSimple size={18} weight="bold" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'logo' && isSuperadmin && (
        <>
          <div className="card">
            <h3 className="card-title flex items-center gap-2">
              <ImageIcon size={20} weight="bold" />
              Logo per BU untuk Surat Jalan
            </h3>
            <p className="text-sm text-muted mb-4">
              Upload logo PNG/JPG/SVG max 1 MB per BU. Logo akan tampil di header
              Surat Jalan PDF, menggantikan teks nama perusahaan. Format
              rekomendasi: PNG transparent, ratio 2:1 (mis. 400×200px).
            </p>
            {loadingBus ? (
              <div className="py-12 flex justify-center">
                <RadialLoading size={48} />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bus.filter((b) => b.is_active).map((bu) => (
                  <div
                    key={bu.bu_id}
                    className="border border-[var(--border)] rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold">
                          {bu.icon} {bu.bu_name}
                        </p>
                        <p className="text-xs text-muted font-mono">{bu.bu_id}</p>
                      </div>
                      <span className="badge text-xs">{bu.surat_jalan_template}</span>
                    </div>
                    <div className="bg-white dark:bg-[var(--bg-color)] rounded p-3 mb-3 h-24 flex items-center justify-center">
                      {bu.logo_file_id ? (
                        <img
                          src={`https://drive.google.com/uc?id=${bu.logo_file_id}&export=view`}
                          alt={`Logo ${bu.bu_name}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-muted italic">Belum ada logo</span>
                      )}
                    </div>
                    <label
                      className={`btn btn-secondary w-full cursor-pointer ${
                        logoUploading === bu.bu_id ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {logoUploading === bu.bu_id ? (
                        <>
                          <RadialLoading size={16} />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <ImageIcon size={16} weight="bold" />
                          {bu.logo_file_id ? 'Ganti Logo' : 'Upload Logo'}
                        </>
                      )}
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(bu.bu_id, file);
                          e.target.value = ''; // reset
                        }}
                        disabled={logoUploading !== null}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'users' && isSuperadmin && (
        <>
          <div className="card flex justify-between items-center">
            <div>
              <h3 className="card-title m-0">User Management</h3>
              <p className="text-sm text-muted">
                Tambah / edit / hapus user. Hanya Superadmin yang bisa akses tab ini.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={loadUsers} className="btn btn-secondary">
                <ArrowsClockwise size={16} className={loadingUsers ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button type="button" onClick={openNewUser} className="btn btn-primary">
                <Plus size={18} weight="bold" />
                Tambah User
              </button>
            </div>
          </div>

          <div className="card">
            {loadingUsers ? (
              <div className="py-12 flex justify-center">
                <RadialLoading size={60} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Email</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th className="text-center">Failed</th>
                      <th>Locked</th>
                      <th>Pwd Changed</th>
                      <th className="text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.Email}>
                        <td>
                          {u.is_active ? (
                            <ToggleRight size={24} weight="fill" className="text-success" />
                          ) : (
                            <ToggleLeft size={24} weight="fill" className="text-muted" />
                          )}
                        </td>
                        <td className="font-mono text-sm">{u.Email}</td>
                        <td>{u.Username}</td>
                        <td>
                          <span
                            className={`badge text-xs ${
                              u.Role === 'Superadmin'
                                ? 'bg-purple-100 text-purple-700'
                                : u.Role === 'Admin'
                                  ? 'bg-blue-100 text-blue-700'
                                  : ''
                            }`}
                          >
                            {u.Role}
                          </span>
                        </td>
                        <td className="text-center text-xs">{u['Failed Attempts'] || 0}</td>
                        <td className="text-xs">
                          {u['Locked Until']
                            ? new Date(u['Locked Until']).toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="text-xs">
                          {u['Password Changed At']
                            ? new Date(u['Password Changed At']).toLocaleDateString('id-ID')
                            : '-'}
                        </td>
                        <td className="text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="text-primary hover:text-primary-hover p-1"
                            title="Edit"
                          >
                            <PencilSimple size={16} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetUserPassword(u)}
                            className="text-warning hover:opacity-80 p-1"
                            title="Reset password"
                          >
                            <KeyReturn size={16} weight="bold" />
                          </button>
                          {u['Locked Until'] && (
                            <button
                              type="button"
                              onClick={() => handleUnlockUser(u)}
                              className="text-info hover:opacity-80 p-1"
                              title="Unlock"
                            >
                              <LockKey size={16} weight="bold" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="text-danger hover:opacity-80 p-1"
                            title="Nonaktifkan"
                            disabled={u.Email === actorEmail}
                          >
                            <Trash size={16} weight="bold" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Add/Edit User */}
          {showUserForm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] flex items-center justify-center p-4">
              <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
                <h2 className="text-2xl font-extrabold mb-4">
                  {editingUserEmail ? 'Edit' : 'Tambah'} User
                </h2>
                <form onSubmit={handleSubmitUser}>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      disabled={!!editingUserEmail}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      className="form-control"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      className="form-control"
                      value={userForm.role}
                      onChange={(e) =>
                        setUserForm({ ...userForm, role: e.target.value as UserRole })
                      }
                    >
                      <option value="User">User</option>
                      <option value="Admin">Admin</option>
                      <option value="Superadmin">Superadmin</option>
                    </select>
                    <p className="text-xs text-muted mt-1">
                      User: read-only · Admin: edit transaksi/MD · Superadmin: + edit BU + users
                    </p>
                  </div>
                  <div className="form-group">
                    <label>
                      Password{' '}
                      {editingUserEmail && (
                        <span className="text-xs text-muted font-normal">
                          (kosongkan untuk tidak ubah)
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder={editingUserEmail ? '(tidak diubah)' : 'Min 8 karakter'}
                      minLength={editingUserEmail ? 0 : 8}
                    />
                  </div>
                  <div className="form-group">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={userForm.is_active}
                        onChange={(e) =>
                          setUserForm({ ...userForm, is_active: e.target.checked })
                        }
                      />
                      Aktif (bisa login)
                    </label>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button type="submit" className="btn btn-primary flex-1">
                      <CheckCircle size={18} weight="bold" />
                      {editingUserEmail ? 'Update' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUserForm(false)}
                      className="btn btn-secondary"
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'system' && (
        <>
          <div className="card border-l-4 border-warning">
            <h3 className="card-title flex items-center gap-2">
              <ArrowsClockwise size={20} weight="bold" />
              Reconcile Stock
            </h3>
            <p className="text-muted mb-4">
              Recalculate stok dari awal berdasarkan history transaksi. Aman dijalankan
              kapan saja (read-only sampai akhir, lalu update Stok Awal kalau drift).
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleReconcile()}
                className="btn btn-warning"
              >
                <ArrowsClockwise size={18} weight="bold" />
                Reconcile Semua BU
              </button>
              {bus
                .filter((b) => b.is_active)
                .map((b) => (
                  <button
                    key={b.bu_id}
                    type="button"
                    onClick={() => handleReconcile(b.bu_name)}
                    className="btn btn-secondary"
                  >
                    {b.icon} {b.bu_name}
                  </button>
                ))}
            </div>

            {reconcileResult && (
              <div className="mt-4 p-4 bg-[var(--bg-color)] rounded">
                <h4 className="font-semibold mb-2">Hasil Reconcile:</h4>
                <p className="text-sm">
                  ✓ {reconcileResult.bus_checked} BU diproses pada{' '}
                  {new Date(reconcileResult.timestamp).toLocaleString('id-ID')}
                </p>
                {reconcileResult.report && reconcileResult.report.length > 0 && (
                  <ul className="text-xs mt-2 space-y-1">
                    {reconcileResult.report.map((r: typeof reconcileResult.report[number], i: number) => (
                      <li key={i}>
                        <strong>{r.bu}:</strong> {r.items || 0} items, masuk{' '}
                        {r.total_masuk || 0}, keluar {r.total_keluar || 0}, stok realtime{' '}
                        {r.total_stok_realtime || 0}
                        {r.error && <span className="text-danger"> — {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="card border-l-4 border-success">
            <h3 className="card-title flex items-center gap-2">
              <ShieldCheck size={20} weight="bold" />
              Verify Integrity
            </h3>
            <p className="text-muted mb-4">
              Cek konsistensi data: orphan transactions, duplicate IDs, missing references.
            </p>
            <button type="button" onClick={handleVerify} className="btn btn-success">
              <ShieldCheck size={18} weight="bold" />
              Run Verify
            </button>

            {integrityResult && (() => {
              const issuesFound =
                integrityResult.summary.missing_count +
                integrityResult.summary.header_mismatch_count;
              return (
                <div
                  className={`mt-4 p-4 rounded ${
                    issuesFound > 0
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-warning'
                      : 'bg-green-50 dark:bg-green-900/20 border-l-4 border-success'
                  }`}
                >
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    {issuesFound > 0 ? (
                      <Warning className="text-warning" size={20} weight="fill" />
                    ) : (
                      <CheckCircle className="text-success" size={20} weight="fill" />
                    )}
                    {issuesFound > 0
                      ? `${issuesFound} Issue Ditemukan`
                      : 'Semua Data Konsisten'}
                  </h4>
                  <p className="text-sm mb-2">
                    OK: {integrityResult.summary.ok_count} sheet,
                    Missing: {integrityResult.summary.missing_count},
                    Header Mismatch: {integrityResult.summary.header_mismatch_count}
                  </p>
                  {integrityResult.missing_sheets.length > 0 && (
                    <div className="text-sm mb-2">
                      <strong>Missing sheets:</strong>{' '}
                      <span className="font-mono text-xs">
                        {integrityResult.missing_sheets.join(', ')}
                      </span>
                    </div>
                  )}
                  {integrityResult.header_mismatches.length > 0 && (
                    <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
                      {integrityResult.header_mismatches.map((iss, i) => (
                        <li key={i}>
                          <strong>{iss.sheet}:</strong>{' '}
                          {iss.missing?.join(', ') || iss.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Modal BU form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="text-2xl font-extrabold mb-4">
              {editingId ? 'Edit' : 'Tambah'} Business Unit
            </h2>
            <form onSubmit={handleSubmitBu}>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label>BU ID (lowercase, no spasi)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.bu_id || ''}
                    onChange={(e) => setForm({ ...form, bu_id: e.target.value.toLowerCase() })}
                    disabled={!!editingId}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>BU Name (display)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.bu_name || ''}
                    onChange={(e) => setForm({ ...form, bu_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    className="form-control"
                    value={form.bu_type}
                    onChange={(e) =>
                      setForm({ ...form, bu_type: e.target.value as 'fabric' | 'chemical' | 'product' })
                    }
                  >
                    <option value="product">product</option>
                    <option value="fabric">fabric</option>
                    <option value="chemical">chemical</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Icon (emoji)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.icon || ''}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div className="form-group">
                  <label>Default UoM</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.default_uom || ''}
                    onChange={(e) => setForm({ ...form, default_uom: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Low Stock Threshold</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.low_stock_threshold || 0}
                    onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Template SJ</label>
                  <select
                    className="form-control"
                    value={form.surat_jalan_template}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        surat_jalan_template: e.target.value as 'canvas' | 'chemical' | 'default',
                      })
                    }
                  >
                    <option value="default">default</option>
                    <option value="canvas">canvas</option>
                    <option value="chemical">chemical</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Sort Order</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.sort_order || 99}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="card !p-4 mt-2">
                <h4 className="font-semibold mb-3">Variation Flags</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      ['has_color', 'Warna'],
                      ['has_size', 'Ukuran'],
                      ['has_width', 'Lebar'],
                      ['has_weight', 'Berat'],
                      ['has_hpp', 'HPP'],
                      ['has_discount', 'Diskon'],
                      ['has_fifo', 'FIFO (recommended)'],
                      ['has_delivery_fields', 'Delivery'],
                    ] as Array<[keyof CreateBuPayload, string]>
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update' : 'Create + Auto-create Sheets'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
