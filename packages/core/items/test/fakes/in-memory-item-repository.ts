import type { Item, ItemRepository } from '../../src/index.js';

// A real, in-process implementation of the port, not a mock: it behaves like
// a repository, so a test using it exercises the same contract the Supabase
// adapter honors, and it keeps working across a refactor of the code under
// test.
export function inMemoryItemRepository(seed: Item[] = []): ItemRepository {
    const items = new Map(seed.map(item => [item.id, item]));

    return {
        findAll: () => Promise.resolve([...items.values()]),
        findById: id => Promise.resolve(items.get(id)),
        save: item => {
            items.set(item.id, item);
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
