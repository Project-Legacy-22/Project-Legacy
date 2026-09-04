import type { Item } from '../domain/item.js';
import type { DomainEvent } from '../domain/event.js';

// What the use cases require of the outside world, named after the need and not
// after the technology. packages/infra provides the implementations.
//
// Reads are not owner-scoped yet: the application is single-user (D-20), so
// "every item" and "this user's items" are the same set. Per-owner filtering
// and the "another user's item is a 404" rule arrive with US-12.
export interface ItemRepository {
    findAll(): Promise<Item[]>;
    findById(id: string): Promise<Item | undefined>;

    // The item and the event announcing it are written together or not at all.
    // They are one argument list rather than two calls because the guarantee is
    // the point: two calls would be two transactions, and a publication that
    // survived a rolled-back write would announce an item nobody can read.
    //
    // The port says "together"; how that is achieved belongs to the adapter.
    save(item: Item, event: DomainEvent): Promise<void>;

    update(item: Item): Promise<void>;
    remove(id: string): Promise<void>;
}
