import type { Logger } from '@legacy/contracts';

// Runs a delivery pass once a use case has written its fact.
//
// The relay normally runs on a timer, in a process that stays up. A serverless
// function has none, so the trigger has to come from somewhere -- and the right
// place is the write: the process that stored the event is the one that
// publishes it, which is what the timer was doing, only asked for instead of
// polled.
//
// Not the read path. Delivering when somebody opens their notifications makes
// an unrelated read carry infrastructure work, and leaves an event undelivered
// until its recipient happens to look.
//
// Delivery never fails the write. The fact is already committed and the outbox
// holds it: a broker that blinked is the scheduled sweep's problem, not the
// caller's.
export function afterWrite<Args extends readonly unknown[], Result>(
    write: (...args: Args) => Promise<Result>,
    deliver: () => Promise<unknown>,
    logger: Logger,
): (...args: Args) => Promise<Result> {
    return async (...args: Args) => {
        const result = await write(...args);

        try {
            await deliver();
        } catch (error) {
            logger.warn({ err: error }, 'delivery after write failed, leaving it to the sweep');
        }

        return result;
    };
}
