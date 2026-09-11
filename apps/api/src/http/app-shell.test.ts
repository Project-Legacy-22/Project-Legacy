import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';
import { createServer } from './server.js';

// Le lien profond de l e-mail de reinitialisation. La coquille absente
// disparaissait en silence : la route n etait pas montee, la requete tombait
// dans la garde de session, et la personne recevait un 401 parlant d une
// session dont elle n a pas besoin pour changer son mot de passe.

let harness: Harness | undefined;

async function serve(staticDir: string): Promise<{ served: Harness; logger: ReturnType<typeof recordingLogger> }> {
    const logger = recordingLogger();
    harness = await listen(
        createServer({ ...testConfig, staticDir }, makeAppUseCases(), logger),
        logger,
    );

    return { served: harness, logger };
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('GET /reset-password', () => {
    it('sert la coquille quand elle est la', async () => {
        const { served } = await serve(testConfig.staticDir);

        const response = await served.request('/reset-password');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
    });

    it('dit que la coquille manque, au lieu de reclamer une session', async () => {
        const { served } = await serve('/un/dossier/qui-n-existe-pas');

        const response = await served.request('/reset-password');

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ type: 'app_shell_unavailable' });
    });

    it('nomme le fichier cherche au demarrage', async () => {
        const { logger } = await serve('/un/dossier/qui-n-existe-pas');

        const avertissement = logger.lines.find(line => line.level === 'warn');

        expect(avertissement).toBeDefined();
        expect(JSON.stringify(avertissement)).toContain('/un/dossier/qui-n-existe-pas/index.html');
    });
});
