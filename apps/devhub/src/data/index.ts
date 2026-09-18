import type { DevHubCatalog } from '../domain/model';

import { apis } from './apis';
import { boundaries } from './boundaries';
import { commands } from './commands';
import { contracts } from './contracts';
import { documents } from './documents';
import { externalSystems } from './external-systems';
import { product } from './product';
import { applications, libraries } from './projects';
import { relations } from './relations';
import { repository } from './repository';
import { runtimes } from './runtimes';
import { scenarios } from './scenarios';
import { tests } from './tests';

/** Curated repository facts. Presentation code reads this and never edits it. */
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
  commands,
  tests,
  scenarios,
};
