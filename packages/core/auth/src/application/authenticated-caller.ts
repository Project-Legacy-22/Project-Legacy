import type { Account } from '../domain/account.js';

// What the HTTP layer has already resolved about the caller before a use case
// that acts on their own credentials runs: who requireAccount vouched them to,
// and the two cookie tokens the provider needs to act as them rather than as an
// administrator. The admin path would bypass the provider's own password policy
// and rate limits, which are exactly the checks these operations want kept.
export interface AuthenticatedCaller {
    account: Account;
    accessToken: string;
    refreshToken: string;
}
