import { catalog } from '../../data';
import type { ApiRef, ContractRef, Scenario, ScenarioStep, TestRef } from '../../domain/model';
import { type SwaggerOperation, swaggerOperation } from '../repository/swagger';

import { projectOf } from './architecture';

/**
 * 프로젝트 하나가 제공하는 API endpoint와 그 주변. 모두 카탈로그에서 끌어낸다 — route는 `apis`,
 * 호출 단계는 그 API를 인용한 시나리오 단계, 계약 · 테스트는 그 단계들이 함께 인용한 것이다.
 * 명세 요약은 생성된 Swagger 문서에서 읽는다.
 */
export type Endpoint = {
  api: ApiRef;
  spec: SwaggerOperation | null;
  steps: { scenario: Scenario; step: ScenarioStep }[];
  contracts: ContractRef[];
  tests: TestRef[];
};

const contractsById = new Map(catalog.contracts.map((contract) => [contract.id, contract]));
const testsById = new Map(catalog.tests.map((test) => [test.id, test]));

const resolve = <T>(ids: string[], byId: Map<string, T>): T[] =>
  [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);

const endpointOf = (api: ApiRef): Endpoint => {
  const steps = catalog.scenarios.flatMap((scenario) =>
    scenario.steps.filter((step) => step.apis.includes(api.id)).map((step) => ({ scenario, step })),
  );
  return {
    api,
    spec: swaggerOperation(api),
    steps,
    contracts: resolve(
      steps.flatMap(({ step }) => step.contracts),
      contractsById,
    ),
    tests: resolve(
      steps.flatMap(({ step }) => step.tests),
      testsById,
    ),
  };
};

/** handler 파일이 `projectId` 안에 있는 route. 순서는 카탈로그 그대로다. */
export const endpointsOf = (projectId: string): Endpoint[] =>
  catalog.apis.filter((api) => projectOf(api.handler.path) === projectId).map(endpointOf);
