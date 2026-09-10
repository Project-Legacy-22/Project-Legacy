import { InvalidItemCursor } from '../../src/index.js';
import type { DomainEvent, Item, ItemRepository } from '../../src/index.js';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

function compareItems(left: Item, right: Item): number {
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priority !== 0) return priority;
    if (left.dueDate === null && right.dueDate !== null) return 1;
    if (left.dueDate !== null && right.dueDate === null) return -1;
    const dueDate = (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
    return dueDate !== 0 ? dueDate : left.id.localeCompare(right.id);
}

// A real, in-process implementation of the port, not a mock: it behaves like
// a repository, so a test using it exercises the same contract the Supabase
// adapter honors, and it keeps working across a refactor of the code under
// test.
//
// `save` writes the item and its event together, like the adapter does. The
// recorded events are exposed so a test can assert what was announced without
// reaching into the implementation.
export interface InMemoryItemRepository extends ItemRepository {
    recordedEvents: DomainEvent[];
    // The rows as stored, so a test can assert what was persisted.
    items: Map<string, Item>;
}

export interface ProjectMembership {
    projectId: string;
    userId: string;
}

export function inMemoryItemRepository(
    seed: Item[] = [],
    additionalMemberships: ProjectMembership[] = [],
): InMemoryItemRepository {
    const items = new Map(seed.map((item) => [item.id, item]));
    const recordedEvents: DomainEvent[] = [];
    const memberships = [
        ...seed.map((item) => ({
            projectId: item.projectId,
            userId: item.ownerId,
        })),
        ...additionalMemberships,
    ];

    // The same public order as the adapter: urgent priority first, dated work
    // before undated work, then the UUID as a stable final key.
    function isMember(projectId: string, userId: string): boolean {
        return memberships.some((membership) => membership.projectId === projectId && membership.userId === userId);
    }

    function inProject(projectId: string): Item[] {
        return [...items.values()].filter((item) => item.projectId === projectId).sort(compareItems);
    }

    return {
        recordedEvents,
        items,
        isProjectMember: (projectId, memberId) => Promise.resolve(isMember(projectId, memberId)),
        findPageForMember: (projectId, memberId, { limit, cursor }) => {
            if (!isMember(projectId, memberId)) return Promise.resolve(undefined);
            const projectItems = inProject(projectId);
            const from = cursor === undefined ? 0 : projectItems.findIndex((item) => item.id === cursor) + 1;

            // Refused rather than silently answered with the first page,
            // exactly as the adapter refuses a cursor it did not mint.
            if (cursor !== undefined && from === 0) {
                return Promise.reject(new InvalidItemCursor());
            }

            const page = projectItems.slice(from, from + limit);
            const last = page.at(-1);

            return Promise.resolve({
                items: page,
                nextCursor: from + limit < projectItems.length && last !== undefined ? last.id : undefined,
            });
        },
        findByIdForMember: (id, projectId, memberId) => {
            const item = items.get(id);
            return Promise.resolve(item?.projectId === projectId && isMember(projectId, memberId) ? item : undefined);
        },
        save: (item, event) => {
            items.set(item.id, item);
            recordedEvents.push(event);
            return Promise.resolve();
        },
        update: (item) => {
            items.set(item.id, item);
            return Promise.resolve();
        },
        moveStatus: ({ id, projectId, status, expectedVersion }) => {
            const item = items.get(id);
            if (item?.projectId !== projectId || item.version !== expectedVersion) return Promise.resolve(undefined);

            const moved = { ...item, status, version: item.version + 1 };
            items.set(id, moved);
            return Promise.resolve(moved);
        },
        remove: (id) => {
            items.delete(id);
            return Promise.resolve();
        },
    };
}

// A repository whose writes fail. Used to check that a failed write announces
// nothing: with a single atomic call there is no window in which the event
// could have been recorded on its own.
export function failingItemRepository(
    reason = 'storage unavailable',
    memberships: ProjectMembership[] = [],
): InMemoryItemRepository {
    const repository = inMemoryItemRepository([], memberships);

    return {
        ...repository,
        save: () => Promise.reject(new Error(reason)),
    };
}
