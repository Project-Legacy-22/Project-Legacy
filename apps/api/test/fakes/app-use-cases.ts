import type { AppUseCases } from '../../src/composition-root.js';

// Every use case the application composes, each one refusing to run.
//
// A route suite exercises a handful of use cases and needs the rest only to
// satisfy the type. Eight suites were writing all of them out, which meant a
// new use case broke eight files at once and each had to be patched by hand --
// six times over in a single afternoon of merges. Adding one now costs a line
// here, and nothing anywhere else.
//
// It rejects rather than resolving: a suite that reaches a use case it did not
// ask for gets an error naming the problem, instead of an undefined that
// surfaces three assertions later as something else.
function refusing(name: string): () => Promise<never> {
    return () => Promise.reject(new Error(`${name} is not exercised by this suite`));
}

function unexercised(): AppUseCases {
    return {
        items: {
            listItems: refusing('listItems'),
            addItem: refusing('addItem'),
            changeItem: refusing('changeItem'),
            moveItem: refusing('moveItem'),
            removeItem: refusing('removeItem'),
        },
        auth: {
            registerAccount: refusing('registerAccount'),
            signIn: refusing('signIn'),
            identifyCaller: refusing('identifyCaller'),
            renewSession: refusing('renewSession'),
            requestPasswordReset: refusing('requestPasswordReset'),
            resetPassword: refusing('resetPassword'),
            signOut: refusing('signOut'),
        },
        account: {
            exportPersonalData: refusing('exportPersonalData'),
            eraseAccount: refusing('eraseAccount'),
        },
        projects: {
            listProjects: refusing('listProjects'),
            addProject: refusing('addProject'),
            removeProject: refusing('removeProject'),
        },
        notifications: {
            countUnread: refusing('countUnread'),
            listNotifications: refusing('listNotifications'),
            markNotificationRead: refusing('markNotificationRead'),
        },
    };
}

export interface AppUseCasesOverrides {
    items?: Partial<AppUseCases['items']>;
    auth?: Partial<AppUseCases['auth']>;
    account?: Partial<AppUseCases['account']>;
    projects?: Partial<AppUseCases['projects']>;
    notifications?: Partial<AppUseCases['notifications']>;
}

// Merged group by group rather than with one spread: a single spread would
// replace a whole group, so a suite overriding one auth use case would lose the
// six refusals beside it and get undefined instead of an error.
export function makeAppUseCases(overrides: AppUseCasesOverrides = {}): AppUseCases {
    const base = unexercised();

    return {
        items: { ...base.items, ...overrides.items },
        auth: { ...base.auth, ...overrides.auth },
        account: { ...base.account, ...overrides.account },
        projects: { ...base.projects, ...overrides.projects },
        notifications: { ...base.notifications, ...overrides.notifications },
    };
}
