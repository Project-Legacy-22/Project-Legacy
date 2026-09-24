import { EmailAddress } from '@legacy/contracts';

// The invitation budget of the API is twenty per account and quarter of an
// hour (apps/api/src/http/routes/invitations.ts). Asking for more at once
// would only have the last ones refused.
export const MAX_INVITATIONS_AT_ONCE = 20;

export interface EmailList {
    // Each address once, in the canonical form accounts are created with.
    addresses: string[];
    // What was typed and is not an address, as typed.
    invalid: string[];
}

// Several addresses in one field (#420), separated by commas, semicolons or
// spaces, checked with the contract the API applies.
export function parseEmailList(text: string): EmailList {
    const addresses: string[] = [];
    const invalid: string[] = [];

    for (const candidate of text.split(/[\s,;]+/u).filter(part => part !== '')) {
        const parsed = EmailAddress.safeParse(candidate);
        if (!parsed.success) invalid.push(candidate);
        else if (!addresses.includes(parsed.data)) addresses.push(parsed.data);
    }

    return { addresses, invalid };
}
