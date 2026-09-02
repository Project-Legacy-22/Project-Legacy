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

export function createItem(id: string, name: string): Item {
    return { id, name: itemName(name), completed: false };
}

// Rebuilding an item from storage is not the same operation as creating one:
// it must accept what is already persisted, including a null name.
export function rehydrateItem(id: string, name: string | null, completed: boolean): Item {
    return { id, name, completed };
}
