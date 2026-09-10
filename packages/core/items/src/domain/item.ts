// The item entity and the rules that govern it. This file imports nothing: it
// is the layer every other layer is allowed to depend on, and depending on
// anything itself would make the rules untestable without that dependency.

export const MAX_ITEM_NAME_LENGTH = 255;
export const ITEM_STATUSES = ['todo', 'doing', 'done'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_PRIORITIES = ['low', 'normal', 'high'] as const;
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];

export interface Item {
    id: string;
    // A name read back from storage may be null: rows created before any
    // validation existed are still there. The invariant below applies when an
    // item is created or changed, not when an existing one is read.
    name: string | null;
    status: ItemStatus;
    // Incremented on every write. A move names the version it observed so a
    // concurrent move cannot be overwritten without being reported.
    version: number;
    priority: ItemPriority;
    // A calendar date deliberately has no time component. Keeping the ISO form
    // in the domain prevents an implicit Date conversion from shifting it.
    dueDate: string | null;
    projectId: string;
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

export class InvalidItemDueDate extends DomainError {
    constructor() {
        super('invalid_item_due_date', 400, 'Item due date must be a calendar date');
    }
}

export class ItemNotFound extends DomainError {
    constructor(readonly itemId: string) {
        super('item_not_found', 404, `Item ${itemId} not found`);
    }
}

export class ItemStatusConflict extends DomainError {
    constructor(readonly itemId: string) {
        super('item_status_conflict', 409, `Item ${itemId} was changed by another request`);
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

const ITEM_DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function itemDueDate(candidate: string | null | undefined): string | null {
    if (candidate === null || candidate === undefined) return null;
    if (!ITEM_DUE_DATE_PATTERN.test(candidate)) throw new InvalidItemDueDate();

    const [year, month, day] = candidate.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
    if (parsed.toISOString().slice(0, 10) !== candidate) throw new InvalidItemDueDate();
    return candidate;
}

export interface NewItem {
    id: string;
    name: string;
    projectId: string;
    ownerId: string;
    priority?: ItemPriority | undefined;
    dueDate?: string | null | undefined;
}

export function createItem(candidate: NewItem): Item {
    return {
        id: candidate.id,
        name: itemName(candidate.name),
        status: 'todo',
        version: 1,
        priority: candidate.priority ?? 'normal',
        dueDate: itemDueDate(candidate.dueDate),
        projectId: candidate.projectId,
        ownerId: candidate.ownerId,
    };
}

// Rebuilding an item from storage is not the same operation as creating one:
// it must accept what is already persisted, including a null name. A single
// object rather than four positional arguments, so a row read back cannot be
// passed in the wrong order.
export function rehydrateItem(row: {
    id: string;
    name: string | null;
    status: ItemStatus;
    version: number;
    priority: ItemPriority;
    dueDate: string | null;
    projectId: string;
    ownerId: string;
}): Item {
    return {
        id: row.id,
        name: row.name,
        status: row.status,
        version: row.version,
        priority: row.priority,
        dueDate: row.dueDate,
        projectId: row.projectId,
        ownerId: row.ownerId,
    };
}

export class ItemProjectNotFound extends DomainError {
    constructor(readonly projectId: string) {
        super('project_not_found', 404, `Project ${projectId} not found`);
    }
}
