import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { formatFileStatuses, toPrettyJson } from './format.js';
import { commitScope, getScopedDiff, getStagedFilesWithStatus } from './git.js';
import { getFilesForScope, groupFilesByScope, sortScopes } from './scope.js';
import type { CommitExecutionResult, ScopeDetails, ScopeSummary } from './types.js';

const server = new McpServer(
  {
    name: 'ai-commit',
    version: '0.1.0',
  },
  {
    instructions:
      '커밋 메시지는 Conventional Commits 형식을 사용해야한다. list_staged_scopes를 사용해서 staged scope 그룹을 확인하고, get_scope_details를 사용해서 scope의 내용을 확인한 후, commit_scope를 사용해서 scope를 커밋한다. 커밋 메시지는 사용자가 명시적으로 승인한 후에 커밋한다.',
  },
);

const toSuccessResult = (data: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: toPrettyJson(data),
    },
  ],
});

const toErrorResult = (message: string, extra?: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: toPrettyJson(
        extra == null
          ? { error: message }
          : {
              error: message,
              details: extra,
            },
      ),
    },
  ],
  isError: true,
});

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

server.registerTool(
  'list_staged_scopes',
  {
    title: 'List staged scopes',
    description:
      '현재 staged 변경을 scope별로 그룹핑해서 보여준다. scope는 root 또는 apps/*, libs/*, tools/* 의 두 번째 경로 세그먼트다.',
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async () => {
    try {
      const stagedFiles = getStagedFilesWithStatus();
      const groups = groupFilesByScope(stagedFiles);
      const scopes = sortScopes(Object.keys(groups));

      const summaries: ScopeSummary[] = scopes.map((scope) => ({
        scope,
        fileCount: groups[scope].length,
        files: formatFileStatuses(groups[scope]),
      }));

      return toSuccessResult({
        scopes: summaries,
      });
    } catch (error) {
      return toErrorResult(getErrorMessage(error));
    }
  },
);

server.registerTool(
  'get_scope_details',
  {
    title: 'Get scope details',
    description:
      '특정 scope의 staged 파일 목록과 diff를 가져온다. 커밋 메시지 제안 전에 호출하는 용도다.',
    inputSchema: z.object({
      scope: z.string().min(1),
      maxDiffChars: z.number().int().positive().max(100_000).optional(),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async ({ scope, maxDiffChars }) => {
    try {
      const stagedFiles = getStagedFilesWithStatus();
      const groups = groupFilesByScope(stagedFiles);
      const files = getFilesForScope(groups, scope);
      const diff = getScopedDiff(files);

      const limit = maxDiffChars ?? 20_000;
      const truncated = diff.length > limit;
      const diffText = truncated ? `${diff.slice(0, limit)}\n\n[diff truncated]` : diff;

      const details: ScopeDetails = {
        scope,
        files: formatFileStatuses(files),
        diff: diffText,
        diffLength: diff.length,
        truncated,
      };

      return toSuccessResult(details);
    } catch (error) {
      return toErrorResult(getErrorMessage(error), { scope });
    }
  },
);

server.registerTool(
  'commit_scope',
  {
    title: 'Commit scope',
    description:
      '특정 scope에 속한 staged 파일만 git commit 한다. title은 Conventional Commits 형식이어야 한다.',
    inputSchema: z.object({
      scope: z.string().min(1),
      title: z.string().min(1),
      body: z.string().optional(),
    }),
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  async ({ scope, title, body }) => {
    try {
      const stagedFiles = getStagedFilesWithStatus();
      const groups = groupFilesByScope(stagedFiles);
      const files = getFilesForScope(groups, scope);

      const result: CommitExecutionResult = commitScope(
        scope,
        {
          title,
          body,
        },
        files,
      );

      if (!result.ok) {
        return toErrorResult('git commit 실행이 실패했습니다.', result);
      }

      return toSuccessResult(result);
    } catch (error) {
      return toErrorResult(getErrorMessage(error), {
        scope,
        title,
      });
    }
  },
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // STDIO MCP 서버는 stdout을 쓰면 안 되므로 stderr로만 로그를 남긴다.
  console.error('[commit-mcp] server connected');
};

main().catch((error) => {
  console.error('[commit-mcp] fatal error:', error);
  process.exit(1);
});
