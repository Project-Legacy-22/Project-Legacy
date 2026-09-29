import { relayOnce } from './outbox-relay.js';
import type { RelayDependencies } from './outbox-relay.js';

// A pass that outlives its interval must not have a second one start behind it:
// both would read the same unpublished rows and publish them twice, in an order
// neither controls. The flag makes the tick skip instead, and the skipped work
// is still there on the next one.
const RELAY_INTERVAL_MS = 1_000;

export function startRelay(dependencies: RelayDependencies): NodeJS.Timeout {
    let relaying = false;

    const timer = setInterval(() => {
        if (relaying) return;
        relaying = true;

        void relayOnce(dependencies)
            .catch((err: unknown) => {
                dependencies.logger.warn({ err }, 'relay pass failed, will retry');
            })
            .finally(() => {
                relaying = false;
            });
    }, RELAY_INTERVAL_MS);

    // Does not hold the process open on its own.
    timer.unref();
    return timer;
}
