import type { FileStatus, FormattedFileStatus } from './types.js';

const STATUS_LABELS: Record<string, string> = {
  A: '추가',
  M: '수정',
  D: '삭제',
  R: '이름변경',
  C: '복사',
};

export const toPrettyJson = (value: unknown): string => JSON.stringify(value, null, 2);

export const formatFileStatus = (fileStatus: FileStatus): FormattedFileStatus => {
  const statusLabel = STATUS_LABELS[fileStatus.status] ?? fileStatus.status;

  if (fileStatus.oldFile) {
    return {
      status: fileStatus.status,
      statusLabel,
      oldFile: fileStatus.oldFile,
      file: fileStatus.file,
      display: `${statusLabel}: ${fileStatus.oldFile} → ${fileStatus.file}`,
    };
  }

  return {
    status: fileStatus.status,
    statusLabel,
    file: fileStatus.file,
    display: `${statusLabel}: ${fileStatus.file}`,
  };
};

export const formatFileStatuses = (files: FileStatus[]): FormattedFileStatus[] =>
  files.map(formatFileStatus);

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// .claude/skills/ai-commit/examples/commit-message-rules.md의 type 목록과 동기화 유지 필요
export const ALLOWED_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'design',
  'style',
  'refactor',
  'test',
  'chore',
  'build',
  'ci',
  'revert',
] as const;

export const buildConventionalCommitTitlePattern = (scope: string): RegExp =>
  new RegExp(`^(?:${ALLOWED_COMMIT_TYPES.join('|')})\\(${escapeRegExp(scope)}\\):\\s+\\S`);
