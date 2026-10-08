'use client';

import { ViewSwitch } from '@berrypjh/devhub-ui';

import type { Scenario } from '@/domain/model';
import type { FlowModel } from '@/lib/catalog/flow';

import { ScenarioFlow } from './scenario-flow';
import { ScenarioOutline } from './scenario-outline';

/**
 * 시나리오 단계를 흐름 그림이나 목록으로. 두 요소를 클라이언트에서 만들어야
 * 서버에서 넘어온 요소에 key 경고가 나지 않는다.
 */
export function ScenarioViews({ scenario, model }: { scenario: Scenario; model: FlowModel }) {
  return (
    <ViewSwitch
      label="흐름"
      canvas={<ScenarioFlow model={model} title={scenario.title} />}
      list={<ScenarioOutline scenario={scenario} />}
    />
  );
}
