import { describe, expect, it } from 'vitest';

import { InvalidItemName, MAX_ITEM_NAME_LENGTH, createItem, itemName, rehydrateItem } from './item.js';

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

describe('createItem', () => {
    it('cree un item non termine avec le nom valide et le proprietaire', () => {
        const item = createItem('item-1', ' A task ', 'owner-1');

        expect(item).toEqual({
            id: 'item-1',
            name: 'A task',
            completed: false,
            ownerId: 'owner-1',
        });
    });

    it('propage le rejet d un nom invalide', () => {
        const result = () => createItem('item-1', '', 'owner-1');

        expect(result).toThrow(InvalidItemName);
    });
});

describe('rehydrateItem', () => {
    it('accepte un nom nul venant du stockage et conserve le proprietaire', () => {
        const item = rehydrateItem({ id: 'item-1', name: null, completed: true, ownerId: 'owner-1' });

        expect(item).toEqual({ id: 'item-1', name: null, completed: true, ownerId: 'owner-1' });
    });
});
