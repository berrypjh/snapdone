import { createElement, Fragment } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { commandLine } from '../../domain/links';
import { COMMAND_GROUPS, commandHref, findEntity, findSection } from '../../lib/catalog/entities';
import { readJson } from '../../test-support/repository-files';

import { CommandGroupDetail, CommandGroups } from './command';

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const detail = (id: string) => {
  const group = COMMAND_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`no group ${id}`);
  return renderToStaticMarkup(createElement(CommandGroupDetail, { group }));
};

describe('command groups', () => {
  it('hold every command exactly once, and none is empty', () => {
    const grouped = COMMAND_GROUPS.flatMap((group) => group.commands.map((c) => c.id));
    expect(grouped.sort()).toEqual(catalog.commands.map((c) => c.id).sort());
    expect(COMMAND_GROUPS.filter((group) => group.commands.length === 0)).toEqual([]);
  });

  it('are the engineering entries of the explorer, not the commands one by one', () => {
    const entries = findSection('engineering')?.entities.map((entity) => entity.label);
    expect(entries).toEqual(COMMAND_GROUPS.map((group) => group.title));
  });

  it('send every command link to a card that exists on its group page', () => {
    for (const c of catalog.commands) {
      const [path, hash] = commandHref(c).split('#');
      const group = path.split('/').pop() as string;
      expect(findEntity('engineering', group)).toBeDefined();
      expect(detail(group)).toContain(`id="${hash}"`);
    }
  });
});

describe('group page', () => {
  it('shows each command as a card with copy and what it really runs', () => {
    const html = detail('check');
    const commands = catalog.commands.filter((c) => c.group === 'check');
    expect(count(html, /<section id="command-/g)).toBe(commands.length);
    expect(count(html, /aria-label="명령 복사: /g)).toBe(commands.length);
    const scripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;
    expect(html).toContain('package.json › scripts.lint');
    expect(html).toContain(scripts.lint.replaceAll('&', '&amp;'));
    expect(html).toContain('실행 조건: 포트 필요 · 브라우저 필요');
  });
});

describe('engineering section', () => {
  it('lists every group with its commands, each linking to its card', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, createElement(CommandGroups)));
    const headings = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(([, text]) => text);
    expect(headings).toEqual(COMMAND_GROUPS.map((g) => `${g.title} ${g.commands.length}`));
    expect(count(html, /aria-label="명령 복사: /g)).toBe(catalog.commands.length);
    for (const c of catalog.commands) {
      expect(html).toContain(`href="${commandHref(c)}"`);
      expect(html).toContain(`>${commandLine(c)}</a>`);
    }
  });
});
