import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { commandLine } from '../domain/links';
import { findEntity } from '../lib/entities';

import { EntitySummary } from './entity-summary';

describe('engineering entry', () => {
  it('is a command group page with a card per command', () => {
    const entity = findEntity('engineering', 'run');
    if (!entity || entity.section !== 'engineering') throw new Error('no run group');
    const html = renderToStaticMarkup(createElement(EntitySummary, { entity }));
    for (const command of entity.record.commands) {
      expect(html).toContain(`id="command-${command.id}"`);
      expect(html).toContain(`aria-label="명령 복사: ${commandLine(command)}"`);
    }
    expect(html).not.toContain('>명령 복사<');
  });
});
