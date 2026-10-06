/**
 * tools/scripts/harness.mjs의 고정 source 판정 테스트.
 *
 * 실행:
 *   node --test tools/scripts/
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sourceMismatches } from './harness.mjs';

const LAUNCHER = fileURLToPath(new URL('./harness.mjs', import.meta.url));

const SOURCE = {
  commit: '55b22e0990cae94f30814eef6a61ef2ab10d8618',
  plugin: 'berry-dev',
  version: '0.1.0',
};
const MATCHING = { head: SOURCE.commit, plugin: 'berry-dev', version: '0.1.0', dirty: false };

describe('고정한 shared-stack checkout 판정', () => {
  test('모두 같으면 통과', () => assert.deepEqual(sourceMismatches(SOURCE, MATCHING), []));

  test('다른 commit', () => {
    const [problem] = sourceMismatches(SOURCE, { ...MATCHING, head: 'a'.repeat(40) });
    assert.match(problem, /^commit /);
  });

  test('다른 version', () => {
    const [problem] = sourceMismatches(SOURCE, { ...MATCHING, version: '0.2.0' });
    assert.match(problem, /^version /);
  });

  test('다른 plugin', () => {
    const [problem] = sourceMismatches(SOURCE, { ...MATCHING, plugin: 'berry-commit' });
    assert.match(problem, /^plugin /);
  });

  test('plugin 경로에 미커밋 변경', () => {
    const [problem] = sourceMismatches(SOURCE, { ...MATCHING, dirty: true });
    assert.match(problem, /uncommitted/);
  });
});

describe('checkout이 없을 때', () => {
  test('stack trace 없이 한 줄 사유와 exit 2 (1은 drift만 뜻한다)', () => {
    const run = spawnSync(process.execPath, [LAUNCHER, 'check'], {
      env: { ...process.env, SHARED_STACK_DIR: '/nonexistent/shared-stack' },
      encoding: 'utf8',
    });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not a shared-stack git checkout/);
    assert.doesNotMatch(run.stderr, /\n\s+at /);
  });
});
