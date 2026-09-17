import { AppShell } from '@/components/app-shell';
import { readCredential } from '@/lib/auth/session';
import { isInAppRequest } from '@/lib/in-app';

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const [inApp, credential] = await Promise.all([isInAppRequest(), readCredential()]);

  return (
    <AppShell inApp={inApp} signedIn={credential !== null}>
      {children}
    </AppShell>
  );
}
