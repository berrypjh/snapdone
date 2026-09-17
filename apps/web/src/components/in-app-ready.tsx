import { InAppMessage } from '@/components/in-app-message';

export function InAppReady({ title }: { title: string }) {
  return <InAppMessage message={{ type: 'ready', title }} />;
}
