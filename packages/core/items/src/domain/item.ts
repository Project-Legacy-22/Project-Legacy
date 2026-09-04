// The item entity and the rules that govern it. This file imports nothing: it
// is the layer every other layer is allowed to depend on, and depending on
// anything itself would make the rules untestable without that dependency.

export const MAX_ITEM_NAME_LENGTH = 255;

export interface Item {
    id: string;
    // A name read back from storage may be null: rows created before any
    // validation existed are still there. The invariant below applies when an
    // item is created or changed, not when an existing one is read.
    name: string | null;
    completed: boolean;
    // Every item belongs to a user. The application is single-user for now
    // (D-20), so this is always the system account, but the column is mandatory
    // from day one so authentication (US-11) and erasure (US-13) do not force a
    // model change later. A plain string, like `id`: branded id types are a
    // separate cleanup, not this change.
    ownerId: string;
}

export class DomainError extends Error {
    constructor(
        readonly code: string,
        readonly httpStatus: number,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class InvalidItemName extends DomainError {
    constructor(reason: string) {
        super('invalid_item_name', 400, `Item name ${reason}`);
    }
}

export class ItemNotFound extends DomainError {
    constructor(readonly itemId: string) {
        super('item_not_found', 404, `Item ${itemId} not found`);
    }
}

// A cursor handed back by a client is outside data like any other. The refusal
// lives here so the error middleware finds it with the domain's other refusals.
export class InvalidItemCursor extends DomainError {
    constructor() {
        super('invalid_item_cursor', 400, 'Item cursor was not issued by this API');
    }
}

// Enforces the invariant. Every path that writes a name goes through here.
export function itemName(candidate: string): string {
    const name = candidate.trim();

    if (name.length === 0) {
        throw new InvalidItemName('must not be empty');
    }
    if (name.length > MAX_ITEM_NAME_LENGTH) {
        throw new InvalidItemName(`must be at most ${MAX_ITEM_NAME_LENGTH} characters`);
    }

    return name;
}

export function createItem(id: string, name: string, ownerId: string): Item {
    return { id, name: itemName(name), completed: false, ownerId };
}

// Rebuilding an item from storage is not the same operation as creating one:
// it must accept what is already persisted, including a null name. A single
// object rather than four positional arguments, so a row read back cannot be
// passed in the wrong order.
export function rehydrateItem(row: {
    id: string;
    name: string | null;
    completed: boolean;
    ownerId: string;
}): Item {
    return { id: row.id, name: row.name, completed: row.completed, ownerId: row.ownerId };
}
