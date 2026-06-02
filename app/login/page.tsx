'use client';

/**
 * Login OTP 2-step:
 *   Step 1: Email → checkDomain → kalau allowed, requestOtp
 *   Step 2: 6-digit OTP → verifyOtp → simpan token + redirect /dashboard
 *
 * Pakai SweetAlert untuk error/success notif, RadialLoading untuk button state.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Envelope, LockKey, ArrowRight, ArrowCounterClockwise } from '@phosphor-icons/react';
import { checkDomain, requestOtp, verifyOtp } from '@/lib/auth';
import { toast, alertError } from '@/lib/swal';
import { RadialLoading } from '@/lib/RadialLoading';
import { getSystemConfig, type SystemConfig } from '@/lib/system';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

  useEffect(() => {
    getSystemConfig().then(setSysConfig).catch(console.error);
  }, []);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'expired') {
      localStorage.removeItem('wms_user');
      alertError(
        new Error(
          'Sesi login ditolak. Kalau baru memasukkan OTP, pastikan JWT_SECRET di Vercel sama persis dengan SESSION_SECRET di Apps Script.',
        ),
        'Login belum berhasil',
      );
    }
    if (reason === 'config') {
      alertError(
        new Error('Konfigurasi session di Vercel belum lengkap. Isi JWT_SECRET atau SESSION_SECRET.'),
        'Konfigurasi belum lengkap',
      );
    }
  }, []);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) {
      toast('Format email tidak valid', 'error');
      return;
    }

    setLoading(true);
    setLoadingText('Mengirim OTP...');
    try {
      const domainCheck = await checkDomain(email);
      if (!domainCheck.allowed) {
        alertError(
          new Error(domainCheck.reason || 'Domain email tidak diizinkan'),
          'Akses Ditolak',
        );
        setLoading(false);
        return;
      }

      await requestOtp(email);
      toast('Kode OTP dikirim ke email kamu', 'success');
      setStep('otp');
      startResendCountdown(60);
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast('OTP harus 6 digit', 'error');
      return;
    }

    setLoading(true);
    setLoadingText('Memverifikasi OTP...');
    try {
      const result = await verifyOtp(email, otp);
      setLoadingText('Masuk ke dashboard...');
      // Cookie session httpOnly diset oleh /api/auth/verify-otp.
      const role = result.role || result.user.role || 'User';
      const username = result.username || result.user.username || email.split('@')[0];
      localStorage.setItem(
        'wms_user',
        JSON.stringify({ email, role, username }),
      );
      toast(`Selamat datang, ${username}`, 'success');
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      alertError(err, 'OTP tidak valid');
      setOtp('');
      setLoading(false);
      setLoadingText('');
    }
  }

  async function handleResend() {
    setLoading(true);
    setLoadingText('Mengirim ulang OTP...');
    try {
      await requestOtp(email);
      toast('OTP baru dikirim', 'success');
      startResendCountdown(60);
    } catch (err) {
      alertError(err);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }

  function startResendCountdown(seconds: number) {
    setResendCountdown(seconds);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  return (
    <div className="login-wrapper">
      <RadialLoading.Overlay text={loadingText} visible={loading} />
      <div className="login-box">
        <div className="flex flex-col items-center justify-center mb-2">
          {sysConfig?.system_logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sysConfig.system_logo_url} alt="Logo Perusahaan" className="max-h-16 max-w-[200px] object-contain mb-2" />
          )}
          <h2>{sysConfig?.system_name || 'WMS Gudang'}</h2>
        </div>
        <p className="subtitle">
          {step === 'email'
            ? 'Login dengan email kantor kamu'
            : `Cek email ${email} untuk kode OTP`}
        </p>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="relative">
                <Envelope
                  size={20}
                  weight="regular"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="email"
                  type="email"
                  className="form-control pl-10"
                  placeholder="nama@kgm-group.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  disabled={loading}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <RadialLoading size={20} />
                  {loadingText}
                </span>
              ) : (
                <>
                  Lanjut <ArrowRight size={18} weight="bold" />
                </>
              )}
            </button>
            <p className="text-xs text-muted mt-4 text-center">
              Hanya 6 domain KGM Group yang diizinkan login
            </p>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <div className="form-group">
              <label htmlFor="otp">Kode OTP (6 digit)</label>
              <div className="relative">
                <LockKey
                  size={20}
                  weight="regular"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="form-control text-center font-mono text-2xl tracking-widest"
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  disabled={loading}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              <p className="text-xs text-muted mt-2">
                OTP berlaku 5 menit. Cek folder Spam kalau tidak masuk.
              </p>
            </div>
            <button type="submit" className="btn btn-primary w-full mb-3" disabled={loading || otp.length !== 6}>
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <RadialLoading size={20} />
                  {loadingText || 'Memproses...'}
                </span>
              ) : (
                'Verifikasi'
              )}
            </button>

            <div className="flex justify-between items-center text-sm">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-muted hover:text-primary"
                disabled={loading}
              >
                ← Ganti email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendCountdown > 0}
                className="flex items-center gap-1 text-primary hover:underline disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                {resendCountdown > 0 ? `Resend (${resendCountdown}s)` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
