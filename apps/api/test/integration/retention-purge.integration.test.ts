import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';
import { membershipClient } from './member-removal-support.js';

// US-39 against the real purge_expired_data: what is older than its period in
// docs/gdpr/registre.md goes, what is younger stays, and an event nobody has
// been told about stays whatever its age. Rows are aged by writing their
// timestamps directly rather than by moving the clock: a clock ninety days
// ahead would purge every other file's rows along with these.
let app: Application;
const unpublished: string[] = [];

beforeAll(() => {
    app = realApplication();
});

afterAll(async () => {
    // The only row the purge never removes. Left behind, a later delivery pass
    // in another file would publish it.
    await membershipClient().from('outbox').delete().in('id', unpublished);
});

function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function check<T extends { error: unknown }>(query: PromiseLike<T>): Promise<T> {
    const result = await query;
    if (result.error !== null) throw new Error('Cannot prepare the purge fixture', { cause: result.error });
    return result;
}

// A processed event and the notification it produced, both written the given
// number of days ago, as the consumer writes them: in one go, for one person.
async function consumedEvent(account: RealAccount, age: number): Promise<string> {
    const client = membershipClient();
    const itemId = randomUUID();
    const eventId = randomUUID();

    await check(client.from('items').insert({ id: itemId, project_id: account.projectId, user_id: account.id, name: 'Aged' }));
    await check(client.from('processed_events').insert({ event_id: eventId, processed_at: daysAgo(age) }));
    await check(
        client.from('notifications').insert({
            event_id: eventId,
            user_id: account.id,
            item_id: itemId,
            kind: 'item.created',
            created_at: daysAgo(age),
        }),
    );
    return eventId;
}

async function outboxRow(account: RealAccount, publishedDaysAgo: number | null, id: string = randomUUID()): Promise<string> {
    await check(
        membershipClient().from('outbox').insert({
            id,
            name: 'item.created.v1',
            occurred_at: daysAgo(400),
            created_at: daysAgo(400),
            payload: { itemId: randomUUID(), ownerId: account.id },
            published_at: publishedDaysAgo === null ? null : daysAgo(publishedDaysAgo),
        }),
    );
    if (publishedDaysAgo === null) unpublished.push(id);
    return id;
}

async function remaining(table: 'processed_events', ids: string[]): Promise<string[]>;
async function remaining(table: 'outbox', ids: string[]): Promise<string[]>;
async function remaining(table: 'processed_events' | 'outbox', ids: string[]): Promise<string[]> {
    const client = membershipClient();
    if (table === 'outbox') {
        const { data } = await check(client.from('outbox').select('id').in('id', ids));
        return (data ?? []).map(row => row.id).sort();
    }
    const { data } = await check(client.from('processed_events').select('event_id').in('event_id', ids));
    return (data ?? []).map(row => row.event_id).sort();
}

async function notificationsOf(eventIds: string[]): Promise<string[]> {
    const { data } = await check(membershipClient().from('notifications').select('event_id').in('event_id', eventIds));
    return (data ?? []).map(row => row.event_id).sort();
}

async function purge(): Promise<Record<string, number>> {
    const { data } = await check(membershipClient().rpc('purge_expired_data', {}));
    return Object.fromEntries((data ?? []).map(row => [row.treatment, row.deleted]));
}

describe('retention purge, against the real database', () => {
    it('removes what is older than its period and keeps what is younger', async () => {
        const account = await registerAndSignIn(app, 'RetentionTest2026');
        const oldEvent = await consumedEvent(account, 91);
        const recentEvent = await consumedEvent(account, 89);
        const oldPublished = await outboxRow(account, 8);
        const recentPublished = await outboxRow(account, 6);

        const result = await purge();

        expect(await remaining('processed_events', [oldEvent, recentEvent])).toEqual([recentEvent]);
        expect(await notificationsOf([oldEvent, recentEvent])).toEqual([recentEvent]);
        expect(await remaining('outbox', [oldPublished, recentPublished])).toEqual([recentPublished]);
        expect(result.notifications).toBeGreaterThanOrEqual(1);
        expect(result.outbox).toBeGreaterThanOrEqual(1);
    });

    it('never removes an event that was never published, however old', async () => {
        const account = await registerAndSignIn(app, 'RetentionTest2026');
        const neverPublished = await outboxRow(account, null);

        await purge();

        expect(await remaining('outbox', [neverPublished])).toEqual([neverPublished]);
    });

    it('has nothing left to do on a second pass', async () => {
        const account = await registerAndSignIn(app, 'RetentionTest2026');
        const kept = await consumedEvent(account, 89);
        await consumedEvent(account, 91);
        await outboxRow(account, 8);

        await purge();
        const second = await purge();

        expect(second).toEqual({ notifications: 0, processed_events: 0, outbox: 0 });
        expect(await remaining('processed_events', [kept])).toEqual([kept]);
    });

    // The case the registre names in T-05: the outbox row purged at day seven,
    // the account erased at day eight. Erasure used to find processed events
    // through the outbox only, and would have left this one in place.
    it('lets account erasure find processed events once their outbox row is purged', async () => {
        const account = await registerAndSignIn(app, 'RetentionTest2026');
        const session = await serveAs(app, account.cookie);
        const eventId = await consumedEvent(account, 8);
        await outboxRow(account, 8, eventId);

        await purge();
        expect(await remaining('outbox', [eventId])).toEqual([]);

        const erased = await session.request('/auth/me', json('DELETE', { confirmation: account.email }));
        expect(erased.status).toBe(204);

        expect(await remaining('processed_events', [eventId])).toEqual([]);
        await session.close();
    });
});
