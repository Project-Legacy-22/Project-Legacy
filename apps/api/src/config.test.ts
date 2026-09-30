import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const VALID_ENV = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key',
    REDIS_URL: 'redis://127.0.0.1:6379',
    SUPABASE_ANON_KEY: 'an-anon-key',
};

describe('loadConfig', () => {
    it('reads the database coordinates from the environment', () => {
        const config = loadConfig(VALID_ENV);

        expect(config.supabaseUrl).toBe(VALID_ENV.SUPABASE_URL);
        expect(config.supabaseServiceRoleKey).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    });

    // The EN-30 criterion: a start that cannot happen must say which variable is missing. A process
    // that starts and fails on the first request is harder to diagnose than one that does not
    // start.
    it('refuses to start, naming the missing variable', () => {
        expect(() =>
            loadConfig({
                SUPABASE_URL: VALID_ENV.SUPABASE_URL,
                SUPABASE_ANON_KEY: VALID_ENV.SUPABASE_ANON_KEY,
            }),
        ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    // Serving HTTP does not touch the bus: no route uses it, only start() and stop() do. Requiring
    // the broker here kept the Vercel function from loading for a variable it did not use, and
    // /auth/me answered 500 -- the interface said it could not check the session. start() requires
    // it now, where it is really needed.
    it('loads without a broker, which only the relay requires', () => {
        expect(
            loadConfig({
                SUPABASE_URL: VALID_ENV.SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY: VALID_ENV.SUPABASE_SERVICE_ROLE_KEY,
                SUPABASE_ANON_KEY: VALID_ENV.SUPABASE_ANON_KEY,
            }).redisUrl,
        ).toBeUndefined();
    });

    it('reads the broker address when one is given', () => {
        expect(loadConfig(VALID_ENV).redisUrl).toBe(VALID_ENV.REDIS_URL);
    });

    it('reads the public key the authentication uses', () => {
        expect(loadConfig(VALID_ENV).supabaseAnonKey).toBe(VALID_ENV.SUPABASE_ANON_KEY);
    });

    // The session cookie is marked Secure in production and not elsewhere: a browser drops a Secure
    // cookie served over plain http, which is the case in development.
    it('does not mark the session cookie outside production', () => {
        expect(loadConfig(VALID_ENV).secureCookies).toBe(false);
    });

    it('marks the session cookie in production', () => {
        expect(loadConfig({ ...VALID_ENV, NODE_ENV: 'production' }).secureCookies).toBe(true);
    });

    it('refuses an unknown environment rather than guessing it', () => {
        expect(() => loadConfig({ ...VALID_ENV, NODE_ENV: 'preprod' })).toThrow(/NODE_ENV/);
    });

    it('names every missing variable, not only the first one', () => {
        expect(() => loadConfig({})).toThrow(
            /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*SUPABASE_ANON_KEY/,
        );
    });

    it('refuses a URL that is not one, naming it', () => {
        expect(() => loadConfig({ ...VALID_ENV, SUPABASE_URL: 'pas-une-url' })).toThrow(
            /SUPABASE_URL/,
        );
    });

    it('applies the default log level when the variable is missing', () => {
        expect(loadConfig(VALID_ENV).logLevel).toBe('info');
    });

    it('keeps the log level asked for', () => {
        expect(loadConfig({ ...VALID_ENV, LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    });

    it('refuses an unknown log level rather than passing it to pino', () => {
        expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbeux' })).toThrow(/LOG_LEVEL/);
    });

    // EN-29: the allowed origin and the proxy trust are optional, with a default suited to direct
    // development.
    it('allows the development front when WEB_ORIGIN is missing', () => {
        expect(loadConfig(VALID_ENV).webOrigin).toBe('http://localhost:5173');
    });

    it('keeps the allowed origin asked for', () => {
        expect(loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'https://todo.example' }).webOrigin).toBe(
            'https://todo.example',
        );
    });

    it('refuses an allowed origin that is not a URL, naming it', () => {
        expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'todo.example' })).toThrow(/WEB_ORIGIN/);
    });

    it('trusts no proxy when TRUST_PROXY is missing', () => {
        expect(loadConfig(VALID_ENV).trustProxy).toBe(0);
    });

    it('keeps the number of proxy hops asked for', () => {
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    });

    it('refuses a negative or non-integer proxy trust, naming it', () => {
        expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
        expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '1.5' })).toThrow(/TRUST_PROXY/);
    });

    // The labels of legacy22_build_info. Twelve characters: enough to find the commit, not enough
    // to lengthen every series.
    it('truncates the deployment commit to twelve characters', () => {
        const config = loadConfig({
            ...VALID_ENV,
            VERCEL_GIT_COMMIT_SHA: '3deb3cbc1f2044556677889900aabbccddeeff11',
            VERCEL_GIT_COMMIT_REF: 'main',
            VERCEL_ENV: 'production',
        });

        expect(config.deployment).toEqual({
            commit: '3deb3cbc1f20',
            ref: 'main',
            environment: 'production',
        });
    });

    // An empty label reads as a value -- one believes one is reading a branch called nothing. A
    // named value reads as what it is.
    it('names the absence rather than leaving an empty label', () => {
        const config = loadConfig({ ...VALID_ENV, VERCEL_GIT_COMMIT_REF: '   ' });

        expect(config.deployment.commit).toBe('unknown');
        expect(config.deployment.ref).toBe('unknown');
        // "local" and not "unknown": outside Vercel, it is not a missing value, it is a place.
        expect(config.deployment.environment).toBe('local');
    });
});
