/** 로그인 화면: 가운데 main 하나, nav · sidebar 없음. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-dvh items-center px-4 py-8">
      <div className="mx-auto w-full max-w-(--container-md)">{children}</div>
    </main>
  );
}
