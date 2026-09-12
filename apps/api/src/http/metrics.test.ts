import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { json, listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';
import { createServer } from './server.js';

const SECRET = 'un-secret-de-relais-assez-long-pour-le-schema';
const PROJET = '01a090ad-a932-739f-b358-60b7eb289a40';

let harness: Harness | undefined;

async function serve(): Promise<Harness> {
    harness = await listen(
        createServer({ ...testConfig, relaySecret: SECRET }, makeAppUseCases(), recordingLogger()),
        recordingLogger(),
    );

    return harness;
}

function lire(served: Harness): Promise<Response> {
    return served.request('/internal/metrics', { headers: { 'x-relay-secret': SECRET } });
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('GET /internal/metrics', () => {
    it('expose les mesures au format que Prometheus lit', async () => {
        const served = await serve();

        const response = await lire(served);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/plain');

        const corps = await response.text();
        expect(corps).toContain('legacy22_http_requests_total');
        expect(corps).toContain('legacy22_http_request_duration_seconds');
    });

    it('refuse sans le secret', async () => {
        const served = await serve();

        const response = await served.request('/internal/metrics');

        expect(response.status).toBe(403);
    });

    it('compte une requete avec son code de statut', async () => {
        const served = await serve();
        await served.request('/auth/me');

        const corps = await (await lire(served)).text();

        expect(corps).toMatch(/legacy22_http_requests_total\{[^}]*status="401"[^}]*\}\s+1/u);
    });

    // La regle de l ADR-0016, verifiee sur une vraie requete : une etiquette ne
    // peut identifier ni une personne ni un objet qu elle a cree. Un identifiant
    // de projet en etiquette serait une donnee personnelle partie chez un
    // sous-traitant, et une cardinalite qui saturerait le palier gratuit.
    it('etiquette la route par son motif, jamais par l identifiant recu', async () => {
        const served = await serve();
        await served.request(`/projects/${PROJET}/items`, json('POST', { name: 'Une tache' }));

        const corps = await (await lire(served)).text();

        expect(corps).not.toContain(PROJET);
        expect(corps).toContain('/projects/:id/items');
    });
});
