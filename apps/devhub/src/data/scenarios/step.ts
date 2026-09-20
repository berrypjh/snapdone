import type { ScenarioStep } from '../../domain/model';

type StepInput = Pick<ScenarioStep, 'id' | 'intent' | 'behavior' | 'runtime' | 'owner' | 'status'> &
  Partial<ScenarioStep>;

/** 단계가 빠뜨린 근거 목록을 빈 배열로 채운다. */
export const step = (input: StepInput): ScenarioStep => ({
  source: [],
  apis: [],
  contracts: [],
  tests: [],
  docs: [],
  next: [],
  ...input,
});
