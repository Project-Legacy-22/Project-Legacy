import { describe, expect, it } from 'vitest';

import { WeakPassword } from './account.js';
import { checkedPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './password-policy.js';

const VALIDE = 'MotDePasse2026';

describe('checkedPassword', () => {
    it('accepte un mot de passe conforme et le rend inchange', () => {
        expect(checkedPassword(VALIDE)).toBe(VALIDE);
    });

    it('refuse un mot de passe plus court que la longueur minimale', () => {
        const court = 'Abc123def';

        expect(court.length).toBeLessThan(MIN_PASSWORD_LENGTH);
        expect(() => checkedPassword(court)).toThrow(WeakPassword);
    });

    it('refuse un mot de passe sans majuscule', () => {
        expect(() => checkedPassword('motdepasse2026')).toThrow(WeakPassword);
    });

    it('refuse un mot de passe sans minuscule', () => {
        expect(() => checkedPassword('MOTDEPASSE2026')).toThrow(WeakPassword);
    });

    it('refuse un mot de passe sans chiffre', () => {
        expect(() => checkedPassword('MotDePasseSansChiffre')).toThrow(WeakPassword);
    });

    // bcrypt ignore ce qui depasse 72 octets. Un mot de passe plus long serait
    // tronque en silence, et un prefixe suffirait alors a ouvrir le compte. La
    // borne est comptee en octets : vingt-cinq caracteres accentues en font
    // cinquante, mais soixante-treize octets sont refuses.
    it('refuse un mot de passe qui depasse la limite en octets', () => {
        const accentue = `Mot2${'e'.repeat(MAX_PASSWORD_BYTES)}`;

        expect(accentue.length).toBeLessThan(MAX_PASSWORD_BYTES * 2);
        expect(() => checkedPassword(accentue)).toThrow(WeakPassword);
    });

    it('ne renvoie pas le mot de passe soumis dans le message d erreur', () => {
        const soumis = 'zzzmotdepassetapezzz';

        expect(() => checkedPassword(soumis)).toThrow(WeakPassword);
        expect(() => checkedPassword(soumis)).not.toThrow(soumis);
    });
});
