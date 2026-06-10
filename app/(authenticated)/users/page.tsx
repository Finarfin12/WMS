'use client';

/**
 * Users — admin only. CRUD user + lockout management + reset password.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Users as UsersIcon,
  Plus,
  PencilSimple,
  Trash,
  LockKey,
  ArrowsClockwise,
  Key,
  X,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react';
import {
  listUsers,
  saveUser,
  deleteUser,
  unlockUser,
  resetUserPassword,
  type UserRecord,
  type UserRole,
} from '@/lib/users';
import { RadialLoading } from '@/lib/RadialLoading';
import { confirm, toast, alertError, alert as showAlert, withLoading } from '@/lib/swal';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [form, setForm] = useState({
    email: '',
    role: 'User' as UserRole,
    username: '',
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers({ includeInactive: showInactive });
      setUsers(result);
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditingEmail(null);
    setForm({ email: '', role: 'User', username: '', is_active: true });
    setShowForm(true);
  }

  function openEdit(user: UserRecord) {
    setEditingEmail(user.Email);
    setForm({
      email: user.Email,
      role: user.Role,
      username: user.Username,
      is_active: user.is_active,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.includes('@')) {
      toast('Email format invalid', 'error');
      return;
    }
    const result = await withLoading(
      () =>
        saveUser({
          email: form.email,
          role: form.role,
          username: form.username || undefined,
          is_active: form.is_active,
        }),
      {
        loadingText: 'Menyimpan…',
        successMessage: editingEmail ? 'User ter-update' : 'User baru ditambahkan',
      },
    );

    if (result) {
      setShowForm(false);
      load();
    }
  }

  async function handleDelete(email: string) {
    const ok = await confirm(`Nonaktifkan user ${email}?`, 'Soft delete (data tidak hilang)', {
      type: 'warning',
      confirmText: 'Nonaktifkan',
    });
    if (!ok) return;

    const result = await withLoading(() => deleteUser(email), {
      loadingText: 'Menonaktifkan…',
      successMessage: 'User dinonaktifkan',
    });
    if (result) load();
  }

  async function handleUnlock(email: string) {
    const result = await withLoading(() => unlockUser(email), {
      loadingText: 'Membuka kunci…',
      successMessage: `Akun ${email} di-unlock`,
    });
    if (result) load();
  }

  async function handleResetSession(email: string) {
    const ok = await confirm(
      `Reset session untuk ${email}?`,
      'Sistem akan menghasilkan kode sesi baru. Berikan ke user lewat channel aman.',
      { type: 'warning', confirmText: 'Reset' },
    );
    if (!ok) return;

    const result = await withLoading(() => resetUserPassword(email), {
      loadingText: 'Generate token baru…',
      silent: false,
    });

    if (result) {
      await showAlert(
        'Berhasil Reset',
        'Sesi login user telah direset dan harus login ulang via OTP.',
        'success',
      );
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <UsersIcon size={32} weight="fill" className="text-primary" />
          Manajemen User
        </h1>
        <button type="button" onClick={openNew} className="btn btn-primary">
          <Plus size={18} weight="bold" />
          Tambah User
        </button>
      </div>

      {/* Filter */}
      <div className="card flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Tampilkan user nonaktif
        </label>
        <button type="button" onClick={() => load()} className="btn btn-secondary ml-auto" disabled={loading}>
          <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="py-12 flex justify-center">
            <RadialLoading size={60} />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-muted py-12">Belum ada user</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nama</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Failed Login</th>
                  <th>Locked</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.Email}>
                    <td className="font-mono text-sm">{u.Email}</td>
                    <td>{u.Username}</td>
                    <td>
                      <span
                        className={`text-xs px-2 py-1 rounded font-semibold ${
                          u.Role === 'Admin'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {u.Role}
                      </span>
                    </td>
                    <td>
                      {u.is_active ? (
                        <span className="text-success flex items-center gap-1">
                          <CheckCircle size={16} weight="fill" />
                          Aktif
                        </span>
                      ) : (
                        <span className="text-muted flex items-center gap-1">
                          <XCircle size={16} weight="fill" />
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {u['Failed Attempts'] > 0 ? (
                        <span className="text-danger font-bold">{u['Failed Attempts']}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td>
                      {u['Locked Until'] ? (
                        <span className="text-danger text-sm flex items-center gap-1">
                          <LockKey size={14} weight="fill" />
                          Locked
                        </span>
                      ) : (
                        <span className="text-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="text-center">
                      <div className="flex justify-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="text-primary hover:text-primary-hover p-1"
                          title="Edit"
                        >
                          <PencilSimple size={18} weight="bold" />
                        </button>
                        {u['Locked Until'] && (
                          <button
                            type="button"
                            onClick={() => handleUnlock(u.Email)}
                            className="text-warning hover:text-orange-700 p-1"
                            title="Unlock"
                          >
                            <LockKey size={18} weight="bold" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResetSession(u.Email)}
                          className="text-info hover:text-cyan-700 p-1"
                          title="Reset Session"
                        >
                          <Key size={18} weight="bold" />
                        </button>
                        {u.is_active && (
                          <button
                            type="button"
                            onClick={() => handleDelete(u.Email)}
                            className="text-danger hover:text-red-700 p-1"
                            title="Nonaktifkan"
                          >
                            <Trash size={18} weight="bold" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-extrabold">
                {editingEmail ? 'Edit User' : 'Tambah User Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-muted hover:text-danger p-1"
              >
                <X size={24} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={!!editingEmail}
                />
                {editingEmail && (
                  <p className="text-xs text-muted mt-1">Email tidak bisa diubah setelah create</p>
                )}
              </div>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  className="form-control"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              {editingEmail && (
                <div className="form-group">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Aktif
                  </label>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary">
                  {editingEmail ? 'Update' : 'Buat User'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn btn-secondary"
                >
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
