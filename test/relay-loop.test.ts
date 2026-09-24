import { describe, expect, it, vi } from 'vitest';

import { addPass, runLoop } from '../scripts/relay-loop.mjs';
import type { Loop, PassResult } from '../scripts/relay-loop.mjs';

// #410: the relay runs every thirty seconds from a loop, not from a cron
// GitHub keeps hours apart. Driven by a fake clock: sleeping advances it.
function loopOf(overrides: Partial<Loop> = {}) {
    let clock = 0;
    const log: string[] = [];
    const pushed: PassResult[] = [];
    const loop: Loop = {
        pass: () => Promise.resolve({ published: 1, consumed: 1, failed: 0 }),
        pushMetrics: total => {
            pushed.push(total);
            return Promise.resolve();
        },
        sleep: ms => {
            clock += ms;
            return Promise.resolve();
        },
        now: () => clock,
        log: line => log.push(line),
        durationMs: 5 * 60_000,
        intervalMs: 30_000,
        passesPerPush: 10,
        ...overrides,
    };
    return { loop, log, pushed, advance: (ms: number) => (clock += ms) };
}

describe('addPass', () => {
    it('sums each field, and counts a missing one as zero', () => {
        expect(addPass({ published: 2, consumed: 1, failed: 0 }, { published: 3, failed: 1 })).toEqual({
            published: 5,
            consumed: 1,
            failed: 1,
        });
    });
});

describe('runLoop', () => {
    it('runs a pass every thirty seconds for the whole duration', async () => {
        const { loop } = loopOf();
        const pass = vi.spyOn(loop, 'pass');

        await expect(runLoop(loop)).resolves.toEqual({ passes: 10, failures: 0 });
        expect(pass).toHaveBeenCalledTimes(10);
    });

    it('counts the time a pass took against the interval', async () => {
        const { loop, advance } = loopOf();
        loop.pass = () => {
            advance(20_000);
            return Promise.resolve({ published: 0 });
        };
        const sleep = vi.spyOn(loop, 'sleep');

        await runLoop(loop);

        expect(sleep).toHaveBeenCalledWith(10_000);
    });

    it('does not sleep after a pass slower than the interval', async () => {
        const { loop, advance } = loopOf({ durationMs: 60_000 });
        loop.pass = () => {
            advance(40_000);
            return Promise.resolve({});
        };
        const sleep = vi.spyOn(loop, 'sleep');

        await expect(runLoop(loop)).resolves.toMatchObject({ passes: 2 });
        expect(sleep).not.toHaveBeenCalled();
    });

    it('pushes the sum of every ten passes, and what is left at the end', async () => {
        const { loop, pushed } = loopOf({ durationMs: 12 * 30_000 });

        await runLoop(loop);

        expect(pushed).toEqual([
            { published: 10, consumed: 10, failed: 0 },
            { published: 2, consumed: 2, failed: 0 },
        ]);
    });

    it('keeps going after a failed pass, and reports it', async () => {
        let calls = 0;
        const { loop, log, pushed } = loopOf({ durationMs: 3 * 30_000 });
        loop.pass = () => {
            calls += 1;
            return calls === 2 ? Promise.reject(new Error('the relay answered 503')) : Promise.resolve({ published: 1 });
        };

        await expect(runLoop(loop)).resolves.toEqual({ passes: 3, failures: 1 });
        expect(log).toContain('::warning::delivery pass failed: the relay answered 503');
        expect(pushed).toEqual([{ published: 2, consumed: 0, failed: 0 }]);
    });

    it('keeps going when the metrics push fails', async () => {
        const { loop, log } = loopOf({ durationMs: 20 * 30_000 });
        loop.pushMetrics = () => Promise.reject(new Error('the push answered 429'));

        await expect(runLoop(loop)).resolves.toEqual({ passes: 20, failures: 0 });
        expect(log.filter(line => line.includes('metrics push failed'))).toHaveLength(2);
    });
});
