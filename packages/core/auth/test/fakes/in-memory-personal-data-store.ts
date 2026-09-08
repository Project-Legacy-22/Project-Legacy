import type {
    ExportedAccount,
    ExportedItem,
    ExportedNotification,
    ExportedProject,
    ExportedProjectMembership,
    PersonalData,
    PersonalDataStore,
} from '../../src/index.js';

// One account's rows, as a test declares them.
export interface SeededAccount {
    account: ExportedAccount;
    projects?: ExportedProject[];
    projectMemberships?: ExportedProjectMembership[];
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
    hasProject(projectId: string): boolean;
    hasMembership(projectId: string, accountId: string): boolean;
    hasItem(itemId: string): boolean;
}

interface Owned<T> {
    ownerId: string;
    row: T;
}

function owned<T>(ownerId: string, rows: T[]): Owned<T>[] {
    return rows.map((row) => ({ ownerId, row }));
}

// A real, in-process implementation of the port rather than a mock, and one
// that keeps its rows in flat tables rather than grouped by account. Grouping
// them would make the erasure a single map deletion, and a test of it would be
// asserting on the fake instead of on the rule: what has to be shown is that
// five separate tables stop mentioning an account, in the order the account
// erasure migration deletes them.
export function inMemoryPersonalDataStore(seed: SeededAccount[] = []): InMemoryPersonalDataStore {
    let users: ExportedAccount[] = seed.map((entry) => entry.account);
    let projects: ExportedProject[] = [
        ...new Map(seed.flatMap((entry) => entry.projects ?? []).map((row) => [row.id, row])).values(),
    ];
    let projectMemberships: Owned<ExportedProjectMembership>[] = seed.flatMap((entry) =>
        owned(entry.account.id, entry.projectMemberships ?? []),
    );
    let items: Owned<ExportedItem>[] = seed.flatMap((e) => owned(e.account.id, e.items ?? []));
    let notifications: Owned<ExportedNotification>[] = seed.flatMap((e) => owned(e.account.id, e.notifications ?? []));
    let outbox: Owned<string>[] = seed.flatMap((e) => owned(e.account.id, e.outboxEventIds ?? []));
    let processedEvents: string[] = outbox.map((entry) => entry.row);

    function rowsOf<T>(table: Owned<T>[], accountId: string): T[] {
        return table.filter((entry) => entry.ownerId === accountId).map((entry) => entry.row);
    }

    return {
        exportFor: (accountId): Promise<PersonalData | undefined> => {
            const account = users.find((user) => user.id === accountId);

            if (account === undefined) return Promise.resolve(undefined);

            return Promise.resolve({
                account,
                projects: projects.filter((project) =>
                    rowsOf(projectMemberships, accountId).some((membership) => membership.projectId === project.id),
                ),
                projectMemberships: rowsOf(projectMemberships, accountId),
                items: rowsOf(items, accountId),
                notifications: rowsOf(notifications, accountId),
            });
        },

        // The same order as the migration: the events this account produced,
        // then the notifications those events caused, then everything the
        // account owns directly.
        eraseFor: (accountId): Promise<void> => {
            const produced = new Set(rowsOf(outbox, accountId));
            const accountProjectIds = rowsOf(projectMemberships, accountId).map((membership) => membership.projectId);
            const projectsWithoutAnotherMember = new Set(
                accountProjectIds.filter(
                    (projectId) =>
                        !projectMemberships.some(
                            (membership) => membership.row.projectId === projectId && membership.ownerId !== accountId,
                        ),
                ),
            );
            const removedItemIds = new Set(
                items
                    .filter(
                        (entry) => entry.ownerId === accountId || projectsWithoutAnotherMember.has(entry.row.projectId),
                    )
                    .map((entry) => entry.row.id),
            );

            processedEvents = processedEvents.filter((eventId) => !produced.has(eventId));
            notifications = notifications.filter(
                (entry) =>
                    entry.ownerId !== accountId &&
                    !produced.has(entry.row.eventId) &&
                    !removedItemIds.has(entry.row.itemId),
            );
            outbox = outbox.filter((entry) => entry.ownerId !== accountId);
            items = items.filter(
                (entry) => entry.ownerId !== accountId && !projectsWithoutAnotherMember.has(entry.row.projectId),
            );
            projects = projects.filter((project) => !projectsWithoutAnotherMember.has(project.id));
            projectMemberships = projectMemberships.filter(
                (membership) =>
                    membership.ownerId !== accountId && !projectsWithoutAnotherMember.has(membership.row.projectId),
            );
            users = users.filter((user) => user.id !== accountId);

            return Promise.resolve();
        },

        rowsMentioning: (accountId): string[] => [
            ...users.filter((user) => user.id === accountId).map(() => 'users'),
            ...rowsOf(items, accountId).map(() => 'items'),
            ...rowsOf(notifications, accountId).map(() => 'notifications'),
            ...rowsOf(outbox, accountId).map(() => 'outbox'),
            ...rowsOf(projectMemberships, accountId).map(() => 'project_memberships'),
        ],

        hasProcessedEvent: (eventId): boolean => processedEvents.includes(eventId),
        hasProject: (projectId): boolean => projects.some((project) => project.id === projectId),
        hasMembership: (projectId, accountId): boolean =>
            projectMemberships.some(
                (membership) => membership.ownerId === accountId && membership.row.projectId === projectId,
            ),
        hasItem: (itemId): boolean => items.some((item) => item.row.id === itemId),
    };
}
