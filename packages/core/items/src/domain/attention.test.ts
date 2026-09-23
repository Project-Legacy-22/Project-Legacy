import { describe, expect, it } from 'vitest';

import { anItem } from '../../test/builders/item.js';
import { attentionGroupOf, attentionWindow, compareAttention, InvalidAttentionDate } from './attention.js';

const WINDOW = attentionWindow('2026-09-23');

describe('attentionWindow', () => {
    it.each([
        ['2026-09-23', '2026-09-24'],
        ['2026-09-30', '2026-10-01'],
        ['2026-12-31', '2027-01-01'],
        ['2028-02-28', '2028-02-29'],
    ])('fait suivre %s de %s', (today, tomorrow) => {
        expect(attentionWindow(today)).toEqual({ today, tomorrow });
    });

    it.each(['2026-02-30', '23/09/2026', '2026-9-3', ''])('refuse %j, qui n est pas un jour du calendrier', (today) => {
        expect(() => attentionWindow(today)).toThrow(InvalidAttentionDate);
    });
});

describe('attentionGroupOf', () => {
    it.each([
        ['2026-09-22', 'normal', 'overdue'],
        ['2026-09-23', 'low', 'dueSoon'],
        ['2026-09-24', 'normal', 'dueSoon'],
        ['2026-09-25', 'high', 'highPriority'],
        [null, 'high', 'highPriority'],
        ['2026-09-25', 'normal', undefined],
        [null, 'low', undefined],
    ] as const)('classe une echeance %s de priorite %s dans %s', (dueDate, priority, group) => {
        expect(attentionGroupOf(anItem({ dueDate, priority }), WINDOW)).toBe(group);
    });

    it('range une tache en retard et prioritaire dans le retard seulement', () => {
        const item = anItem({ dueDate: '2026-09-01', priority: 'high' });

        expect(attentionGroupOf(item, WINDOW)).toBe('overdue');
    });

    it('ne retient jamais une tache terminee, meme en retard et prioritaire', () => {
        const item = anItem({ dueDate: '2026-09-01', priority: 'high', status: 'done' });

        expect(attentionGroupOf(item, WINDOW)).toBeUndefined();
    });

    it('retient une tache en cours comme une tache a faire', () => {
        const item = anItem({ dueDate: '2026-09-23', status: 'doing' });

        expect(attentionGroupOf(item, WINDOW)).toBe('dueSoon');
    });
});

describe('compareAttention', () => {
    it('place l echeance la plus proche en premier, les taches sans echeance en dernier, puis la priorite', () => {
        const undated = anItem({ id: 'a', dueDate: null, priority: 'high' });
        const laterHigh = anItem({ id: 'b', dueDate: '2026-09-24', priority: 'high' });
        const laterLow = anItem({ id: 'c', dueDate: '2026-09-24', priority: 'low' });
        const sooner = anItem({ id: 'd', dueDate: '2026-09-20', priority: 'low' });

        const sorted = [undated, laterLow, laterHigh, sooner].sort(compareAttention);

        expect(sorted.map((item) => item.id)).toEqual(['d', 'b', 'c', 'a']);
    });
});
