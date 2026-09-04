import type { Item } from '../domain/item.js';
import type { DomainEvent } from '../domain/event.js';

// Where a page stops, and where the next one resumes. The cursor is minted and
// read by the adapter alone; the use cases carry it through untouched.
export interface ItemPageQuery {
    limit: number;
    cursor: string | undefined;
}

export interface ItemPage {
    items: Item[];
    nextCursor: string | undefined;
}

// What the use cases require of the outside world, named after the need and not
// after the technology. packages/infra provides the implementations.
//
// Every read names an owner (US-12). There is deliberately no way to ask this
// port for an item without saying on whose behalf: one forgotten argument at a
// call site would otherwise hand a caller someone else's items.
export interface ItemRepository {
    findPageByOwner(ownerId: string, page: ItemPageQuery): Promise<ItemPage>;
    findByIdForOwner(id: string, ownerId: string): Promise<Item | undefined>;

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
