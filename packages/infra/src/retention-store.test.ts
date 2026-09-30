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
    it('returns what the pass deleted', async () => {
        const result = await purgeExpired(
            storeRemoving({ notifications: 3, processedEvents: 2, outbox: 5 }),
            recordingLogger(),
        );

        expect(result).toEqual({ notifications: 3, processedEvents: 2, outbox: 5 });
    });

    // The trace US-39 requires: one line per processing, a name and a number, nothing that
    // designates a deleted row.
    it('leaves one line per processing, made of a name and a number only', async () => {
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
    it('returns one number per processing from the rows of the function', async () => {
        const store = await storeAnswering(200, [
            { treatment: 'notifications', deleted: 3 },
            { treatment: 'processed_events', deleted: 2 },
            { treatment: 'outbox', deleted: 5 },
        ]);

        await expect(store.purgeExpired()).resolves.toEqual({ notifications: 3, processedEvents: 2, outbox: 5 });
    });

    // A processing this side does not know would vanish from the trace without a word if it were
    // ignored.
    it('refuses an unknown processing', async () => {
        const store = await storeAnswering(200, [{ treatment: 'items', deleted: 1 }]);

        await expect(store.purgeExpired()).rejects.toThrow('unknown treatment');
    });

    it('refuses a result that lacks a processing', async () => {
        const store = await storeAnswering(200, [{ treatment: 'outbox', deleted: 1 }]);

        await expect(store.purgeExpired()).rejects.toThrow('incomplete result');
    });

    it('reports the failure of the function', async () => {
        const store = await storeAnswering(400, { code: '42883', message: 'function does not exist' });

        await expect(store.purgeExpired()).rejects.toThrow('retention: purgeExpired failed');
    });
});
