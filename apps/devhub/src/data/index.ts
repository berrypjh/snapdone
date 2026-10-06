import type { DevHubCatalog } from '../domain/model';

import { apis } from './apis';
import { boundaries } from './boundaries';
import { contracts } from './contracts';
import { documents } from './documents';
import { externalSystems } from './external-systems';
import { product } from './product';
import { applications, libraries } from './projects';
import { records } from './records';
import { relations } from './relations';
import { repository } from './repository';
import { runtimes } from './runtimes';
import { scenarios } from './scenarios';
import { tests } from './tests';

/** 정리해 둔 저장소 사실. 표현 코드는 읽기만 하고 고치지 않는다. */
export const catalog: DevHubCatalog = {
  repository,
  product,
  nodes: [...applications, ...libraries, ...externalSystems],
  runtimes,
  relations,
  boundaries,
  apis,
  contracts,
  documents,
  records,
  tests,
  scenarios,
};
