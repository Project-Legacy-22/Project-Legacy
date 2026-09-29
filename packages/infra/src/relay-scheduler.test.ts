import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';
import type { OutboxStore } from './outbox-store.js';
import type { EventBus } from './redis-event-bus.js';
import { startRelay } from './relay-scheduler.js';

const bus: EventBus = {
    connect: async () => {},
    disconnect: async () => {},
    publish: async () => {},
    take: async () => null,
    depth: async () => 0,
};

afterEach(() => vi.useRealTimers());

describe('the scheduled relay', () => {
    it('does not overlap passes when an outbox read is still pending', async () => {
        vi.useFakeTimers();
        const logger = recordingLogger();
        let finishRead: ((value: []) => void) | undefined;
        const reads: number[] = [];
        const outbox: OutboxStore = {
            unpublished: async () => {
                reads.push(1);
                return new Promise(resolve => { finishRead = resolve; });
            },
            markPublished: async () => {},
        };
        const timer = startRelay({ outbox, bus, logger });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(reads).toHaveLength(1);

        finishRead?.([]);
        await Promise.resolve();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(reads).toHaveLength(2);
        clearInterval(timer);
        finishRead?.([]);
    });

    it('logs a failed pass so the next tick can retry', async () => {
        vi.useFakeTimers();
        const logger = recordingLogger();
        const outbox: OutboxStore = {
            unpublished: async () => { throw new Error('database unavailable'); },
            markPublished: async () => {},
        };
        const timer = startRelay({ outbox, bus, logger });

        await vi.advanceTimersByTimeAsync(2_000);

        expect(logger.lines.filter(line => line.message === 'relay pass failed, will retry')).toHaveLength(2);
        clearInterval(timer);
    });
});
