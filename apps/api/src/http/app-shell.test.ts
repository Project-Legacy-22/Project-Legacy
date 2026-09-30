import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';
import { createServer } from './server.js';

// The deep link of the reset email. A missing shell used to disappear silently: the route was not
// mounted, the request fell into the session guard, and the person got a 401 about a session they
// do not need to change their password.

let harness: Harness | undefined;

async function serve(staticDir: string): Promise<{ served: Harness; logger: ReturnType<typeof recordingLogger> }> {
    const logger = recordingLogger();
    harness = await listen(
        createServer({ ...testConfig, staticDir }, makeAppUseCases(), { logger: logger }),
        logger,
    );

    return { served: harness, logger };
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('GET /reset-password', () => {
    it('serves the shell when it is there', async () => {
        const { served } = await serve(testConfig.staticDir);

        const response = await served.request('/reset-password');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
    });

    it('says the shell is missing, instead of asking for a session', async () => {
        const { served } = await serve('/un/dossier/qui-n-existe-pas');

        const response = await served.request('/reset-password');

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ type: 'app_shell_unavailable' });
    });

    it('names the file looked for at start-up', async () => {
        const { logger } = await serve('/un/dossier/qui-n-existe-pas');

        const avertissement = logger.lines.find(line => line.level === 'warn');

        expect(avertissement).toBeDefined();
        expect(JSON.stringify(avertissement)).toContain('/un/dossier/qui-n-existe-pas/index.html');
    });
});
