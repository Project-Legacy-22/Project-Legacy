import { createHash } from 'node:crypto';

import type { CompromisedPasswordRegistry } from '@legacy/core-auth';
import type { Logger } from '@legacy/contracts';

// Checks a candidate password against Have I Been Pwned's Pwned Passwords range
// API.
//
// SHA-1 is not a choice here: it is the scheme the range API is defined on. The
// hash is never stored and never verified against anything, it is only the
// lookup key. k-anonymity: only the first five characters of that hash leave the
// process. The API answers with every hash suffix sharing that prefix and how
// often each was seen in a breach; the match happens here. "Add-Padding" asks
// the API to pad the response with decoy zero-count entries so its size does
// not reveal how many real matches there were.
const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PREFIX_LENGTH = 5;
// A reply that never comes is not a rejection: without a deadline the platform
// default is counted in minutes, and a password reset would hang for all of it
// -- exactly what failing open exists to prevent. Two seconds is far above the
// service's normal latency and far below anything a person would wait through.
const DEFAULT_TIMEOUT_MS = 2000;

export interface HibpSettings {
    logger: Logger;
    // Injected so a test drives the exchange without a network. Defaults to the
    // platform fetch.
    fetch?: typeof globalThis.fetch;
    // Injected so a test can prove the deadline without waiting for it.
    timeoutMs?: number;
}

function sha1Upper(value: string): string {
    // SHA-1 is mandated by the Pwned Passwords range API and is used only as a
    // lookup key: the digest is not stored, not compared to a stored digest,
    // and only its first five characters ever leave the process. A strong
    // password hash here would not talk to the API at all. Both scanners flag
    // the algorithm without looking at the use; the suppressions are scoped to
    // this one call.
    // codeql[js/insufficient-password-hash]
    return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase(); // NOSONAR typescript:S4790
}

function suffixIsBreached(body: string, suffix: string): boolean {
    for (const line of body.split('\n')) {
        const [hashSuffix, count] = line.trim().split(':');
        if (hashSuffix?.toUpperCase() === suffix && Number(count) > 0) return true;
    }
    return false;
}

export function createHibpPasswordRegistry(settings: HibpSettings): CompromisedPasswordRegistry {
    const doFetch = settings.fetch ?? globalThis.fetch;
    const timeoutMs = settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return {
        async isCompromised(candidate: string): Promise<boolean> {
            const hash = sha1Upper(candidate);
            const prefix = hash.slice(0, PREFIX_LENGTH);
            const suffix = hash.slice(PREFIX_LENGTH);

            try {
                const response = await doFetch(`${RANGE_URL}${prefix}`, {
                    headers: { 'Add-Padding': 'true' },
                    // The abort surfaces as a rejection, which the catch below
                    // already turns into failing open.
                    signal: AbortSignal.timeout(timeoutMs),
                });

                if (!response.ok) {
                    // Fail open: a breach-list outage must not block every
                    // password reset. Length and character rules still applied
                    // upstream. The password is never logged.
                    settings.logger.warn(
                        { status: response.status },
                        'pwned passwords range query failed, treating candidate as not compromised',
                    );
                    return false;
                }

                return suffixIsBreached(await response.text(), suffix);
            } catch (cause) {
                settings.logger.warn(
                    { err: cause },
                    'pwned passwords range query errored, treating candidate as not compromised',
                );
                return false;
            }
        },
    };
}
