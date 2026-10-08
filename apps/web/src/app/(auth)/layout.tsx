/** 로그인 · 온보딩 화면: 가운데 main 하나, nav · sidebar 없음. 본문 틀의 pb-5xl(64px 토큰)로 아래 여백을 위보다 넉넉히 둔다. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-dvh items-center px-4 py-8">
      <div className="mx-auto w-full max-w-(--container-md) pb-5xl">{children}</div>
    </main>
  );
}
