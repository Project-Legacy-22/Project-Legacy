import { AccountNotFound } from '../domain/account.js';
import type { PersonalDataExport } from '../domain/personal-data.js';
import type { PersonalDataStore } from '../ports/personal-data-store.js';

export interface ExportPersonalDataDependencies {
    store: PersonalDataStore;
    // Injected, like the clock of every other use case: a value read from the
    // ambient system cannot be asserted on, and the date an export carries is
    // part of what it promises.
    now: () => Date;
}

// Portability. The copy is assembled while the request is being served and
// handed straight back: nothing is written to disk and no file is kept, so
// there is no second copy of an account's data to protect, to expire, or to
// forget about. That is a constraint US-13 states, not an omission.
//
// The account is an argument, like the owner of an item: an export is the
// caller's own data and nothing else, and the port offers no way to ask for
// anybody else's.
export function makeExportPersonalData({ store, now }: ExportPersonalDataDependencies) {
    return async function exportPersonalData(accountId: string): Promise<PersonalDataExport> {
        const data = await store.exportFor(accountId);

        // A valid session pointing at an account the store knows nothing about
        // means the identity provider and the application store have drifted
        // apart. Answering with an empty export would present that as a person
        // who owns nothing, which is a different statement, and a false one.
        if (data === undefined) throw new AccountNotFound();

        return { exportedAt: now().toISOString(), ...data };
    };
}
