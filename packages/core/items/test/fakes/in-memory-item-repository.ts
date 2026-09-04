import { InvalidItemCursor } from '../../src/index.js';
import type { DomainEvent, Item, ItemRepository } from '../../src/index.js';

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

export function inMemoryItemRepository(seed: Item[] = []): InMemoryItemRepository {
    const items = new Map(seed.map(item => [item.id, item]));
    const recordedEvents: DomainEvent[] = [];

    // Most recent first, like the adapter, insertion order standing in for
    // creation order: a fake that ordered otherwise would prove nothing.
    function ownedBy(ownerId: string): Item[] {
        return [...items.values()].filter(item => item.ownerId === ownerId).reverse();
    }

    return {
        recordedEvents,
        items,
        findPageByOwner: (ownerId, { limit, cursor }) => {
            const owned = ownedBy(ownerId);
            const from = cursor === undefined ? 0 : owned.findIndex(item => item.id === cursor) + 1;

            // Refused rather than silently answered with the first page,
            // exactly as the adapter refuses a cursor it did not mint.
            if (cursor !== undefined && from === 0) {
                return Promise.reject(new InvalidItemCursor());
            }

            const page = owned.slice(from, from + limit);
            const last = page.at(-1);

            return Promise.resolve({
                items: page,
                nextCursor: from + limit < owned.length && last !== undefined ? last.id : undefined,
            });
        },
        findByIdForOwner: (id, ownerId) => {
            const item = items.get(id);
            return Promise.resolve(item?.ownerId === ownerId ? item : undefined);
        },
        save: (item, event) => {
            items.set(item.id, item);
            recordedEvents.push(event);
            return Promise.resolve();
        },
        update: item => {
            items.set(item.id, item);
            return Promise.resolve();
        },
        remove: id => {
            items.delete(id);
            return Promise.resolve();
        },
    };
}

// A repository whose writes fail. Used to check that a failed write announces
// nothing: with a single atomic call there is no window in which the event
// could have been recorded on its own.
export function failingItemRepository(reason = 'storage unavailable'): InMemoryItemRepository {
    const repository = inMemoryItemRepository();

    return {
        ...repository,
        save: () => Promise.reject(new Error(reason)),
    };
}
