// Shared contract for the persistence layer.
//
// Both implementations (sqlite.ts and mysql.ts) satisfy `Persistence`, which is
// what keeps them interchangeable: index.ts selects one of them and the rest of
// the application only ever depends on these signatures.

export interface Item {
    id: string;
    // POST /items currently accepts a body without `name`, which is stored as
    // NULL and read back as null. That is existing behaviour, not a new case,
    // so the type admits it rather than pretending it cannot happen. Validation
    // at the boundary is a later step of the restructuring.
    name: string | null;
    completed: boolean;
}

// What POST /items builds and echoes back. `name` stays `undefined` rather than
// null when absent, so the JSON response omits the field exactly as before.
export interface NewItem {
    id: string;
    name: string | undefined;
    completed: boolean;
}

// The fields a caller is allowed to change. updateItem never touches the id.
// `completed` is deliberately `unknown`: the drivers store it through the same
// truthiness test as the original code, and nothing has validated it yet.
export interface ItemUpdate {
    name: string | undefined;
    completed: unknown;
}

export interface Persistence {
    init(): Promise<void>;
    teardown(): Promise<void>;
    getItems(): Promise<Item[]>;
    // Resolves to undefined when no row matches, mirroring the previous
    // behaviour of `rows.map(...)[0]` on an empty result set.
    getItem(id: string): Promise<Item | undefined>;
    storeItem(item: NewItem): Promise<void>;
    updateItem(id: string, item: ItemUpdate): Promise<void>;
    removeItem(id: string): Promise<void>;
}

// Rows come back from both drivers untyped. They are narrowed here rather than
// asserted: a row that does not match the stored schema is a real fault and
// must surface, not be silently dropped.
export function toItem(row: unknown): Item {
    if (typeof row !== 'object' || row === null) {
        throw new TypeError('todo_items row is not an object');
    }

    const { id, name, completed } = row as Record<string, unknown>;

    if (typeof id !== 'string') {
        throw new TypeError('todo_items row has no string id');
    }

    return {
        id,
        name: typeof name === 'string' ? name : null,
        completed: completed === 1,
    };
}
