import { describe, expect, it, vi } from 'vitest';

import { opener } from './redis-event-bus.js';

// The defect this closes: a serverless function never calls connect(), so every command went to a
// closed client and failed. The delivery pass caught the error, served what was stored, and no
// notification appeared on the deployment.

describe('opening the bus on demand', () => {
    it('opens a closed client', async () => {
        const connect = vi.fn(async () => undefined);
        const ouvrir = opener({ isOpen: false, connect });

        await ouvrir();

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('does not reopen a client already open', async () => {
        const connect = vi.fn(async () => undefined);
        const ouvrir = opener({ isOpen: true, connect });

        await ouvrir();

        expect(connect).not.toHaveBeenCalled();
    });

    // node-redis rejects a second connect() during the first: two concurrent commands on a closed
    // client must share the wait.
    it('starts a single opening for two concurrent commands', async () => {
        let liberer: () => void = () => undefined;
        const connect = vi.fn(
            () =>
                new Promise<undefined>(resolve => {
                    liberer = () => resolve(undefined);
                }),
        );
        const ouvrir = opener({ isOpen: false, connect });

        const premiere = ouvrir();
        const seconde = ouvrir();
        liberer();
        await Promise.all([premiere, seconde]);

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('retries after a failure, rather than staying stuck', async () => {
        const connect = vi
            .fn<() => Promise<undefined>>()
            .mockRejectedValueOnce(new Error('courtier injoignable'))
            .mockResolvedValueOnce(undefined);
        const ouvrir = opener({ isOpen: false, connect });

        await expect(ouvrir()).rejects.toThrow('courtier injoignable');
        await expect(ouvrir()).resolves.toBeUndefined();

        expect(connect).toHaveBeenCalledTimes(2);
    });
});
