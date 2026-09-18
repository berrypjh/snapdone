import type { ScenarioStep } from '../../domain/model';

type StepInput = Pick<ScenarioStep, 'id' | 'intent' | 'behavior' | 'runtime' | 'owner' | 'status'> &
  Partial<ScenarioStep>;

/** Fills the evidence lists a step leaves out with empty arrays. */
export const step = (input: StepInput): ScenarioStep => ({
  source: [],
  apis: [],
  contracts: [],
  tests: [],
  docs: [],
  next: [],
  ...input,
});
