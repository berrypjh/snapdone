import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EvalsGuide } from './evals-guide';

describe('evals guide', () => {
  it('explains every answer source and both rule baselines', () => {
    const page = renderToStaticMarkup(createElement(EvalsGuide));

    for (const label of ['실제 모델 호출', '규칙 기준선', '기록 재채점']) {
      expect(page).toContain(`${label}</span>`);
    }
    expect(page).toContain('모델이 넘어야 할 최저선');
    expect(page).toContain('baseline-always-other');
    expect(page).toContain('baseline-nearest-case');
    expect(page).toContain('행동 완료 가능률');
  });

  it('keeps the contents to one short row and groups metrics by spacing only', () => {
    const page = renderToStaticMarkup(createElement(EvalsGuide));

    expect(page.match(/href="#guide-/g)).toHaveLength(4);
    const at = (text: string) => page.indexOf(text);
    // 묶음은 간격으로만 나눈다 — 묶음 제목 없음.
    expect(page).not.toContain('믿어도 되나');
    expect(at('critical 비율')).toBeLessThan(at('추출값 재현율'));
    expect(at('행동 완료 가능률')).toBeLessThan(at('high인데 틀림'));
    // 방향은 문장이 아니라 이름 옆 표시.
    expect(page.match(/낮을수록 좋음/g)).toHaveLength(2);
    // 기준선은 읽는 이름이 먼저, id는 작은 코드.
    expect(at('늘 기타로 답함')).toBeLessThan(at('baseline-always-other'));
  });
});
