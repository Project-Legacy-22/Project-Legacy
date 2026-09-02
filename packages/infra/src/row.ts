import { rehydrateItem } from '@legacy/core-items';
import type { Item } from '@legacy/core-items';

// Both engines store `completed` as an integer and return rows untyped. Rows are
// narrowed here rather than asserted: a row that does not match the stored
// schema is a real fault and must surface, not be silently dropped.
export function toItem(row: unknown): Item {
    if (typeof row !== 'object' || row === null) {
        throw new TypeError('todo_items row is not an object');
    }

    const { id, name, completed } = row as Record<string, unknown>;

    if (typeof id !== 'string') {
        throw new TypeError('todo_items row has no string id');
    }

    return rehydrateItem(id, typeof name === 'string' ? name : null, completed === 1);
}
