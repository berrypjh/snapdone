import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';

import {
  filterHref,
  filterScenarios,
  parseArchitectureFilters,
  parseScenarioFilters,
} from './filters';

describe('parse', () => {
  it('keeps known values and drops unknown ones', () => {
    expect(parseScenarioFilters({ status: 'partial', runtime: 'go-api', track: 'x' })).toEqual({
      status: 'partial',
      runtime: 'go-api',
      track: undefined,
    });
    expect(parseScenarioFilters({ status: ['partial', 'implemented'] }).status).toBeUndefined();
    expect(parseArchitectureFilters({ kind: 'library' })).toEqual({ kind: 'library' });
    expect(parseArchitectureFilters({ kind: '<script>' })).toEqual({ kind: undefined });
  });
});

describe('filterScenarios', () => {
  it('narrows by track, status, and runtime together', () => {
    const ids = (active: Record<string, string>) =>
      filterScenarios(catalog.scenarios, active).map((s) => s.id);
    expect(ids({ track: 'product-target' })).toEqual(['finish-task-from-image']);
    expect(ids({ status: 'partial' })).toEqual(['onboarding-intro', 'onboarding-first-photo']);
    expect(ids({ runtime: 'system-auth-browser' })).toEqual(['mobile-google-login']);
    expect(ids({})).toHaveLength(catalog.scenarios.length);
  });

  it('can leave nothing, which the view shows as an empty state', () => {
    expect(
      filterScenarios(catalog.scenarios, { track: 'product-target', status: 'implemented' }),
    ).toEqual([]);
  });
});

describe('filterHref', () => {
  it('sets, replaces, and clears one filter while keeping the others', () => {
    expect(filterHref('/scenarios', {}, 'status', 'partial')).toBe('/scenarios?status=partial');
    expect(
      filterHref('/scenarios', { status: 'partial', runtime: 'go-api' }, 'status', undefined),
    ).toBe('/scenarios?runtime=go-api');
    expect(filterHref('/scenarios', { status: 'partial' }, 'runtime', 'go-api')).toBe(
      '/scenarios?runtime=go-api&status=partial',
    );
    expect(filterHref('/scenarios', { status: 'partial' }, 'status', undefined)).toBe('/scenarios');
  });
});
