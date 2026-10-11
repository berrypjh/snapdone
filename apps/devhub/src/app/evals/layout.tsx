import { notFound } from 'next/navigation';

import type { ReactNode } from 'react';

import { evalsVisible } from '@/lib/evaluations/visibility';

/** 평가 화면을 숨기는 배포에서는 `/evals` 아래 전부 404다. */
export default function EvalsLayout({ children }: { children: ReactNode }) {
  if (!evalsVisible()) notFound();
  return children;
}
