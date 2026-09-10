import { describe, expect, it } from 'vitest';

import { readCookie } from './cookies.js';

describe('readCookie', () => {
    it('lit la valeur d un cookie present parmi d autres', () => {
        expect(readCookie('theme=dark; session=jeton; locale=fr', 'session')).toBe('jeton');
    });

    it('ne trouve rien quand l en-tete est absent', () => {
        expect(readCookie(undefined, 'session')).toBeUndefined();
    });

    it('ne trouve rien quand le cookie demande n y est pas', () => {
        expect(readCookie('theme=dark', 'session')).toBeUndefined();
    });

    // Un nom de cookie qui contient celui qu on cherche ne doit pas etre
    // confondu avec lui : la comparaison porte sur le nom entier.
    it('ne confond pas un cookie dont le nom contient celui recherche', () => {
        expect(readCookie('presession=autre; session=jeton', 'session')).toBe('jeton');
    });

    it('conserve les points d un jeton et ne coupe qu au premier signe egal', () => {
        expect(readCookie('session=a.b=c', 'session')).toBe('a.b=c');
    });

    // res.cookie encode la valeur ; le lecteur doit la decoder, sinon le jeton
    // relu differe de celui qui a ete pose.
    it('decode une valeur encodee par express', () => {
        expect(readCookie('session=jeton%3Aabc', 'session')).toBe('jeton:abc');
    });

    it('rend telle quelle une valeur mal encodee plutot que d echouer', () => {
        expect(readCookie('session=100%', 'session')).toBe('100%');
    });

    it('ignore un fragment sans signe egal', () => {
        expect(readCookie('casse; session=jeton', 'session')).toBe('jeton');
    });
});
