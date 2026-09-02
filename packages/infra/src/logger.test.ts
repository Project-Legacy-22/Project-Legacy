import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

// Keeping credentials and user content out of logs is a rule the team
// committed to, and one nobody can verify by reading code. These tests read
// back what was actually written.
function captureLines(): { lines: string[]; stream: Writable } {
    const lines: string[] = [];
    const stream = new Writable({
        write(chunk: Buffer, _encoding, done) {
            lines.push(chunk.toString());
            done();
        },
    });

    return { lines, stream };
}

describe('createLogger', () => {
    it('ecrit une ligne JSON portant le niveau et les champs fournis', () => {
        const { lines, stream } = captureLines();

        createLogger('info', stream).info({ traceId: 'trace-1', status: 200 });

        const line = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
        expect(line.level).toBe('info');
        expect(line.traceId).toBe('trace-1');
        expect(line.status).toBe(200);
    });

    it('masque un mot de passe plutot que de l ecrire', () => {
        const { lines, stream } = captureLines();

        createLogger('info', stream).warn({ password: 'secret-a-masquer' });

        expect(lines.join()).not.toContain('secret-a-masquer');
        expect(lines.join()).toContain('[redacted]');
    });

    it('masque un en-tete d autorisation et un cookie', () => {
        const { lines, stream } = captureLines();

        createLogger('info', stream).info({
            req: { headers: { authorization: 'Bearer jeton-secret', cookie: 'session=abc' } },
        });

        const written = lines.join();
        expect(written).not.toContain('jeton-secret');
        expect(written).not.toContain('session=abc');
    });

    // Le corps d une requete porterait le nom d un item, qui est du contenu
    // utilisateur : il ne doit jamais atteindre un journal.
    it('masque le corps d une requete', () => {
        const { lines, stream } = captureLines();

        createLogger('info', stream).info({ req: { body: { name: 'Acheter du pain' } } });

        expect(lines.join()).not.toContain('Acheter du pain');
    });

    it('respecte le niveau demande', () => {
        const { lines, stream } = captureLines();
        const logger = createLogger('warn', stream);

        logger.info({ traceId: 'trace-1' });
        logger.warn({ traceId: 'trace-2' });

        expect(lines).toHaveLength(1);
        expect(lines.join()).toContain('trace-2');
    });
});
