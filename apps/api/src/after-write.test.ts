import { describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { afterWrite } from './after-write.js';

describe('afterWrite', () => {
    it('rend ce que l ecriture a rendu, apres avoir livre', async () => {
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

    // Le fait est deja ecrit et l outbox le retient : le balai planifie s en
    // occupera. Faire echouer la creation pour un courtier qui a cligne serait
    // perdre l ecriture pour sauver la notification.
    it('n echoue pas l ecriture quand la livraison echoue', async () => {
        const logger = recordingLogger();
        const run = afterWrite(
            async () => 'ecrit',
            () => Promise.reject(new Error('courtier injoignable')),
            logger,
        );

        await expect(run()).resolves.toBe('ecrit');
        expect(logger.lines.some(line => line.level === 'warn')).toBe(true);
    });

    it('ne livre pas quand l ecriture a echoue', async () => {
        const deliver = vi.fn(async () => undefined);
        const run = afterWrite(() => Promise.reject(new Error('refus')), deliver, recordingLogger());

        await expect(run()).rejects.toThrow('refus');
        expect(deliver).not.toHaveBeenCalled();
    });
});
