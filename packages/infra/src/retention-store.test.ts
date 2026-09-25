import { describe, expect, it } from 'vitest';

import { purgeExpired } from './retention-store.js';
import type { RetentionStore } from './retention-store.js';
import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';

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
