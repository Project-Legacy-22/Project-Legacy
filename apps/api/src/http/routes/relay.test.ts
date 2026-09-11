import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { createServer } from '../server.js';

const SECRET = 'un-secret-de-relais-assez-long-pour-le-schema';

let harness: Harness | undefined;

async function serve(
    relaySecret: string | undefined,
    deliverPending = vi.fn(async () => ({ published: 2, consumed: 2, failed: 0 })),
): Promise<Harness> {
    const logger = recordingLogger();
    const useCases = makeAppUseCases({ notifications: { deliverPending } });

    harness = await listen(createServer({ ...testConfig, relaySecret }, useCases, logger), logger);
    return harness;
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('POST /internal/relay', () => {
    it('lance une passe de livraison et rend son compte', async () => {
        const deliverPending = vi.fn(async () => ({ published: 3, consumed: 3, failed: 0 }));
        const served = await serve(SECRET, deliverPending);

        const response = await served.request('/internal/relay', {
            ...json('POST', {}),
            headers: { 'x-relay-secret': SECRET },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ published: 3, consumed: 3, failed: 0 });
        expect(deliverPending).toHaveBeenCalledTimes(1);
    });

    it('refuse sans le secret, et ne livre rien', async () => {
        const deliverPending = vi.fn(async () => ({ published: 0, consumed: 0, failed: 0 }));
        const served = await serve(SECRET, deliverPending);

        const response = await served.request('/internal/relay', json('POST', {}));

        expect(response.status).toBe(403);
        expect(deliverPending).not.toHaveBeenCalled();
    });

    it('refuse un secret qui n est pas le bon', async () => {
        const served = await serve(SECRET);

        const response = await served.request('/internal/relay', {
            ...json('POST', {}),
            headers: { 'x-relay-secret': `${SECRET}-faux` },
        });

        expect(response.status).toBe(403);
    });

    // Une cible qui fait tourner le relais en continu n a rien a declencher :
    // la route n est alors pas montee, et le chemin devient indistinguable de
    // n importe quel chemin inconnu -- ce qui est mieux qu un 403 qui
    // apprendrait a un scanner que le point d entree existe.
    it('ne se distingue pas d un chemin inconnu quand aucun secret n est configure', async () => {
        const deliverPending = vi.fn(async () => ({ published: 0, consumed: 0, failed: 0 }));
        const served = await serve(undefined, deliverPending);

        const relais = await served.request('/internal/relais', {
            ...json('POST', {}),
            headers: { 'x-relay-secret': SECRET },
        });
        const inconnu = await served.request('/chemin-qui-n-existe-pas', {
            ...json('POST', {}),
            headers: { 'x-relay-secret': SECRET },
        });

        expect(relais.status).toBe(inconnu.status);
        expect(deliverPending).not.toHaveBeenCalled();
    });
});
