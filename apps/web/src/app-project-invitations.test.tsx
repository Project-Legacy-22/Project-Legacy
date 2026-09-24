import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { ApiError } from './api/items-api';
import type { MembersApi } from './api/members-api';
import type { ProjectDto, ProjectsApi } from './api/projects-api';
import { MAX_INVITATIONS_AT_ONCE } from './email-list';
import { labels } from './labels';
import {
    createApi,
    createAttentionApi,
    createAuth,
    createCredentialsApi,
    createMembersApi,
    createProjectsApi,
} from './test/app-fixture';
import { click, createReactTestRoot, flushTimers, getElement, setInputValue, submitForm } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// #420: one or several people are invited from the project creation form, and
// from the members panel.

const CREATED: ProjectDto = { id: '0191f3c2-3333-7000-8000-cccccccccccc', name: 'Launch', role: 'owner', itemCount: 0 };
const NO_ACCOUNT = 'No account uses this email address. Check it for a typo.';

let testRoot: ReactTestRoot;

async function renderApp(projects: ProjectsApi, members: MembersApi): Promise<void> {
    await testRoot.render(
        <App
            api={createApi()}
            auth={createAuth()}
            credentials={createCredentialsApi()}
            attention={createAttentionApi()}
            projects={projects}
            members={members}
        />,
    );
    await flushTimers();
}

async function createProject(name: string, invitees: string): Promise<void> {
    await setInputValue(getElement<HTMLInputElement>('#project-name'), name);
    await setInputValue(getElement<HTMLInputElement>('#project-invitees'), invitees);
    await submitForm(getElement<HTMLFormElement>('.project-form'));
    await flushTimers();
}

function politeText(): string {
    return [...document.querySelectorAll('[aria-live="polite"], [role="status"]')].map(region => region.textContent).join(' ');
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('inviting people when creating a project', () => {
    it('creates the project, then invites each address in order, and says so', async () => {
        const createProjectApi = vi.fn(async () => CREATED);
        const invite = vi.fn(async () => 'invited' as const);
        await renderApp(createProjectsApi({ createProject: createProjectApi }), createMembersApi({ invite }));

        await createProject('Launch', 'Ada@Example.com, grace@example.com');

        expect(createProjectApi).toHaveBeenCalledWith({ name: 'Launch' });
        expect(invite.mock.calls).toEqual([
            [CREATED.id, 'ada@example.com'],
            [CREATED.id, 'grace@example.com'],
        ]);
        expect(politeText()).toContain(labels.invitationSummary([
            { email: 'ada@example.com', outcome: 'invited' },
            { email: 'grace@example.com', outcome: 'invited' },
        ]));
        expect(getElement<HTMLInputElement>('#project-invitees').value).toBe('');
    });

    it('creates a project alone when the field is empty', async () => {
        const invite = vi.fn(async () => 'invited' as const);
        await renderApp(createProjectsApi({ createProject: async () => CREATED }), createMembersApi({ invite }));

        await createProject('Launch', '');

        expect(invite).not.toHaveBeenCalled();
    });

    it('refuses to create anything while an address is not one', async () => {
        const createProjectApi = vi.fn(async () => CREATED);
        await renderApp(createProjectsApi({ createProject: createProjectApi }), createMembersApi());

        await createProject('Launch', 'ada@example.com, ada-at-example');

        expect(createProjectApi).not.toHaveBeenCalled();
        expect(getElement('#project-invitees-error').textContent).toBe(labels.notEmailAddresses(['ada-at-example']));
        expect(getElement('#project-invitees').getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(getElement('#project-invitees'));
    });

    it(`refuses more than ${MAX_INVITATIONS_AT_ONCE} addresses at once`, async () => {
        const createProjectApi = vi.fn(async () => CREATED);
        await renderApp(createProjectsApi({ createProject: createProjectApi }), createMembersApi());
        const many = Array.from({ length: MAX_INVITATIONS_AT_ONCE + 1 }, (_, index) => `person${index}@example.com`);

        await createProject('Launch', many.join(', '));

        expect(createProjectApi).not.toHaveBeenCalled();
        expect(getElement('#project-invitees-error').textContent).toBe(labels.tooManyInvitations(MAX_INVITATIONS_AT_ONCE));
    });

    it('keeps the project when an invitation fails, and names the address and the reason', async () => {
        const invite = vi.fn(async (_projectId: string, email: string) => {
            if (email === 'nobody@example.com') throw new ApiError(404, NO_ACCOUNT);
            return 'invited' as const;
        });
        await renderApp(createProjectsApi({ createProject: async () => CREATED }), createMembersApi({ invite }));

        await createProject('Launch', 'ada@example.com nobody@example.com');

        const alert = getElement('.projects-panel [role="alert"]').textContent ?? '';
        expect(alert).toContain(labels.projectCreated('Launch'));
        expect(alert).toContain(`nobody@example.com was not invited: ${NO_ACCOUNT}`);
        expect(alert).toContain('Invitation sent to ada@example.com.');
    });
});

describe('inviting several people from the members panel', () => {
    it('invites each address and leaves only the refused ones in the field', async () => {
        const invite = vi.fn(async (_projectId: string, email: string) => {
            if (email === 'nobody@example.com') throw new ApiError(404, NO_ACCOUNT);
            return 'invited' as const;
        });
        await renderApp(createProjectsApi(), createMembersApi({ invite }));
        await click(getElement<HTMLButtonElement>('.members-panel button[aria-controls="members-content"]'));
        await flushTimers();

        await setInputValue(getElement<HTMLInputElement>('#invite-email'), 'ada@example.com, nobody@example.com');
        await submitForm(getElement<HTMLFormElement>('.members-panel form'));
        await flushTimers();

        expect(invite).toHaveBeenCalledTimes(2);
        expect(getElement<HTMLInputElement>('#invite-email').value).toBe('nobody@example.com');
        expect(getElement('#invite-email-error').textContent).toBe(`nobody@example.com was not invited: ${NO_ACCOUNT}`);
        expect(politeText()).toContain('Invitation sent to ada@example.com.');
    });
});
