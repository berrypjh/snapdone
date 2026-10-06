'use client';

import { type ReactNode, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { type DevHubLinkProps, DevHubProvider, type DevHubRouter } from '@berrypjh/devhub-ui';

/** 공용 셸의 `to`를 Next `href`로 넘긴다. */
function NextLink({ to, ...rest }: DevHubLinkProps) {
  return <Link href={to} {...rest} />;
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
};

/**
 * `@berrypjh/devhub-ui`에 Next 라우터를 연결한다. Next는 hash를 훅으로 주지 않으므로 `location.hash`를
 * 읽고, 서버에서는 빈 값이다. 공용 컴포넌트는 이 provider만 보고 `next/*`를 모른다.
 */
export function DevHubRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { push } = useRouter();
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => '',
  );
  const router = useMemo<DevHubRouter>(
    () => ({ Link: NextLink, location: { pathname, hash }, navigate: push }),
    [pathname, hash, push],
  );

  return (
    <DevHubProvider productName="Snapdone DevHub" router={router}>
      {children}
    </DevHubProvider>
  );
}
