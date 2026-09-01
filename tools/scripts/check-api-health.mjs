/**
 * 로컬 환경에서 Go API 연결 상태를 확인하기 위한 개발용 스크립트.
 *
 * 브라우저를 실행하지 않고 현재 머신에서 설정된 API 주소에 접근할 수 있는지 확인한다.
 * 앱에서 실제 사용하는 fetchHealth를 그대로 호출하므로
 * API URL 결정, 상태 코드 검사, 응답 데이터 검증까지 함께 확인할 수 있다.
 *
 * 사용 예:
 *   pnpm health
 *   pnpm health http://192.168.0.10:8080
 *   API_BASE_URL=http://localhost:9000 pnpm health
 */

const DEV_DEFAULT = 'http://localhost:8080';

const override = process.argv[2];

// CLI 인자가 있으면 환경변수보다 우선한다.
// 모바일 기기에서 접근할 LAN 주소 등을 임시로 확인할 때 사용한다.
if (override) {
  process.env.API_BASE_URL = override;
}

// 실제로 어떤 설정값을 사용했는지 로그에 표시하기 위한 출처 정보.
const source = override
  ? 'argument'
  : process.env.API_BASE_URL
    ? 'API_BASE_URL'
    : 'development default';

// 별도 설정이 없으면 로컬 Go API 기본 주소를 사용한다.
process.env.API_BASE_URL ??= DEV_DEFAULT;

// 별도 health-check 로직을 만들지 않고
// 웹 앱이 실제 사용하는 API 로직을 그대로 검증한다.
const { fetchHealth, getApiBaseUrl } = await import('../../apps/web/src/lib/api.ts');

console.log(`checking ${getApiBaseUrl()}/health (${source})`);

try {
  const health = await fetchHealth();

  if (health.status !== 'ok') {
    console.error(`실패: status가 "ok"가 아닙니다. 응답: ${JSON.stringify(health)}`);
    process.exit(1);
  }

  console.log(`ok: ${JSON.stringify(health)}`);
} catch (error) {
  console.error(`실패: ${error instanceof Error ? error.message : String(error)}`);
  console.error('API 서버가 떠 있는지 확인하세요: pnpm dev:api');
  process.exit(1);
}
