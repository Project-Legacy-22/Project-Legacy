import { describe, expect, it } from 'vitest';

import { parseEmailList } from './email-list';

describe('parseEmailList', () => {
    it('reads addresses separated by commas, semicolons or spaces, in their canonical form', () => {
        expect(parseEmailList(' Ada@Example.com, grace@example.com;alan@example.com\n linus@example.com ')).toEqual({
            addresses: ['ada@example.com', 'grace@example.com', 'alan@example.com', 'linus@example.com'],
            invalid: [],
        });
    });

    it('keeps each address once, whatever its case', () => {
        expect(parseEmailList('ada@example.com, ADA@example.com').addresses).toEqual(['ada@example.com']);
    });

    it('returns what is not an address as it was typed', () => {
        expect(parseEmailList('ada@example.com, not-an-address, @nobody')).toEqual({
            addresses: ['ada@example.com'],
            invalid: ['not-an-address', '@nobody'],
        });
    });

    it('reads an empty field as no address', () => {
        expect(parseEmailList(' , ')).toEqual({ addresses: [], invalid: [] });
    });
});
