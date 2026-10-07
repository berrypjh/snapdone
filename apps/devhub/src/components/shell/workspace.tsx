import { Icon, type IconName, INSPECTOR_ID, WorkspaceFrame } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

/**
 * 다른 항목의 상세를 여는 링크. hash로 인스펙터 id를 달아 이동 뒤 Next가 새 상세로 스크롤하고
 * 포커스를 준다. 인스펙터가 작업 영역 아래에 오는 좁은 화면에서 맨 위로 돌아가지 않게 한다.
 */
export const detailsHref = (href: string) => `${href}#${INSPECTOR_ID}`;

type HeaderProps = {
  eyebrow: string;
  /** `eyebrow`와 함께 보이는 화면 아이콘. 상단 바 · 탐색기와 같은 모양이다. */
  icon?: IconName;
  title: string;
  /** 덧붙일 class. 예를 들어 문서 페이지가 본문과 함께 쓰는 가운데 칸. */
  className?: string;
};

/**
 * 선택한 것의 이름이 놓이는 자리. 공용 `WorkspaceHeader`와 같은 모양이지만 평가 아이콘(`evaluation`)과
 * 문서 칸 폭(`className`)을 받아야 해서 아직 이 저장소에 둔다.
 */
export function WorkspaceHeader({ eyebrow, icon, title, className }: HeaderProps) {
  return (
    <header className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <p className="flex items-center gap-1.5 typo-caption-small text-text-light">
        {icon && <Icon name={icon} />}
        {eyebrow}
      </p>
      <h1 className="typo-heading-h5">{title}</h1>
      {/* `lg` 아래에서는 인스펙터가 작업 영역 전체 뒤에 온다. */}
      <a
        href={`#${INSPECTOR_ID}`}
        className="typo-caption-small text-text-link underline-offset-2 hover:underline lg:hidden"
      >
        상세 정보로 이동
      </a>
    </header>
  );
}

/** 가운데 창. 선택한 것의 이름과 요약이 놓인다. */
export function Workspace({ children, ...header }: HeaderProps & { children: ReactNode }) {
  return (
    <WorkspaceFrame>
      <WorkspaceHeader {...header} />
      {children}
    </WorkspaceFrame>
  );
}

/** 관계 그림 자리. 아직 그리지 않았고, 옆의 목록이 정본이다. */
export function DiagramPlaceholder({ listId }: { listId: string }) {
  return (
    <figure className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stroke-default bg-background-default devhub-grid">
      <p className="typo-body-small-strong">관계 그림 — 아직 그리지 않음</p>
      <figcaption className="typo-caption-small text-text-light">
        같은 내용의 정본은{' '}
        <a href={`#${listId}`} className="text-text-link underline">
          아래 목록
        </a>
      </figcaption>
    </figure>
  );
}
