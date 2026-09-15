import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
// The adapter by relative path, like the doubles of the other packages: the
// layer rule forbids `apps/api/src` from importing `@legacy/infra` by name, and
// that rule is what moved prom-client out of here.
import { createPrometheusMetrics } from '../../../../packages/infra/src/prometheus-metrics.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { json, listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';
import { createServer } from './server.js';
import type { StateReading } from '@legacy/contracts';

const SECRET = 'a-relay-secret-long-enough-for-the-schema';
const PROJECT = '01a090ad-a932-739f-b358-60b7eb289a40';

let harness: Harness | undefined;

async function serve(readings: readonly StateReading[] = []): Promise<Harness> {
    harness = await listen(
        createServer({ ...testConfig, relaySecret: SECRET }, makeAppUseCases(), {
            logger: recordingLogger(),
            metrics: createPrometheusMetrics({ readings }),
        }),
        recordingLogger(),
    );

    return harness;
}

function read(served: Harness): Promise<Response> {
    return served.request('/internal/metrics', { headers: { 'x-relay-secret': SECRET } });
}

function readState(served: Harness): Promise<Response> {
    return served.request('/internal/state', { headers: { 'x-relay-secret': SECRET } });
}

function reading(name: string, value: number, labels?: Record<string, string>): StateReading {
    const help = `Help for ${name}.`;
    return labels === undefined
        ? { name, help, read: () => Promise.resolve(value) }
        : { name, help, labels, read: () => Promise.resolve(value) };
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('GET /internal/metrics', () => {
    it('exposes the measurements in the format Prometheus reads', async () => {
        const served = await serve();

        const response = await read(served);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/plain');

        const body = await response.text();
        expect(body).toContain('legacy22_http_requests_total');
        expect(body).toContain('legacy22_http_request_duration_seconds');
    });

    it('refuses without the secret', async () => {
        const served = await serve();

        const response = await served.request('/internal/metrics');

        expect(response.status).toBe(403);
    });

    it('counts a request together with its status code', async () => {
        const served = await serve();
        await served.request('/auth/me');

        const body = await (await read(served)).text();

        expect(body).toMatch(/legacy22_http_requests_total\{[^}]*status="401"[^}]*\}\s+1/u);
    });

    // The ADR-0016 rule, checked on a real request: a label may identify
    // neither a person nor an object they created. A project identifier in a
    // label would be personal data sent to a processor, and a cardinality that
    // would saturate the free tier.
    it('labels the route by its pattern, never by the identifier received', async () => {
        const served = await serve();
        await served.request(`/projects/${PROJECT}/items`, json('POST', { name: 'A task' }));

        const body = await (await read(served)).text();

        expect(body).not.toContain(PROJECT);
        expect(body).toContain('/projects/:id/items');
    });
});

// The route the dashboard datasource calls on every refresh. That is what
// makes the figures live: nothing has to have pushed them beforehand.
describe('GET /internal/state', () => {
    it('serves one flat object, one field per series', async () => {
        const served = await serve([
            reading('legacy22_items_total', 9),
            reading('legacy22_redis_up', 1),
        ]);

        const response = await readState(served);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            legacy22_items_total: 9,
            legacy22_redis_up: 1,
            legacy22_state_readings_failed: 0,
        });
    });

    // Flat, not nested: a dashboard datasource reads a row of columns, and a
    // nested object would make every panel carry a path expression instead of
    // a column name.
    it('flattens a label into a field of its own, named after its series', async () => {
        const served = await serve([
            reading('legacy22_build_info', 1, {
                commit: '970499dd2438',
                ref: 'main',
                environment: 'production',
            }),
        ]);

        await expect((await readState(served)).json()).resolves.toMatchObject({
            legacy22_build_info: 1,
            legacy22_build_info_commit: '970499dd2438',
            legacy22_build_info_ref: 'main',
            legacy22_build_info_environment: 'production',
        });
    });

    // The same rule as the exposition, and the reason both exist: a count that
    // did not load is not a count of zero.
    it('omits a reading that failed, and says how many were omitted', async () => {
        const served = await serve([
            reading('legacy22_items_total', 4),
            {
                name: 'legacy22_accounts_total',
                help: 'Help.',
                read: () => Promise.reject(new Error('the table did not answer')),
            },
        ]);

        const body = (await (await readState(served)).json()) as Record<string, unknown>;

        expect(body['legacy22_items_total']).toBe(4);
        expect('legacy22_accounts_total' in body).toBe(false);
        expect(body['legacy22_state_readings_failed']).toBe(1);
    });

    it('refuses without the secret, like the exposition does', async () => {
        const served = await serve();

        const response = await served.request('/internal/state');

        expect(response.status).toBe(403);
    });

    // A dashboard asking for the current state must not be served a
    // minute-old copy by a proxy in between.
    it('forbids any cache of what it answers', async () => {
        const served = await serve([reading('legacy22_items_total', 1)]);

        expect((await readState(served)).headers.get('cache-control')).toBe('no-store');
    });
});
