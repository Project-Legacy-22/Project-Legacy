import type { AttentionGroup, AttentionGroupName, AttentionWindow, Workload } from '../domain/attention.js';

export interface AttentionGroupQuery {
    memberId: string;
    group: AttentionGroupName;
    window: AttentionWindow;
    limit: number;
}

// A read across every project the member belongs to (US-20). It is its own
// port rather than one more method on ItemRepository, whose reads all name a
// single project: this one names none, and is scoped by membership instead.
//
// Every method takes the member. There is no read of "all tasks due today":
// the scope is part of the question, never a filter a caller could forget.
export interface AttentionReader {
    // At most `limit` entries of the group, in compareAttention order, and
    // whether more exist beyond them.
    findGroupForMember(query: AttentionGroupQuery): Promise<AttentionGroup>;
    workloadOf(memberId: string): Promise<Workload>;
}
