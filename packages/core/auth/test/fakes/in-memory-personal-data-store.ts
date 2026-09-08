import type {
    ExportedAccount,
    ExportedItem,
    ExportedNotification,
    PersonalData,
    PersonalDataStore,
} from '../../src/index.js';

// One account's rows, as a test declares them.
export interface SeededAccount {
    account: ExportedAccount;
    items?: ExportedItem[];
    notifications?: ExportedNotification[];
    // The events this account produced. Nothing exports them, so they are not
    // part of PersonalData; the erasure still has to remove them, and the fake
    // carries them so a test can say whether it did.
    outboxEventIds?: string[];
}

export interface InMemoryPersonalDataStore extends PersonalDataStore {
    // Every row still carrying the account, named by the table it sits in. The
    // erasure criterion of US-13 is "no row carries the identifier any more",
    // and this is what lets a test state it in those words.
    rowsMentioning(accountId: string): string[];
    hasProcessedEvent(eventId: string): boolean;
}

interface Owned<T> {
    ownerId: string;
    row: T;
}

function owned<T>(ownerId: string, rows: T[]): Owned<T>[] {
    return rows.map(row => ({ ownerId, row }));
}

// A real, in-process implementation of the port rather than a mock, and one
// that keeps its rows in flat tables rather than grouped by account. Grouping
// them would make the erasure a single map deletion, and a test of it would be
// asserting on the fake instead of on the rule: what has to be shown is that
// five separate tables stop mentioning an account, in the order the account
// erasure migration deletes them.
export function inMemoryPersonalDataStore(seed: SeededAccount[] = []): InMemoryPersonalDataStore {
    let users: ExportedAccount[] = seed.map(entry => entry.account);
    let items: Owned<ExportedItem>[] = seed.flatMap(e => owned(e.account.id, e.items ?? []));
    let notifications: Owned<ExportedNotification>[] = seed.flatMap(e =>
        owned(e.account.id, e.notifications ?? []),
    );
    let outbox: Owned<string>[] = seed.flatMap(e => owned(e.account.id, e.outboxEventIds ?? []));
    let processedEvents: string[] = outbox.map(entry => entry.row);

    function rowsOf<T>(table: Owned<T>[], accountId: string): T[] {
        return table.filter(entry => entry.ownerId === accountId).map(entry => entry.row);
    }

    return {
        exportFor: (accountId): Promise<PersonalData | undefined> => {
            const account = users.find(user => user.id === accountId);

            if (account === undefined) return Promise.resolve(undefined);

            return Promise.resolve({
                account,
                items: rowsOf(items, accountId),
                notifications: rowsOf(notifications, accountId),
            });
        },

        // The same order as the migration: the events this account produced,
        // then the notifications those events caused, then everything the
        // account owns directly.
        eraseFor: (accountId): Promise<void> => {
            const produced = new Set(rowsOf(outbox, accountId));

            processedEvents = processedEvents.filter(eventId => !produced.has(eventId));
            notifications = notifications.filter(
                entry => entry.ownerId !== accountId && !produced.has(entry.row.eventId),
            );
            outbox = outbox.filter(entry => entry.ownerId !== accountId);
            items = items.filter(entry => entry.ownerId !== accountId);
            users = users.filter(user => user.id !== accountId);

            return Promise.resolve();
        },

        rowsMentioning: (accountId): string[] => [
            ...users.filter(user => user.id === accountId).map(() => 'users'),
            ...rowsOf(items, accountId).map(() => 'items'),
            ...rowsOf(notifications, accountId).map(() => 'notifications'),
            ...rowsOf(outbox, accountId).map(() => 'outbox'),
        ],

        hasProcessedEvent: (eventId): boolean => processedEvents.includes(eventId),
    };
}
