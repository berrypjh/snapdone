import type { RepositoryRef } from '../domain/model';

export const repository: RepositoryRef = {
  id: 'snapdone',
  owner: 'berrypjh',
  name: 'snapdone',
  webUrl: 'https://github.com/berrypjh/snapdone',
  defaultBranch: 'main',
  browse: {
    file: '{base}/blob/{rev}/{path}',
    directory: '{base}/tree/{rev}/{path}',
    lineRange: '#L{start}-L{end}',
  },
};
