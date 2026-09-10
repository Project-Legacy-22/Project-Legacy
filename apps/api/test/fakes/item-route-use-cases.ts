import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
} from '@legacy/core-auth';
import type { IdentityProvider } from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import type { ItemRepository } from '@legacy/core-items';
import { makeAddProject, makeListProjects, makeRemoveProject } from '@legacy/core-projects';

import { inMemoryCompromisedPasswords } from '../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryPersonalDataStore } from '../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryProjectRepository } from '../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';
import type { AppUseCases } from '../../src/composition-root.js';

interface ItemRouteUseCasesOptions {
    repository: ItemRepository;
    provider: IdentityProvider;
    generatedId: string;
    projectId: string;
}

export function makeItemRouteUseCases(options: ItemRouteUseCasesOptions): AppUseCases {
    const { repository, provider, generatedId, projectId } = options;
    const personalData = inMemoryPersonalDataStore();
    const projects = inMemoryProjectRepository();

    return {
        notifications: { countUnread: () => Promise.resolve(0) },
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => generatedId,
                now: () => new Date('2026-09-04T10:00:00.000Z'),
            }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date('2026-09-04T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({
                store: personalData,
                identity: provider,
            }),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({
                repository: projects,
                newId: () => projectId,
            }),
            removeProject: makeRemoveProject(projects),
        },
    };
}
