import {
    consume,
    createLogger,
    createRedisEventBus,
    createSupabaseNotificationStore,
} from '@legacy/infra';

import { loadWorkerConfig } from './config.js';

// The consumer, in its own process. ADR-0007 chose an external broker for what
// a separate process makes visible: stop this one and the queue grows, start it
// again and it drains. A bus inside the API would have to be explained; this can
// be shown.
//
// A failure here does not take the API down, which is the property the
// architecture is meant to demonstrate.

const config = loadWorkerConfig();
const logger = createLogger(config.logLevel);

const bus = createRedisEventBus({ url: config.redisUrl });
const notifications = createSupabaseNotificationStore({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
});

let running = true;

async function loop(): Promise<void> {
    await bus.connect();
    logger.info({ queueDepth: await bus.depth() }, 'worker started');

    while (running) {
        let event;

        try {
            // Blocks until an event arrives or the delay elapses. Polling in a
            // tight loop would burn a core to learn nothing.
            event = await bus.take(config.blockSeconds);
        } catch (error) {
            // Closing the connection from stop() makes the pending read fail.
            // That is the shutdown working, not a fault: reporting it would end
            // a deliberate stop with a fatal log and a non-zero exit code.
            if (!running) break;

            // Otherwise the queue held something unreadable, or the broker
            // blinked. Neither is worth taking the worker down for: the next
            // pass reconnects, and the bad entry is already off the queue.
            logger.error({ err: error }, 'could not read from the queue, retrying');
            continue;
        }

        if (event === null) continue;

        try {
            await consume(event, { notifications, logger });
        } catch (error) {
            // The event has already left the queue. Logging and carrying on
            // means it is lost, which is the trade-off ADR-0007 recorded and
            // EN-35 is meant to close with a retry and a dead-letter queue.
            // Stopping the worker instead would block every later event behind
            // this one.
            logger.error({ err: error, eventId: event.id }, 'event not handled, moving on');
        }
    }
}

// Resolves when the loop has left its body. stop() waits on it, so an event
// being handled when a signal arrives is finished rather than abandoned: it has
// already left the queue, so killing the process would lose it with nothing to
// notice.
const finished = loop().catch((error: unknown) => {
    logger.fatal({ err: error }, 'worker failed');
    process.exit(1);
});

function stop(signal: string): void {
    logger.info({ signal }, 'worker stopping');
    // Set before disconnecting: the pending read is about to fail, and the loop
    // reads this flag to tell a deliberate stop from a real failure.
    running = false;

    // Waiting on the loop rather than exiting straight away. An event is off
    // the queue as soon as it is read, so a process killed mid-consume loses
    // it silently. The blocking read is what the disconnect below cuts short,
    // which is why the wait is bounded in practice by the current event, not by
    // the poll interval.
    void bus
        .disconnect()
        .then(() => finished)
        .then(() => {
            logger.info({}, 'worker stopped');
            process.exit(0);
        })
        .catch((error: unknown) => {
            logger.error({ err: error }, 'worker did not stop cleanly');
            process.exit(1);
        });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
