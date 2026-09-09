import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHibpPasswordRegistry } from './hibp-password-registry.js';

function recordingLogger() {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() };
}

function sha1Upper(value: string): string {
    return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

const CANDIDATE = 'CorrectHorseBatteryStaple9';
const HASH = sha1Upper(CANDIDATE);
const PREFIX = HASH.slice(0, 5);
const SUFFIX = HASH.slice(5);

afterEach(() => vi.restoreAllMocks());

describe('createHibpPasswordRegistry', () => {
    it('n envoie que le prefixe du hash, jamais le mot de passe', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(`${SUFFIX}:3`));
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await registry.isCompromised(CANDIDATE);

        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining(`/${PREFIX}`),
            expect.anything(),
        );
        const [requested] = fetch.mock.calls[0] ?? [];
        expect(requested).not.toContain(CANDIDATE);
        expect(requested).not.toContain(SUFFIX);
    });

    it('demande le rembourrage de la reponse', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
            expect(new Headers(init?.headers).get('Add-Padding')).toBe('true');
            return new Response(`${SUFFIX}:1`, { status: 200 });
        });
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await registry.isCompromised(CANDIDATE);
    });

    it('signale un mot de passe dont le suffixe apparait avec un compte non nul', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(
            async () => new Response(`0000000000000000000000000000000000A:0\n${SUFFIX.toLowerCase()}:42`),
        );
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(true);
    });

    it('laisse passer un mot de passe absent de la plage', async () => {
        const fetch = vi.fn(async () => new Response('0000000000000000000000000000000000A:5'));
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
    });

    it('ignore une entree de rembourrage a compte nul portant le meme suffixe', async () => {
        const fetch = vi.fn(async () => new Response(`${SUFFIX}:0`));
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
    });

    it('echoue en mode ouvert sur une reponse en erreur, sans journaliser le mot de passe', async () => {
        const logger = recordingLogger();
        const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('nope', { status: 503 }));
        const registry = createHibpPasswordRegistry({ logger, fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(CANDIDATE);
    });

    it('echoue en mode ouvert sur une panne reseau', async () => {
        const logger = recordingLogger();
        const fetch = vi.fn(async () => {
            throw new Error('network down');
        });
        const registry = createHibpPasswordRegistry({ logger, fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
    });

    // Une reponse qui ne vient jamais n est pas un rejet : sans echeance, la
    // reinitialisation resterait bloquee le temps du defaut de la plateforme.
    // Le service reel n est pas sollicite ici, seul le signal transmis compte.
    it('abandonne quand la reponse ne vient pas, plutot que d attendre', async () => {
        const logger = recordingLogger();
        const fetch = vi.fn((_url: string, init?: RequestInit) => {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new Error('aborted'));
                });
            });
        }) as unknown as typeof globalThis.fetch;

        const registry = createHibpPasswordRegistry({ logger, fetch, timeoutMs: 10 });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
    });
});
