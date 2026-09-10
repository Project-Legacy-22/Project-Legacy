import type { Item, ItemStatus } from '../domain/item.js';
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

export interface ItemStatusMove {
    id: string;
    projectId: string;
    status: ItemStatus;
    expectedVersion: number;
}

// What the use cases require of the outside world, named after the need and not
// after the technology. packages/infra provides the implementations.
//
// Every read names a project and the member on whose behalf it is made. There is
// deliberately no unscoped lookup: one forgotten argument at a call site would
// otherwise hand a caller another project's items.
export interface ItemRepository {
    isProjectMember(projectId: string, memberId: string): Promise<boolean>;
    findPageForMember(projectId: string, memberId: string, page: ItemPageQuery): Promise<ItemPage | undefined>;
    findByIdForMember(id: string, projectId: string, memberId: string): Promise<Item | undefined>;

    // The item and the event announcing it are written together or not at all.
    // They are one argument list rather than two calls because the guarantee is
    // the point: two calls would be two transactions, and a publication that
    // survived a rolled-back write would announce an item nobody can read.
    //
    // The port says "together"; how that is achieved belongs to the adapter.
    save(item: Item, event: DomainEvent): Promise<void>;

    update(item: Item): Promise<void>;
    moveStatus(move: ItemStatusMove): Promise<Item | undefined>;
    remove(id: string): Promise<void>;
}
