import { type ReactNode, useId } from 'react';

import { Box } from '@berrypjh/react-ui';

type SectionCardProps = {
  title: string;
  /** 제목 앞의 장식 아이콘. 뜻은 제목이 전한다. */
  icon?: ReactNode;
  /** 제목 줄 오른쪽에 두는 이동 하나(예: 전체 보기). */
  action?: ReactNode;
  children: ReactNode;
};

/** 화면의 한 영역(홈 · 내 정보). 제목(h2)이 이름을 붙인 section 카드다. */
export function SectionCard({ title, icon, action, children }: SectionCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        className="flex flex-col gap-3 border-semanticBorder-divider border-stroke-light shadow-xs"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-2 typo-body-medium-strong">
            {icon}
            {title}
          </h2>
          {action}
        </div>
        {children}
      </Box>
    </section>
  );
}
