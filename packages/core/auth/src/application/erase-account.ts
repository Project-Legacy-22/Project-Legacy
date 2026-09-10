import { ErasureNotConfirmed } from '../domain/account.js';
import type { Account } from '../domain/account.js';
import { normalizeEmailAddress } from '../domain/email-address.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { PersonalDataStore } from '../ports/personal-data-store.js';

export interface EraseAccountDependencies {
    store: PersonalDataStore;
    identity: IdentityProvider;
}

// The right to erasure. Immediate, with no grace period: Sprint Planning 2
// decided that an account asked to disappear disappears, and a deferred
// deletion would mean keeping, for the length of the delay, exactly the data
// the request is about.
//
// The confirmation is checked here rather than at the HTTP boundary. A rule
// that only lives in a route is a rule the next route can forget, and this one
// is the only thing standing between a mis-click and an irreversible deletion.
// It is compared through normalizeEmailAddress, so a capitalised or padded
// retyping of the right address is accepted: the point is to prove intent, not
// to test typing.
//
// The order of the two steps is the substance of this function. Rows first,
// credentials second. If the second step fails, the caller still holds a
// session, can ask again, and asking again removes what is left. Reversed, a
// failure would strand the rows behind an account nobody can sign into to
// retry, and an erasure nobody can complete is worse than one that has to be
// repeated.
export function makeEraseAccount({ store, identity }: EraseAccountDependencies) {
    return async function eraseAccount(account: Account, confirmation: string): Promise<void> {
        if (normalizeEmailAddress(confirmation) !== normalizeEmailAddress(account.email)) {
            throw new ErasureNotConfirmed();
        }

        await store.eraseFor(account.id);
        await identity.remove(account.id);
    };
}
