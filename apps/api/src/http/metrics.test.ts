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

const SECRET = 'a-relay-secret-long-enough-for-the-schema';
const PROJECT = '01a090ad-a932-739f-b358-60b7eb289a40';

let harness: Harness | undefined;

async function serve(): Promise<Harness> {
    harness = await listen(
        createServer({ ...testConfig, relaySecret: SECRET }, makeAppUseCases(), {
            logger: recordingLogger(),
            metrics: createPrometheusMetrics(),
        }),
        recordingLogger(),
    );

    return harness;
}

function read(served: Harness): Promise<Response> {
    return served.request('/internal/metrics', { headers: { 'x-relay-secret': SECRET } });
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
