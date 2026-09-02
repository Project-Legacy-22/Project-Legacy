import { describe, expect, it } from 'vitest';

import { toItem } from './row.js';

// Rows arrive untyped from both drivers. These tests pin down the narrowing
// contract: what is accepted, what is rejected, and what a legacy row becomes.
describe('toItem', () => {
    it('convertit une ligne complete en item', () => {
        const item = toItem({ id: 'item-1', name: 'Acheter du pain', completed: 1 });

        expect(item).toEqual({ id: 'item-1', name: 'Acheter du pain', completed: true });
    });

    it('traite tout entier autre que 1 comme non termine', () => {
        const item = toItem({ id: 'item-1', name: 'Acheter du pain', completed: 0 });

        expect(item.completed).toBe(false);
    });

    // Les deux moteurs stockent `completed` en entier, et une ligne heritee peut
    // porter un nom nul, que le contrat de reponse accepte explicitement.
    it('accepte un nom nul, que la base heritee peut contenir', () => {
        const item = toItem({ id: 'item-1', name: null, completed: 0 });

        expect(item.name).toBeNull();
    });

    it('rejette une ligne qui n est pas un objet', () => {
        expect(() => toItem('pas une ligne')).toThrow(TypeError);
        expect(() => toItem(null)).toThrow(TypeError);
    });

    // Une ligne sans identifiant utilisable est une faute reelle : la laisser
    // passer produirait un item impossible a retrouver ou a supprimer.
    it('rejette une ligne sans identifiant textuel', () => {
        expect(() => toItem({ name: 'Acheter du pain', completed: 0 })).toThrow(TypeError);
        expect(() => toItem({ id: 42, name: 'Acheter du pain', completed: 0 })).toThrow(TypeError);
    });
});
