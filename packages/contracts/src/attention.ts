import { z } from 'zod';

import { ItemDto, ItemDueDate } from './items.js';

// What needs the caller's attention across their projects (US-20).
//
// `today` is the caller's calendar day, sent by the browser: a due date is a
// day in the browser's time zone, and the server has no way to know which day
// that is for the person asking.
export const AttentionQuery = z.object({
    today: ItemDueDate,
});

// The task, plus the name of the project it lives in: the home screen lists
// tasks from several projects and each row has to say which one.
export const AttentionItemDto = ItemDto.extend({
    projectName: z.string(),
});

// Bounded by the server. hasMore says the group is longer than what was sent,
// so the screen does not present a truncated list as the whole of it.
export const AttentionGroupDto = z.object({
    items: z.array(AttentionItemDto),
    hasMore: z.boolean(),
});

export const Workload = z.enum(['none', 'all_done', 'open']);

export const AttentionDto = z.object({
    overdue: AttentionGroupDto,
    dueSoon: AttentionGroupDto,
    highPriority: AttentionGroupDto,
    workload: Workload,
});

export type AttentionQuery = z.infer<typeof AttentionQuery>;
export type AttentionItemDto = z.infer<typeof AttentionItemDto>;
export type AttentionGroupDto = z.infer<typeof AttentionGroupDto>;
export type Workload = z.infer<typeof Workload>;
export type AttentionDto = z.infer<typeof AttentionDto>;
