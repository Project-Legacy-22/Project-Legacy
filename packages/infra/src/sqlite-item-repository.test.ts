import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSqliteItemStore } from './sqlite-item-repository.js';
import type { ItemStore } from './item-store.js';

// Run against a real SQLite engine held in memory, not against a double. An
// adapter's whole job is to honour the port over a specific driver: replacing
// that driver would test nothing. `:memory:` gives each test a fresh database
// with no file to clean up and no collision between parallel runs.
describe('sqlite item store', () => {
    let store: ItemStore;

    beforeEach(async () => {
        store = createSqliteItemStore(':memory:');
        await store.connect();
    });

    afterEach(() => store.disconnect());

    it('ne trouve rien dans une base vide', async () => {
        await expect(store.findAll()).resolves.toEqual([]);
        await expect(store.findById('item-1')).resolves.toBeUndefined();
    });

    it('relit un item apres l avoir enregistre', async () => {
        await store.save({ id: 'item-1', name: 'Acheter du pain', completed: false });

        await expect(store.findById('item-1')).resolves.toEqual({
            id: 'item-1',
            name: 'Acheter du pain',
            completed: false,
        });
    });

    // Le booleen traverse une colonne entiere : c est le point ou un adaptateur
    // se trompe le plus souvent, et le domaine ne peut pas le rattraper.
    it('conserve l etat termine a travers la conversion en entier', async () => {
        await store.save({ id: 'item-1', name: 'Acheter du pain', completed: true });

        const item = await store.findById('item-1');

        expect(item?.completed).toBe(true);
    });

    it('renvoie tous les items enregistres', async () => {
        await store.save({ id: 'item-1', name: 'Premier', completed: false });
        await store.save({ id: 'item-2', name: 'Second', completed: true });

        const items = await store.findAll();

        expect(items).toHaveLength(2);
        expect(items.map(item => item.id).sort()).toEqual(['item-1', 'item-2']);
    });

    it('remplace le nom et l etat d un item existant', async () => {
        await store.save({ id: 'item-1', name: 'Ancien nom', completed: false });

        await store.update({ id: 'item-1', name: 'Nouveau nom', completed: true });

        await expect(store.findById('item-1')).resolves.toEqual({
            id: 'item-1',
            name: 'Nouveau nom',
            completed: true,
        });
    });

    it('supprime un item sans toucher aux autres', async () => {
        await store.save({ id: 'item-1', name: 'A supprimer', completed: false });
        await store.save({ id: 'item-2', name: 'A garder', completed: false });

        await store.remove('item-1');

        await expect(store.findById('item-1')).resolves.toBeUndefined();
        await expect(store.findById('item-2')).resolves.not.toBeUndefined();
    });

    it('reste utilisable apres une suppression sans effet', async () => {
        await store.remove('item-inexistant');

        await expect(store.findAll()).resolves.toEqual([]);
    });
});
