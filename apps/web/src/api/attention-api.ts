import { AttentionDto } from '@legacy/contracts';

import { ApiError, requestJson } from './items-api';
import { labels } from '../labels';

export type { AttentionDto, AttentionItemDto, Workload } from '@legacy/contracts';

// The home screen's read (US-20). `today` is the browser's calendar day: due
// dates are days in this time zone, and the server has no way to know which
// one it is here.
export interface AttentionApi {
    listAttention: (today: string, signal: AbortSignal) => Promise<AttentionDto>;
}

export const attentionApi: AttentionApi = {
    listAttention(today, signal) {
        const query = new URLSearchParams({ today });

        return requestJson(
            `/projects/attention?${query.toString()}`,
            { headers: { Accept: 'application/json' }, signal },
            value => {
                const result = AttentionDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidAttention);
                return result.data;
            },
        );
    },
};
