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
}

export function inMemoryItemRepository(seed: Item[] = []): InMemoryItemRepository {
    const items = new Map(seed.map(item => [item.id, item]));
    const recordedEvents: DomainEvent[] = [];

    return {
        recordedEvents,
        findAll: () => Promise.resolve([...items.values()]),
        findById: id => Promise.resolve(items.get(id)),
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
