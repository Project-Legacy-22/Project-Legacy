import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_CREATED_V1, membershipCreated } from './event.js';

const OCCURRED_AT = new Date('2026-09-15T10:00:00.000Z');
const PROJET = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const MEMBRE = '0191f3c2-2222-7000-8000-bbbbbbbbbbbb';
const AJOUTE_PAR = '0191f3c2-3333-7000-8000-cccccccccccc';

describe('membershipCreated', () => {
    it('carries the three identifiers and the instant, and nothing more', () => {
        expect(
            membershipCreated('event-id', OCCURRED_AT, {
                projectId: PROJET,
                memberId: MEMBRE,
                addedBy: AJOUTE_PAR,
            }),
        ).toEqual({
            id: 'event-id',
            name: MEMBERSHIP_CREATED_V1,
            occurredAt: '2026-09-15T10:00:00.000Z',
            payload: { projectId: PROJET, memberId: MEMBRE, addedBy: AJOUTE_PAR },
        });
    });

    // The same GDPR criterion as for creating a task. The address is what the person typed to find
    // the account, hence content: if it entered the payload, it would leave the scope that export
    // and erasure know how to reach, and end up in the consumer's logs.
    it('carries no address', () => {
        const event = membershipCreated('event-id', OCCURRED_AT, {
            projectId: PROJET,
            memberId: MEMBRE,
            addedBy: AJOUTE_PAR,
        });

        expect(Object.keys(event.payload)).toEqual(['projectId', 'memberId', 'addedBy']);
        expect(JSON.stringify(event)).not.toContain('@');
    });

    // `addedBy` is why the invitation goes through the flow: without it, the notification could say
    // "added" but not "by whom".
    it('names who added, not only who was added', () => {
        const event = membershipCreated('event-id', OCCURRED_AT, {
            projectId: PROJET,
            memberId: MEMBRE,
            addedBy: AJOUTE_PAR,
        });

        expect(event.payload.addedBy).toBe(AJOUTE_PAR);
        expect(event.payload.addedBy).not.toBe(event.payload.memberId);
    });

    it('carries a versioned name, so that a consumer subscribes to a precise shape', () => {
        expect(
            membershipCreated('event-id', OCCURRED_AT, {
                projectId: PROJET,
                memberId: MEMBRE,
                addedBy: AJOUTE_PAR,
            }).name,
        ).toBe('membership.created.v1');
    });
});
