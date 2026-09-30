import { describe, expect, it } from 'vitest';

import { createHealthProbes } from './health-probes.js';
import type { EventBus } from './redis-event-bus.js';

const settings = { url: 'http://127.0.0.1:54321', serviceRoleKey: 'local-test-key' };

function fakeBus(depth: () => Promise<number>): EventBus {
    return {
        connect: async () => {},
        disconnect: async () => {},
        publish: async () => {},
        take: async () => null,
        depth,
    };
}

describe('readiness probes', () => {
    it('accepts an empty database and an empty event queue as available', async () => {
        const probes = createHealthProbes(settings, fakeBus(async () => 0), async () => ({ error: null }));

        await expect(Promise.all([probes.database(), probes.broker()])).resolves.toEqual([undefined, undefined]);
    });

    it('rejects a database error instead of treating a missing row as success', async () => {
        const probes = createHealthProbes(settings, fakeBus(async () => 0), async () => ({ error: new Error('database failed') }));

        await expect(probes.database()).rejects.toThrow('database failed');
    });

    it('rejects a missing or failed broker', async () => {
        const missing = createHealthProbes(settings, undefined, async () => ({ error: null }));
        const failed = createHealthProbes(settings, fakeBus(async () => { throw new Error('broker failed'); }), async () => ({ error: null }));

        await expect(missing.broker()).rejects.toThrow('broker not configured');
        await expect(failed.broker()).rejects.toThrow('broker failed');
    });
});
