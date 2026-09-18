import { criteriaFingerprint, InvalidItemCursor, matchesCriteria } from '../../src/index.js';
import type { DomainEvent, Item, ItemPageQuery, ItemRepository, ItemSearchCriteria } from '../../src/index.js';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

function compareItems(left: Item, right: Item): number {
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priority !== 0) return priority;
    if (left.dueDate === null && right.dueDate !== null) return 1;
    if (left.dueDate !== null && right.dueDate === null) return -1;
    const dueDate = (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
    return dueDate !== 0 ? dueDate : left.id.localeCompare(right.id);
}

// The same envelope shape as the Supabase adapter (priority/dueDate/id sort
// key, plus a fingerprint of the criteria it was minted under), encoded with
// the global btoa/atob rather than node:buffer: packages/core may depend on
// nothing bare, not even a Node builtin (see scripts/check-layers.mjs). Every
// value encoded here is plain ASCII (an enum, an ISO date, a UUID, a hex
// fingerprint), so the Latin1-only base64 primitives are safe to use as-is.
interface ItemPosition {
    priority: Item['priority'];
    dueDate: string | null;
    id: string;
    criteria: string;
}

function toBase64Url(input: string): string {
    return btoa(input).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function fromBase64Url(input: string): string {
    const restored = input.replace(/-/gu, '+').replace(/_/gu, '/');
    const padding = restored.length % 4 === 0 ? '' : '='.repeat(4 - (restored.length % 4));
    return atob(restored + padding);
}

function isPosition(value: unknown): value is ItemPosition {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return Object.keys(candidate).length === 4
        && typeof candidate.priority === 'string'
        && (candidate.dueDate === null || typeof candidate.dueDate === 'string')
        && typeof candidate.id === 'string'
        && typeof candidate.criteria === 'string';
}

function encodeCursor(item: Item, criteria: ItemSearchCriteria): string {
    return toBase64Url(JSON.stringify({
        priority: item.priority,
        dueDate: item.dueDate,
        id: item.id,
        criteria: criteriaFingerprint(criteria),
    }));
}

// Refused rather than silently reinterpreted, exactly as the adapter refuses
// a cursor it did not mint: a shape it cannot parse and a shape from a
// different search/filter request are the same failure from the caller's
// point of view (US-32's own note on the ticket).
function decodeCursor(cursor: string, criteria: ItemSearchCriteria): ItemPosition {
    try {
        const value: unknown = JSON.parse(fromBase64Url(cursor));
        if (isPosition(value) && value.criteria === criteriaFingerprint(criteria)) return value;
    } catch {
        // The domain error below is the only cursor failure exposed to callers.
    }
    throw new InvalidItemCursor();
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

    function inProject(projectId: string, criteria: ItemSearchCriteria): Item[] {
        return [...items.values()]
            .filter((item) => item.projectId === projectId && matchesCriteria(criteria, item))
            .sort(compareItems);
    }

    return {
        recordedEvents,
        items,
        isProjectMember: (projectId, memberId) => Promise.resolve(isMember(projectId, memberId)),
        findPageForMember: (projectId, memberId, query: ItemPageQuery) => {
            if (!isMember(projectId, memberId)) return Promise.resolve(undefined);
            const { limit, cursor, ...criteria } = query;
            const projectItems = inProject(projectId, criteria);

            let from = 0;
            if (cursor !== undefined) {
                let position: ItemPosition;
                try {
                    position = decodeCursor(cursor, criteria);
                } catch {
                    // decodeCursor only ever throws InvalidItemCursor.
                    return Promise.reject(new InvalidItemCursor());
                }
                from = projectItems.findIndex(
                    (item) => item.priority === position.priority && item.dueDate === position.dueDate && item.id === position.id,
                ) + 1;
                // Refused rather than silently answered with the first page,
                // exactly as a cursor this API never issued is refused.
                if (from === 0) return Promise.reject(new InvalidItemCursor());
            }

            const page = projectItems.slice(from, from + limit);
            const last = page.at(-1);

            return Promise.resolve({
                items: page,
                nextCursor: from + limit < projectItems.length && last !== undefined
                    ? encodeCursor(last, criteria)
                    : undefined,
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
