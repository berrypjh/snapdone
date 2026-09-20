import Link from 'next/link';

import { commandLine } from '@/domain/links';
import type { CommandConstraint, CommandRef } from '@/domain/model';
import { definitionOf, definitionSource } from '@/lib/catalog/command-definition';
import {
  COMMAND_GROUPS,
  type CommandGroupEntry,
  commandHref,
  entityHref,
} from '@/lib/catalog/entities';
import { CONSTRAINT } from '@/lib/catalog/labels';

import { WorkspaceSection } from '../shell/workspace';
import { CopyButton } from '../source/copy-button';
import { Icon } from '../ui/icon';

const LINK = 'text-text-link underline-offset-2 hover:underline';

/** 실행에 필요한 환경 조건을 아이콘과 글로. 색만으로 알리지 않는다. */
function Constraints({ constraints }: { constraints: CommandConstraint[] }) {
  return constraints.length ? (
    <p className="flex items-center gap-1.5 typo-caption-small text-text-warning">
      <Icon name="warning" />
      실행 조건: {constraints.map((constraint) => CONSTRAINT[constraint]).join(' · ')}
    </p>
  ) : (
    <p className="flex items-center gap-1.5 typo-caption-small text-text-light">
      <Icon name="check" />
      조건 없음 — 어디서나 돈다
    </p>
  );
}

/**
 * 그룹 페이지에 놓이는 명령 하나. 명령 줄을 터미널 모양 제목으로 두고 옆에 복사를, 그 아래
 * 실제로 실행되는 내용(정의 파일에서 읽는다) · 요약 · 실행 조건을 보인다.
 */
function CommandCard({ command }: { command: CommandRef }) {
  const line = commandLine(command);
  const definition = definitionOf(command);
  const id = `command-${command.id}`;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-stroke-light bg-background-surface p-4"
    >
      <div className="flex items-start gap-2 rounded-md bg-background-default p-3">
        <Icon name="engineering" className="mt-0.5 text-text-light" />
        <h2 id={`${id}-heading`} className="devhub-code min-w-0 flex-1 typo-body-small-strong">
          {line}
        </h2>
        <CopyButton variant="icon" text={line} label="명령 복사" />
      </div>
      <p className="typo-body-small">{command.summary}</p>
      {definition && (
        <div className="flex flex-col gap-1">
          <p className="typo-caption-small text-text-light">
            실제로 실행되는 내용 · <span className="devhub-code">{definitionSource(command)}</span>
          </p>
          <pre className="devhub-code whitespace-pre-wrap rounded-md bg-background-default p-3">
            {definition}
          </pre>
        </div>
      )}
      <Constraints constraints={command.constraints} />
    </section>
  );
}

/** 그룹 페이지. 그룹이 무엇을 위한 것인지 적고 속한 명령을 카드로 늘어놓는다. */
export function CommandGroupDetail({ group }: { group: CommandGroupEntry }) {
  return (
    <>
      <p className="typo-body-small text-text-light">
        {group.summary} · 명령 {group.commands.length}
      </p>
      {group.commands.map((command) => (
        <CommandCard key={command.id} command={command} />
      ))}
    </>
  );
}

/** 엔지니어링 섹션. 그룹마다 명령을 한 줄씩 보이고 바로 복사할 수 있게 한다. */
export function CommandGroups() {
  return COMMAND_GROUPS.map((group) => (
    <WorkspaceSection
      key={group.id}
      id={`commands-${group.id}`}
      title={`${group.title} ${group.commands.length}`}
    >
      <p className="typo-caption-small text-text-light">
        {group.summary} ·{' '}
        <Link href={entityHref({ section: 'engineering', id: group.id })} className={LINK}>
          {group.title} 열기
        </Link>
      </p>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {group.commands.map((command) => {
          const line = commandLine(command);
          return (
            <li key={command.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <Link href={commandHref(command)} className={`devhub-code ${LINK}`}>
                  {line}
                </Link>
                <CopyButton variant="icon" text={line} label="명령 복사" />
              </div>
              <p className="typo-caption-small text-text-light">{command.summary}</p>
              {command.constraints.length > 0 && <Constraints constraints={command.constraints} />}
            </li>
          );
        })}
      </ul>
    </WorkspaceSection>
  ));
}
