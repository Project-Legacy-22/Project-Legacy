import { describe, expect, it } from 'vitest';

import { ServiceUnavailable } from '@legacy/contracts';

import {
    adapterFailure,
    asInstant,
    DeadlineExceeded,
    retryingOnOutage,
    serviceRoleClient,
    withDeadline,
} from './adapter.js';

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

// #383: a dependency that throttled us or was down became a 500. Each shape
// below is the one the real client produces, not an invented one.
describe('adapterFailure, when the dependency is the problem', () => {
    class ConnectionTimeoutError extends Error {}

    const causes = [
        {
            shape: 'a GoTrue rate limit',
            cause: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' },
            reason: 'rate_limited',
            retryAfter: 30,
        },
        { shape: 'a call past its deadline', cause: new DeadlineExceeded('refresh', 5000), reason: 'timed_out', retryAfter: 5 },
        { shape: 'a database statement timeout', cause: { code: '57014', message: 'canceling statement' }, reason: 'timed_out', retryAfter: 5 },
        { shape: 'a gateway answering 503', cause: { status: 503 }, reason: 'unreachable', retryAfter: 5 },
        {
            shape: 'a GoTrue host that did not answer',
            cause: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' },
            reason: 'unreachable',
            retryAfter: 5,
        },
        {
            shape: 'a PostgREST fetch that failed',
            cause: { message: 'TypeError: fetch failed', details: '', hint: '', code: '' },
            reason: 'unreachable',
            retryAfter: 5,
        },
        { shape: 'PostgREST unable to reach its database', cause: { code: 'PGRST001' }, reason: 'unreachable', retryAfter: 5 },
        { shape: 'a Redis connection timeout', cause: new ConnectionTimeoutError('Connection timeout'), reason: 'unreachable', retryAfter: 5 },
    ] as const;

    it.each(causes)('reports $shape as a passing unavailability', ({ cause, reason, retryAfter }) => {
        const fail = adapterFailure('identity provider');

        const thrown = catchError(() => fail('refresh', cause));

        expect(thrown).toBeInstanceOf(ServiceUnavailable);
        expect(thrown).toMatchObject({
            reason,
            retryAfterSeconds: retryAfter,
            operation: 'identity provider: refresh',
            httpStatus: 503,
        });
        expect((thrown as Error).cause).toBe(cause);
    });

    // Dressing an unknown error up as an outage would hide a bug of ours
    // behind a retry: it has to stay a plain failure, reported as 500.
    it('keeps an error nobody modelled as a plain failure', () => {
        const fail = adapterFailure('items repository');

        const thrown = catchError(() => fail('save', { code: '23505', message: 'duplicate key' }));

        expect(thrown).not.toBeInstanceOf(ServiceUnavailable);
        expect(thrown).toHaveProperty('message', 'items repository: save failed');
    });

    it('never puts the dependency or the operation in the client-facing message', () => {
        const fail = adapterFailure('identity provider');

        const thrown = catchError(() => fail('refresh', { status: 429 }));

        expect((thrown as Error).message).toBe('The service is temporarily unavailable. Try again shortly.');
    });
});

function catchError(run: () => never): unknown {
    try {
        run();
    } catch (error) {
        return error;
    }
    return undefined;
}

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

describe('withDeadline', () => {
    it('rends la main quand le travail repond avant l echeance', async () => {
        await expect(withDeadline(Promise.resolve('fait'), 1000, 'refresh')).resolves.toBe('fait');
    });

    // Le defaut de #214 : le SDK retente pendant environ 25 secondes sans que
    // ni la fenetre ni le predicat soient exposes, et la requete HTTP restait
    // ouverte pendant tout ce temps.
    it('echoue en nommant l echeance quand le travail ne repond jamais', async () => {
        const jamais = new Promise<never>(() => undefined);

        await expect(withDeadline(jamais, 10, 'refresh')).rejects.toThrow(
            /refresh exceeded its 10 ms deadline/u,
        );
    });

    it('laisse passer l echec du travail plutot que de le convertir en echeance', async () => {
        const echec = Promise.reject(new Error('le fournisseur a refuse'));

        await expect(withDeadline(echec, 1000, 'refresh')).rejects.toThrow('le fournisseur a refuse');
    });

});

describe('retryingOnOutage', () => {
    const panne = { name: 'AuthRetryableFetchError', message: 'Gateway Timeout' };

    it('retente une panne passagere et rend la seconde reponse', async () => {
        const reponses = [{ error: panne }, { error: null }];
        let appels = 0;
        const call = () => {
            const reponse = reponses[appels] ?? { error: null };
            appels += 1;
            return Promise.resolve(reponse);
        };

        await expect(retryingOnOutage(call)).resolves.toEqual({ error: null });
        expect(appels).toBe(2);
    });

    // Un mot de passe refuse est une reponse, pas une panne : le retenter
    // doublerait le cout de chaque tentative fausse.
    it('ne retente pas un refus', async () => {
        let appels = 0;
        const call = () => {
            appels += 1;
            return Promise.resolve({ error: { name: 'AuthApiError', message: 'Invalid login credentials' } });
        };

        await retryingOnOutage(call);

        expect(appels).toBe(1);
    });

    it('n appelle qu une fois quand la premiere reponse est bonne', async () => {
        let appels = 0;
        const call = () => {
            appels += 1;
            return Promise.resolve({ error: null });
        };

        await retryingOnOutage(call);

        expect(appels).toBe(1);
    });

    it('rend la seconde panne quand la seconde tentative echoue aussi', async () => {
        const call = () => Promise.resolve({ error: panne });

        await expect(retryingOnOutage(call)).resolves.toEqual({ error: panne });
    });
});

// The rule that cost #344. PostgreSQL renders a timestamptz with a numeric
// offset; `z.iso.datetime()` accepts only the form ending in Z. The outbox
// carried a private copy of this conversion, the notification store never got
// it, and the browser refused the notification list while the unread count
// next to it was right.
describe('asInstant', () => {
    it('turns the offset PostgreSQL renders into the form the contracts accept', () => {
        expect(asInstant('2026-09-15T10:11:12.345+00:00')).toBe('2026-09-15T10:11:12.345Z');
    });

    // The form PostgREST really sends, taken from the fixture of
    // supabase-identity-provider.test.ts: microsecond precision and the full
    // offset. Milliseconds are as far as the contracts go, so the tail is
    // dropped -- which is a loss of precision, not of correctness, and worth
    // stating rather than discovering.
    it('reads the microsecond precision PostgREST sends, down to the millisecond', () => {
        expect(asInstant('2026-09-08T14:30:00.123456+00:00')).toBe('2026-09-08T14:30:00.123Z');
    });

    it('keeps the instant, not just the shape, when the offset is not zero', () => {
        expect(asInstant('2026-09-15T12:11:12.345+02:00')).toBe('2026-09-15T10:11:12.345Z');
    });

    it('leaves a value already in canonical form alone', () => {
        expect(asInstant('2026-09-15T10:11:12.345Z')).toBe('2026-09-15T10:11:12.345Z');
    });

    // Returned raw rather than thrown on: a row that cannot be read must be
    // refused by the schema, which names it, not by a RangeError nobody
    // catches halfway through a batch.
    it('gives back what it was handed when that is not a date', () => {
        expect(asInstant('pas une date')).toBe('pas une date');
    });
});
