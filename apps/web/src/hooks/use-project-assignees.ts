import { useCallback, useEffect, useState } from 'react';

import type { MembersApi, ProjectMemberDto } from '../api/members-api';

// Who a task of the selected project can be assigned to (US-58). A failed read
// leaves the list empty, which hides the choice rather than blocking the edit:
// the name, priority and due date stay editable, and the next project change
// or member change asks again.
export function useProjectAssignees(api: MembersApi, projectId: string | null) {
    const [members, setMembers] = useState<readonly ProjectMemberDto[]>([]);
    const [attempt, setAttempt] = useState(0);
    const reload = useCallback(() => setAttempt(previous => previous + 1), []);

    useEffect(() => {
        setMembers([]);
        if (projectId === null) return;
        const controller = new AbortController();

        api.listMembers(projectId, controller.signal)
            .then(found => {
                if (!controller.signal.aborted) setMembers(found);
            })
            .catch(() => {
                // Deliberately silent: see above.
            });

        return () => controller.abort();
    }, [api, projectId, attempt]);

    return { members, reload };
}
