import { z } from 'zod';

// What one pass of the retention purge removed (US-39), per treatment of
// docs/gdpr/registre.md. Counts only: nothing here names a row, so the result
// can be logged and shown in a workflow summary as it is.
const Deleted = z.number().int().nonnegative();

export const PurgeResult = z.object({
    notifications: Deleted,
    processedEvents: Deleted,
    outbox: Deleted,
});

export type PurgeResult = z.infer<typeof PurgeResult>;
