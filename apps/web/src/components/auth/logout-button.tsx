import { Button } from '@berrypjh/react-ui';

import { logout } from '@/lib/auth/actions';

/** 이 브라우저를 로그아웃하는 form. 헤더 · 온보딩 소개가 함께 쓴다. */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout} className={className}>
      <Button type="submit" variant="text" size="sm">
        로그아웃
      </Button>
    </form>
  );
}
