/**
 * EAS Build 환경에서 Nx + Expo 프로젝트의 node_modules 경로를 맞추기 위한 스크립트.
 *
 * EAS 설치가 끝난 뒤 프로젝트의 node_modules를 Nx workspace 루트에서도
 * 참조할 수 있도록 심볼릭 링크를 생성한다.
 *
 * package.json의 eas-build-post-install 단계에서 실행한다.
 *
 * 실행:
 *   node tools/scripts/eas-build-post-install.mjs <workspace root> <project root>
 */

import { existsSync, symlink } from 'fs';
import { join } from 'path';

const [workspaceRoot, projectRoot] = process.argv.slice(2);

// 이미 경로가 존재하면 다시 링크를 만들지 않는다.
if (existsSync(join(workspaceRoot, 'node_modules'))) {
  console.log('Symlink already exists');
  process.exit(0);
}

// EAS에서 설치된 프로젝트 node_modules를 Nx workspace 루트에서 참조할 수 있게 연결한다.
symlink(join(projectRoot, 'node_modules'), join(workspaceRoot, 'node_modules'), 'dir', (err) => {
  if (err) console.log(err);
  else {
    console.log('Symlink created');
  }
});
