import { v7 as uuid } from 'uuid';
import {
    createHibpPasswordRegistry,
    createLogger,
    createSupabaseIdentityProvider,
    createSupabaseItemStore,
    createSupabasePersonalDataStore,
    createSupabaseProjectRepository,
} from '@legacy/infra';
import type { ItemStore } from '@legacy/infra';
import type { Logger } from '@legacy/contracts';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
} from '@legacy/core-auth';
import { makeListItems, makeAddItem, makeChangeItem, makeRemoveItem } from '@legacy/core-items';
import { makeAddProject, makeListProjects, makeRemoveProject } from '@legacy/core-projects';

import type { Config } from './config.js';

export interface ItemUseCases {
    listItems: ReturnType<typeof makeListItems>;
    addItem: ReturnType<typeof makeAddItem>;
    changeItem: ReturnType<typeof makeChangeItem>;
    removeItem: ReturnType<typeof makeRemoveItem>;
}

export interface AuthUseCases {
    registerAccount: ReturnType<typeof makeRegisterAccount>;
    signIn: ReturnType<typeof makeSignIn>;
    identifyCaller: ReturnType<typeof makeIdentifyCaller>;
    requestPasswordReset: ReturnType<typeof makeRequestPasswordReset>;
    resetPassword: ReturnType<typeof makeResetPassword>;
}

// Kept apart from AuthUseCases, which requireAccount receives on every request
// that needs a session. Erasing an account has no business being reachable from
// there.
export interface AccountUseCases {
    exportPersonalData: ReturnType<typeof makeExportPersonalData>;
    eraseAccount: ReturnType<typeof makeEraseAccount>;
}

export interface ProjectUseCases {
    listProjects: ReturnType<typeof makeListProjects>;
    addProject: ReturnType<typeof makeAddProject>;
    removeProject: ReturnType<typeof makeRemoveProject>;
}

export interface AppUseCases {
    items: ItemUseCases;
    auth: AuthUseCases;
    account: AccountUseCases;
    projects: ProjectUseCases;
}

export interface Application {
    useCases: AppUseCases;
    logger: Logger;
    start(): Promise<void>;
    stop(): Promise<void>;
}

interface UseCaseDependencies {
    store: ItemStore;
    identity: ReturnType<typeof createSupabaseIdentityProvider>;
    personalData: ReturnType<typeof createSupabasePersonalDataStore>;
    projects: ReturnType<typeof createSupabaseProjectRepository>;
    compromisedPasswords: ReturnType<typeof createHibpPasswordRegistry>;
}

function wireUseCases(dependencies: UseCaseDependencies): AppUseCases {
    const { store, identity, personalData, projects, compromisedPasswords } = dependencies;
    return {
        items: {
            listItems: makeListItems(store),
            addItem: makeAddItem({
                repository: store,
                newId: uuid,
                now: () => new Date(),
            }),
            changeItem: makeChangeItem(store),
            removeItem: makeRemoveItem(store),
        },
        auth: {
            registerAccount: makeRegisterAccount(identity),
            signIn: makeSignIn(identity),
            identifyCaller: makeIdentifyCaller(identity),
            requestPasswordReset: makeRequestPasswordReset(identity),
            resetPassword: makeResetPassword({ provider: identity, compromisedPasswords }),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date(),
            }),
            eraseAccount: makeEraseAccount({ store: personalData, identity }),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({ repository: projects, newId: uuid }),
            removeProject: makeRemoveProject(projects),
        },
    };
}

export function compose(config: Config): Application {
    const store: ItemStore = createSupabaseItemStore({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
    });
    // A second client, with the public key: sign-up and sign-in are the
    // endpoints that apply the project's password policy, and the service-role
    // key would bypass it.
    const identity = createSupabaseIdentityProvider({
        url: config.supabaseUrl,
        anonKey: config.supabaseAnonKey,
        serviceRoleKey: config.supabaseServiceRoleKey,
    });
    // A third adapter on the same database as the item store, behind its own
    // port: it reads and clears the tables of every domain at once (US-13),
    // which no single domain's repository is allowed to know about.
    const personalData = createSupabasePersonalDataStore({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
    });
    const projects = createSupabaseProjectRepository({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
    });
    const logger = createLogger(config.logLevel);
    const compromisedPasswords = createHibpPasswordRegistry({ logger });

    return {
        logger,
        useCases: wireUseCases({ store, identity, personalData, projects, compromisedPasswords }),
        // start() no longer creates the schema -- that is what migrations are
        // for. It checks the connection so a misconfigured deployment fails
        // loudly at boot instead of on the first request.
        start: () => store.connect(),
        stop: () => store.disconnect(),
    };
}
