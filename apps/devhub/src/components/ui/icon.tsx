import { Icon as SharedIcon, type IconName as SharedIconName } from '@berrypjh/devhub-ui';

/**
 * 공용 `Icon`에 평가 보기 아이콘 하나만 더한다. 공용 세트에 평가용 모양이 없고, 공용 DevHub처럼
 * `test`를 쓰면 상세 정보의 테스트 절과 같은 모양이 되어 "같은 모양은 같은 곳" 규칙이 깨진다.
 * 공용 세트에 생기면 이 파일은 공용 `Icon` re-export로 줄인다.
 */
const EVALUATION = ['M4 20h16', 'M7 16v-4', 'M12 16V8', 'M17 16v-7'];

export type IconName = SharedIconName | 'evaluation';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  if (name !== 'evaluation') return <SharedIcon name={name} className={className} />;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['shrink-0', className].filter(Boolean).join(' ')}
    >
      {EVALUATION.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
