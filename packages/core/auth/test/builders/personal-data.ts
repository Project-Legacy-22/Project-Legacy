import type {
    ExportedAccount,
    ExportedItem,
    ExportedNotification,
    ExportedProject,
    ExportedProjectMembership,
} from '../../src/index.js';
import type { SeededAccount } from '../fakes/in-memory-personal-data-store.js';

// Builders for the rows US-13 exports and erases. Identifiers are real uuids:
// the HTTP contract validates the export it serves, so a placeholder string
// would pass here and fail two layers up, where the reason is harder to read.

const INSTANT = '2026-09-08T10:00:00.000Z';

// A uuid v7 whose tail spells out what the row is and which account it belongs
// to, so a failed assertion names the row instead of a random-looking value.
function uuidOf(tail: string): string {
    return `01996f00-0000-7000-8000-${tail.padStart(12, '0')}`;
}

export function anAccount(overrides: Partial<ExportedAccount> = {}): ExportedAccount {
    return {
        id: uuidOf('1'),
        email: 'alice@example.com',
        createdAt: INSTANT,
        ...overrides,
    };
}

export function anItem(overrides: Partial<ExportedItem> = {}): ExportedItem {
    return {
        id: uuidOf('a'),
        projectId: uuidOf('d'),
        name: 'Prepare the sprint review',
        completed: false,
        createdAt: INSTANT,
        updatedAt: INSTANT,
        ...overrides,
    };
}

export function aProject(overrides: Partial<ExportedProject> = {}): ExportedProject {
    return {
        id: uuidOf('d'),
        name: 'Sprint planning',
        createdAt: INSTANT,
        updatedAt: INSTANT,
        ...overrides,
    };
}

export function aProjectMembership(overrides: Partial<ExportedProjectMembership> = {}): ExportedProjectMembership {
    return {
        projectId: uuidOf('d'),
        role: 'owner',
        createdAt: INSTANT,
        ...overrides,
    };
}

export function aNotification(overrides: Partial<ExportedNotification> = {}): ExportedNotification {
    return {
        id: uuidOf('b'),
        itemId: uuidOf('a'),
        eventId: uuidOf('c'),
        readAt: null,
        createdAt: INSTANT,
        ...overrides,
    };
}

// The identifiers of the rows below, exposed alongside them so a test can name
// the one it is looking for without indexing into an array.
export interface AccountWithData extends SeededAccount {
    projectId: string;
    itemId: string;
    notificationId: string;
    eventId: string;
}

// An account with one row in every table it can have one in. That is what most
// of these tests need: enough rows, in enough tables, that "nothing of this
// account is left" and "nothing of the other account moved" are both statements
// with content. The seed keeps two such accounts from sharing an identifier.
export function anAccountWithData(email: string, seed: number): AccountWithData {
    const suffix = seed.toString(16);
    const itemId = uuidOf(`a${suffix}`);
    const notificationId = uuidOf(`b${suffix}`);
    const eventId = uuidOf(`c${suffix}`);
    const projectId = uuidOf(`d${suffix}`);

    return {
        account: anAccount({ id: uuidOf(`1${suffix}`), email }),
        projects: [aProject({ id: projectId })],
        projectMemberships: [aProjectMembership({ projectId })],
        items: [anItem({ id: itemId, projectId })],
        notifications: [aNotification({ id: notificationId, itemId, eventId })],
        outboxEventIds: [eventId],
        projectId,
        itemId,
        notificationId,
        eventId,
    };
}
