/**
 * SweetAlert helper — wrapper untuk konsistensi notifikasi.
 *
 * Pakai 4 fungsi utama:
 *   - toast(message, type)      — toast pojok kanan atas, auto-dismiss
 *   - alert(title, text, type)  — modal alert dengan tombol OK
 *   - confirm(title, text)      — modal confirm Y/N, return boolean
 *   - prompt(title, label)      — modal input, return string|null
 *
 * Style sudah di-override di globals.css (border-radius, brand color).
 */

import Swal, { type SweetAlertIcon } from 'sweetalert2';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';

/**
 * Toast notification (pojok kanan atas, auto-dismiss 3 detik).
 */
export function toast(message: string, type: AlertType = 'success') {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type as SweetAlertIcon,
    title: message,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  });
}

/**
 * Modal alert dengan tombol OK saja.
 */
export function alert(title: string, text?: string, type: AlertType = 'info') {
  return Swal.fire({
    title,
    text,
    icon: type as SweetAlertIcon,
    confirmButtonText: 'OK',
  });
}

/**
 * Modal confirm Y/N. Return Promise<boolean>.
 */
export async function confirm(
  title: string,
  text?: string,
  options: {
    confirmText?: string;
    cancelText?: string;
    type?: AlertType;
  } = {},
): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon: (options.type || 'question') as SweetAlertIcon,
    showCancelButton: true,
    confirmButtonText: options.confirmText || 'Ya',
    cancelButtonText: options.cancelText || 'Batal',
    reverseButtons: true,
  });
  return result.isConfirmed;
}

/**
 * Modal prompt untuk input text. Return Promise<string|null>.
 */
export async function prompt(
  title: string,
  label?: string,
  options: { placeholder?: string; defaultValue?: string } = {},
): Promise<string | null> {
  const result = await Swal.fire({
    title,
    input: 'text',
    inputLabel: label,
    inputPlaceholder: options.placeholder,
    inputValue: options.defaultValue,
    showCancelButton: true,
    confirmButtonText: 'OK',
    cancelButtonText: 'Batal',
    reverseButtons: true,
  });
  return result.isConfirmed ? (result.value || null) : null;
}

/**
 * Modal error dari Error object atau string.
 */
export function alertError(err: unknown, title: string = 'Terjadi kesalahan') {
  const message = err instanceof Error ? err.message : String(err);
  return Swal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'OK',
  });
}

/**
 * Modal loading manual (dipakai untuk operasi yang nggak pakai radial loading komponen).
 */
export function showLoading(title: string = 'Memproses…') {
  Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function hideLoading() {
  Swal.close();
}

/**
 * Wrapper untuk async operation dengan auto loading + error handling.
 *
 * Pakai begini:
 *   await withLoading(
 *     async () => await saveTransaction(payload),
 *     { successMessage: 'Tersimpan' }
 *   );
 */
export async function withLoading<T>(
  fn: () => Promise<T>,
  options: {
    loadingText?: string;
    successMessage?: string;
    silent?: boolean;
  } = {},
): Promise<T | null> {
  if (!options.silent) showLoading(options.loadingText || 'Memproses…');
  try {
    const result = await fn();
    if (!options.silent) {
      hideLoading();
      if (options.successMessage) toast(options.successMessage, 'success');
    }
    return result;
  } catch (err) {
    if (!options.silent) {
      hideLoading();
      alertError(err);
    }
    return null;
  }
}
