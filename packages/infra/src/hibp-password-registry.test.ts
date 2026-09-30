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
    it('sends only the prefix of the hash, never the password', async () => {
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

    it('asks for the response to be padded', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
            expect(new Headers(init?.headers).get('Add-Padding')).toBe('true');
            return new Response(`${SUFFIX}:1`, { status: 200 });
        });
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await registry.isCompromised(CANDIDATE);
    });

    it('flags a password whose suffix appears with a non-zero count', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(
            async () => new Response(`0000000000000000000000000000000000A:0\n${SUFFIX.toLowerCase()}:42`),
        );
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(true);
    });

    it('lets through a password absent from the range', async () => {
        const fetch = vi.fn(async () => new Response('0000000000000000000000000000000000A:5'));
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
    });

    it('ignores a zero-count padding entry carrying the same suffix', async () => {
        const fetch = vi.fn(async () => new Response(`${SUFFIX}:0`));
        const registry = createHibpPasswordRegistry({ logger: recordingLogger(), fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
    });

    it('fails open on an error response, without logging the password', async () => {
        const logger = recordingLogger();
        const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('nope', { status: 503 }));
        const registry = createHibpPasswordRegistry({ logger, fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(CANDIDATE);
    });

    it('fails open on a network outage', async () => {
        const logger = recordingLogger();
        const fetch = vi.fn(async () => {
            throw new Error('network down');
        });
        const registry = createHibpPasswordRegistry({ logger, fetch });

        await expect(registry.isCompromised(CANDIDATE)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
    });

    // An answer that never comes is not a rejection: without a deadline, the reset would stay
    // blocked for as long as the platform's outage lasts. The real service is not called here, only
    // the signal passed on matters.
    it('gives up when the answer does not come, rather than waiting', async () => {
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
