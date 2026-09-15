import { beforeAll, describe, expect, it } from 'vitest';

import type { Application } from '../../src/composition-root.js';
import { integrationConfig, realApplication, registerAndSignIn } from './support.js';
import type { RealAccount } from './support.js';

// The half of the state readings a fake cannot prove.
//
// state-readings.test.ts covers the broker readings against a hand-written
// EventBus, because their logic is the catch and the deadline. The Supabase
// readings have no logic worth doubling: what can go wrong is a table name
// that does not exist, a filter PostgREST refuses, or a count that answers
// null -- and every one of those only shows up against a real database. A
// hand-written double of a query builder would have agreed with whatever this
// file wrote.
//
// The assertion that carries the most is legacy22_state_readings_failed: at 0
// it says every reading ran and returned a number, which is exactly the class
// of mistake above.
const MOT_DE_PASSE = 'IntegrationTest2026';

const READ_HERE = [
    'legacy22_accounts_total',
    'legacy22_projects_total',
    'legacy22_items_total',
    'legacy22_notifications_total',
    'legacy22_processed_events_total',
    'legacy22_outbox_pending',
] as const;

let app: Application;

// The exposition, as a map from series name to value. Only the unlabelled
// lines are kept, which is every state reading: none of them carries a label,
// and that is deliberate -- a label is where an identifier would slip in.
async function gauges(): Promise<Map<string, number>> {
    const { body } = await app.metrics.render();
    const found = new Map<string, number>();

    for (const line of body.split('\n')) {
        const match = /^([a-z][a-z0-9_]*) (-?[\d.]+)$/u.exec(line.trim());
        if (match !== null) found.set(match[1] ?? '', Number(match[2]));
    }

    return found;
}

async function valueOf(name: string): Promise<number> {
    const value = (await gauges()).get(name);
    if (value === undefined) throw new Error(`${name} is not in the exposition`);

    return value;
}

beforeAll(() => {
    // compose() and not start(): the readings are served by the metrics
    // endpoint, which needs no relay running behind it.
    app = realApplication();
});

describe('the state readings against the real database', () => {
    it('answers every reading, and reports no failure', async () => {
        const found = await gauges();

        for (const name of READ_HERE) {
            expect(found.get(name), `${name} is missing from the exposition`).toBeTypeOf('number');
        }

        expect(found.get('legacy22_state_readings_failed')).toBe(0);
    });

    // Exact, not « at least »: vitest.integration.config.ts sets
    // fileParallelism to false, so nothing else is writing to this database
    // while the test runs. An « at least » here would still pass if the
    // reading were counting the wrong table.
    it('counts the account and the default project a registration creates', async () => {
        const accountsBefore = await valueOf('legacy22_accounts_total');
        const projectsBefore = await valueOf('legacy22_projects_total');

        await registerAndSignIn(app, MOT_DE_PASSE);

        expect(await valueOf('legacy22_accounts_total')).toBe(accountsBefore + 1);
        expect(await valueOf('legacy22_projects_total')).toBe(projectsBefore + 1);
    });

    it('counts a task the moment it is created', async () => {
        const account: RealAccount = await registerAndSignIn(app, MOT_DE_PASSE);
        const before = await valueOf('legacy22_items_total');

        await app.useCases.items.addItem({
            name: 'Comptee par une jauge',
            projectId: account.projectId,
            ownerId: account.id,
        });

        expect(await valueOf('legacy22_items_total')).toBe(before + 1);
    });

    // The whole reason the broker readings exist, and the one thing the unit
    // test cannot say: that depth() reaches a real Redis.
    it('says whether the broker answers, when one is declared', async () => {
        const found = await gauges();

        if (integrationConfig().redisUrl === undefined) {
            // Also an assertion, not a skip: no broker declared must mean no
            // broker series, rather than a series claiming an empty queue.
            expect(found.has('legacy22_redis_up')).toBe(false);
            expect(found.has('legacy22_event_queue_depth')).toBe(false);
            return;
        }

        expect(found.get('legacy22_redis_up')).toBe(1);
        expect(found.get('legacy22_event_queue_depth')).toBeTypeOf('number');
    });

    // ADR-0016, measured rather than asserted. The address and the task name
    // both exist in the database these gauges counted, so if a reading ever
    // returned a row instead of a number, this is where it would show.
    it('puts no address and no task name in what it exposes', async () => {
        const account = await registerAndSignIn(app, MOT_DE_PASSE);
        const name = `Jamais expose ${account.id}`;
        await app.useCases.items.addItem({
            name,
            projectId: account.projectId,
            ownerId: account.id,
        });

        const { body } = await app.metrics.render();

        expect(body).not.toContain(account.email);
        expect(body).not.toContain(account.id);
        expect(body).not.toContain(name);
    });
});
