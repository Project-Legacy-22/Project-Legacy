import type { StateReading } from '@legacy/contracts';

import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure, SupabaseSettings } from './adapter.js';

// What the database can say about the service when asked, as opposed to what
// the process counted while running. See StateReading in the contracts for why
// that distinction decides everything on a serverless target.
//
// Nothing here selects a row. Every query asks PostgREST for a count with
// `head: true`, which answers with headers and no body: the number of accounts
// is not personal data, the list of them is.

const fail: AdapterFailure = adapterFailure('state readings');

type Counted = 'users' | 'projects' | 'items' | 'notifications' | 'processed_events';

interface TableCount {
    name: string;
    help: string;
    table: Counted;
}

// The activity the database records, which is what the users' requests leave
// behind. It is not a request count and must not be read as one: on this
// target a request count cannot be collected at all, because the instance that
// answers the metrics endpoint is never the one that served the traffic.
const COUNTS: readonly TableCount[] = [
    { name: 'legacy22_accounts_total', help: 'Accounts in the application table.', table: 'users' },
    { name: 'legacy22_projects_total', help: 'Projects created.', table: 'projects' },
    { name: 'legacy22_items_total', help: 'Tasks across every board.', table: 'items' },
    {
        name: 'legacy22_notifications_total',
        help: 'Notifications the consumer has written.',
        table: 'notifications',
    },
    {
        name: 'legacy22_processed_events_total',
        help: 'Events the consumer has already absorbed, replays included.',
        table: 'processed_events',
    },
];

export function createSupabaseStateReadings(settings: SupabaseSettings): StateReading[] {
    const client = serviceRoleClient(settings);

    const total = async (table: Counted): Promise<number> => {
        const { count, error } = await client.from(table).select('*', {
            count: 'exact',
            head: true,
        });

        if (error) fail(`count of ${table}`, error);
        return count ?? 0;
    };

    // The backlog of the relay, and the one number that says whether the
    // outbox is draining. A pass result reports what that pass moved; it
    // cannot distinguish « nothing was waiting » from « the relay is behind ».
    const pendingOutbox = async (): Promise<number> => {
        const { count, error } = await client
            .from('outbox')
            .select('*', { count: 'exact', head: true })
            .is('published_at', null);

        if (error) fail('count of unpublished outbox rows', error);
        return count ?? 0;
    };

    return [
        ...COUNTS.map(one => ({
            name: one.name,
            help: one.help,
            read: () => total(one.table),
        })),
        {
            name: 'legacy22_outbox_pending',
            help: 'Rows in the outbox the relay has not published yet.',
            read: pendingOutbox,
        },
    ];
}
