import type { CompromisedPasswordRegistry } from '../../src/index.js';

// The seeded passwords are the "known breached" ones; everything else is
// treated as clean. Enough to drive the use case without reaching the network.
export function inMemoryCompromisedPasswords(seed: string[] = []): CompromisedPasswordRegistry {
    const known = new Set(seed);

    return {
        isCompromised: (password): Promise<boolean> => Promise.resolve(known.has(password)),
    };
}
