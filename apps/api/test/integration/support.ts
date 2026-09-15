import { randomUUID } from 'node:crypto';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { loadConfig } from '../../src/config.js';
import type { Config } from '../../src/config.js';
import { compose } from '../../src/composition-root.js';
import type { Application } from '../../src/composition-root.js';
import { createServer } from '../../src/http/server.js';
import { SESSION_COOKIE } from '../../src/http/session.js';
import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { listen } from '../http-harness.js';
import type { Harness } from '../http-harness.js';

// Fails loudly, naming what is missing, rather than letting the first request
// fail against http://127.0.0.1:undefined: a suite run without the local stack
// up must say so, not produce a wall of unrelated connection errors.
export function integrationConfig(): Config {
    try {
        return loadConfig(process.env);
    } catch (cause) {
        throw new Error(
            'Integration tests need the local Supabase stack: run `npm run db:start` first ' +
                '(or `npm run test:integration`, which does it for you).',
            { cause },
        );
    }
}

// One real, fully composed application per test file not per test: compose()
// only builds use cases and a client, it opens no connection of its own, so
// sharing it costs nothing and a fresh one buys no extra isolation. Isolation
// instead comes from every test creating its own account and its own items.
export function realApplication(): Application {
    return compose(integrationConfig());
}

export interface RealAccount {
    id: string;
    email: string;
    accessToken: string;
    cookie: string;
    projectId: string;
}

// Goes through the real HTTP-facing use cases, backed by the real Supabase
// Auth adapter: this is what proves the whole stack -- GoTrue, the mirroring
// trigger, the session it grants -- works together, not just each piece in
// isolation against a fake.
export async function registerAndSignIn(app: Application, password: string): Promise<RealAccount> {
    // Unique per call: two runs of the suite against a database that was not
    // reset between them must not collide on a UNIQUE email, and a fixed
    // address would make every test depend on running before the others that
    // reuse it.
    const email = `integration-${randomUUID()}@example.com`;

    await app.useCases.auth.registerAccount(email, password, PRIVACY_POLICY_VERSION);
    const session = await app.useCases.auth.signIn(email, password);
    const page = await app.useCases.projects.listProjects(session.account.id, {
        limit: 1,
        cursor: undefined,
    });
    const project = page.projects[0];
    if (project === undefined) throw new Error('registration did not create a default project');

    return {
        id: session.account.id,
        email,
        accessToken: session.accessToken,
        cookie: `${SESSION_COOKIE}=${session.accessToken}`,
        projectId: project.id,
    };
}

export async function serveAs(app: Application, cookie?: string): Promise<Harness> {
    const logger = recordingLogger();
    return listen(createServer(integrationConfig(), app.useCases, { logger: logger }), logger, cookie);
}
