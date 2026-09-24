import { InvitationOutcomeDto, ProjectMemberListDto } from '@legacy/contracts';
import type { InvitationOutcome, ProjectMemberDto } from '@legacy/contracts';

import { ApiError, errorMessage, jsonHeaders, requestJson } from './items-api';
import { labels } from '../labels';
import { send } from './failure';

export type { InvitationOutcome, ProjectMemberDto } from '@legacy/contracts';

// Who is in a project, bringing someone in, and the answer of the person
// brought in (#401). Answering lives here rather than with notifications: the
// notification is only where the question is asked.
export interface MembersApi {
    listMembers: (projectId: string, signal: AbortSignal) => Promise<readonly ProjectMemberDto[]>;
    invite: (projectId: string, email: string) => Promise<InvitationOutcome>;
    removeMember: (projectId: string, userId: string) => Promise<void>;
    answerInvitation: (invitationId: string, accept: boolean) => Promise<void>;
}

function membersPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/members`;
}

async function sendOrThrow(input: string, init: RequestInit): Promise<void> {
    const response = await send(input, init);
    if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
}

export const membersApi: MembersApi = {
    listMembers(projectId, signal) {
        return requestJson(membersPath(projectId), { headers: { Accept: 'application/json' }, signal }, value => {
            const result = ProjectMemberListDto.safeParse(value);
            if (!result.success) throw new ApiError(502, labels.invalidMemberList);
            return result.data.members;
        });
    },

    invite(projectId, email) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}/invitations`,
            { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }) },
            value => {
                const result = InvitationOutcomeDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.unreadableResponse);
                return result.data.outcome;
            },
        );
    },

    removeMember(projectId, userId) {
        return sendOrThrow(`${membersPath(projectId)}/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });
    },

    answerInvitation(invitationId, accept) {
        return sendOrThrow(`/projects/invitations/${encodeURIComponent(invitationId)}/${accept ? 'accept' : 'decline'}`, {
            method: 'POST',
            headers: { Accept: 'application/json' },
        });
    },
};
