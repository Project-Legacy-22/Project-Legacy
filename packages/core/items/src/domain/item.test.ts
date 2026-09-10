import { describe, expect, it } from 'vitest';

import {
    InvalidItemDueDate,
    InvalidItemName,
    MAX_ITEM_NAME_LENGTH,
    createItem,
    itemDueDate,
    itemName,
    rehydrateItem,
} from './item.js';

describe('itemName', () => {
    it('refuse un nom vide', () => {
        const result = () => itemName('   ');

        expect(result).toThrow(InvalidItemName);
    });

    it('refuse un nom de plus de 255 caracteres', () => {
        const tooLong = 'a'.repeat(MAX_ITEM_NAME_LENGTH + 1);

        const result = () => itemName(tooLong);

        expect(result).toThrow(InvalidItemName);
    });

    it('accepte un nom de 255 caracteres exactement', () => {
        const atLimit = 'a'.repeat(MAX_ITEM_NAME_LENGTH);

        expect(itemName(atLimit)).toBe(atLimit);
    });

    it('retire les espaces superflus', () => {
        expect(itemName('  A task  ')).toBe('A task');
    });
});

describe('itemDueDate', () => {
    it('accepts a past calendar date without applying a business refusal', () => {
        expect(itemDueDate('2020-01-02')).toBe('2020-01-02');
    });

    it('accepts an absent due date', () => {
        expect(itemDueDate(null)).toBeNull();
        expect(itemDueDate(undefined)).toBeNull();
    });

    it.each(['2026-02-30', '11/09/2026', '2026-09-11T00:00:00Z'])('rejects %s', (candidate) => {
        expect(() => itemDueDate(candidate)).toThrow(InvalidItemDueDate);
    });
});

describe('createItem', () => {
    it('cree un item non termine avec le nom valide et le proprietaire', () => {
        const item = createItem({
            id: 'item-1',
            name: ' A task ',
            projectId: 'project-1',
            ownerId: 'owner-1',
        });

        expect(item).toEqual({
            id: 'item-1',
            name: 'A task',
            status: 'todo',
            version: 1,
            priority: 'normal',
            dueDate: null,
            projectId: 'project-1',
            ownerId: 'owner-1',
        });
    });

    it('keeps an explicit priority and due date', () => {
        const item = createItem({
            id: 'item-1',
            name: 'A task',
            priority: 'high',
            dueDate: '2020-01-02',
            projectId: 'project-1',
            ownerId: 'owner-1',
        });

        expect(item).toMatchObject({ priority: 'high', dueDate: '2020-01-02' });
    });

    it('propage le rejet d un nom invalide', () => {
        const result = () =>
            createItem({
                id: 'item-1',
                name: '',
                projectId: 'project-1',
                ownerId: 'owner-1',
            });

        expect(result).toThrow(InvalidItemName);
    });
});

describe('rehydrateItem', () => {
    it('accepte un nom nul venant du stockage et conserve le proprietaire', () => {
        const item = rehydrateItem({
            id: 'item-1',
            name: null,
            status: 'doing',
            version: 7,
            priority: 'low',
            dueDate: '2026-09-12',
            projectId: 'project-1',
            ownerId: 'owner-1',
        });

        expect(item).toEqual({
            id: 'item-1',
            name: null,
            status: 'doing',
            version: 7,
            priority: 'low',
            dueDate: '2026-09-12',
            projectId: 'project-1',
            ownerId: 'owner-1',
        });
    });
});
