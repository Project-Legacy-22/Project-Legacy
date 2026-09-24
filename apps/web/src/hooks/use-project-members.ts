import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { MembersApi, ProjectMemberDto } from '../api/members-api';
import { labels } from '../labels';
import type { ActionResult, Feedback, LoadState } from './view-state';

type SetMembers = Dispatch<SetStateAction<readonly ProjectMemberDto[]>>;

function messageFor(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

// Fetched only while the panel is open, like the notification list: most
// visits never look at who is in a project.
function useMemberList(api: MembersApi, projectId: string, isEnabled: boolean) {
    const [members, setMembers] = useState<readonly ProjectMemberDto[]>([]);
    const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => setAttempt(previous => previous + 1), []);

    useEffect(() => {
        if (!isEnabled) return;
        const controller = new AbortController();
        setMembers([]);
        setLoadState({ status: 'loading' });

        api.listMembers(projectId, controller.signal)
            .then(found => {
                if (controller.signal.aborted) return;
                setMembers(found);
                setLoadState({ status: 'ready' });
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState({ status: 'error', message: messageFor(error, labels.loadMembersFailed) });
            });

        return () => controller.abort();
    }, [api, projectId, isEnabled, attempt]);

    return { members, setMembers, loadState, retry };
}

interface ActionContext {
    api: MembersApi;
    projectId: string;
    setMembers: SetMembers;
    setFeedback: Dispatch<SetStateAction<Feedback>>;
}

async function inviteMember(context: ActionContext, email: string): Promise<ActionResult> {
    context.setFeedback({ status: 'idle' });
    try {
        const outcome = await context.api.invite(context.projectId, email);
        context.setFeedback({ status: 'success', message: labels.invitationOutcome(outcome, email) });
        return { status: 'success' };
    } catch (error) {
        return { status: 'error', message: messageFor(error, labels.inviteFailed) };
    }
}

async function removeMember(context: ActionContext, member: ProjectMemberDto): Promise<boolean> {
    context.setFeedback({ status: 'idle' });
    try {
        await context.api.removeMember(context.projectId, member.userId);
        context.setMembers(current => current.filter(candidate => candidate.userId !== member.userId));
        context.setFeedback({ status: 'success', message: labels.memberRemoved(member.email) });
        return true;
    } catch (error) {
        context.setFeedback({ status: 'error', message: messageFor(error, labels.removeMemberFailed) });
        return false;
    }
}

function useMemberActions(api: MembersApi, projectId: string, setMembers: SetMembers) {
    const [feedback, setFeedback] = useState<Feedback>({ status: 'idle' });
    const [isInviting, setIsInviting] = useState(false);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const context: ActionContext = { api, projectId, setMembers, setFeedback };

    // A message about one project must not stay under the next one.
    useEffect(() => setFeedback({ status: 'idle' }), [projectId]);

    const invite = async (email: string) => {
        setIsInviting(true);
        try {
            return await inviteMember(context, email);
        } finally {
            setIsInviting(false);
        }
    };

    const remove = async (member: ProjectMemberDto) => {
        setPendingUserId(member.userId);
        try {
            return await removeMember(context, member);
        } finally {
            setPendingUserId(null);
        }
    };

    return { feedback, isInviting, pendingUserId, invite, remove };
}

export function useProjectMembers(api: MembersApi, projectId: string, isEnabled: boolean) {
    const list = useMemberList(api, projectId, isEnabled);
    const actions = useMemberActions(api, projectId, list.setMembers);

    return {
        members: list.members,
        loadState: list.loadState,
        retry: list.retry,
        feedback: actions.feedback,
        isInviting: actions.isInviting,
        pendingUserId: actions.pendingUserId,
        invite: actions.invite,
        remove: actions.remove,
    };
}
