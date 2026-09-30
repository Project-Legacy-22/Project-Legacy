import { describe, expect, it } from 'vitest';

import { readCookie } from './cookies.js';

describe('readCookie', () => {
    it('reads the value of a cookie present among others', () => {
        expect(readCookie('theme=dark; session=jeton; locale=fr', 'session')).toBe('jeton');
    });

    it('finds nothing when the header is missing', () => {
        expect(readCookie(undefined, 'session')).toBeUndefined();
    });

    it('finds nothing when the requested cookie is not there', () => {
        expect(readCookie('theme=dark', 'session')).toBeUndefined();
    });

    // A cookie name that contains the one looked for must not be mistaken for it: the comparison is
    // on the whole name.
    it('does not confuse a cookie whose name contains the one looked for', () => {
        expect(readCookie('presession=autre; session=jeton', 'session')).toBe('jeton');
    });

    it('keeps the dots of a token and only splits at the first equals sign', () => {
        expect(readCookie('session=a.b=c', 'session')).toBe('a.b=c');
    });

    // res.cookie encodes the value; the reader must decode it, otherwise the token read back
    // differs from the one that was set.
    it('decodes a value encoded by express', () => {
        expect(readCookie('session=jeton%3Aabc', 'session')).toBe('jeton:abc');
    });

    it('returns a badly encoded value as it is rather than failing', () => {
        expect(readCookie('session=100%', 'session')).toBe('100%');
    });

    it('ignores a fragment without an equals sign', () => {
        expect(readCookie('casse; session=jeton', 'session')).toBe('jeton');
    });
});
