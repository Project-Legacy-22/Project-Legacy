import { describe, expect, it } from 'vitest';

import { compose } from './composition-root.js';
import { loadConfig } from './config.js';

// Constructing the application touches nothing: the Supabase clients, the
// broker client and the use cases are all built without a call. Only start()
// dials, and the refusal below happens before it does -- which is why this
// belongs at the unit level and needs no service running.

// No REDIS_URL: both tests below are about what happens without a broker.
const ENV_WITHOUT_BROKER = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key',
    SUPABASE_ANON_KEY: 'an-anon-key',
};

describe('compose', () => {
    // The other half of making REDIS_URL optional. The schema lets a process
    // that only serves HTTP boot without a broker; nothing then stops a
    // long-running process from starting the relay without one, and a relay
    // with no broker publishes nothing while the outbox keeps filling. It is
    // start() that has to refuse, and say which variable is missing -- the
    // criterion EN-30 asks of every boot failure.
    it('refuses to relay without a broker, naming the missing variable', async () => {
        const application = compose(loadConfig(ENV_WITHOUT_BROKER));

        await expect(application.start()).rejects.toThrow(/REDIS_URL/u);
    });

    // Serving HTTP is what a deployment without a broker has to keep doing.
    // identifyCaller is the use case behind GET /auth/me, the request that was
    // answering 500 -- it has to be composed whether or not a broker exists.
    it('still composes the use cases the routes call', () => {
        const application = compose(loadConfig(ENV_WITHOUT_BROKER));

        expect(typeof application.useCases.auth.identifyCaller).toBe('function');
        expect(typeof application.useCases.items.listItems).toBe('function');
    });
});
