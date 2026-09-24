import { ApiError } from './api/items-api';
import type { MembersApi } from './api/members-api';
import { labels } from './labels';
import type { InvitationSummaryEntry } from './members-labels';

// One request per address, one after the other: the API answers each on its
// own terms (sent, already a member, no such account, throttled), and a
// sequence keeps the answers in the order the person typed them.
export async function inviteAll(
    api: MembersApi,
    projectId: string,
    addresses: readonly string[],
): Promise<InvitationSummaryEntry[]> {
    const results: InvitationSummaryEntry[] = [];
    for (const email of addresses) {
        try {
            results.push({ email, outcome: await api.invite(projectId, email) });
        } catch (error) {
            results.push({ email, reason: error instanceof ApiError ? error.message : labels.inviteFailed });
        }
    }
    return results;
}

export function failedAddresses(results: readonly InvitationSummaryEntry[]): string[] {
    return results.filter(result => result.outcome === undefined).map(result => result.email);
}
