export type CommitMessage = {
  title: string;
  body?: string;
};

export type FileStatus = {
  status: string;
  file: string;
  oldFile?: string;
};

export type ScopeGroups = Record<string, FileStatus[]>;

export type GitCommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type FormattedFileStatus = {
  status: string;
  statusLabel: string;
  file: string;
  oldFile?: string;
  display: string;
};

export type ScopeSummary = {
  scope: string;
  fileCount: number;
  files: FormattedFileStatus[];
};

export type ScopeDetails = {
  scope: string;
  files: FormattedFileStatus[];
  diff: string;
  diffLength: number;
  truncated: boolean;
};

export type CommitExecutionResult = {
  ok: boolean;
  scope: string;
  title: string;
  body: string;
  command: string;
  stdout: string;
  stderr: string;
};
