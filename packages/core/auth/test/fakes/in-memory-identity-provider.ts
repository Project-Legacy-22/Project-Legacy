import type { IdentityProvider, RegistrationOutcome, Session } from '../../src/index.js';

interface StoredAccount {
    id: string;
    email: string;
    password: string;
}

// A real, in-process implementation of the port rather than a mock: it accepts
// registrations, refuses duplicates, checks passwords and hands out tokens it
// can recognise afterwards. A test using it exercises the same contract the
// Supabase adapter honours, and keeps working across a refactor.
//
// Tokens are "token:<id>". A test that asserts on that string would be asserting
// on the fake, so no test does; they round-trip the value through identify().
export function inMemoryIdentityProvider(seed: StoredAccount[] = []): IdentityProvider {
    const accounts = new Map(seed.map(account => [account.email, account]));
    let nextId = seed.length;

    function sessionFor(account: StoredAccount): Session {
        return {
            account: { id: account.id, email: account.email },
            accessToken: `token:${account.id}`,
            expiresInSeconds: 3600,
        };
    }

    return {
        register: (email, password): Promise<RegistrationOutcome> => {
            if (accounts.has(email)) return Promise.resolve('already-registered');

            nextId += 1;
            accounts.set(email, { id: `account-${String(nextId)}`, email, password });
            return Promise.resolve('created');
        },

        authenticate: (email, password): Promise<Session | undefined> => {
            const account = accounts.get(email);
            const matches = account !== undefined && account.password === password;

            return Promise.resolve(matches ? sessionFor(account) : undefined);
        },

        identify: (accessToken): Promise<{ id: string; email: string } | undefined> => {
            const found = [...accounts.values()].find(
                account => `token:${account.id}` === accessToken,
            );

            return Promise.resolve(
                found === undefined ? undefined : { id: found.id, email: found.email },
            );
        },
    };
}
