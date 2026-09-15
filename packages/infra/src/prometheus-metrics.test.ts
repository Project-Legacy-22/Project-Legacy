import { describe, expect, it, vi } from 'vitest';

import type { Logger, StateReading } from '@legacy/contracts';

import { createBuildStateReading } from './build-state-reading.js';
import { createPrometheusMetrics } from './prometheus-metrics.js';

// What the exposition must keep true when a reading misbehaves.
//
// The behaviour worth guarding is not that a gauge appears -- that is one
// template string -- but what happens when one reading of several fails: the
// endpoint has to answer, the readings that worked have to be served, and the
// one that did not must be absent rather than zero. A count that failed to
// load is not a count of zero, and a panel showing « 0 tasks » because the
// database was slow states something false as confidently as the truth.

function reading(name: string, value: number): StateReading {
    return { name, help: `Help for ${name}.`, read: () => Promise.resolve(value) };
}

function refusing(name: string): StateReading {
    return {
        name,
        help: `Help for ${name}.`,
        read: () => Promise.reject(new Error('the table did not answer')),
    };
}

function silentLogger(): Logger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() };
}

async function bodyOf(readings: readonly StateReading[], logger?: Logger): Promise<string> {
    const metrics = createPrometheusMetrics(
        logger === undefined ? { readings } : { readings, logger },
    );
    const { body } = await metrics.render();

    return body;
}

describe('the exposition of state readings', () => {
    it('renders a reading as a gauge, with its help and its value', async () => {
        const body = await bodyOf([reading('legacy22_items_total', 4)]);

        expect(body).toContain('# HELP legacy22_items_total Help for legacy22_items_total.');
        expect(body).toContain('# TYPE legacy22_items_total gauge');
        expect(body).toContain('legacy22_items_total 4');
    });

    it('omits the reading that failed, keeps the others, and counts the failure', async () => {
        const body = await bodyOf([
            reading('legacy22_items_total', 7),
            refusing('legacy22_accounts_total'),
        ]);

        expect(body).toContain('legacy22_items_total 7');
        expect(body).not.toContain('legacy22_accounts_total');
        expect(body).toContain('legacy22_state_readings_failed 1');
    });

    it('answers with a body even when every reading failed', async () => {
        const body = await bodyOf([refusing('one'), refusing('two')]);

        expect(body).toContain('legacy22_state_readings_failed 2');
    });

    it('says no reading failed when all of them answered', async () => {
        const body = await bodyOf([reading('a', 1), reading('b', 2)]);

        expect(body).toContain('legacy22_state_readings_failed 0');
    });

    // Silence is the failure mode this guards. A reading dropped without a
    // trace leaves a gap on a graph and no way to learn why.
    it('names the reading that failed in the log', async () => {
        const logger = silentLogger();
        await bodyOf([refusing('legacy22_outbox_pending')], logger);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ reading: 'legacy22_outbox_pending' }),
            expect.stringContaining('state reading failed'),
        );
    });

    it('serves the counted measurements alongside the read ones', async () => {
        const metrics = createPrometheusMetrics({ readings: [reading('legacy22_redis_up', 1)] });
        metrics.observe({ method: 'GET', route: '/items', status: 200, seconds: 0.012 });

        const { body } = await metrics.render();

        expect(body).toContain('legacy22_http_requests_total{method="GET"');
        expect(body).toContain('legacy22_redis_up 1');
    });

    it('writes the labels of a reading that carries them', async () => {
        const body = await bodyOf([
            createBuildStateReading({
                commit: '3deb3cbc1f20',
                ref: 'main',
                environment: 'production',
            }),
        ]);

        expect(body).toContain(
            'legacy22_build_info{commit="3deb3cbc1f20",ref="main",environment="production"} 1',
        );
    });

    // Neither character can occur in a commit or a branch name today. The
    // escape is here so that the renderer stays correct when a label it does
    // not yet carry arrives, rather than resting on that.
    it('escapes what the exposition format reserves inside a label', async () => {
        const body = await bodyOf([
            {
                name: 'legacy22_awkward',
                help: 'A label with a quote and a backslash.',
                labels: { ref: 'a "quoted" \\ branch' },
                read: () => Promise.resolve(1),
            },
        ]);

        expect(body).toContain('legacy22_awkward{ref="a \\"quoted\\" \\\\ branch"} 1');
    });

    // A service with no readings is legitimate: the HTTP measurements need no
    // adapter of their own, and the existing call sites pass nothing.
    it('still renders when no reading is configured', async () => {
        const { body } = await createPrometheusMetrics().render();

        expect(body).toContain('legacy22_state_readings_failed 0');
    });
});
