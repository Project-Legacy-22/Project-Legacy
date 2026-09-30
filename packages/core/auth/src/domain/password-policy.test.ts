import { describe, expect, it } from 'vitest';

import { WeakPassword } from './account.js';
import { checkedPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './password-policy.js';

const VALIDE = 'MotDePasse2026';

describe('checkedPassword', () => {
    it('accepts a compliant password and returns it unchanged', () => {
        expect(checkedPassword(VALIDE)).toBe(VALIDE);
    });

    it('refuses a password shorter than the minimum length', () => {
        const court = 'Abc123def';

        expect(court.length).toBeLessThan(MIN_PASSWORD_LENGTH);
        expect(() => checkedPassword(court)).toThrow(WeakPassword);
    });

    it('refuses a password without an uppercase letter', () => {
        expect(() => checkedPassword('motdepasse2026')).toThrow(WeakPassword);
    });

    it('refuses a password without a lowercase letter', () => {
        expect(() => checkedPassword('MOTDEPASSE2026')).toThrow(WeakPassword);
    });

    it('refuses a password without a digit', () => {
        expect(() => checkedPassword('MotDePasseSansChiffre')).toThrow(WeakPassword);
    });

    // bcrypt ignores whatever goes beyond 72 bytes. A longer password would be silently truncated,
    // and a prefix would then be enough to open the account. The bound is counted in bytes:
    // twenty-five accented characters make fifty, but seventy-three bytes are refused.
    it('refuses a password over the byte limit', () => {
        const accentue = `Mot2${'e'.repeat(MAX_PASSWORD_BYTES)}`;

        expect(accentue.length).toBeLessThan(MAX_PASSWORD_BYTES * 2);
        expect(() => checkedPassword(accentue)).toThrow(WeakPassword);
    });

    it('keeps the submitted password out of the error message', () => {
        const soumis = 'zzzmotdepassetapezzz';

        expect(() => checkedPassword(soumis)).toThrow(WeakPassword);
        expect(() => checkedPassword(soumis)).not.toThrow(soumis);
    });
});
