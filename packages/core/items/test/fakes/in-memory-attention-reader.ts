import { attentionGroupOf, compareAttention } from '../../src/index.js';
import type { AttentionReader, Item } from '../../src/index.js';

export interface SeededProject {
    id: string;
    name: string;
    memberIds: string[];
}

// A real implementation of the port over arrays, applying the domain's own
// grouping rule: what the Supabase adapter must agree with, and what the
// integration suite checks it does.
export function inMemoryAttentionReader(items: Item[], projects: SeededProject[]): AttentionReader {
    const itemsOf = (memberId: string) =>
        items.filter((item) =>
            projects.some((project) => project.id === item.projectId && project.memberIds.includes(memberId)),
        );
    const projectNameOf = (item: Item) => projects.find((project) => project.id === item.projectId)?.name ?? '';

    return {
        findGroupForMember({ memberId, group, window, limit }) {
            const matching = itemsOf(memberId)
                .filter((item) => attentionGroupOf(item, window) === group)
                .sort(compareAttention);

            return Promise.resolve({
                entries: matching.slice(0, limit).map((item) => ({ item, projectName: projectNameOf(item) })),
                hasMore: matching.length > limit,
            });
        },
        workloadOf(memberId) {
            const mine = itemsOf(memberId);
            if (mine.length === 0) return Promise.resolve('none');
            return Promise.resolve(mine.every((item) => item.status === 'done') ? 'all_done' : 'open');
        },
    };
}
