import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './config.js';

const VALID_ENV = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key',
    REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('loadWorkerConfig', () => {
    it('lit le broker et le magasin que le consommateur alimente', () => {
        const config = loadWorkerConfig(VALID_ENV);

        expect(config.redisUrl).toBe(VALID_ENV.REDIS_URL);
        expect(config.supabaseUrl).toBe(VALID_ENV.SUPABASE_URL);
    });

    // Meme exigence que pour l API : un processus mal configure ne demarre pas,
    // et il dit laquelle des variables lui manque.
    it('refuse de demarrer sans broker, en nommant la variable', () => {
        expect(() =>
            loadWorkerConfig({
                SUPABASE_URL: VALID_ENV.SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY: VALID_ENV.SUPABASE_SERVICE_ROLE_KEY,
            }),
        ).toThrow(/REDIS_URL/);
    });

    it('applique une attente bloquante par defaut', () => {
        expect(loadWorkerConfig(VALID_ENV).blockSeconds).toBe(5);
    });

    it('accepte une attente fournie sous forme de chaine', () => {
        expect(loadWorkerConfig({ ...VALID_ENV, WORKER_BLOCK_SECONDS: '2' }).blockSeconds).toBe(2);
    });

    it('refuse une attente qui n en est pas une', () => {
        expect(() => loadWorkerConfig({ ...VALID_ENV, WORKER_BLOCK_SECONDS: '0' })).toThrow(
            /WORKER_BLOCK_SECONDS/,
        );
    });
});
