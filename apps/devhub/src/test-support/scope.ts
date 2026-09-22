/**
 * DevHub는 제품(api · web · mobile · libs)을 보여 주는 도구다. 자기 자신은 카탈로그에 담지 않아서,
 * 저장소 전체와 대조하는 검사들은 이 목록을 뺀 나머지를 본다.
 */
export const DEVHUB_ITSELF = {
  projects: ['devhub', 'devhub-e2e'],
  document: 'docs/architecture/devhub.md',
};

export const isDevHubProject = (id: string | undefined) =>
  DEVHUB_ITSELF.projects.includes(String(id));
