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
    // Opaque sort key. It is swapped only with an adjacent task in the same
    // status, priority and due-date group.
    position: string;
    priority: ItemPriority;
    // A calendar date deliberately has no time component. Keeping the ISO form
    // in the domain prevents an implicit Date conversion from shifting it.
    dueDate: string | null;
    projectId: string;
    // Who created the item, or null once that account has been erased. A
    // shared project's tasks outlive their creator's account (US-13, #425):
    // erasure breaks this link rather than removing the row, so nothing here
    // may assume it is always set. A plain string, like `id`: branded id
    // types are a separate cleanup, not this change.
    ownerId: string | null;
    // Who the task is for (US-58, #419): members of its project, possibly
    // none. Never the creator by default: ownerId says who created it, and
    // the two are different facts.
    assigneeIds: readonly string[];
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

export class ItemPositionConflict extends DomainError {
    constructor(readonly itemId: string) {
        super('item_position_conflict', 409, `Item ${itemId} was changed by another request`);
    }
}

export class InvalidItemPosition extends DomainError {
    constructor() {
        super('invalid_item_position', 400, 'Item position must name an adjacent task in the same ordering group');
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

// A real day of the calendar written YYYY-MM-DD: the pattern alone would let
// 2026-02-30 through. Shared with the attention window (US-20), whose "today"
// is the same kind of value.
export function isCalendarDate(candidate: string): boolean {
    if (!ITEM_DUE_DATE_PATTERN.test(candidate)) return false;

    const [year, month, day] = candidate.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
    return parsed.toISOString().slice(0, 10) === candidate;
}

export function itemDueDate(candidate: string | null | undefined): string | null {
    if (candidate === null || candidate === undefined) return null;
    if (!isCalendarDate(candidate)) throw new InvalidItemDueDate();
    return candidate;
}

export interface NewItem {
    id: string;
    name: string;
    projectId: string;
    ownerId: string;
    priority?: ItemPriority | undefined;
    dueDate?: string | null | undefined;
    assigneeIds?: readonly string[] | undefined;
}

// One entry per person, in a stable order: a list typed with a duplicate, or
// in another order, is the same assignment.
export function itemAssignees(candidate: readonly string[] | undefined): readonly string[] {
    // Code-unit order, not the locale's: identifiers are ASCII, and the order
    // must not depend on the machine that sorts them.
    return [...new Set(candidate ?? [])].sort((left, right) => (left < right ? -1 : Number(left > right)));
}

export function createItem(candidate: NewItem): Item {
    return {
        id: candidate.id,
        name: itemName(candidate.name),
        status: 'todo',
        version: 1,
        position: candidate.id,
        priority: candidate.priority ?? 'normal',
        dueDate: itemDueDate(candidate.dueDate),
        projectId: candidate.projectId,
        ownerId: candidate.ownerId,
        assigneeIds: itemAssignees(candidate.assigneeIds),
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
    position: string;
    priority: ItemPriority;
    dueDate: string | null;
    projectId: string;
    ownerId: string | null;
    assigneeIds: readonly string[];
}): Item {
    return {
        id: row.id,
        name: row.name,
        status: row.status,
        version: row.version,
        position: row.position,
        priority: row.priority,
        dueDate: row.dueDate,
        projectId: row.projectId,
        ownerId: row.ownerId,
        assigneeIds: itemAssignees(row.assigneeIds),
    };
}

// Someone who is not a member of the task's project. 404 like a missing task:
// the answer must not tell a caller whether an account exists (US-58).
export class AssigneeNotMember extends DomainError {
    constructor() {
        super('assignee_not_found', 404, 'This person is not a member of the project.');
    }
}

export class ItemProjectNotFound extends DomainError {
    constructor(readonly projectId: string) {
        super('project_not_found', 404, `Project ${projectId} not found`);
    }
}
