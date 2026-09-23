import type { AttentionDto, AttentionItemDto } from '../../api/attention-api';
import { anItem } from './item-builder';

export function anAttentionItem(overrides: Partial<AttentionItemDto> = {}): AttentionItemDto {
    return { ...anItem(), projectName: 'My project', ...overrides };
}

// Nothing to show and no task at all: what a fresh account answers, and what a
// suite that is not about the home screen needs to stay out of its way.
export function anAttention(overrides: Partial<AttentionDto> = {}): AttentionDto {
    const empty = { items: [], hasMore: false };
    return { overdue: empty, dueSoon: empty, highPriority: empty, workload: 'none', ...overrides };
}
