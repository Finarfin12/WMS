import { redirect } from 'next/navigation';

/**
 * Root entry — redirect ke dashboard.
 * Auth middleware (Phase 3) akan tangani redirect ke /login kalau belum login.
 */
export default function Home() {
  redirect('/dashboard');
}
