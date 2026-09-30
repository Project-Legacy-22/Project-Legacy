import { describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { afterWrite } from './after-write.js';

describe('afterWrite', () => {
    it('returns what the write returned, after delivering', async () => {
        const ordre: string[] = [];
        const write = vi.fn(async (nom: string) => {
            ordre.push(`ecrit ${nom}`);
            return { id: '1', nom };
        });
        const deliver = vi.fn(async () => {
            ordre.push('livre');
        });

        const run = afterWrite(write, deliver, recordingLogger());

        await expect(run('une tache')).resolves.toEqual({ id: '1', nom: 'une tache' });
        expect(ordre).toEqual(['ecrit une tache', 'livre']);
    });

    // The fact is already written and the outbox holds it: the scheduled sweep will take care of
    // it. Failing the creation for a broker that blinked would lose the write to save the
    // notification.
    it('does not fail the write when the delivery fails', async () => {
        const logger = recordingLogger();
        const run = afterWrite(
            async () => 'ecrit',
            () => Promise.reject(new Error('courtier injoignable')),
            logger,
        );

        await expect(run()).resolves.toBe('ecrit');
        expect(logger.lines.some(line => line.level === 'warn')).toBe(true);
    });

    it('does not deliver when the write failed', async () => {
        const deliver = vi.fn(async () => undefined);
        const run = afterWrite(() => Promise.reject(new Error('refus')), deliver, recordingLogger());

        await expect(run()).rejects.toThrow('refus');
        expect(deliver).not.toHaveBeenCalled();
    });
});
