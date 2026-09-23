// What needs the caller's attention across every project they belong to
// (US-20): the rules that sort a task into a group, kept here so the fake
// reader and the tests apply the same ones the Supabase adapter translates
// into filters. Like the rest of the domain, this file performs no I/O.

import { DomainError, isCalendarDate } from './item.js';
import type { Item } from './item.js';

// Enough to decide what to start with. A group is a pointer to work, not a
// second task list: the project screen is where the rest is read.
export const ATTENTION_GROUP_LIMIT = 20;

export const ATTENTION_GROUPS = ['overdue', 'dueSoon', 'highPriority'] as const;
export type AttentionGroupName = (typeof ATTENTION_GROUPS)[number];

// The calendar day the caller lives in, and the next one. A due date is a
// calendar fact interpreted in the browser's time zone (US-19), so the server
// cannot know which day it is for the caller: the day comes with the request.
export interface AttentionWindow {
    today: string;
    tomorrow: string;
}

// `none`: not a single task yet. `all_done`: tasks, every one of them done.
// `open`: something is still to do. The first two call for different messages
// and a boolean pair could also say "no task, all done", which means nothing.
export type Workload = 'none' | 'all_done' | 'open';

export interface AttentionEntry {
    item: Item;
    projectName: string;
}

export interface AttentionGroup {
    entries: AttentionEntry[];
    hasMore: boolean;
}

export interface Attention {
    overdue: AttentionGroup;
    dueSoon: AttentionGroup;
    highPriority: AttentionGroup;
    workload: Workload;
}

export class InvalidAttentionDate extends DomainError {
    constructor() {
        super('invalid_attention_date', 400, 'Today must be a calendar date');
    }
}

function dayAfter(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, (day ?? 0) + 1));
    return next.toISOString().slice(0, 10);
}

export function attentionWindow(today: string): AttentionWindow {
    if (!isCalendarDate(today)) throw new InvalidAttentionDate();
    return { today, tomorrow: dayAfter(today) };
}

// The groups do not overlap: a task appears once, in the most urgent group it
// qualifies for. A late task of high priority is late first; listing it twice
// would inflate the screen with the same work.
//
// ISO calendar dates compare correctly as strings, which is what lets this
// rule and the adapter's SQL filters say the same thing.
export function attentionGroupOf(item: Item, window: AttentionWindow): AttentionGroupName | undefined {
    if (item.status === 'done') return undefined;
    if (item.dueDate !== null && item.dueDate < window.today) return 'overdue';
    if (item.dueDate !== null && item.dueDate <= window.tomorrow) return 'dueSoon';
    if (item.priority === 'high') return 'highPriority';
    return undefined;
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

// Nearest due date first, undated last, then priority, then the identifier so
// two loads of the same data read in the same order.
export function compareAttention(left: Item, right: Item): number {
    if (left.dueDate !== right.dueDate) {
        if (left.dueDate === null) return 1;
        if (right.dueDate === null) return -1;
        return left.dueDate < right.dueDate ? -1 : 1;
    }
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    return priority !== 0 ? priority : left.id.localeCompare(right.id);
}
