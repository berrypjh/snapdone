'use client';

import { useState } from 'react';

import { Button, Checkbox } from '@berrypjh/react-ui';
import { isPurposeSelection, type Purpose, PURPOSES, togglePurpose } from '@snapdone/onboarding';
import { useFormStatus } from 'react-dom';

import { choosePurposes, skipPurpose } from '@/lib/onboarding/actions';

const PURPOSE_LABEL: Record<Purpose, string> = {
  food: '맛집 / 카페',
  shopping: '쇼핑',
  travel: '여행',
  events: '일정 / 공연',
  receipt: '영수증',
  'foreign-language': '외국어',
  work: '업무 자료',
  unsure: '아직 모르겠어요',
};

function Actions({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="submit"
        variant="contained"
        size="lg"
        fullWidth
        disabled={!canSubmit || pending}
        loading={pending}
      >
        다음
      </Button>
      <Button type="submit" formAction={skipPurpose} variant="text" fullWidth disabled={pending}>
        건너뛰기
      </Button>
    </div>
  );
}

/**
 * ON-03 사용 목적 선택. 여러 개를 고를 수 있고 필수가 아니다.
 * 선택 규칙("아직 모르겠어요"는 혼자만)은 mobile과 같은 `togglePurpose`다.
 */
export function PurposeForm({ initialSelection }: { initialSelection: readonly Purpose[] }) {
  const [selected, setSelected] = useState(initialSelection);

  return (
    <form action={choosePurposes} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">사용 목적</legend>
        {PURPOSES.map((purpose) => {
          const checked = selected.includes(purpose);
          return (
            <Checkbox
              key={purpose}
              name="purpose"
              value={purpose}
              checked={checked}
              onChange={() => setSelected((current) => togglePurpose(current, purpose))}
              className={`rounded-lg border p-4 ${checked ? 'border-stroke-primary' : 'border-stroke-light'}`}
            >
              {PURPOSE_LABEL[purpose]}
            </Checkbox>
          );
        })}
      </fieldset>
      <Actions canSubmit={isPurposeSelection(selected)} />
    </form>
  );
}
