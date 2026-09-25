import { afterEach, describe, expect, it } from 'vitest';

import { fauxFournisseur } from '../test/fakes/gotrue-server.js';
import type { FauxFournisseur } from '../test/fakes/gotrue-server.js';
import { createSupabaseRetentionStore, purgeExpired } from './retention-store.js';
import type { RetentionStore } from './retention-store.js';
import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';

// PostgREST answers an rpc under /rest/v1/rpc/<function>, the same fake server
// stands in for it: the translation of rows into counts is what is pinned here.
const RPC = 'POST /rest/v1/rpc/purge_expired_data';

let faux: FauxFournisseur | undefined;

afterEach(async () => {
    await faux?.close();
    faux = undefined;
});

async function storeAnswering(status: number, body: unknown): Promise<RetentionStore> {
    faux = await fauxFournisseur();
    faux.quand(RPC, { status, body });
    return createSupabaseRetentionStore({ url: faux.url, serviceRoleKey: 'cle-de-service' });
}

function storeRemoving(result: Awaited<ReturnType<RetentionStore['purgeExpired']>>): RetentionStore {
    return { purgeExpired: () => Promise.resolve(result) };
}

describe('purgeExpired', () => {
    it('rend ce que la passe a supprime', async () => {
        const result = await purgeExpired(
            storeRemoving({ notifications: 3, processedEvents: 2, outbox: 5 }),
            recordingLogger(),
        );

        expect(result).toEqual({ notifications: 3, processedEvents: 2, outbox: 5 });
    });

    // La trace exigee par US-39 : une ligne par traitement, un nom et un
    // nombre, rien qui designe une ligne supprimee.
    it('laisse une ligne par traitement, faite d un nom et d un nombre seulement', async () => {
        const logger = recordingLogger();

        await purgeExpired(storeRemoving({ notifications: 3, processedEvents: 0, outbox: 5 }), logger);

        expect(logger.lines).toEqual([
            { level: 'info', fields: { treatment: 'notifications', deleted: 3 }, message: 'retention purge' },
            { level: 'info', fields: { treatment: 'processedEvents', deleted: 0 }, message: 'retention purge' },
            { level: 'info', fields: { treatment: 'outbox', deleted: 5 }, message: 'retention purge' },
        ]);
    });
});

describe('createSupabaseRetentionStore', () => {
    it('rend un nombre par traitement a partir des lignes de la fonction', async () => {
        const store = await storeAnswering(200, [
            { treatment: 'notifications', deleted: 3 },
            { treatment: 'processed_events', deleted: 2 },
            { treatment: 'outbox', deleted: 5 },
        ]);

        await expect(store.purgeExpired()).resolves.toEqual({ notifications: 3, processedEvents: 2, outbox: 5 });
    });

    // Un traitement que ce cote ne connait pas disparaitrait de la trace sans
    // un mot s il etait ignore.
    it('refuse un traitement inconnu', async () => {
        const store = await storeAnswering(200, [{ treatment: 'items', deleted: 1 }]);

        await expect(store.purgeExpired()).rejects.toThrow('unknown treatment');
    });

    it('refuse un resultat auquel il manque un traitement', async () => {
        const store = await storeAnswering(200, [{ treatment: 'outbox', deleted: 1 }]);

        await expect(store.purgeExpired()).rejects.toThrow('incomplete result');
    });

    it('signale l echec de la fonction', async () => {
        const store = await storeAnswering(400, { code: '42883', message: 'function does not exist' });

        await expect(store.purgeExpired()).rejects.toThrow('retention: purgeExpired failed');
    });
});
