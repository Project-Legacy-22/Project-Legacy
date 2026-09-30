import type { Logger } from '@legacy/contracts';
import type { ItemRepository } from '@legacy/core-items';
import type { InvitationRepository } from '@legacy/core-projects';

import { currentTraceId } from './http/trace.js';

function recorded(logger: Logger, eventId: string): void {
    const traceId = currentTraceId();
    logger.info(traceId === undefined ? { eventId } : { traceId, eventId }, 'event recorded');
}

// The repository confirms that the item and event committed in one
// transaction. Only then is the link from request to event logged. The core
// remains unaware of HTTP traces and the event envelope stays unchanged.
export function correlateItemEvents(repository: ItemRepository, logger: Logger): ItemRepository {
    return {
        ...repository,
        async save(item, event) {
            await repository.save(item, event);
            recorded(logger, event.id);
        },
    };
}

export function correlateInvitationEvents(repository: InvitationRepository, logger: Logger): InvitationRepository {
    return {
        ...repository,
        async invite(invitation, event) {
            const outcome = await repository.invite(invitation, event);
            if (outcome === 'invited') recorded(logger, event.id);
            return outcome;
        },
    };
}
