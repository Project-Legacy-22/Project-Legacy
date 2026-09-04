import { describe, expect, it } from 'vitest';

import { InvalidEmailAddress } from './account.js';
import { emailAddress, normalizeEmailAddress } from './email-address.js';

describe('emailAddress', () => {
    it('ramene une adresse a sa forme canonique', () => {
        const address = emailAddress('  Alice@Example.COM ');

        expect(address).toBe('alice@example.com');
    });

    it('refuse une adresse sans arobase', () => {
        expect(() => emailAddress('alice.example.com')).toThrow(InvalidEmailAddress);
    });

    it('refuse une adresse a deux arobases', () => {
        expect(() => emailAddress('alice@example@com')).toThrow(InvalidEmailAddress);
    });

    it('refuse une adresse sans partie locale', () => {
        expect(() => emailAddress('@example.com')).toThrow(InvalidEmailAddress);
    });

    it('refuse un domaine sans point', () => {
        expect(() => emailAddress('alice@example')).toThrow(InvalidEmailAddress);
    });

    it('ne renvoie pas l adresse soumise dans le message d erreur', () => {
        const soumise = 'zzz-adresse-tapee-zzz';

        expect(() => emailAddress(soumise)).toThrow(
            expect.objectContaining({ message: expect.not.stringContaining(soumise) as string }),
        );
    });
});

describe('normalizeEmailAddress', () => {
    // La connexion normalise sans juger : une adresse enregistree sous des
    // regles plus anciennes doit rester utilisable.
    it('normalise sans refuser une adresse que la creation rejetterait', () => {
        expect(normalizeEmailAddress('  ALICE@example  ')).toBe('alice@example');
    });
});
