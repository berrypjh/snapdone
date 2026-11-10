import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { swaggerOperation } from '../repository/swagger';

import { endpointsOf } from './endpoints';

const api = endpointsOf('api');

describe('endpoints of a project', () => {
  it('list every catalog route whose handler lives in that project, in catalog order', () => {
    expect(api.map((endpoint) => endpoint.api.id)).toEqual(catalog.apis.map((route) => route.id));
    expect(endpointsOf('web')).toEqual([]);
  });

  it('attach the Swagger operation to every always-on route and to nothing else', () => {
    for (const { api: route, spec } of api) {
      expect(spec !== null, `${route.method} ${route.path}`).toBe(route.exposure === 'always');
      if (spec) expect(spec.summary.length).toBeGreaterThan(0);
    }
  });

  it('read the auth requirement from the generated document, not from a guess', () => {
    expect(swaggerOperation({ method: 'GET', path: '/v1/auth/session' })?.secured).toBe(true);
    expect(swaggerOperation({ method: 'GET', path: '/health' })?.secured).toBe(false);
    expect(swaggerOperation({ method: 'GET', path: '/nowhere' })).toBeNull();
  });

  it('collect the citing steps and only what those steps cite', () => {
    for (const endpoint of api) {
      const citing = catalog.scenarios.flatMap((scenario) =>
        scenario.steps.filter((step) => step.apis.includes(endpoint.api.id)),
      );
      expect(endpoint.steps.map(({ step }) => step)).toEqual(citing);
      const contractIds = new Set(citing.flatMap((step) => step.contracts));
      const testIds = new Set(citing.flatMap((step) => step.tests));
      expect(new Set(endpoint.contracts.map((c) => c.id))).toEqual(contractIds);
      expect(new Set(endpoint.tests.map((t) => t.id))).toEqual(testIds);
    }
  });
});
