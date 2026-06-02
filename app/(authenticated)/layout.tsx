import AppShell from '@/components/AppShell';
import FlushQueueProvider from '@/components/FlushQueueProvider';
import { FloatingWidget } from '@/components/FloatingWidget';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlushQueueProvider>
      <AppShell>{children}</AppShell>
      <FloatingWidget />
    </FlushQueueProvider>
  );
}
