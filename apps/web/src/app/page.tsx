import { Surface } from '@/components/surface';

export default function Index() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold">이미지 액션 라우터</h1>
        <p className="mt-3 text-body text-text-secondary">
          사진이나 스크린샷에서 필요한 정보를 찾고,
          <br />
          해야 할 일까지 자연스럽게 이어줍니다.
        </p>
      </div>

      <Surface>
        <p className="text-caption text-text-muted">
          초기 설정 중입니다. 화면은 아직 준비되지 않았습니다.
        </p>
      </Surface>
    </div>
  );
}
