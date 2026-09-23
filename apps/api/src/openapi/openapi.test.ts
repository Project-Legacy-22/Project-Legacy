import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Express, IRouter } from 'express';
import { describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
// By relative path, as metrics.test.ts does: the layer rule keeps
// `apps/api/src` from importing `@legacy/infra` by name.
import { createPrometheusMetrics } from '../../../../packages/infra/src/prometheus-metrics.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { testConfig } from '../../test/http-harness.js';
import { createServer } from '../http/server.js';
import { OPERATIONS } from './catalog.js';
import { openApiDocument, renderOpenApi } from './document.js';

const COMMITTED = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'api', 'openapi.json');

// Deep links into the single-page application: they answer HTML, not the API.
const SHELL_ROUTES = new Set(['GET /reset-password', 'GET /confirm-email-change']);

// Every route mounted, the relay and metrics routes included: they exist only
// when RELAY_SECRET and the metrics are configured, and they are documented
// like the others.
function application(): Express {
    const config = { ...testConfig, relaySecret: 'a-relay-secret-long-enough-for-the-schema' };
    return createServer(config, makeAppUseCases(), {
        logger: recordingLogger(),
        metrics: createPrometheusMetrics({ readings: [] }),
    });
}

// Read from the running application rather than typed out again, as
// vercel-rewrites.test.ts does: a second hand-written list is one more thing to
// forget. A nested router appears as a layer whose handle carries its stack.
function servedRoutes(app: Express): string[] {
    const found = new Set<string>();

    const walk = (stack: IRouter['stack']): void => {
        for (const layer of stack) {
            const route = layer.route as { path?: unknown; methods?: Record<string, boolean> } | undefined;
            if (route !== undefined && typeof route.path === 'string') {
                for (const method of Object.keys(route.methods ?? {})) found.add(`${method.toUpperCase()} ${route.path}`);
                continue;
            }
            const nested = (layer.handle as Partial<IRouter> | undefined)?.stack;
            if (nested !== undefined) walk(nested);
        }
    };

    walk(app.router.stack);
    return [...found].filter(route => !SHELL_ROUTES.has(route)).sort();
}

describe('the API documentation', () => {
    // The CI half of #45: a contract that changes without the document being
    // regenerated fails the pull request, with the command that fixes it.
    it('is the document the code produces, byte for byte', () => {
        const committed = readFileSync(COMMITTED, 'utf8');

        expect(committed, 'docs/api/openapi.json is stale: run npm run docs:api').toBe(renderOpenApi());
    });

    it('documents every route the application serves, and nothing else', () => {
        const documented = OPERATIONS.map(operation => `${operation.method.toUpperCase()} ${operation.path}`).sort();

        expect(documented).toEqual(servedRoutes(application()));
    });

    it('describes every error it refers to', () => {
        const document = openApiDocument() as {
            paths: Record<string, Record<string, { responses: Record<string, { $ref?: string }> }>>;
            components: { responses: Record<string, unknown> };
        };

        const references = Object.values(document.paths)
            .flatMap(path => Object.values(path))
            .flatMap(operation => Object.values(operation.responses))
            .flatMap(response => (response.$ref === undefined ? [] : [response.$ref.replace('#/components/responses/', '')]));

        expect(references.filter(name => !(name in document.components.responses))).toEqual([]);
    });

    it('lets every operation fail with 500 and a trace id to quote', () => {
        const document = openApiDocument() as {
            paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
        };

        const withoutServerError = Object.entries(document.paths).flatMap(([path, methods]) =>
            Object.entries(methods)
                .filter(([, operation]) => !('500' in operation.responses))
                .map(([method]) => `${method} ${path}`),
        );

        expect(withoutServerError).toEqual([]);
    });
});
