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
        // Blocks until an event arrives or the delay elapses. Polling in a
        // tight loop would burn a core to learn nothing.
        const event = await bus.take(config.blockSeconds);
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

function stop(signal: string): void {
    logger.info({ signal }, 'worker stopping');
    running = false;
    // The pending blocking read holds the process; closing the connection ends
    // it rather than waiting out the timeout.
    void bus.disconnect().then(() => process.exit(0));
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

loop().catch((error: unknown) => {
    logger.fatal({ err: error }, 'worker failed');
    process.exit(1);
});
