import { describe, expect, it } from 'vitest';

import { adapterFailure, serviceRoleClient } from './adapter.js';

// The seven adapters of this package report their failures through this
// factory, so the shape of what they throw is decided here rather than in each
// of them. A change to the message would go unnoticed in seven places at once;
// it fails here instead.

describe('adapterFailure', () => {
    it('names the adapter and the operation that failed', () => {
        const fail = adapterFailure('outbox');

        expect(() => fail('unpublished', new Error('la base a refuse'))).toThrow(
            'outbox: unpublished failed',
        );
    });

    it('keeps the cause reachable rather than folding it into the message', () => {
        const cause = new Error('la base a refuse');
        const fail = adapterFailure('items repository');

        try {
            fail('save', cause);
            expect.unreachable('fail must throw');
        } catch (error) {
            // The cause is what tells an operator which failure to go and read.
            // Flattening it into the text would leave a message and no trail.
            expect((error as Error).cause).toBe(cause);
            expect((error as Error).message).not.toContain('la base a refuse');
        }
    });

    it('gives each adapter its own label', () => {
        const bus = adapterFailure('event bus');
        const identity = adapterFailure('identity provider');

        expect(() => bus('take', undefined)).toThrow('event bus: take failed');
        expect(() => identity('signOut', undefined)).toThrow('identity provider: signOut failed');
    });
});

describe('serviceRoleClient', () => {
    // No request is made: building the client is what this covers. Reaching a
    // real PostgREST is the integration suite's job.
    it('builds a client for the given project', () => {
        const client = serviceRoleClient({
            url: 'http://127.0.0.1:1',
            serviceRoleKey: 'cle-de-service',
        });

        expect(typeof client.from).toBe('function');
        expect(typeof client.rpc).toBe('function');
    });

    it('keeps no session, so nothing schedules a refresh in a server process', async () => {
        const client = serviceRoleClient({
            url: 'http://127.0.0.1:1',
            serviceRoleKey: 'cle-de-service',
        });

        // getSession answers from storage, and this client keeps none: a stored
        // session would mean one caller's identity leaking into another's call.
        await expect(client.auth.getSession()).resolves.toMatchObject({
            data: { session: null },
        });
    });
});
