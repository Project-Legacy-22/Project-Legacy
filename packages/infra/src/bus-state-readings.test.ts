import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StateReading } from '@legacy/contracts';

import type { EventBus } from './redis-event-bus.js';
import { createBusStateReadings } from './bus-state-readings.js';

// The two readings that watch the broker, and the asymmetry between them.
//
// `legacy22_redis_up` answers 0 when the broker refuses, because there the
// failure *is* the measurement: a health panel has to tell « the broker said
// no » from « nobody asked ». `legacy22_event_queue_depth` lets the failure
// through instead, so the exposition omits the series rather than claiming an
// empty queue -- an unreachable broker is not a broker with nothing on it.
//
// The Supabase readings are not here: a hand-written double of a PostgREST
// query builder would only test the double. What they count is proved against
// a real database by the integration level.

function fakeBus(depth: () => Promise<number>): EventBus {
    return {
        connect: vi.fn(async () => undefined),
        disconnect: vi.fn(async () => undefined),
        publish: vi.fn(async () => undefined),
        take: vi.fn(async () => null),
        depth,
    };
}

function readingNamed(readings: readonly StateReading[], name: string): StateReading {
    const found = readings.find(one => one.name === name);
    if (found === undefined) throw new Error(`no reading named ${name}`);

    return found;
}

function readingsFor(depth: () => Promise<number>): readonly StateReading[] {
    return createBusStateReadings(fakeBus(depth));
}

afterEach(() => {
    vi.useRealTimers();
});

describe('the readings that watch the broker', () => {
    it('says the broker is up when it answers', async () => {
        const readings = readingsFor(() => Promise.resolve(0));

        await expect(readingNamed(readings, 'legacy22_redis_up').read()).resolves.toBe(1);
    });

    // 0, and not a rejection that the exposition would turn into an absence.
    it('says the broker is down when it refuses, rather than going quiet', async () => {
        const readings = readingsFor(() => Promise.reject(new Error('ECONNREFUSED')));

        await expect(readingNamed(readings, 'legacy22_redis_up').read()).resolves.toBe(0);
    });

    it('reports what is waiting on the queue', async () => {
        const readings = readingsFor(() => Promise.resolve(12));

        await expect(readingNamed(readings, 'legacy22_event_queue_depth').read()).resolves.toBe(12);
    });

    // The opposite choice of the one above, on purpose: a depth that could not
    // be read must not be rendered as a depth of zero.
    it('lets a failed depth through instead of calling the queue empty', async () => {
        const readings = readingsFor(() => Promise.reject(new Error('ECONNREFUSED')));

        await expect(readingNamed(readings, 'legacy22_event_queue_depth').read()).rejects.toThrow(
            'ECONNREFUSED',
        );
    });

    // The two below assert before advancing the clock, not after. The deadline
    // rejects while advanceTimersByTimeAsync is still running, so a handler
    // attached afterwards arrives too late: the rejection is unhandled for a
    // tick, and vitest reports it as an error next to a suite that passed.
    //
    // The case a plain try/catch would miss. An unreachable broker does not
    // refuse quickly: the client keeps trying to connect, and without a bound
    // the metrics endpoint would hang for as long as that takes.
    it('gives up on a broker that never answers, and calls it down', async () => {
        vi.useFakeTimers();
        const readings = readingsFor(() => new Promise<number>(() => undefined));

        const asserted = expect(readingNamed(readings, 'legacy22_redis_up').read()).resolves.toBe(
            0,
        );
        await vi.advanceTimersByTimeAsync(3_000);

        await asserted;
    });

    it('names the deadline it exceeded when the depth is the one waiting', async () => {
        vi.useFakeTimers();
        const readings = readingsFor(() => new Promise<number>(() => undefined));

        const asserted = expect(
            readingNamed(readings, 'legacy22_event_queue_depth').read(),
        ).rejects.toThrow('event queue depth');
        await vi.advanceTimersByTimeAsync(3_000);

        await asserted;
    });
});
