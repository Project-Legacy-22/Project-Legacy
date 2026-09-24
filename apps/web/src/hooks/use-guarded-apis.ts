import { useMemo } from 'react';

import type { AccountApi } from '../api/account-api';
import type { AttentionApi } from '../api/attention-api';
import type { CredentialsApi } from '../api/credentials-api';
import { guardSession } from '../api/guard-session';
import type { ItemsApi } from '../api/items-api';
import type { MembersApi } from '../api/members-api';
import type { NotificationsApi } from '../api/notifications-api';
import type { ProjectsApi } from '../api/projects-api';

export interface SignedInApis {
    api: ItemsApi;
    account: AccountApi;
    credentials: CredentialsApi;
    notifications: NotificationsApi;
    projects: ProjectsApi;
    attention: AttentionApi;
    members: MembersApi;
}

// The clients the signed-in screen uses, each wrapped so that a 401 ends
// the session in the interface instead of being reported as one more failed
// request (US-27).
//
// Wrapped once and kept: useItems and useNotifications key their effects on the
// identity of the client they are given, so rebuilding these on every render
// would refetch on every render.
export function useGuardedApis(apis: SignedInApis, onExpired: () => void): SignedInApis {
    const { api, account, credentials, notifications, projects, attention, members } = apis;

    return useMemo(
        () => ({
            api: guardSession(api, onExpired),
            account: guardSession(account, onExpired),
            credentials: guardSession(credentials, onExpired),
            notifications: guardSession(notifications, onExpired),
            projects: guardSession(projects, onExpired),
            attention: guardSession(attention, onExpired),
            members: guardSession(members, onExpired),
        }),
        [api, account, credentials, notifications, projects, attention, members, onExpired],
    );
}
