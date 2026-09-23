import { ATTENTION_GROUP_LIMIT, attentionWindow } from '../domain/attention.js';
import type { Attention, AttentionGroupName } from '../domain/attention.js';
import type { AttentionReader } from '../ports/attention-reader.js';

// What the caller should look at first, across every project they belong to.
// `today` is the caller's calendar day; see AttentionWindow for why it is theirs
// to give.
export function makeListAttention(reader: AttentionReader) {
    return async function listAttention(memberId: string, today: string): Promise<Attention> {
        const window = attentionWindow(today);
        const groupOf = (group: AttentionGroupName) =>
            reader.findGroupForMember({ memberId, group, window, limit: ATTENTION_GROUP_LIMIT });

        const [overdue, dueSoon, highPriority] = await Promise.all([
            groupOf('overdue'),
            groupOf('dueSoon'),
            groupOf('highPriority'),
        ]);

        // Only asked when every group came back empty: a single entry already
        // says there is open work, and the question costs two more queries.
        const isEmpty = [overdue, dueSoon, highPriority].every((group) => group.entries.length === 0);
        const workload = isEmpty ? await reader.workloadOf(memberId) : 'open';

        return { overdue, dueSoon, highPriority, workload };
    };
}
