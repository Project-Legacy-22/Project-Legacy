import type { Item } from '../domain/item.js';

// What the use cases require of the outside world, named after the need and not
// after the technology. packages/infra provides the implementations.
//
// Reads are not owner-scoped yet: the application is single-user (D-20), so
// "every item" and "this user's items" are the same set. Per-owner filtering
// and the "another user's item is a 404" rule arrive with US-12.
export interface ItemRepository {
    findAll(): Promise<Item[]>;
    findById(id: string): Promise<Item | undefined>;
    save(item: Item): Promise<void>;
    update(item: Item): Promise<void>;
    remove(id: string): Promise<void>;
}
