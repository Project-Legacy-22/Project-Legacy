import type { StateReading } from '@legacy/contracts';

import { withDeadline } from './adapter.js';
import type { EventBus } from './redis-event-bus.js';

// The two readings that watch the broker.
//
// Separate from the Supabase ones because this file is exercised by a
// hand-written EventBus and therefore stays inside the coverage gate, while an
// adapter that needs a real PostgREST endpoint cannot be and is excluded with
// the other outbound ones.

// The broker is asked for its queue depth rather than pinged.
//
// A ping would only say that Redis is up; the depth says that and what is
// waiting, which is the number ADR-0007 wants to be able to show -- stop the
// consumer and it grows, restart it and it drains.
const BUS_DEADLINE_MS = 3_000;

export function createBusStateReadings(bus: EventBus): StateReading[] {
    // A deadline because an unreachable broker does not refuse quickly: the
    // client tries to connect, and without a bound the metrics endpoint would
    // hang for as long as that takes. A health check that hangs is worse than
    // one that says « down ».
    const depth = (): Promise<number> =>
        withDeadline(bus.depth(), BUS_DEADLINE_MS, 'event queue depth');

    return [
        {
            name: 'legacy22_redis_up',
            help: 'Whether the broker answered when asked for the queue depth.',
            // 0, not an absent series. « The broker refused » and « nobody
            // asked » are different facts, and a health panel has to tell them
            // apart -- so this is the one reading whose failure is itself the
            // measurement, and it therefore catches instead of throwing.
            read: async () => {
                try {
                    await depth();
                    return 1;
                } catch {
                    return 0;
                }
            },
        },
        {
            // Asked a second time rather than derived from the reading above.
            // Two LLEN cost nothing next to the connection they share, and
            // sharing one answer between two readings would mean caching it --
            // a cache whose lifetime is one render is a bug waiting for the
            // render that lasts two.
            name: 'legacy22_event_queue_depth',
            help: 'Events waiting on the broker.',
            read: depth,
        },
    ];
}
