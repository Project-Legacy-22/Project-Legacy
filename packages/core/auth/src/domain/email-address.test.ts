import { describe, expect, it } from 'vitest';

import { InvalidEmailAddress } from './account.js';
import { emailAddress, normalizeEmailAddress } from './email-address.js';

describe('emailAddress', () => {
    it('brings an address to its canonical form', () => {
        const address = emailAddress('  Alice@Example.COM ');

        expect(address).toBe('alice@example.com');
    });

    it('refuses an address without an at sign', () => {
        expect(() => emailAddress('alice.example.com')).toThrow(InvalidEmailAddress);
    });

    it('refuses an address with two at signs', () => {
        expect(() => emailAddress('alice@example@com')).toThrow(InvalidEmailAddress);
    });

    it('refuses an address without a local part', () => {
        expect(() => emailAddress('@example.com')).toThrow(InvalidEmailAddress);
    });

    it('refuses a domain without a dot', () => {
        expect(() => emailAddress('alice@example')).toThrow(InvalidEmailAddress);
    });

    it('keeps the submitted address out of the error message', () => {
        const soumise = 'zzz-adresse-tapee-zzz';

        expect(() => emailAddress(soumise)).toThrow(InvalidEmailAddress);
        expect(() => emailAddress(soumise)).not.toThrow(soumise);
    });
});

describe('normalizeEmailAddress', () => {
    // Sign-in normalises without judging: an address registered under older rules must stay usable.
    it('normalises without refusing an address that creation would reject', () => {
        expect(normalizeEmailAddress('  ALICE@example  ')).toBe('alice@example');
    });
});
