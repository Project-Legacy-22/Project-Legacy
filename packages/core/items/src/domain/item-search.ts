// Search and filter criteria for a page of items, plus the normalization and
// fingerprinting shared by the fake repository and the Supabase adapter so
// the two agree on what "the same request" means. This file imports nothing,
// like the rest of the domain: it is a pure computation, not a database call.

import type { ItemPriority, ItemStatus } from './item.js';

export interface ItemSearchCriteria {
    search?: string | undefined;
    status?: ItemStatus | undefined;
    priority?: ItemPriority | undefined;
    // undefined = no filter, null = items with no due date, an ISO date = due
    // exactly that day. Mirrors the three-state pattern already used for
    // dueDate on CreateItemBody/UpdateItemBody.
    dueDate?: string | null | undefined;
}

// Case- and accent-insensitive: NFD separates a letter from its diacritic,
// which the second step then strips. Mirrors what the database's generated
// name_search column does, so a term normalized here reads the same as one
// normalized in Postgres, even though the two implementations are separate.
export function normalizeSearchTerm(term: string): string {
    return term
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .toLowerCase();
}

// FNV-1a over a fixed-order tuple. This is a correctness check, not a
// security boundary: project membership is verified independently and first,
// so a collision here could at worst misorder a page inside a project the
// caller is already authorized to read, never leak another project's data.
function fingerprint(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

// A tuple, not an object: array serialization is ordered by index, so the
// fingerprint cannot drift with key-order behavior the way a hand-rolled
// object serializer could.
export function criteriaFingerprint(criteria: ItemSearchCriteria): string {
    const normalized = [
        criteria.search !== undefined ? normalizeSearchTerm(criteria.search) : null,
        criteria.status ?? null,
        criteria.priority ?? null,
        criteria.dueDate === undefined ? 'unset' : criteria.dueDate,
    ];
    return fingerprint(JSON.stringify(normalized));
}

export function matchesCriteria(criteria: ItemSearchCriteria, item: { name: string | null; status: ItemStatus; priority: ItemPriority; dueDate: string | null }): boolean {
    if (criteria.status !== undefined && item.status !== criteria.status) return false;
    if (criteria.priority !== undefined && item.priority !== criteria.priority) return false;
    if (criteria.dueDate !== undefined && item.dueDate !== criteria.dueDate) return false;
    if (criteria.search !== undefined) {
        const haystack = normalizeSearchTerm(item.name ?? '');
        if (!haystack.includes(normalizeSearchTerm(criteria.search))) return false;
    }
    return true;
}
