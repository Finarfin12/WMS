import AppShell from '@/components/AppShell';
import FlushQueueProvider from '@/components/FlushQueueProvider';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlushQueueProvider>
      <AppShell>{children}</AppShell>
    </FlushQueueProvider>
  );
}
