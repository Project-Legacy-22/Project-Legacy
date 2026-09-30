import { INVITATION_CREATED_V1, ITEM_CREATED_V1, MEMBERSHIP_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent, Logger } from '@legacy/contracts';

import type { NotificationStore } from './notification-store.js';

export interface ConsumeDependencies {
    notifications: NotificationStore;
    logger: Logger;
}

export type ConsumeOutcome = 'applied' | 'alreadyHandled';

// What the worker does with one event. Kept apart from the loop that fetches
// them so the decision can be tested without a broker: the reason a redelivery
// changes nothing is a rule, not a property of Redis.
export async function consume(
    event: DomainEvent,
    { notifications, logger }: ConsumeDependencies,
): Promise<ConsumeOutcome> {
    // The switch is exhaustive over the catalogue. A second event type added to
    // the union without a branch here fails to compile, instead of being
    // silently dropped at run time.
    switch (event.name) {
        case ITEM_CREATED_V1: {
            const applied = await notifications.notifyItemCreated(
                event.id,
                event.payload.ownerId,
                event.payload.itemId,
            );

            logger.info(
                { eventId: event.id, applied },
                applied ? 'notification created' : 'event already handled, nothing to do',
            );

            return applied ? 'applied' : 'alreadyHandled';
        }

        case MEMBERSHIP_CREATED_V1: {
            // The person added, and only them: the person who adds knows what they just did.
            // `addedBy` travels anyway, because it is what will make it possible to say "by whom"
            // (#349).
            const applied = await notifications.notifyMemberAdded(
                event.id,
                event.payload.memberId,
                event.payload.projectId,
            );

            logger.info(
                { eventId: event.id, applied },
                applied ? 'membership notification created' : 'event already handled, nothing to do',
            );

            return applied ? 'applied' : 'alreadyHandled';
        }

        case INVITATION_CREATED_V1: {
            // The person invited, and only them: they are the one who answers. The notification
            // designates the invitation so that they can accept or decline from the notification
            // itself (#401).
            const applied = await notifications.notifyInvited({
                eventId: event.id,
                userId: event.payload.inviteeId,
                projectId: event.payload.projectId,
                invitationId: event.payload.invitationId,
            });

            logger.info(
                { eventId: event.id, applied },
                applied ? 'invitation notification created' : 'event already handled, nothing to do',
            );

            return applied ? 'applied' : 'alreadyHandled';
        }
    }
}
