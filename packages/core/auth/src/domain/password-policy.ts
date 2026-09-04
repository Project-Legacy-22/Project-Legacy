import { WeakPassword } from './account.js';

// The policy is enforced here and, separately, by the identity provider's own
// configuration (supabase/config.toml). Neither is enough alone: the provider's
// setting is a value nobody reviews in a pull request, and a rule that only
// lives at the boundary is a rule the domain cannot guarantee.
export const MIN_PASSWORD_LENGTH = 12;

// bcrypt, which GoTrue uses, ignores everything past 72 bytes. Counting bytes
// rather than characters matters as soon as a password contains an accent.
export const MAX_PASSWORD_BYTES = 72;

const LOWER_CASE = /\p{Ll}/u;
const UPPER_CASE = /\p{Lu}/u;
const DIGIT = /\p{Nd}/u;

export function checkedPassword(candidate: string): string {
    if (candidate.length < MIN_PASSWORD_LENGTH) {
        throw new WeakPassword(`must be at least ${String(MIN_PASSWORD_LENGTH)} characters long.`);
    }
    if (new TextEncoder().encode(candidate).length > MAX_PASSWORD_BYTES) {
        throw new WeakPassword(`must be at most ${String(MAX_PASSWORD_BYTES)} bytes long.`);
    }
    if (!LOWER_CASE.test(candidate) || !UPPER_CASE.test(candidate) || !DIGIT.test(candidate)) {
        throw new WeakPassword('must mix lower case, upper case and digits.');
    }

    return candidate;
}
