import { InvalidEmailAddress } from './account.js';

// Normalising is not validating, and the two are needed at different moments.
// Signing in normalises what was typed so it matches what was stored; creating
// an account also has to refuse what cannot be an address at all.
export function normalizeEmailAddress(candidate: string): string {
    return candidate.trim().toLowerCase();
}

export function emailAddress(candidate: string): string {
    const address = normalizeEmailAddress(candidate);
    const [local, domain, ...extra] = address.split('@');

    if (local === undefined || domain === undefined || extra.length > 0) {
        throw new InvalidEmailAddress('must contain exactly one "@".');
    }
    if (local.length === 0 || !domain.includes('.') || /\s/.test(address)) {
        throw new InvalidEmailAddress('is not a usable address.');
    }

    return address;
}
