import { describe, expect, it } from 'vitest';

import { formatDueDate, isOverdue } from './item-due-date';
import { orderItems } from './item-order';
import { anItem } from './test/builders/item-builder';

describe('item due date', () => {
    it('formats a calendar date using the requested browser locale', () => {
        expect(formatDueDate('2026-09-12', 'en-US')).toBe('Sep 12, 2026');
        expect(formatDueDate('2026-09-12', 'fr-FR')).toBe('12 sept. 2026');
    });

    it('marks only a date before the browser local day as overdue', () => {
        const now = new Date(2026, 8, 12, 18, 30);

        expect(isOverdue('2026-09-11', now)).toBe(true);
        expect(isOverdue('2026-09-12', now)).toBe(false);
        expect(isOverdue('2026-09-13', now)).toBe(false);
    });
});

describe('item planning order', () => {
    it('orders priority, then dated work, due date and id', () => {
        const items = [
            anItem({ id: '00000000-0000-7000-8000-000000000004', priority: 'normal', dueDate: null }),
            anItem({ id: '00000000-0000-7000-8000-000000000003', priority: 'high', dueDate: '2026-09-20' }),
            anItem({ id: '00000000-0000-7000-8000-000000000002', priority: 'high', dueDate: '2026-09-12' }),
            anItem({ id: '00000000-0000-7000-8000-000000000001', priority: 'high', dueDate: '2026-09-12' }),
            anItem({ id: '00000000-0000-7000-8000-000000000005', priority: 'low', dueDate: '2026-09-01' }),
        ];

        expect(orderItems(items).map((item) => item.id)).toEqual([
            '00000000-0000-7000-8000-000000000001',
            '00000000-0000-7000-8000-000000000002',
            '00000000-0000-7000-8000-000000000003',
            '00000000-0000-7000-8000-000000000004',
            '00000000-0000-7000-8000-000000000005',
        ]);
    });
});
