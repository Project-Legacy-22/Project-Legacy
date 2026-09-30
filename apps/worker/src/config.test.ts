import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './config.js';

const VALID_ENV = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key',
    REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('loadWorkerConfig', () => {
    it('reads the broker and the store the consumer feeds', () => {
        const config = loadWorkerConfig(VALID_ENV);

        expect(config.redisUrl).toBe(VALID_ENV.REDIS_URL);
        expect(config.supabaseUrl).toBe(VALID_ENV.SUPABASE_URL);
    });

    // Same requirement as for the API: a misconfigured process does not start, and it says which
    // variable it is missing.
    it('refuses to start without a broker, naming the variable', () => {
        expect(() =>
            loadWorkerConfig({
                SUPABASE_URL: VALID_ENV.SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY: VALID_ENV.SUPABASE_SERVICE_ROLE_KEY,
            }),
        ).toThrow(/REDIS_URL/);
    });

    it('applies a default blocking wait', () => {
        expect(loadWorkerConfig(VALID_ENV).blockSeconds).toBe(5);
    });

    it('accepts a wait given as a string', () => {
        expect(loadWorkerConfig({ ...VALID_ENV, WORKER_BLOCK_SECONDS: '2' }).blockSeconds).toBe(2);
    });

    it('refuses a wait that is not one', () => {
        expect(() => loadWorkerConfig({ ...VALID_ENV, WORKER_BLOCK_SECONDS: '0' })).toThrow(
            /WORKER_BLOCK_SECONDS/,
        );
    });
});
