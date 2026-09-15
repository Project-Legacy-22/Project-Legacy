import { createClient } from '@redis/client';

import { DomainEvent } from '@legacy/contracts';
import type { DomainEvent as Event } from '@legacy/contracts';
import { adapterFailure } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

// The broker, behind an interface. ADR-0007 chose Redis for what it makes
// visible -- stop the consumer and the queue grows, restart it and it drains --
// but the domain never sees this type: only the relay and the worker do, and
// swapping brokers would mean writing another adapter, not touching the metier.
export interface EventBus {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publish(event: Event): Promise<void>;
    // Blocks until an event arrives or the timeout elapses, then returns null.
    // Polling in a tight loop would burn a core for nothing; a blocking read
    // wakes the worker exactly when there is something to do.
    take(timeoutSeconds: number): Promise<Event | null>;
    // What is waiting, for the demonstration and for a health check.
    depth(): Promise<number>;
}

// A list used as a queue: pushed on the left, taken from the right, so the
// oldest event is the next one served. Redis Streams would offer consumer
// groups and replay, which EN-35 may need; a list is what US-10 needs, and it
// is the smaller thing to explain in a review.
export const EVENT_QUEUE = 'legacy22:events';

const fail: AdapterFailure = adapterFailure('event bus');

export interface RedisSettings {
    url: string;
}

// A serverless function never calls connect(): it has no startup, and its
// process is gone before the next request. Every command therefore opens the
// connection if it has to, and the shared promise keeps two concurrent commands
// from both calling connect -- node-redis rejects the second.
// Le client n est vu que par ce dont l ouverture a besoin : l instanciation
// generique de createClient ne se laisse pas nommer sous exactOptionalPropertyTypes.
export function opener(client: {
    isOpen: boolean;
    connect: () => Promise<unknown>;
}): () => Promise<void> {
    let opening: Promise<unknown> | undefined;

    return async () => {
        if (client.isOpen) return;

        opening ??= client.connect().finally(() => {
            opening = undefined;
        });

        await opening;
    };
}

export function createRedisEventBus(settings: RedisSettings): EventBus {
    const client = createClient({ url: settings.url });

    // Without a listener, a connection error would surface as an unhandled
    // rejection and take the process down on a broker hiccup.
    client.on('error', () => {
        // Reported by whoever awaits the failing call; nothing to do here.
    });

    const ensureOpen = opener(client);

    return {
        async connect() {
            try {
                await client.connect();
            } catch (error) {
                fail('connect', error);
            }
        },

        async disconnect() {
            if (client.isOpen) await client.close();
        },

        async publish(event) {
            try {
                await ensureOpen();
                await client.lPush(EVENT_QUEUE, JSON.stringify(event));
            } catch (error) {
                fail('publish', error);
            }
        },

        async take(timeoutSeconds) {
            // The whole exchange is guarded, not just the read. Parsing sits
            // inside on purpose: a message pushed by hand, or written by an
            // older producer, would otherwise throw past every caller and take
            // the worker down for one bad entry.
            try {
                await ensureOpen();
                const popped = await client.brPop(EVENT_QUEUE, timeoutSeconds);
                if (popped === null) return null;

                const parsed = DomainEvent.safeParse(JSON.parse(popped.element));
                if (!parsed.success) {
                    throw new Error('event does not match the catalogue', { cause: parsed.error });
                }

                return parsed.data;
            } catch (error) {
                return fail('take', error);
            }
        },

        async depth() {
            try {
                await ensureOpen();
                return await client.lLen(EVENT_QUEUE);
            } catch (error) {
                return fail('depth', error);
            }
        },
    };
}
