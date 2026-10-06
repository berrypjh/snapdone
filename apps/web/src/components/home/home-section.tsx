import { type ReactNode, useId } from 'react';

import { Box } from '@berrypjh/react-ui';

/** 홈의 한 영역. 제목(h2)이 이름을 붙인 section 카드다. */
export function HomeSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        className="flex flex-col gap-3 border-semanticBorder-divider border-stroke-light shadow-xs"
      >
        <h2 id={titleId} className="typo-body-medium-strong">
          {title}
        </h2>
        {children}
      </Box>
    </section>
  );
}
