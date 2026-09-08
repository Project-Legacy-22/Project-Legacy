import type { PersonalData } from '../domain/personal-data.js';

// Everything one account owns, wherever it happens to be stored, named after
// the need rather than after the technology. packages/infra provides the
// implementation.
//
// It is a single port rather than one per domain because neither operation can
// be expressed one domain at a time. A core package may not import another
// (standards/01-architecture.md section 2.3), and an erasure spread over
// several calls would be several transactions, so an account could end up
// half removed.
//
// Both methods name the account. There is deliberately no way to ask this port
// for data without saying whose: one forgotten argument at a call site would
// hand back somebody else's export, or erase the wrong rows.
export interface PersonalDataStore {
    // Resolves to undefined when nothing is held for that account. That is an
    // ordinary answer for the port to give; deciding whether it is a failure
    // belongs to the use case.
    exportFor(accountId: string): Promise<PersonalData | undefined>;

    // Removes every row the account owns, in one transaction. Erasure is
    // physical, not a flag (standards/01-architecture.md section 5): a
    // deleted_at on personal data keeps the personal data.
    //
    // Calling it twice is not an error. A caller whose erasure failed halfway
    // must be able to ask again, and the second call has nothing left to find.
    eraseFor(accountId: string): Promise<void>;
}
