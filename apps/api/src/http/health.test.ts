import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';
import { createServer } from './server.js';
import type { HealthProbes } from './health.js';
import { currentTraceId } from './trace.js';

let harness: Harness | undefined;

async function serve(probes?: HealthProbes): Promise<Harness> {
    const logger = recordingLogger();
    harness = await listen(createServer(testConfig, makeAppUseCases(), probes === undefined ? { logger } : { logger, health: probes }), logger);
    return harness;
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('GET /health', () => {
    it('answers without a session when both dependencies respond', async () => {
        const served = await serve({ database: async () => {}, broker: async () => {} });

        const response = await served.request('/health');

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({
            status: 'ready',
            dependencies: { database: 'up', broker: 'up' },
        });
    });

    it('keeps the request trace across the asynchronous probe', async () => {
        let probeTrace: string | undefined;
        const served = await serve({
            database: async () => {
                await Promise.resolve();
                probeTrace = currentTraceId();
            },
            broker: async () => {},
        });

        await served.request('/health');

        expect(probeTrace).toMatch(/^[0-9a-f-]{36}$/u);
        expect(served.logger.lines.find(line => line.message === undefined)?.fields)
            .toMatchObject({ traceId: probeTrace });
    });

    it.each(['database', 'broker'] as const)('answers 503 when %s fails without exposing its error', async failed => {
        const probes = {
            database: async () => {},
            broker: async () => {},
        };
        probes[failed] = async () => { throw new Error('private-host.internal:5432'); };
        const served = await serve(probes);

        const response = await served.request('/health');
        const body = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(body)).toEqual({
            status: 'unavailable',
            dependencies: {
                database: failed === 'database' ? 'down' : 'up',
                broker: failed === 'broker' ? 'down' : 'up',
            },
        });
        expect(body).not.toContain('private-host');
    });

    it('never claims readiness when probes were not wired', async () => {
        const served = await serve();

        const response = await served.request('/health');

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            status: 'unavailable',
            dependencies: { database: 'down', broker: 'down' },
        });
    });
});
